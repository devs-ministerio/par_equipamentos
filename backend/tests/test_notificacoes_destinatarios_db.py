"""Matriz de destinatários em schema PostgreSQL sintético e descartável."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from app.db.base import engine
from app.db.models import (
    Base,
    Convenio,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    User,
    UserRole,
    UserStatus,
)
from app.repositories.notificacoes import criar_notificacao, resolver_destinatarios
from scripts.homologacao_local import validar_url_banco


@pytest.fixture
def matriz():
    validar_url_banco(engine.url.render_as_string(hide_password=False), teste=True)
    schema = "pytest_destinatarios_" + uuid4().hex
    isolado = engine.execution_options(schema_translate_map={None: schema})
    with engine.begin() as conn:
        conn.execute(CreateSchema(schema))
    try:
        Base.metadata.create_all(isolado)
        with Session(isolado) as db:
            usuarios = {}
            for nome, role, status, excluido in (
                ("admin", UserRole.admin, UserStatus.active, False),
                ("gestor", UserRole.gestor, UserStatus.active, False),
                ("titular", UserRole.colaborador, UserStatus.active, False),
                ("suplente", UserRole.colaborador, UserStatus.active, False),
                ("outro", UserRole.colaborador, UserStatus.active, False),
                ("leitor", UserRole.leitor, UserStatus.active, False),
                ("inativo", UserRole.colaborador, UserStatus.inactive, False),
                ("suspenso", UserRole.colaborador, UserStatus.suspended, False),
                ("excluido", UserRole.colaborador, UserStatus.active, True),
                ("admin_excluido", UserRole.admin, UserStatus.active, True),
                ("gestor_inativo", UserRole.gestor, UserStatus.inactive, False),
            ):
                usuario = User(
                    name=nome,
                    email=f"{nome}@example.com",
                    password_hash="hash-sintetico-nao-autenticavel",
                    role=role,
                    status=status,
                    deleted_at=datetime.now(UTC) if excluido else None,
                )
                db.add(usuario)
                usuarios[nome] = usuario
            instrumento = InstrumentoEquipamento(nr_convenio="123", nome_convenente="Instituição sintética")
            convenio = Convenio(numero="123", convenente_nome="Instituição sintética")
            db.add_all([instrumento, convenio])
            db.commit()
            yield db, usuarios, instrumento, convenio
    finally:
        assert schema.startswith("pytest_destinatarios_") and len(schema) == len("pytest_destinatarios_") + 32
        with engine.begin() as conn:
            conn.execute(DropSchema(schema, cascade=True))


@pytest.mark.parametrize(
    "tipo", [NotificacaoTipo.atualizacao_api, NotificacaoTipo.edicao_manual, NotificacaoTipo.alerta_vigencia]
)
@pytest.mark.parametrize("dono", [None, "titular", "inativo", "suspenso", "leitor", "excluido"])
def test_matriz_de_responsabilidade_materializa_apenas_destinatarios_autorizados(matriz, tipo, dono):
    # Arrange: vínculo cadastrado não é removido por inatividade/exclusão.
    db, usuarios, instrumento, convenio = matriz
    esperados = {usuarios["admin"].id, usuarios["gestor"].id}
    if dono is None:
        esperados.update(usuarios[n].id for n in ("titular", "suplente", "outro"))
    else:
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=usuarios[dono].id, papel="titular"))
        if dono == "titular":
            db.add(
                InstrumentoResponsavel(
                    instrumento_id=instrumento.id, usuario_id=usuarios["suplente"].id, papel="suplente"
                )
            )
            esperados.update(usuarios[n].id for n in ("titular", "suplente"))
        db.commit()
    entidade_id = convenio.id if tipo == NotificacaoTipo.alerta_vigencia else instrumento.id
    # Act: Repository e persistência reais; não substitui domínio por mocks.
    aviso = criar_notificacao(db, Notificacao(tipo=tipo, titulo="Mudança sintética agrupada", entidade_id=entidade_id))
    db.commit()
    # Assert: conjunto exato, sem leitor/inativo/excluído ou colaborador alheio.
    destinatarios = list(
        db.scalars(select(NotificacaoDestinatario.usuario_id).where(NotificacaoDestinatario.notificacao_id == aviso.id))
    )
    assert set(destinatarios) == esperados and len(destinatarios) == len(esperados)
    assert resolver_destinatarios(db, tipo=tipo, entidade_id=entidade_id) == esperados


@pytest.mark.parametrize(
    "tipo",
    [NotificacaoTipo.inclusao_monitoramento, NotificacaoTipo.fonte_indisponivel, NotificacaoTipo.proposta_candidata],
)
def test_matriz_de_avisos_gerenciais_e_propostas_exclui_contas_inaptas(matriz, tipo):
    # Arrange
    db, usuarios, instrumento, _ = matriz
    esperados = {usuarios["admin"].id, usuarios["gestor"].id}
    if tipo == NotificacaoTipo.proposta_candidata:
        esperados.update(usuarios[n].id for n in ("titular", "suplente", "outro"))
    # Act
    aviso = criar_notificacao(db, Notificacao(tipo=tipo, titulo="Aviso sintético", entidade_id=instrumento.id))
    db.commit()
    # Assert
    ids = list(
        db.scalars(select(NotificacaoDestinatario.usuario_id).where(NotificacaoDestinatario.notificacao_id == aviso.id))
    )
    assert set(ids) == esperados and len(ids) == len(esperados)


@pytest.mark.parametrize(
    "tipo", [NotificacaoTipo.atualizacao_api, NotificacaoTipo.edicao_manual, NotificacaoTipo.alerta_vigencia]
)
def test_responsavel_inativo_sem_gestores_nao_amplia_escopo(matriz, tipo):
    # Arrange: existe um responsável, mesmo sem destinatário elegível.
    db, usuarios, instrumento, convenio = matriz
    usuarios["admin"].status = UserStatus.inactive
    usuarios["gestor"].status = UserStatus.inactive
    db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=usuarios["inativo"].id, papel="titular"))
    db.commit()
    # Act
    entidade_id = convenio.id if tipo == NotificacaoTipo.alerta_vigencia else instrumento.id
    aviso = criar_notificacao(db, Notificacao(tipo=tipo, titulo="Escopo restrito", entidade_id=entidade_id))
    db.commit()
    # Assert: ausência de destinatário não autoriza broadcast para outros técnicos.
    assert (
        list(db.scalars(select(NotificacaoDestinatario.id).where(NotificacaoDestinatario.notificacao_id == aviso.id)))
        == []
    )
