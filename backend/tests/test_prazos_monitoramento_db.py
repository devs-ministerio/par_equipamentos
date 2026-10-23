"""Avisos de prazo D-1/D0/D+1: janelas, deduplicação, invalidação e destinatários."""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.db.base import engine
from app.db.models import (
    AcaoMonitoramento,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    MarcoCatalogo,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    User,
    UserRole,
)
from app.services.prazos_monitoramento import executar

pytestmark = pytest.mark.db
HOJE = date(2026, 10, 23)


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
        name=f"{role.value} prazo",
        email=f"pytest-prazo-{uuid4()}@example.com",
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
        self.leitor = _usuario(db, UserRole.leitor)
        self.inst = InstrumentoEquipamento(
            nr_convenio=f"PRZ{uuid4().hex[:8]}", nome_convenente="x", tipo_contratacao="Convênio"
        )
        db.add(self.inst)
        db.flush()
        db.add(InstrumentoResponsavel(instrumento_id=self.inst.id, usuario_id=self.titular.id, papel="titular"))
        db.flush()
        self.db = db

    def acao(self, dias: int | None, **kw) -> AcaoMonitoramento:
        a = AcaoMonitoramento(
            instrumento_id=self.inst.id,
            descricao="Cobrar entrega",
            data_prevista=HOJE + timedelta(days=dias) if dias is not None else None,
            **kw,
        )
        self.db.add(a)
        self.db.flush()
        return a

    def avisos(self) -> list[Notificacao]:
        return list(
            self.db.execute(
                select(Notificacao).where(
                    Notificacao.entidade_id == self.inst.id,
                    Notificacao.tipo.in_([NotificacaoTipo.prazo_acao, NotificacaoTipo.prazo_inauguracao]),
                )
            ).scalars()
        )

    def destinatarios(self, notificacao: Notificacao) -> set[int]:
        return set(
            self.db.execute(
                select(NotificacaoDestinatario.usuario_id).where(
                    NotificacaoDestinatario.notificacao_id == notificacao.id
                )
            ).scalars()
        )


@pytest.mark.parametrize("dias,janela", [(1, "D-1"), (0, "D0"), (-1, "D+1")])
def test_avisa_nas_tres_janelas(db, dias, janela):
    c = Cenario(db)
    c.acao(dias)
    executar(db, hoje=HOJE, aplicar=True)
    (aviso,) = c.avisos()
    assert aviso.chave_dedup is not None and aviso.chave_dedup.endswith(f":{janela}")


@pytest.mark.parametrize("dias", [None, 2, 5, -2, -10])
def test_fora_das_janelas_nao_avisa(db, dias):
    c = Cenario(db)
    c.acao(dias)
    executar(db, hoje=HOJE, aplicar=True)
    assert c.avisos() == []


def test_simulacao_nao_grava_e_reexecucao_nao_duplica(db):
    c = Cenario(db)
    c.acao(0)
    simulado = executar(db, hoje=HOJE, aplicar=False)
    assert simulado.avisos["D0"] >= 1 and c.avisos() == []
    executar(db, hoje=HOJE, aplicar=True)
    segundo = executar(db, hoje=HOJE, aplicar=True)
    assert len(c.avisos()) == 1 and segundo.avisos["D0"] == 0 and segundo.ja_emitidos >= 1


def test_destinatarios_titular_e_gestao_sem_leitor_nem_outro_colaborador(db):
    c = Cenario(db)
    gestor = _usuario(db, UserRole.gestor)
    c.acao(0)
    executar(db, hoje=HOJE, aplicar=True)
    (aviso,) = c.avisos()
    quem = c.destinatarios(aviso)
    assert {c.titular.id, gestor.id} <= quem
    assert c.leitor.id not in quem and c.outro.id not in quem


def test_concluir_ou_reagendar_arquivam_os_avisos_antigos(db):
    c = Cenario(db)
    acao = c.acao(1)
    executar(db, hoje=HOJE, aplicar=True)
    (aviso,) = c.avisos()
    acao.data_prevista = HOJE + timedelta(days=10)
    db.flush()
    r = executar(db, hoje=HOJE, aplicar=True)
    assert r.arquivados >= 1
    arquivadas = (
        db.execute(select(NotificacaoDestinatario.arquivada).where(NotificacaoDestinatario.notificacao_id == aviso.id))
        .scalars()
        .all()
    )
    assert arquivadas and all(arquivadas)
    # concluída: mesmo dentro da janela, nada novo
    acao.data_prevista = HOJE
    acao.data_conclusao = HOJE
    db.flush()
    executar(db, hoje=HOJE, aplicar=True)
    assert len(c.avisos()) == 1


def test_inauguracao_prevista_avisa_so_enquanto_nao_realizada(db):
    c = Cenario(db)
    marco = db.execute(
        select(MarcoCatalogo).where(MarcoCatalogo.codigo == "cronograma_previsao_inauguracao")
    ).scalar_one()
    evento = EventoMarco(instrumento_id=c.inst.id, marco_id=marco.id, data_prevista=HOJE + timedelta(days=1))
    db.add(evento)
    db.flush()
    executar(db, hoje=HOJE, aplicar=True)
    (aviso,) = c.avisos()
    assert aviso.tipo == NotificacaoTipo.prazo_inauguracao
    # realizada em seguida: o aviso de D0 não nasce
    evento.data_ocorrencia = HOJE
    db.flush()
    executar(db, hoje=HOJE + timedelta(days=1), aplicar=True)
    assert len(c.avisos()) == 1
