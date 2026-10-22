"""Carteira sintética maior que um lote, independente das fontes oficiais."""

from datetime import date

from sqlalchemy import insert, select

from app.db.models import Convenio, EventoMarco, InstrumentoEquipamento, MarcoCatalogo


def criar_monitorados_limite(db, quantidade=501):
    db.execute(
        insert(InstrumentoEquipamento),
        [
            {
                "nr_convenio": f"QA_MON_{n:04}",
                "nome_convenente": "Instituição sintética",
                "uf": "AC",
                "municipio": "AAAA sintético",
                "tipo_contratacao": "FAF",
                "ano_instrumento": 2010,
            }
            for n in range(quantidade)
        ],
    )
    db.flush()
    return list(
        db.scalars(
            select(InstrumentoEquipamento)
            .where(InstrumentoEquipamento.nr_convenio.like("QA_MON_%"))
            .order_by(InstrumentoEquipamento.nr_convenio)
        )
    )


def concluir_monitorados(db, instrumentos):
    marcos = {m.codigo: m for m in db.scalars(select(MarcoCatalogo))}
    fase = marcos["fase_concluido"]
    inauguracao = marcos["cronograma_previsao_inauguracao"]
    db.execute(
        insert(EventoMarco),
        [{"instrumento_id": i.id, "marco_id": fase.id, "data_ocorrencia": date(2010, 1, 1)} for i in instrumentos],
    )
    db.execute(
        insert(EventoMarco),
        [
            {
                "instrumento_id": i.id,
                "marco_id": inauguracao.id,
                "fase_geral_id": fase.id,
                "data_ocorrencia": date(2010, 1, 1),
            }
            for i in instrumentos
        ],
    )


def ocultar_monitorados(db, instrumentos):
    db.execute(
        insert(Convenio),
        [
            {
                "numero": i.nr_convenio,
                "convenente_nome": "Obra sintética excluída",
                "uf": "AC",
                "fora_escopo_equipamentos": True,
            }
            for i in instrumentos
        ],
    )
