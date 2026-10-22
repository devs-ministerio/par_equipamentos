"""Privilégios efetivos via SET ROLE, sem senha ou alteração do clone servido."""

import pytest
from psycopg import Error as PsycopgError
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import DBAPIError

from app.db.models import Convenio, InstrumentoEquipamento, Notificacao
from app.db.models_legado import CandidatoLegadoDecisao, CandidatoLegadoRecaptura
from app.domain_errors import AuthorizationError
from app.services.aprovacao_legado import aprovar_entrada
from tests.runtime_radar_fixture import nome_runtime_sintetico, sessao_runtime_radar
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_radar_append_only_recuperado_db import historico_protegido as historico_protegido
from tests.test_revisao_legado_recuperada_db import preparar_prova


@pytest.fixture
def runtime(historico_protegido):
    dono, usuarios, *_ = historico_protegido
    ids = {nome: usuario.id for nome, usuario in usuarios.items()}
    bind = dono.get_bind()
    schema = bind.get_execution_options()["schema_translate_map"][None]
    dono.commit()
    with sessao_runtime_radar(bind, schema) as db:
        yield db, ids, schema


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_recaptura_aprovacao_replay_sob_role_runtime(runtime, dados, perfil):
    db, usuarios, schema = runtime
    ref, _, _, prova, pedido = preparar_prova(db, dados)
    parametros = dict(db=db, usuario_id=usuarios[perfil], candidato_id=ref.candidato_id, dados=pedido)
    decisao = aprovar_entrada(**parametros)
    assert aprovar_entrada(**parametros) == decisao
    assert db.scalar(text("SELECT current_user")) == nome_runtime_sintetico(schema)
    assert db.get(CandidatoLegadoDecisao, decisao.id).recaptura_id == prova.id
    for modelo, esperado in ((Convenio, 2), (InstrumentoEquipamento, 1), (Notificacao, 1), (CandidatoLegadoDecisao, 1)):
        assert db.scalar(select(func.count()).select_from(modelo)) == esperado


@pytest.mark.parametrize("perfil", ["titular", "leitor", "admin_excluido", "gestor_inativo"])
def test_role_banco_dml_nao_contorna_autorizacao_do_service(runtime, dados, perfil):
    db, usuarios, _ = runtime
    ref, _, _, _, pedido = preparar_prova(db, dados)
    with pytest.raises(AuthorizationError):
        aprovar_entrada(db=db, usuario_id=usuarios[perfil], candidato_id=ref.candidato_id, dados=pedido)
    assert db.scalar(select(func.count()).select_from(Convenio)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 0
    assert db.scalar(select(func.count()).select_from(Notificacao)) == 0


@pytest.mark.parametrize("operacao", ["update", "delete"])
def test_runtime_nao_altera_prova_mesmo_com_permissao_dml(runtime, dados, operacao):
    db, _, _ = runtime
    _, _, _, prova, _ = preparar_prova(db, dados)
    comando = (
        update(CandidatoLegadoRecaptura)
        .where(CandidatoLegadoRecaptura.id == prova.id)
        .values(situacao="Alteração indevida")
        if operacao == "update"
        else delete(CandidatoLegadoRecaptura).where(CandidatoLegadoRecaptura.id == prova.id)
    )
    with pytest.raises(DBAPIError, match="imutável") as erro, db.begin_nested():
        db.execute(comando.execution_options(synchronize_session=False))
    assert isinstance(erro.value.orig, PsycopgError)
    assert erro.value.orig.sqlstate == "P0001"
    assert db.get(CandidatoLegadoRecaptura, prova.id).hash_conteudo == prova.hash_conteudo


@pytest.mark.parametrize("operacao", ["update", "delete"])
def test_runtime_nao_altera_decisao_aprovada(runtime, dados, operacao):
    db, usuarios, _ = runtime
    ref, _, _, _, pedido = preparar_prova(db, dados)
    decisao = aprovar_entrada(db=db, usuario_id=usuarios["admin"], candidato_id=ref.candidato_id, dados=pedido)
    comando = (
        update(CandidatoLegadoDecisao)
        .where(CandidatoLegadoDecisao.id == decisao.id)
        .values(justificativa="Alteração indevida")
        if operacao == "update"
        else delete(CandidatoLegadoDecisao).where(CandidatoLegadoDecisao.id == decisao.id)
    )
    with pytest.raises(DBAPIError, match="imutável") as erro, db.begin_nested():
        db.execute(comando.execution_options(synchronize_session=False))
    assert isinstance(erro.value.orig, PsycopgError)
    assert erro.value.orig.sqlstate == "23514"
    db.expire_all()
    assert db.get(CandidatoLegadoDecisao, decisao.id).justificativa == pedido.justificativa


@pytest.mark.parametrize(
    "entidade,trigger",
    [
        ("candidato_legado_recaptura", "recaptura_legado_append_only"),
        ("candidato_legado_decisao", "trg_decisao_legado_imutavel"),
    ],
)
@pytest.mark.parametrize("operacao", ["truncate", "disable_trigger", "alter_table", "drop_table", "create_table"])
def test_runtime_nao_contorna_protecao_por_ddl(runtime, entidade, trigger, operacao):
    db, _, schema = runtime
    tabela = f'"{schema}".{entidade}'
    comandos = {
        "truncate": f"TRUNCATE TABLE {tabela}",
        "disable_trigger": f"ALTER TABLE {tabela} DISABLE TRIGGER {trigger}",
        "alter_table": f"ALTER TABLE {tabela} ADD COLUMN adulteracao text",
        "drop_table": f"DROP TABLE {tabela}",
        "create_table": f'CREATE TABLE "{schema}".indevida (id bigint)',
    }
    with pytest.raises(DBAPIError) as erro, db.begin_nested():
        db.execute(text(comandos[operacao]))
    assert isinstance(erro.value.orig, PsycopgError)
    assert erro.value.orig.sqlstate == "42501"
    assert db.scalar(text("SELECT current_user")) == nome_runtime_sintetico(schema)
