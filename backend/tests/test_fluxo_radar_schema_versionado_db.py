"""Services reais do Radar sobre cadeia Alembic, sem create_all ou rede."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from alembic import command
from app.db.models import (
    Base,
    Convenio,
    EquipamentoCatalogo,
    EquipamentoMarcador,
    FonteCaptura,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    User,
    UserRole,
    UserStatus,
)
from app.db.models_legado import CandidatoLegadoDecisao, CandidatoLegadoRecaptura, CandidatoLegadoRegistro
from app.domain_errors import AuthorizationError, ConflictError
from app.schemas_aprovacao_legado import AprovacaoLegadoCreate
from app.schemas_filhas_legado import CHAVES_FILHAS
from app.schemas_legado import ReferenciaDescoberta
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.schemas_recaptura_persistencia import ReferenciaRecaptura
from app.services.aprovacao_legado import aprovar_entrada
from app.services.candidatos_legados import registrar_descoberta
from app.services.recapturas_legado import registrar_recaptura
from app.services.revisao_legado import preparar_revisao
from tests.test_cadeia_migrations_recuperacao_db import banco_migrations as banco_migrations
from tests.test_prova_recaptura_legado import candidato
from tests.test_prova_recaptura_legado import dados as dados


@pytest.fixture
def radar_versionado(banco_migrations):
    conexao, config = banco_migrations
    command.upgrade(config, "head")
    # Usuários institucionais seedados pela revisão histórica não participam
    # nem são copiados/exportados. O fluxo usa somente identidades sintéticas.
    conexao.execute(
        text("""UPDATE "user" SET status='inactive',
        name='Pessoa sintética ' || id::text, email='inativo-' || id::text || '@example.com',
        password_hash='!inutilizavel!'""")
    )
    conexao.commit()
    with Session(conexao) as db:
        usuarios = {}
        for perfil in (UserRole.admin, UserRole.gestor, UserRole.colaborador, UserRole.leitor):
            usuario = User(
                name=f"Pessoa {perfil.value}",
                email=f"{perfil.value}@example.com",
                password_hash="!inutilizavel!",
                role=perfil,
                status=UserStatus.active,
            )
            db.add(usuario)
            usuarios[perfil.value] = usuario
        if db.scalar(select(EquipamentoCatalogo.id).where(EquipamentoCatalogo.codigo == "mamografo")) is None:
            db.add(EquipamentoCatalogo(codigo="mamografo", nome="Mamógrafo", prioritario=True))
        db.commit()
        yield db, usuarios


def preparar_fluxo(db, dados):
    registrar_descoberta(
        db=db,
        candidatos=[candidato(dados)],
        referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="a" * 64),
    )
    registro = db.scalar(select(CandidatoLegadoRegistro))
    ref = ReferenciaRecaptura(candidato_id=registro.id, captura_id=registro.ultima_captura_id)
    prova = registrar_recaptura(
        db=db,
        referencia=ref,
        captura=CapturaLegadoParaPromocao.model_validate(dados),
        origem=OrigemRecapturaColetada(
            iniciado_em=datetime.now(UTC),
            hash_convenios="b" * 64,
            hash_itens="c" * 64,
            hash_proposta="d" * 64,
            hashes_filhas={c: "e" * 64 for c in CHAVES_FILHAS},
            hashes_programas={c: "f" * 64 for c in ("siconv_programa_proposta", "siconv_programa")},
            payload_protegido_local=True,
        ),
    )
    pedido = AprovacaoLegadoCreate(
        chave=uuid4(),
        captura_id=ref.captura_id,
        recaptura_id=prova.id,
        hash_revisado=prova.hash_conteudo,
        versao=0,
        justificativa="Evidência sintética revisada pela gestão",
    )
    return ref, prova, pedido


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_fluxo_real_aprova_replay_preserva_fonte_e_notifica_gestao(radar_versionado, dados, perfil):
    # Arrange: a situação e o decimal devem atravessar todo o fluxo literalmente.
    db, usuarios = radar_versionado
    dados["convenio"]["SIT_CONVENIO"] = "Prestação de Contas Concluída"
    dados["convenio"]["VL_GLOBAL_CONV"] = "1000.123456789"
    ref, prova, pedido = preparar_fluxo(db, dados)
    revisao = preparar_revisao(db=db, usuario_id=usuarios[perfil].id, candidato_id=ref.candidato_id, dados=pedido)
    assert revisao.recaptura_id == prova.id
    # Act: revisão, aprovação e replay reais, sem mock dos services/repositories.
    decisao = aprovar_entrada(db=db, usuario_id=usuarios[perfil].id, candidato_id=ref.candidato_id, dados=pedido)
    assert (
        aprovar_entrada(db=db, usuario_id=usuarios[perfil].id, candidato_id=ref.candidato_id, dados=pedido) == decisao
    )
    # Assert: somente carteira; monitoramento pós-repasse não nasce automaticamente.
    convenio = db.scalar(select(Convenio))
    assert convenio.numero == "999001" and convenio.situacao == "Prestação de Contas Concluída"
    assert convenio.valor_global == Decimal("1000.123456789")
    assert db.scalar(select(func.count()).select_from(InstrumentoEquipamento)) == 0
    assert db.scalar(select(func.count()).select_from(EquipamentoMarcador)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoRecaptura)) == 1
    avisos = list(db.scalars(select(Notificacao).order_by(Notificacao.id)))
    assert [a.tipo for a in avisos] == [NotificacaoTipo.convenio_descoberto, NotificacaoTipo.aprovacao_carteira]
    for aviso in avisos:
        ids = set(
            db.scalars(
                select(NotificacaoDestinatario.usuario_id).where(NotificacaoDestinatario.notificacao_id == aviso.id)
            )
        )
        assert ids == {usuarios["admin"].id, usuarios["gestor"].id}


@pytest.mark.parametrize("perfil", ["colaborador", "leitor"])
def test_schema_versionado_nao_permite_aprovacao_sem_perfil(radar_versionado, dados, perfil):
    db, usuarios = radar_versionado
    ref, _, pedido = preparar_fluxo(db, dados)
    with pytest.raises(AuthorizationError):
        aprovar_entrada(db=db, usuario_id=usuarios[perfil].id, candidato_id=ref.candidato_id, dados=pedido)
    assert db.scalar(select(func.count()).select_from(Convenio)) == 0
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 0
    assert list(db.scalars(select(Notificacao.tipo))) == [NotificacaoTipo.convenio_descoberto]


def test_schema_versionado_bloqueia_prova_expirada_sem_inclusao_parcial(radar_versionado, dados):
    db, usuarios = radar_versionado
    ref, prova, pedido = preparar_fluxo(db, dados)
    rodada = db.get(FonteCaptura, prova.fonte_captura_id)
    rodada.iniciado_em = datetime.now(UTC) - timedelta(hours=25)
    db.commit()
    with pytest.raises(ConflictError):
        aprovar_entrada(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    assert db.scalar(select(func.count()).select_from(Convenio)) == 0
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 0
    assert list(db.scalars(select(Notificacao.tipo))) == [NotificacaoTipo.convenio_descoberto]


def test_schema_versionado_contem_tabelas_e_colunas_de_todos_modelos_registrados(radar_versionado):
    # Arrange: registry real da aplicação, não somente as quatro tabelas novas.
    db, _ = radar_versionado
    inspector = inspect(db.get_bind())
    existentes = set(inspector.get_table_names())
    esperadas = set(Base.metadata.tables)
    # Assert: colunas extras de expand-contract são permitidas; faltas não.
    assert esperadas <= existentes, sorted(esperadas - existentes)
    for nome, tabela in Base.metadata.tables.items():
        colunas = {coluna["name"] for coluna in inspector.get_columns(nome)}
        assert set(tabela.columns.keys()) <= colunas, (nome, sorted(set(tabela.columns.keys()) - colunas))
