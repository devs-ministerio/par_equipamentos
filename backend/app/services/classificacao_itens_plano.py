"""Fila de revisão da classificação dos itens do plano (gestor e admin).

O motor deixa para a equipe só o que não decide com segurança. Cada ação grava uma decisão append-only
(`origem=tecnico`) que substitui a anterior sem apagá-la, atualiza o item e vai para o AuditLog.
A projeção (`scripts/projetar_itens_plano.py`) reaplica as decisões vigentes, então a escolha não se perde.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.classificacao_itens import chave_do_item
from app.db.models import (
    CodigoItemLegado,
    Convenio,
    DecisaoClassificacaoItem,
    EquipamentoCatalogo,
    InstrumentoEquipamento,
    ItemPlano,
    RenemItem,
    User,
    UserRole,
)
from app.domain_errors import AuthorizationError, NotFoundError, ValidationError
from app.equipamentos import normalizar_texto
from app.schemas_classificacao import DecisaoItemCreate, ItemParaRevisaoRead


def _assert_gestao(usuario: User) -> None:
    if usuario.role not in (UserRole.admin, UserRole.gestor):
        raise AuthorizationError("Apenas gestor e administrador revisam a classificação dos itens.")


def listar_fila(*, db: Session, usuario: User) -> list[ItemParaRevisaoRead]:
    _assert_gestao(usuario)
    linhas = db.execute(
        select(ItemPlano, Convenio.numero, InstrumentoEquipamento.nr_convenio, EquipamentoCatalogo.nome)
        .join(Convenio, Convenio.id == ItemPlano.convenio_id)
        .outerjoin(InstrumentoEquipamento, InstrumentoEquipamento.id == ItemPlano.instrumento_id)
        .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(ItemPlano.situacao_classificacao == "pendente", ItemPlano.ativo.is_(True))
        .order_by(ItemPlano.id)
    ).all()
    return [
        ItemParaRevisaoRead(
            id=item.id,
            convenio_numero=numero,
            instrumento_nr_convenio=nr,
            descricao=item.descricao,
            valor_total=float(item.valor_total) if item.valor_total is not None else None,
            tipo_lancamento=item.tipo_lancamento,  # type: ignore[arg-type]
            codigo_item=item.codigo_item,
            familia=familia,
            motivo=item.motivo_classificacao,
        )
        for item, numero, nr, familia in linhas
    ]


def _catalogo_do_codigo(db: Session, codigo: str) -> int | None:
    renem = db.execute(select(RenemItem).where(RenemItem.codigo_item == codigo)).scalars().first()
    if renem is not None:
        return renem.catalogo_id
    legado = db.execute(select(CodigoItemLegado).where(CodigoItemLegado.codigo_item == codigo)).scalar_one_or_none()
    if legado is None:
        raise ValidationError(f"O código {codigo} não consta da RENEM nem dos códigos legados.")
    return legado.catalogo_id


def _gravar_decisao(db: Session, *, convenio_numero: str, chave: str, **campos: object) -> None:
    vigente = db.execute(
        select(DecisaoClassificacaoItem).where(
            DecisaoClassificacaoItem.convenio_numero == convenio_numero,
            DecisaoClassificacaoItem.chave_item == chave,
            DecisaoClassificacaoItem.substituida_por_id.is_(None),
        )
    ).scalar_one_or_none()
    nova = DecisaoClassificacaoItem(convenio_numero=convenio_numero, chave_item=chave, **campos)
    if vigente is None:
        db.add(nova)
        db.flush()
        return
    # O índice único admite uma vigente por item: entra com chave provisória e assume a real depois.
    nova.chave_item = chave + "#novo"
    db.add(nova)
    db.flush()
    vigente.substituida_por_id = nova.id
    db.flush()
    nova.chave_item = chave
    db.flush()


def decidir(*, item_id: int, dados: DecisaoItemCreate, db: Session, usuario: User) -> ItemParaRevisaoRead:
    _assert_gestao(usuario)
    item = db.get(ItemPlano, item_id, with_for_update=True)
    if item is None or not item.ativo:
        raise NotFoundError(f"Item {item_id} não encontrado.")
    convenio = db.get(Convenio, item.convenio_id)
    assert convenio is not None
    tipo = item.tipo_lancamento
    codigo, catalogo_id = item.codigo_item, item.catalogo_id
    if dados.acao == "nao_equipamento":
        tipo, codigo, catalogo_id = "nao_equipamento", None, None
    elif dados.acao == "corrigir":
        if dados.tipo_lancamento is None:
            raise ValidationError("Informe o tipo de lançamento da correção.")
        tipo = dados.tipo_lancamento
        if tipo == "aquisicao" and dados.codigo_item is not None:
            codigo, catalogo_id = dados.codigo_item, _catalogo_do_codigo(db, dados.codigo_item)
        elif tipo != "aquisicao":
            codigo = None
    elif tipo == "multiplo":
        raise ValidationError("Um item com mais de um equipamento precisa ser corrigido, não confirmado.")
    catalogo = db.get(EquipamentoCatalogo, catalogo_id) if catalogo_id else None
    controla = tipo == "aquisicao" and catalogo is not None and catalogo.controle_por_unidade
    chave = (
        chave_do_item({"ID_ITEM_PAD": item.id_origem})
        if item.origem == "siconv"
        else chave_do_item({"DESCRICAO_ITEM": normalizar_texto(item.descricao)})
    )
    _gravar_decisao(
        db,
        convenio_numero=convenio.numero,
        chave=chave,
        tipo_lancamento=tipo,
        codigo_item=codigo,
        conta_unidade=controla,
        origem="tecnico",
        status="aplicada",
        observacao=dados.observacao,
    )
    antes = {"tipo": item.tipo_lancamento, "codigo": item.codigo_item, "controla": item.controla_unidade}
    item.tipo_lancamento, item.codigo_item, item.catalogo_id = tipo, codigo, catalogo_id
    if codigo is not None and codigo != antes["codigo"]:
        item.codigo_fonte = "definido_pela_equipe"
    item.controla_unidade = controla
    item.situacao_classificacao = "aplicada"
    item.motivo_classificacao = dados.observacao or "Decisão da equipe"
    log_action(
        db,
        user_id=usuario.id,
        entity_name="item_plano",
        entity_id=item.id,
        action="classificacao_decidida",
        details={"acao": dados.acao, "antes": antes, "depois": {"tipo": tipo, "codigo": codigo, "controla": controla}},
    )
    db.commit()
    return ItemParaRevisaoRead(
        id=item.id,
        convenio_numero=convenio.numero,
        instrumento_nr_convenio=None,
        descricao=item.descricao,
        valor_total=float(item.valor_total) if item.valor_total is not None else None,
        tipo_lancamento=tipo,  # type: ignore[arg-type]
        codigo_item=codigo,
        familia=catalogo.nome if catalogo else None,
        motivo=item.motivo_classificacao,
    )
