"""Entrega por item e unidade: regras do Service contra PostgreSQL real.

Cada teste roda numa transação externa com SAVEPOINT (o Service commita; nada permanece no banco de teste).
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db.base import engine
from app.db.models import (
    Convenio,
    EntregaLegadaRevisao,
    EquipamentoCatalogo,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    ItemPlano,
    User,
    UserRole,
)
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.schemas_entregas import EntregaCreate, ItemEntregaCreate, UnidadeEntregaCreate, UnidadeUpdate
from app.services import entregas_equipamento as svc

pytestmark = pytest.mark.db


@pytest.fixture
def db():
    conexao = engine.connect()
    transacao = conexao.begin()
    sessao = Session(bind=conexao, join_transaction_mode="create_savepoint")
    try:
        yield sessao
    finally:
        sessao.close()
        transacao.rollback()
        conexao.close()


def _usuario(db, role: UserRole) -> User:
    u = User(
        name=f"{role.value} pytest",
        email=f"pytest-entrega-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(u)
    db.flush()
    return u


class Cenario:
    def __init__(self, db: Session):
        self.titular = _usuario(db, UserRole.colaborador)
        self.outro = _usuario(db, UserRole.colaborador)
        self.gestor = _usuario(db, UserRole.gestor)
        self.leitor = _usuario(db, UserRole.leitor)
        numero = f"PYT{uuid4().hex[:8]}"
        conv = Convenio(numero=numero, objeto="x", convenente_nome="x")
        db.add(conv)
        db.flush()
        self.inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao="Convênio")
        db.add(self.inst)
        db.flush()
        db.add(InstrumentoResponsavel(instrumento_id=self.inst.id, usuario_id=self.titular.id, papel="titular"))
        self.dois = self._item(db, conv, "Mamógrafo", 2, True)
        self.um = self._item(db, conv, "Colposcópio", 1, True)
        self.livre = self._item(db, conv, "Mesa", 1, False)
        self.sem_qtd = self._item(db, conv, "Ultrassom", None, True)
        outro_conv = Convenio(numero=f"PYT{uuid4().hex[:8]}", objeto="x", convenente_nome="x")
        db.add(outro_conv)
        db.flush()
        outro_inst = InstrumentoEquipamento(
            nr_convenio=outro_conv.numero, nome_convenente="x", tipo_contratacao="Convênio"
        )
        db.add(outro_inst)
        db.flush()
        self.alheio = self._item(db, outro_conv, "Mamógrafo", 5, True, outro_inst.id)
        db.flush()

    def _item(self, db, conv, nome, qtd, controla, instrumento_id=None) -> ItemPlano:
        item = ItemPlano(
            convenio_id=conv.id,
            instrumento_id=instrumento_id or self.inst.id,
            origem="manual",
            id_origem=f"t:{uuid4().hex}",
            descricao=nome,
            controla_unidade=controla,
            quantidade_planejada=qtd,
        )
        db.add(item)
        return item


def _dados(*itens: ItemEntregaCreate, chave: str | None = None, data: date | None = None) -> EntregaCreate:
    return EntregaCreate(
        chave_idempotencia=chave or uuid4().hex, data_ocorrencia=data or date.today(), itens=list(itens)
    )


def _item(
    item: ItemPlano, quantidade: int = 1, series: list[str] | None = None, marca: str | None = None, **kw
) -> ItemEntregaCreate:
    """`quantidade` unidades; as séries preenchem as primeiras."""
    series = series or []
    unidades = [
        UnidadeEntregaCreate(marca=marca, numero_serie=series[i] if i < len(series) else None)
        for i in range(quantidade)
    ]
    return ItemEntregaCreate(item_id=item.id, unidades=unidades, **kw)


def test_entrega_cria_unidades_evento_e_atualiza_a_situacao(db):
    c = Cenario(db)
    entrega = svc.registrar_entrega(
        nr_convenio=c.inst.nr_convenio,
        dados=_dados(_item(c.dois, 2, marca="M", series=["A1"]), _item(c.um)),
        db=db,
        usuario=c.titular,
    )
    assert len(entrega.unidades) == 3
    assert entrega.evento_id is not None
    leitura = svc.listar_equipamentos_do_instrumento(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    situacoes = {i.descricao: i.situacao for i in leitura.itens}
    assert situacoes["Mamógrafo"] == "entregue" and situacoes["Colposcópio"] == "entregue"
    assert leitura.outros_itens == 1 and leitura.pode_editar is True
    mamografo = next(i for i in leitura.itens if i.descricao == "Mamógrafo")
    assert [u.numero_serie for u in mamografo.unidades] == ["A1", None]


def test_entrega_sem_item_e_bloqueada(db):
    c = Cenario(db)
    with pytest.raises(PydanticValidationError):  # 422 já na borda HTTP
        _dados()
    sem_itens = EntregaCreate.model_construct(chave_idempotencia=uuid4().hex, data_ocorrencia=date.today(), itens=[])
    with pytest.raises(ValidationError):  # e de novo no Service, para chamadas fora do HTTP
        svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=sem_itens, db=db, usuario=c.titular)


def test_nao_entrega_acima_do_planejado_nem_item_nao_controlado_nem_de_outro_instrumento(db):
    c = Cenario(db)
    for dados in (_item(c.dois, 3), _item(c.livre), _item(c.alheio)):
        with pytest.raises(ValidationError):
            svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(dados), db=db, usuario=c.titular)
    svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 2)), db=db, usuario=c.titular)
    with pytest.raises(ValidationError):
        svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois)), db=db, usuario=c.titular)


def test_quantidade_desconhecida_exige_confirmacao(db):
    c = Cenario(db)
    with pytest.raises(ValidationError):
        svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.sem_qtd)), db=db, usuario=c.titular)
    svc.registrar_entrega(
        nr_convenio=c.inst.nr_convenio,
        dados=_dados(_item(c.sem_qtd, confirmar_quantidade_desconhecida=True)),
        db=db,
        usuario=c.titular,
    )


def test_serie_repetida_na_entrega_ou_no_item_e_recusada(db):
    c = Cenario(db)
    with pytest.raises(ValidationError):
        svc.registrar_entrega(
            nr_convenio=c.inst.nr_convenio,
            dados=_dados(_item(c.dois, 2, series=["X", "X"])),
            db=db,
            usuario=c.titular,
        )
    svc.registrar_entrega(
        nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, series=["X"])), db=db, usuario=c.titular
    )
    with pytest.raises(ConflictError):
        svc.registrar_entrega(
            nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, series=["X"])), db=db, usuario=c.titular
        )


def test_data_futura_e_recusada(db):
    c = Cenario(db)
    with pytest.raises(ValidationError):
        svc.registrar_entrega(
            nr_convenio=c.inst.nr_convenio,
            dados=_dados(_item(c.um), data=date.today() + timedelta(days=1)),
            db=db,
            usuario=c.titular,
        )


def test_reenvio_com_a_mesma_chave_nao_duplica(db):
    c = Cenario(db)
    dados = _dados(_item(c.dois), chave="chave-fixa-0001")
    primeira = svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=c.titular)
    segunda = svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=c.titular)
    assert primeira.id == segunda.id
    leitura = svc.listar_equipamentos_do_instrumento(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert next(i for i in leitura.itens if i.descricao == "Mamógrafo").quantidade_entregue == 1


def test_autorizacao_por_titularidade(db):
    c = Cenario(db)
    dados = _dados(_item(c.um))
    for intruso in (c.outro, c.leitor):
        with pytest.raises(AuthorizationError):
            svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=intruso)
    svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=dados, db=db, usuario=c.gestor)


def test_instrumento_inexistente_e_404(db):
    c = Cenario(db)
    with pytest.raises(NotFoundError):
        svc.registrar_entrega(nr_convenio="NAO-EXISTE", dados=_dados(_item(c.um)), db=db, usuario=c.gestor)


def test_corrigir_unidade_registra_antes_e_depois_e_protege_serie(db):
    c = Cenario(db)
    entrega = svc.registrar_entrega(
        nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 2, series=["S1", "S2"])), db=db, usuario=c.titular
    )
    primeira, segunda = entrega.unidades
    corrigida = svc.corrigir_unidade(
        unidade_id=primeira.id, dados=UnidadeUpdate(marca="Nova", numero_serie="S9"), db=db, usuario=c.titular
    )
    assert (corrigida.marca, corrigida.numero_serie) == ("Nova", "S9")
    with pytest.raises(ConflictError):
        svc.corrigir_unidade(unidade_id=segunda.id, dados=UnidadeUpdate(numero_serie="S9"), db=db, usuario=c.titular)
    with pytest.raises(AuthorizationError):
        svc.corrigir_unidade(unidade_id=segunda.id, dados=UnidadeUpdate(marca="x"), db=db, usuario=c.outro)


def test_excluir_entrega_libera_a_quantidade_e_exige_motivo(db):
    c = Cenario(db)
    entrega = svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    with pytest.raises(ValidationError):
        svc.excluir_entrega(entrega_id=entrega.id, motivo="  ", db=db, usuario=c.titular)
    svc.excluir_entrega(entrega_id=entrega.id, motivo="lançada por engano", db=db, usuario=c.titular)
    evento = db.get(EventoMarco, entrega.evento_id)
    assert evento is not None and evento.deletado_em is not None
    leitura = svc.listar_equipamentos_do_instrumento(nr_convenio=c.inst.nr_convenio, db=db, usuario=c.titular)
    assert next(i for i in leitura.itens if i.descricao == "Colposcópio").situacao == "pendente"
    svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    with pytest.raises(ValidationError):
        svc.excluir_entrega(entrega_id=entrega.id, motivo="de novo", db=db, usuario=c.titular)


def test_vincular_entrega_legada_resolve_a_revisao(db):
    c = Cenario(db)
    evento = svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.um)), db=db, usuario=c.titular)
    svc.excluir_entrega(entrega_id=evento.id, motivo="simula legado", db=db, usuario=c.titular)
    ev = db.get(EventoMarco, evento.evento_id)
    ev.deletado_em = ev.deletado_por_id = ev.motivo_exclusao = None
    revisao = EntregaLegadaRevisao(instrumento_id=c.inst.id, evento_id=ev.id, motivo="varios_itens")
    db.add(revisao)
    db.flush()
    pendentes = svc.listar_entregas_legadas(db=db, usuario=c.titular)
    assert [p.id for p in pendentes] == [revisao.id]
    assert svc.listar_entregas_legadas(db=db, usuario=c.outro) == []
    assert svc.listar_entregas_legadas(db=db, usuario=c.leitor) == []
    resolvida = svc.vincular_entrega_legada(revisao_id=revisao.id, itens=[_item(c.dois)], db=db, usuario=c.titular)
    assert resolvida.data_ocorrencia == ev.data_ocorrencia
    assert db.get(EntregaLegadaRevisao, revisao.id).situacao == "resolvida"
    with pytest.raises(ConflictError):
        svc.vincular_entrega_legada(revisao_id=revisao.id, itens=[_item(c.dois)], db=db, usuario=c.titular)


def test_http_leitura_exige_sessao_e_devolve_contrato(headers_autenticados):
    from fastapi.testclient import TestClient

    from app.main import app

    cliente = TestClient(app)
    assert cliente.get("/monitoramento/instrumentos/948686/equipamentos").status_code == 401
    resposta = cliente.get("/monitoramento/instrumentos/948686/equipamentos", headers=headers_autenticados)
    assert resposta.status_code == 200
    assert set(resposta.json()) == {"nr_convenio", "pode_editar", "itens", "outros_itens", "revisoes_pendentes"}
    assert (
        cliente.get("/monitoramento/instrumentos/NAO-EXISTE/equipamentos", headers=headers_autenticados).status_code
        == 404
    )
    assert cliente.post("/monitoramento/instrumentos/948686/entregas", json={}).status_code == 403  # sem CSRF/sessão


def test_cada_unidade_e_lancada_com_os_proprios_dados(db):
    c = Cenario(db)
    item = ItemEntregaCreate(
        item_id=c.dois.id,
        unidades=[
            UnidadeEntregaCreate(marca="A", modelo="M1", numero_serie="X1", vida_util_anos=10),
            UnidadeEntregaCreate(marca="B", modelo="M2", numero_serie="X2", vida_util_anos=8),
        ],
    )
    entrega = svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(item), db=db, usuario=c.titular)
    assert [(u.marca, u.modelo, u.numero_serie, u.vida_util_anos) for u in entrega.unidades] == [
        ("A", "M1", "X1", 10),
        ("B", "M2", "X2", 8),
    ]


def test_relatorio_conta_unidades_entregues_so_onde_ha_controle(db):
    from app.repositories import itens_equipamento as repo

    c = Cenario(db)
    assert repo.unidades_entregues_por_instrumento(db, {c.inst.id}) == {c.inst.id: 0}
    svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 2)), db=db, usuario=c.titular)
    assert repo.unidades_entregues_por_instrumento(db, {c.inst.id}) == {c.inst.id: 2}
    sem_controle = InstrumentoEquipamento(
        nr_convenio=f"PYT{uuid4().hex[:8]}", nome_convenente="x", tipo_contratacao="Convênio"
    )
    db.add(sem_controle)
    db.flush()
    assert repo.unidades_entregues_por_instrumento(db, {sem_controle.id}) == {}


def test_resumo_planejado_x_entregue_por_familia(db):
    from app.repositories import itens_equipamento as repo

    c = Cenario(db)
    mamografo = EquipamentoCatalogo(codigo=f"fam{uuid4().hex[:6]}", nome=f"Familia {uuid4().hex[:6]}")
    db.add(mamografo)
    db.flush()
    c.dois.catalogo_id = mamografo.id
    db.flush()
    svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 1)), db=db, usuario=c.titular)
    assert repo.resumo_por_instrumento_e_familia(db, {c.inst.id}) == [(c.inst.id, mamografo.nome, 2, 1)]


def test_relatorio_de_instrumentos_traz_entregues_por_familia_do_convenio(db):
    from app.services.relatorios import _entregues_por_convenio

    c = Cenario(db)
    familia = EquipamentoCatalogo(codigo=f"fam{uuid4().hex[:6]}", nome=f"Familia {uuid4().hex[:6]}")
    db.add(familia)
    db.flush()
    c.dois.catalogo_id = familia.id
    db.flush()
    svc.registrar_entrega(nr_convenio=c.inst.nr_convenio, dados=_dados(_item(c.dois, 2)), db=db, usuario=c.titular)
    convenio = db.get(Convenio, c.dois.convenio_id)
    assert _entregues_por_convenio(db, [convenio]) == {convenio.id: {familia.nome: 2}}
