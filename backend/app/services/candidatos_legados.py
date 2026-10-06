"""Persistência idempotente; não promove candidato à carteira."""

from datetime import UTC, datetime
from hashlib import sha256

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoEvidencia, CandidatoLegadoRegistro
from app.domain_errors import ConflictError, ValidationError
from app.repositories import candidatos_legados as repositorio
from app.repositories.descoberta_legado import numeros_legados_conhecidos
from app.schemas_legado import CandidatosLegadosRead, ConfirmacaoPortal, ReferenciaDescoberta, SituacaoLegado
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado


def registrar_descoberta(*, db: Session, candidatos: list[CandidatoLegado], referencia: ReferenciaDescoberta) -> int:
    """Um lote/uma transação, com lock antes de verificar identidade e baseline."""
    try:
        repositorio.bloquear_lote(db)
        conhecidos = numeros_legados_conhecidos(db)
        selecionados = [c for c in candidatos if c.numero not in conhecidos]
        if len({c.numero for c in selecionados}) != len(selecionados):
            raise ValidationError("Lote contém candidatos duplicados.")
        registros = repositorio.obter_registros(db, {c.numero for c in selecionados})
        capturas = repositorio.obter_capturas(
            db, {r.ultima_captura_id for r in registros.values() if r.ultima_captura_id is not None}
        )
        anteriores = repositorio.evidencias_por_captura(db, set(capturas))
        confirmados = []
        for candidato in selecionados:
            registro = registros.get(candidato.numero)
            anterior = capturas.get(registro.ultima_captura_id) if registro and registro.ultima_captura_id else None
            evidencias = (
                {
                    (e.id_item, e.codigo): EvidenciaLegado(
                        id_item=e.id_item, codigo_equipamento=e.codigo, descricao=e.descricao, relacao=e.relacao
                    )
                    for e in anteriores.get(anterior.id, [])
                }
                if anterior
                else {}
            )
            evidencias.update({(e.id_item, e.codigo_equipamento): e for e in candidato.evidencias})
            confirmado = candidato.model_copy(
                update={"evidencias": tuple(evidencias[chave] for chave in sorted(evidencias))}
            )
            if (
                anterior
                and anterior.confirmacao_portal == "confirmado"
                and candidato.confirmacao_portal != "confirmado"
            ):
                confirmado = confirmado.model_copy(
                    update={"confirmacao_portal": "confirmado", "data_publicacao": anterior.data_publicacao}
                )
            confirmados.append((confirmado, registro, anterior))
        catalogo = repositorio.catalogo_por_codigos(
            db, {e.codigo_equipamento for c, _, _ in confirmados for e in c.evidencias}
        )
        alterados = sum(_registrar_candidato(db, c, referencia, catalogo, r, a) for c, r, a in confirmados)
        db.commit()
        return alterados
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("Identidade ou evidência do candidato conflita com o histórico registrado.") from exc
    except Exception:
        db.rollback()
        raise


def _registrar_candidato(
    db: Session,
    candidato: CandidatoLegado,
    referencia: ReferenciaDescoberta,
    catalogo: dict[str, int],
    registro: CandidatoLegadoRegistro | None,
    anterior: CandidatoLegadoCaptura | None,
) -> int:
    if not candidato.evidencias or any(e.codigo_equipamento not in catalogo for e in candidato.evidencias):
        raise ValidationError("Candidato sem evidência válida no catálogo.")
    if (candidato.confirmacao_portal == "confirmado") != (candidato.data_publicacao is not None):
        raise ValidationError("Confirmação do Portal sem publicação consistente.")
    hash_conteudo = sha256((referencia.origem + candidato.model_dump_json()).encode()).hexdigest()
    if registro is None:
        registro = CandidatoLegadoRegistro(numero=candidato.numero, id_proposta=candidato.id_proposta)
        repositorio.adicionar(db, registro)
    elif registro.id_proposta != candidato.id_proposta:
        raise ConflictError("Proposta do convênio difere da identidade confirmada no histórico.")
    registro.verificado_em = datetime.now(UTC)
    if anterior and anterior.hash_conteudo == hash_conteudo:
        return 0
    captura = CandidatoLegadoCaptura(
        candidato_id=registro.id,
        confirmacao_portal=candidato.confirmacao_portal,
        data_publicacao=candidato.data_publicacao,
        origem=referencia.origem,
        referencia_snapshot=referencia.hash_snapshot,
        hash_conteudo=hash_conteudo,
    )
    repositorio.adicionar(db, captura)
    for evidencia in candidato.evidencias:
        repositorio.adicionar(
            db,
            CandidatoLegadoEvidencia(
                captura_id=captura.id,
                id_item=evidencia.id_item,
                equipamento_catalogo_id=catalogo[evidencia.codigo_equipamento],
                descricao=evidencia.descricao,
                relacao=evidencia.relacao,
            ),
        )
    registro.ultima_captura_id = captura.id
    return 1


def listar_candidatos(
    *,
    db: Session,
    pagina: int,
    tamanho: int,
    busca: str | None,
    confirmacao: ConfirmacaoPortal | None,
    situacao: SituacaoLegado | None = None,
    somente_oficiais: bool = False,
) -> CandidatosLegadosRead:
    total, itens = repositorio.listar_pagina(
        db,
        pagina=pagina,
        tamanho=tamanho,
        busca=busca,
        confirmacao=confirmacao,
        situacao=situacao,
        somente_oficiais=somente_oficiais,
    )
    return CandidatosLegadosRead(total=total, novos=repositorio.contar_novos(db), itens=itens)
