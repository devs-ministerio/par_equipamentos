"""Worker reconstruído: recaptura até cinco propostas conhecidas em staging.

Não descobre, aprova ou inclui instrumentos. Guardas precedem imports que
abrem o banco; toda publicação do lote e sua captura usam uma transação.
"""

import argparse
import os
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy.engine import make_url

from app.schemas_amostra_transferegov import AmostraTransfereGov
from app.schemas_campos_proposta_transferegov import CamposPropostaTransfereGov
from app.services.espelho_transferegov import reconciliar_arvore
from scripts.captura_local_guardas import validar_staging
from scripts.proteger_clone_local import JsonValue, ProtecaoTexto

if TYPE_CHECKING:
    from requests import Session as SessaoHTTP
    from sqlalchemy.orm import Session


class DetalheLocal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    proposta: dict[str, JsonValue]
    programa: dict[str, JsonValue]
    metas: list[dict[str, JsonValue]]
    cronograma_desembolso: list[dict[str, JsonValue]]
    analise: list[dict[str, JsonValue]]
    distribuicao_recurso: list[dict[str, JsonValue]]
    parceria: dict[str, JsonValue] | None = None
    timeline_financeira: dict[str, JsonValue] | None = None

    @model_validator(mode="after")
    def campos_oficiais_coerentes(self) -> "DetalheLocal":
        campos = CamposPropostaTransfereGov.model_validate(self.proposta)
        programa_id = self.programa.get("id_programa")
        if type(programa_id) is not int or programa_id <= 0:
            raise ValueError("Identidade do programa oficial inválida.")
        if campos.id_programa is not None and campos.id_programa != programa_id:
            raise ValueError("A proposta pertence a outro programa.")
        reconciliar_arvore({}, self.model_dump(exclude_none=True))
        return self


def _recapturar_lote(*, db: "Session", sessao: "SessaoHTTP", limite: int, proposta_ids: tuple[int, ...] | None) -> int:
    # Imports adiados: executar() valida staging antes de carregar o domínio.
    from app.db.models import FonteCaptura
    from app.pipeline.transferegov_parcerias import _buscar_paginado
    from app.repositories.capturas_fonte import adicionar_captura
    from app.repositories.propostas_candidatas import selecionar_recaptura_local
    from scripts.job_descoberta_transferegov import _atualizar_captura_existente, _capturar_detalhe_completo

    propostas = selecionar_recaptura_local(db, limite=limite, ids=proposta_ids)
    if proposta_ids is not None and {p.id_proposta for p in propostas} != set(proposta_ids):
        raise ValueError("Amostra contém proposta desconhecida; nenhuma captura aplicada.")
    inicio = datetime.now(UTC)
    alterados = avisos = 0
    protecao = ProtecaoTexto([])
    for proposta in propostas:
        registros = _buscar_paginado(sessao, "proposta", {"id_proposta": proposta.id_proposta}, exigir_envelope=True)
        programas = _buscar_paginado(sessao, "programa", {"id_programa": proposta.id_programa}, exigir_envelope=True)
        parcerias = _buscar_paginado(sessao, "parceria", {"id_proposta": proposta.id_proposta}, exigir_envelope=True)
        if len(registros) != 1 or len(programas) != 1 or len(parcerias) > 1:
            raise ValueError("Identidade oficial ausente ou ambígua; lote não aplicado.")
        detalhe = _capturar_detalhe_completo(
            sessao, proposta.id_proposta, registros[0], parcerias[0] if parcerias else None
        )
        detalhe["programa"] = programas[0]
        contrato = DetalheLocal.model_validate(protecao.payload(detalhe))
        if (
            contrato.proposta["id_proposta"] != proposta.id_proposta
            or contrato.programa["id_programa"] != proposta.id_programa
        ):
            raise ValueError("Detalhe oficial não corresponde à proposta conhecida.")
        mudou, avisou = _atualizar_captura_existente(db, proposta, contrato.model_dump(exclude_none=True))
        alterados += mudou
        avisos += avisou
    adicionar_captura(
        db,
        FonteCaptura(
            fonte="transferegov_recaptura_local",
            iniciado_em=inicio,
            finalizado_em=datetime.now(UTC),
            status="ok",
            itens_verificados=len(propostas),
            itens_alterados=alterados,
            avisos_criados=avisos,
        ),
    )
    return len(propostas)


def executar(*, limite: int, proposta_ids: tuple[int, ...] | None = None) -> None:
    if type(limite) is not int or not 1 <= limite <= 5:
        raise ValueError("Amostra local limitada a 1–5 propostas.")
    selecao = AmostraTransfereGov(proposta_ids=proposta_ids) if proposta_ids is not None else None
    if selecao is not None and len(selecao.proposta_ids) > limite:
        raise ValueError("Seleção excede o limite autorizado da amostra.")
    runtime = os.environ.get("DATABASE_URL", "")
    migration = os.environ.get("DATABASE_URL_MIGRATION", "")
    validar_staging(runtime)
    validar_staging(migration)
    a, b = make_url(runtime), make_url(migration)
    if (a.host, a.port or 5432, a.database) != (b.host, b.port or 5432, b.database):
        raise ValueError("URLs de staging divergentes.")
    from app.db.base import SessionLocal, engine
    from app.pipeline.transferegov_parcerias import _sessao_com_retry
    from app.services.capturas_fonte import registrar_captura

    validar_staging(engine.url.render_as_string(hide_password=True))
    if (engine.url.host, engine.url.port or 5432, engine.url.database) != (a.host, a.port or 5432, a.database):
        raise ValueError("Conexão carregada não corresponde ao staging autorizado.")
    inicio = datetime.now(UTC)
    with _sessao_com_retry() as sessao, SessionLocal() as db:
        try:
            _recapturar_lote(db=db, sessao=sessao, limite=limite, proposta_ids=proposta_ids)
            db.commit()
        except Exception:
            db.rollback()
            registrar_captura(
                "transferegov_recaptura_local", iniciado_em=inicio, status="erro", fabrica_sessao=SessionLocal
            )
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limite", type=int, default=1)
    parser.add_argument("--proposta-id", type=int, action="append")
    args = parser.parse_args()
    try:
        executar(limite=args.limite, proposta_ids=tuple(args.proposta_id) if args.proposta_id is not None else None)
    except Exception:
        print("Recaptura local interrompida. Consulte o histórico de capturas; nenhum detalhe privado é exibido.")
        raise SystemExit(1) from None
