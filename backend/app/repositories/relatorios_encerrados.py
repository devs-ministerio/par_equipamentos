"""Projeções limitadas do espelho, sem chamadas oficiais ou escritas."""

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Convenio,
    EquipamentoCatalogo,
    EquipamentoMarcador,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    PropostaCandidata,
)
from app.repositories.equipamento_marcadores import marcador_de_financiamento
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.schemas_relatorios_encerrados import FatoEncerramento, OrdemEncerramento

LIMITE = 5000
_ORDENS = TypeAdapter(list[OrdemEncerramento])


def _conclusoes():
    return (
        select(
            EventoMarco.instrumento_id,
            func.count().label("quantidade"),
            func.max(EventoMarco.data_ocorrencia).label("data"),
        )
        .join(MarcoCatalogo, MarcoCatalogo.id == EventoMarco.marco_id)
        .where(
            MarcoCatalogo.codigo == "fase_concluido",
            EventoMarco.substituido_por_id.is_(None),
            EventoMarco.deletado_em.is_(None),
        )
        .group_by(EventoMarco.instrumento_id)
        .subquery()
    )


def _equipamento(coluna, nome: str | None):
    if not nome:
        return True
    return (
        select(EquipamentoMarcador.id)
        .join(EquipamentoCatalogo)
        .where(coluna, EquipamentoCatalogo.nome == nome, marcador_de_financiamento())
        .exists()
    )


def listar_fatos(db: Session, *, equipamento: str | None) -> list[FatoEncerramento]:
    conclusoes = _conclusoes()
    convenio = (
        select(
            Convenio.numero,
            Convenio.convenente_nome.label("nome"),
            func.coalesce(Convenio.tipo_contratacao, "Convênio").label("tipo"),
            Convenio.uf,
            Convenio.municipio,
            Convenio.cnes,
            Convenio.ano_instrumento.label("ano"),
            Convenio.programa,
            Convenio.valor_global,
            Convenio.situacao.label("situacao_carteira"),
            Convenio.siconv_raw["convenio"]["SIT_CONVENIO"].astext.label("situacao_oficial"),
            InstrumentoEquipamento.situacao_prestacao_contas.label("situacao_monitoramento"),
            (func.coalesce(conclusoes.c.quantidade, 0) > 0).label("conclusao_ativa"),
            conclusoes.c.data.label("data_conclusao"),
        )
        .select_from(Convenio)
        .outerjoin(
            InstrumentoEquipamento,
            (InstrumentoEquipamento.nr_convenio == Convenio.numero)
            & (
                func.coalesce(InstrumentoEquipamento.tipo_contratacao, "Convênio")
                == func.coalesce(Convenio.tipo_contratacao, "Convênio")
            ),
        )
        .outerjoin(conclusoes, conclusoes.c.instrumento_id == InstrumentoEquipamento.id)
        .where(
            Convenio.fora_escopo_equipamentos.is_(False),
            _equipamento(EquipamentoMarcador.convenio_id == Convenio.id, equipamento),
        )
    )
    interno = (
        select(
            InstrumentoEquipamento.nr_convenio.label("numero"),
            InstrumentoEquipamento.nome_convenente.label("nome"),
            func.coalesce(InstrumentoEquipamento.tipo_contratacao, "Convênio").label("tipo"),
            InstrumentoEquipamento.uf,
            InstrumentoEquipamento.municipio,
            InstrumentoEquipamento.cnes,
            InstrumentoEquipamento.ano_instrumento.label("ano"),
            InstrumentoEquipamento.programa,
            InstrumentoEquipamento.situacao_prestacao_contas.label("situacao_monitoramento"),
            (func.coalesce(conclusoes.c.quantidade, 0) > 0).label("conclusao_ativa"),
            conclusoes.c.data.label("data_conclusao"),
        )
        .select_from(InstrumentoEquipamento)
        .outerjoin(
            Convenio,
            (Convenio.numero == InstrumentoEquipamento.nr_convenio)
            & (
                func.coalesce(Convenio.tipo_contratacao, "Convênio")
                == func.coalesce(InstrumentoEquipamento.tipo_contratacao, "Convênio")
            ),
        )
        .outerjoin(conclusoes, conclusoes.c.instrumento_id == InstrumentoEquipamento.id)
        .where(
            Convenio.id.is_(None),
            _equipamento(EquipamentoMarcador.instrumento_equipamento_id == InstrumentoEquipamento.id, equipamento),
        )
    )
    propostas = select(
        PropostaCandidata.cd_parceria.label("numero"),
        PropostaCandidata.nm_proponente.label("nome"),
        PropostaCandidata.uf,
        PropostaCandidata.municipio,
        PropostaCandidata.cnes,
        func.extract("year", PropostaCandidata.data_proposta).label("ano"),
        PropostaCandidata.nm_programa.label("programa"),
        PropostaCandidata.vl_global_proposta.label("valor_global"),
        PropostaCandidata.situacao_proposta.label("situacao_carteira"),
        PropostaCandidata.id_proposta.label("proposta_id"),
        PropostaCandidata.tem_parceria.label("parceria_confirmada"),
        PropostaCandidata.metas_resumo["parceria"]["cd_parceria"].astext.label("codigo_confirmado"),
        PropostaCandidata.metas_resumo["timeline_financeira"]["ordens_pagamento"].label("ordens_raw"),
    ).where(
        PropostaCandidata.tem_parceria.is_(True),
        PropostaCandidata.cd_parceria.is_not(None),
        _equipamento(EquipamentoMarcador.proposta_candidata_id == PropostaCandidata.id, equipamento),
    )
    resultado = []
    for consulta, origem in ((convenio, "instrumento"), (interno, "instrumento"), (propostas, "parceria")):
        for linha in db.execute(consulta.limit(LIMITE + 1)).mappings():
            campos = dict(linha)
            campos["origem"] = origem
            if origem == "parceria":
                campos["tipo"] = "Parceria TransfereGov"
                raw = campos.pop("ordens_raw")
                try:
                    campos["ordens"] = _ORDENS.validate_python(raw if raw is not None else [])
                except ValidationError:
                    campos["evidencia_invalida"] = True
            resultado.append(FatoEncerramento.model_validate(campos))
            if len(resultado) > LIMITE:
                raise LimiteConsultaExcedido
    return resultado
