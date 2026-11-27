"""Cria a linha de convênio dos FAF de parceria monitorados que ainda não a têm, com valor e itens.

Decisão do usuário (24/11/2026): os FAF 202500042951 e 202500044035 usam o valor de repasse como valor global e
o valor de cada item da proposta. A fonte é a evidência do TransfereGov já capturada
(``evidencia_transferegov``: proposta e ``item-proposta``), sem consulta nova à API.

- Só cria o convênio quando ele não existe; nunca altera um existente. Idempotente.
- Aborta se a soma dos itens não bater com o valor da proposta.
- Grava ``siconv_raw.itens_plano_aplicacao`` (ID_ITEM_PAD, QTD_ITEM, VALOR_TOTAL_ITEM), projeta os itens
  (``projetar``) e preenche ``investimento_aquisicao`` do instrumento. ``AuditLog`` por convênio.
- Sem ``--aplicar`` apenas simula.

Uso:
    python -m scripts.registrar_convenio_faf_parceria
    python -m scripts.registrar_convenio_faf_parceria --aplicar --confirmo-host HOST
"""

from __future__ import annotations

import argparse
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.audit import log_action
from app.db.base import SessionLocal, engine
from app.db.models import Convenio, EvidenciaTransfereGov, InstrumentoEquipamento, PropostaCandidata
from app.equipamentos import normalizar_texto
from app.services.projecao_itens_plano import projetar
from scripts.lib_monitoramento_convenio import valor_item_em_texto

CODIGOS = ("202500042951", "202500044035")
ACAO = "registrar_convenio_faf_parceria"
FONTE = "TransfereGov · parceria · evidência capturada"


def _itens(db, proposta_id: int) -> list[dict]:
    evidencias = db.execute(
        select(EvidenciaTransfereGov)
        .where(EvidenciaTransfereGov.proposta_candidata_id == proposta_id)
        .where(EvidenciaTransfereGov.tipo_recurso == "item-proposta")
        .order_by(EvidenciaTransfereGov.chave_externa)
    ).scalars()
    return [
        {
            "ID_ITEM_PAD": str(e.payload["id_item_proposta"]),
            "DESCRICAO_ITEM": e.payload["nm_item"],
            "QTD_ITEM": str(e.payload["qt_quantidade"]),
            "VALOR_TOTAL_ITEM": valor_item_em_texto(Decimal(str(e.payload["vl_total_item"]))),
            "FONTE_ITEM": FONTE,
        }
        for e in evidencias
    ]


def registrar(db, *, aplicar: bool) -> list[str]:
    relato: list[str] = []
    for codigo in CODIGOS:
        if db.execute(select(Convenio.id).where(Convenio.numero == codigo)).first():
            relato.append(f"{codigo}: já tem convênio, mantido")
            continue
        instrumento = db.execute(
            select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == codigo)
        ).scalar_one()
        proposta = db.execute(select(PropostaCandidata).where(PropostaCandidata.cd_parceria == codigo)).scalar_one()
        itens = _itens(db, proposta.id)
        valor = Decimal(str(proposta.vl_global_proposta))
        soma = sum(Decimal(i["VALOR_TOTAL_ITEM"].replace(",", ".")) for i in itens)
        if not itens or soma != valor:
            raise RuntimeError(f"{codigo}: soma dos itens ({soma}) difere do valor da proposta ({valor}).")
        relato.append(f"{codigo}: criar convênio FAF com valor {valor} e {len(itens)} itens")
        if not aplicar:
            continue
        convenio = Convenio(
            numero=codigo,
            tipo_contratacao="FAF",
            convenente_nome=instrumento.nome_convenente,
            convenente_cnpj=instrumento.cnpj_convenente,
            municipio=instrumento.municipio,
            municipio_normalizado=normalizar_texto(instrumento.municipio or "") or None,
            uf=instrumento.uf,
            cnes=instrumento.cnes,
            ano_instrumento=instrumento.ano_instrumento,
            valor_global=valor,
            valor_repasse=valor,
            financeiro_fonte_confiavel=False,
            siconv_raw={"itens_plano_aplicacao": itens},
        )
        db.add(convenio)
        db.flush()
        instrumento.investimento_aquisicao = valor
        projetar(db, aplicar=True, convenio_numero=codigo)
        log_action(
            db,
            user_id=None,
            entity_name="convenio",
            entity_id=convenio.id,
            action=ACAO,
            details={"numero": codigo, "valor": str(valor), "itens": len(itens)},
        )
    return relato


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--aplicar", action="store_true", help="grava; sem isso só simula")
    analisador.add_argument("--confirmo-host", default="", help="host do banco, exigido com --aplicar")
    args = analisador.parse_args(argv)
    host = make_url(str(engine.url)).host or ""
    if args.aplicar and args.confirmo_host != host:
        print(f"Destino: host={host}. Para gravar, confirme com --confirmo-host {host}.")
        return 2
    print(f"Banco: {make_url(str(engine.url)).database} em {host}")
    with SessionLocal() as db:
        relato = registrar(db, aplicar=args.aplicar)
        if args.aplicar:
            db.commit()
        else:
            db.rollback()
    print("Gravado." if args.aplicar else "Simulação: nada foi alterado.")
    for linha in relato:
        print(" ", linha)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
