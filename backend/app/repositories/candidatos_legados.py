"""SQL do Radar legado; commit e decisões ficam no Service."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import Convenio, EquipamentoCatalogo, InstrumentoEquipamento
from app.db.models_legado import (
    CandidatoLegadoCaptura,
    CandidatoLegadoComponente,
    CandidatoLegadoDecisao,
    CandidatoLegadoEvidencia,
    CandidatoLegadoRegistro,
)
from app.db.models_recaptura_legado import CandidatoLegadoRecaptura
from app.equipamentos import nome_curto_do_item
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_escopo_descoberta import ComponenteDescoberto
from app.schemas_legado import CandidatoLegadoRead, EvidenciaLegadoRead, ItemPlanoLegadoRead


def bloquear_lote(db: Session) -> None:
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext("sigeo:radar-legado"))))


def numeros_ja_descobertos_oficialmente(db: Session, numeros: set[str]) -> set[str]:
    """Histórico elegível, não apenas a última captura. Não exige o Portal: o aviso sai na descoberta."""
    if not numeros:
        return set()
    return set(
        db.scalars(
            select(CandidatoLegadoRegistro.numero)
            .join(CandidatoLegadoCaptura, CandidatoLegadoCaptura.candidato_id == CandidatoLegadoRegistro.id)
            .where(
                CandidatoLegadoRegistro.numero.in_(numeros),
                CandidatoLegadoCaptura.origem == "siconv_oficial",
                CandidatoLegadoCaptura.elegivel.is_(True),
                CandidatoLegadoCaptura.criterio_escopo == "prioritarios_ms_celebrados_v2",
                CandidatoLegadoCaptura.orgao_superior == "36000",
            )
            .distinct()
        )
    )


def obter_registros(db: Session, numeros: set[str]) -> dict[str, CandidatoLegadoRegistro]:
    return {
        r.numero: r
        for r in db.scalars(select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero.in_(numeros)))
    }


def obter_por_id(db: Session, candidato_id: int) -> CandidatoLegadoRegistro | None:
    return db.get(CandidatoLegadoRegistro, candidato_id)


def alvos_revalidacao(db: Session, *, limite: int) -> list[AlvoRecapturaLegado]:
    """Só fila oficial aberta; exclui carteira e captura já inelegível."""
    candidato, captura, decisao = CandidatoLegadoRegistro, CandidatoLegadoCaptura, CandidatoLegadoDecisao
    ultima = (
        select(func.max(decisao.id)).where(decisao.candidato_id == candidato.id).correlate(candidato).scalar_subquery()
    )
    incorporado = (
        select(Convenio.id)
        .where(
            Convenio.numero == candidato.numero,
            Convenio.tipo_contratacao.in_(["Convênio", "Convenio"]) | Convenio.tipo_contratacao.is_(None),
        )
        .exists()
    )
    monitorado = (
        select(InstrumentoEquipamento.id)
        .where(
            InstrumentoEquipamento.nr_convenio == candidato.numero,
            InstrumentoEquipamento.tipo_contratacao.in_(["Convênio", "Convenio"]),
        )
        .exists()
    )
    consulta = (
        select(candidato.id, captura.id, candidato.numero, candidato.id_proposta)
        .join(captura, captura.id == candidato.ultima_captura_id)
        .outerjoin(decisao, decisao.id == ultima)
        .where(
            captura.origem == "siconv_oficial",
            captura.elegivel.is_(True),
            or_(decisao.id.is_(None), decisao.situacao == "em_analise"),
            ~incorporado,
            ~monitorado,
        )
        .order_by(candidato.id)
        .limit(limite + 1)
    )
    return [
        AlvoRecapturaLegado(candidato_id=c, captura_id=s, numero=n, id_proposta=p)
        for c, s, n, p in db.execute(consulta)
    ]


def obter_capturas(db: Session, ids: set[int]) -> dict[int, CandidatoLegadoCaptura]:
    return {r.id: r for r in db.scalars(select(CandidatoLegadoCaptura).where(CandidatoLegadoCaptura.id.in_(ids)))}


def adicionar(
    db: Session,
    registro: CandidatoLegadoRegistro | CandidatoLegadoCaptura | CandidatoLegadoEvidencia | CandidatoLegadoComponente,
) -> None:
    db.add(registro)
    db.flush()


def catalogo_por_codigos(db: Session, codigos: set[str]) -> dict[str, int]:
    return {
        codigo: identificador
        for codigo, identificador in db.execute(
            select(EquipamentoCatalogo.codigo, EquipamentoCatalogo.id).where(EquipamentoCatalogo.codigo.in_(codigos))
        )
    }


def evidencias_por_captura(db: Session, ids: set[int]) -> dict[int, list[EvidenciaLegadoRead]]:
    resultado: dict[int, list[EvidenciaLegadoRead]] = defaultdict(list)
    if ids:
        for evidencia, codigo, nome in db.execute(
            select(CandidatoLegadoEvidencia, EquipamentoCatalogo.codigo, EquipamentoCatalogo.nome)
            .join(EquipamentoCatalogo, EquipamentoCatalogo.id == CandidatoLegadoEvidencia.equipamento_catalogo_id)
            .where(CandidatoLegadoEvidencia.captura_id.in_(ids))
            .order_by(CandidatoLegadoEvidencia.id_item, EquipamentoCatalogo.codigo)
        ):
            resultado[evidencia.captura_id].append(
                EvidenciaLegadoRead.model_validate(
                    {
                        "id_item": evidencia.id_item,
                        "codigo": codigo,
                        "nome": nome,
                        "descricao": evidencia.descricao,
                        "relacao": evidencia.relacao,
                    }
                )
            )
    return resultado


def componentes_por_captura(db: Session, ids: set[int]) -> dict[int, list[ComponenteDescoberto]]:
    resultado: dict[int, list[ComponenteDescoberto]] = defaultdict(list)
    if not ids:
        return resultado
    componente = CandidatoLegadoComponente
    registros = db.execute(
        select(componente.captura_id, componente.id_programa, componente.nome_programa, componente.componente)
        .where(componente.captura_id.in_(ids))
        .order_by(componente.id_programa, componente.nome_programa)
    )
    for captura_id, id_programa, nome_programa, nome in registros:
        resultado[captura_id].append(
            ComponenteDescoberto(id_programa=id_programa, nome_programa=nome_programa, componente=nome)
        )
    return resultado


def _consulta_candidatos():
    candidato, captura = CandidatoLegadoRegistro, CandidatoLegadoCaptura
    decisao = CandidatoLegadoDecisao
    ultima_id = (
        select(func.max(decisao.id)).where(decisao.candidato_id == candidato.id).correlate(candidato).scalar_subquery()
    )
    consulta = (
        select(candidato, captura, decisao)
        .join(captura, captura.id == candidato.ultima_captura_id)
        .outerjoin(decisao, decisao.id == ultima_id)
    )
    conhecido = (
        select(Convenio.id)
        .where(
            Convenio.numero == candidato.numero,
            Convenio.tipo_contratacao.in_(["Convênio", "Convenio"]) | Convenio.tipo_contratacao.is_(None),
        )
        .exists()
    )
    monitorado = (
        select(InstrumentoEquipamento.id)
        .where(
            InstrumentoEquipamento.nr_convenio == candidato.numero,
            InstrumentoEquipamento.tipo_contratacao.in_(["Convênio", "Convenio"]),
        )
        .exists()
    )
    # Decisões encerradas continuam consultáveis, mesmo após entrada na carteira.
    fila_elegivel = captura.elegivel.is_(True) & ~conhecido & ~monitorado
    # Só descoberta oficial atual. O Portal não é exigido para ver o candidato (o SICONV já traz
    # assinatura e publicação); ele é exigido para recapturar e aprovar.
    fila_elegivel &= (
        (captura.origem == "siconv_oficial")
        & (captura.criterio_escopo == "prioritarios_ms_celebrados_v2")
        & (captura.orgao_superior == "36000")
    )
    return consulta.where(or_(decisao.situacao.in_(["aprovado", "rejeitado"]), fila_elegivel))


def contar_novos(db: Session) -> int:
    consulta = _consulta_candidatos().where(CandidatoLegadoDecisao.id.is_(None))
    return db.scalar(select(func.count()).select_from(consulta.subquery())) or 0


def _texto_ou_none(valor: object) -> str | None:
    texto = str(valor).strip() if valor is not None else ""
    return texto or None


def _itens_do_plano(itens: object) -> list[ItemPlanoLegadoRead]:
    """Bens do plano de aplicação (nome só com o título, quantidade e valores), na ordem da fonte."""
    if not isinstance(itens, list):
        return []
    bens: list[ItemPlanoLegadoRead] = []
    for item in itens:
        if not isinstance(item, dict) or str(item.get("TIPO_DESPESA_ITEM") or "BEM").upper() != "BEM":
            continue
        nome = nome_curto_do_item(str(item.get("DESCRICAO_ITEM") or ""))
        if nome:
            bens.append(
                ItemPlanoLegadoRead(
                    nome=nome,
                    quantidade=_texto_ou_none(item.get("QTD_ITEM")),
                    valor_unitario=_texto_ou_none(item.get("VALOR_UNITARIO_ITEM")),
                    valor_total=_texto_ou_none(item.get("VALOR_TOTAL_ITEM")),
                )
            )
    return bens


_SEM_RECAPTURA: tuple[Any, ...] = (None, None, None, [], None)


def _resumo_recaptura(
    db: Session, ids: set[int]
) -> dict[int, tuple[object, str | None, str | None, list[ItemPlanoLegadoRead], datetime]]:
    """Valor, município, UF e itens da última recaptura oficial de cada candidato."""
    if not ids:
        return {}
    r = CandidatoLegadoRecaptura
    ultima = select(func.max(r.id)).where(r.candidato_id.in_(ids)).group_by(r.candidato_id)
    municipio = r.payload_oficial["portal"]["municipioConvenente"]["nomeIBGE"].astext
    uf = r.payload_oficial["portal"]["municipioConvenente"]["uf"]["nome"].astext
    return {
        candidato_id: (valor, mun, sigla, _itens_do_plano(itens), criado_em)
        for candidato_id, valor, mun, sigla, itens, criado_em in db.execute(
            select(r.candidato_id, r.valor_global, municipio, uf, r.payload_oficial["itens"], r.criado_em).where(
                r.id.in_(ultima)
            )
        )
    }


def listar_pagina(
    db: Session,
    *,
    pagina: int,
    tamanho: int,
    busca: str | None,
    confirmacao: str | None,
    situacao: Sequence[str] | None = None,
) -> tuple[int, list[CandidatoLegadoRead]]:
    candidato, captura, decisao = CandidatoLegadoRegistro, CandidatoLegadoCaptura, CandidatoLegadoDecisao
    consulta = _consulta_candidatos()
    if situacao:
        consulta = consulta.where(func.coalesce(decisao.situacao, "novo").in_(situacao))
    if confirmacao:
        consulta = consulta.where(captura.confirmacao_portal == confirmacao)
    if busca:
        alvo = "%" + busca.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        consulta = consulta.where(
            or_(candidato.numero.ilike(alvo, escape="\\"), candidato.id_proposta.ilike(alvo, escape="\\"))
        )
    total = db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = db.execute(
        consulta.order_by(candidato.verificado_em.desc(), candidato.id.desc())
        .limit(tamanho)
        .offset((pagina - 1) * tamanho)
    ).all()
    evidencias = evidencias_por_captura(db, {captura.id for _, captura, _ in registros})
    componentes = componentes_por_captura(db, {captura.id for _, captura, _ in registros})
    recapturas = _resumo_recaptura(db, {candidato.id for candidato, _, _ in registros})
    itens = [
        CandidatoLegadoRead.model_validate(
            {
                "id": candidato.id,
                "numero": candidato.numero,
                "id_proposta": candidato.id_proposta,
                "confirmacao_portal": captura.confirmacao_portal,
                "data_publicacao": captura.data_publicacao,
                "origem": captura.origem,
                "descoberto_em": candidato.descoberto_em,
                "verificado_em": candidato.verificado_em,
                "evidencias": evidencias.get(captura.id, []),
                "componentes": componentes.get(captura.id, []),
                "captura_id": captura.id,
                "situacao": decisao.situacao if decisao else "novo",
                "versao": decisao.id if decisao else 0,
                "valor_global": recapturas.get(candidato.id, _SEM_RECAPTURA)[0],
                "municipio": recapturas.get(candidato.id, _SEM_RECAPTURA)[1],
                "uf": recapturas.get(candidato.id, _SEM_RECAPTURA)[2],
                "recaptura_em": recapturas.get(candidato.id, _SEM_RECAPTURA)[4],
                "itens": recapturas.get(candidato.id, _SEM_RECAPTURA)[3]
                or [
                    ItemPlanoLegadoRead(nome=nome)
                    for nome in dict.fromkeys(e.nome for e in evidencias.get(captura.id, []))
                ],
                "data_instrumento": captura.data_assinatura_siconv or captura.data_publicacao,
            }
        )
        for candidato, captura, decisao in registros
    ]
    return total, itens
