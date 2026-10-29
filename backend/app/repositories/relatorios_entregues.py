"""Unidades entregues com o instrumento e o item, sem escrita."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    EntregaEquipamento,
    EquipamentoCatalogo,
    InstrumentoEquipamento,
    ItemPlano,
    UnidadeEquipamento,
)
from app.repositories.itens_equipamento import _nome_renem_vigente
from app.repositories.limites_relatorio import LimiteConsultaExcedido

LIMITE = 20000


def listar_unidades_entregues(db: Session) -> list[dict]:
    consulta = (
        select(
            InstrumentoEquipamento.nr_convenio.label("instrumento"),
            InstrumentoEquipamento.nome_convenente.label("convenente"),
            InstrumentoEquipamento.tipo_contratacao.label("tipo"),
            InstrumentoEquipamento.uf,
            InstrumentoEquipamento.municipio,
            InstrumentoEquipamento.cnes,
            InstrumentoEquipamento.ano_instrumento.label("ano"),
            InstrumentoEquipamento.programa,
            ItemPlano.descricao.label("descricao_item"),
            _nome_renem_vigente().label("nome_renem"),
            EquipamentoCatalogo.nome.label("familia"),
            UnidadeEquipamento.ordem,
            UnidadeEquipamento.marca,
            UnidadeEquipamento.modelo,
            UnidadeEquipamento.numero_serie,
            UnidadeEquipamento.vida_util_anos,
            EntregaEquipamento.data_ocorrencia.label("data_entrega"),
        )
        .select_from(UnidadeEquipamento)
        .join(EntregaEquipamento, EntregaEquipamento.id == UnidadeEquipamento.entrega_id)
        .join(ItemPlano, ItemPlano.id == UnidadeEquipamento.item_id)
        .join(InstrumentoEquipamento, InstrumentoEquipamento.id == EntregaEquipamento.instrumento_id)
        .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(EntregaEquipamento.deletado_em.is_(None), EntregaEquipamento.substituido_por_id.is_(None))
        .order_by(InstrumentoEquipamento.nr_convenio, ItemPlano.id, UnidadeEquipamento.ordem)
        .limit(LIMITE + 1)
    )
    linhas = [dict(linha) for linha in db.execute(consulta).mappings()]
    if len(linhas) > LIMITE:
        raise LimiteConsultaExcedido
    return linhas
