"""Triggers sobreviventes em schema sintético; não substitui migration ausente."""

from datetime import timedelta
from decimal import Decimal

import pytest
from psycopg import Error as PsycopgError
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import DBAPIError

from app.db.models import FonteCaptura, Notificacao
from app.db.models_legado import CandidatoLegadoDecisao, CandidatoLegadoRecaptura
from app.services.aprovacao_legado import aprovar_entrada
from app.services.recapturas_legado import registrar_recaptura
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_revisao_legado_recuperada_db import preparar_prova


@pytest.fixture
def historico_protegido(matriz):
    db, *_ = matriz
    schema = db.get_bind().get_execution_options()["schema_translate_map"][None]
    prefixo = "pytest_destinatarios_"
    assert schema.startswith(prefixo) and len(schema) == len(prefixo) + 32
    assert all(c in "0123456789abcdef" for c in schema[len(prefixo) :])
    # Definições confirmadas via pg_get_functiondef/pg_get_triggerdef no
    # clone sobrevivente em 13/10. Só os qualificadores de schema mudam.
    # Não executa migration nem presume privilégios de runtime.
    for tabela, funcao, trigger, mensagem, sqlstate in (
        (
            "candidato_legado_recaptura",
            "impedir_mutacao_recaptura_legado",
            "recaptura_legado_append_only",
            "Recaptura oficial é imutável",
            "",
        ),
        (
            "candidato_legado_decisao",
            "proteger_decisao_legado",
            "trg_decisao_legado_imutavel",
            "Decisão do Radar é imutável",
            " USING ERRCODE = '23514'",
        ),
    ):
        db.execute(
            text(f'''
            CREATE FUNCTION "{schema}".{funcao}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION '{mensagem}'{sqlstate}; END; $$
        ''')
        )
        db.execute(
            text(f'''
            CREATE TRIGGER {trigger} BEFORE UPDATE OR DELETE ON "{schema}".{tabela}
            FOR EACH ROW EXECUTE FUNCTION "{schema}".{funcao}()
        ''')
        )
    db.commit()
    return matriz


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("situacao", "Prestação de Contas Concluída"),
        ("hash_conteudo", "0" * 64),
        ("valor_global", Decimal("1001")),
        ("payload_oficial", {"alteracao": "indevida"}),
        (None, None),
    ],
)
def test_recaptura_rejeita_update_delete_fora_do_service(historico_protegido, dados, campo, valor):
    db, *_ = historico_protegido
    _, _, _, prova, _ = preparar_prova(db, dados)
    prova_id = prova.id
    registro = db.get(CandidatoLegadoRecaptura, prova_id)
    antes = (registro.situacao, registro.hash_conteudo, registro.valor_global, registro.payload_oficial)
    comando = (
        update(CandidatoLegadoRecaptura).where(CandidatoLegadoRecaptura.id == prova_id).values({campo: valor})
        if campo
        else delete(CandidatoLegadoRecaptura).where(CandidatoLegadoRecaptura.id == prova_id)
    )
    with pytest.raises(DBAPIError, match="imutável") as erro, db.begin_nested():
        db.execute(comando.execution_options(synchronize_session=False))
    assert isinstance(erro.value.orig, PsycopgError)
    assert erro.value.orig.sqlstate == "P0001"
    db.expire_all()
    salvo = db.get(CandidatoLegadoRecaptura, prova_id)
    assert (salvo.situacao, salvo.hash_conteudo, salvo.valor_global, salvo.payload_oficial) == antes


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("justificativa", "Alteração indevida"),
        ("usuario_id", "gestor"),
        ("situacao", "rejeitado"),
        (None, None),
    ],
)
def test_decisao_aprovada_rejeita_update_delete_diretos(historico_protegido, dados, campo, valor):
    db, usuarios, *_ = historico_protegido
    ref, _, _, _, pedido = preparar_prova(db, dados)
    decisao = aprovar_entrada(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    if campo == "usuario_id":
        valor = usuarios["gestor"].id
    comando = (
        update(CandidatoLegadoDecisao).where(CandidatoLegadoDecisao.id == decisao.id).values({campo: valor})
        if campo
        else delete(CandidatoLegadoDecisao).where(CandidatoLegadoDecisao.id == decisao.id)
    )
    with pytest.raises(DBAPIError, match="imutável") as erro, db.begin_nested():
        db.execute(comando.execution_options(synchronize_session=False))
    assert isinstance(erro.value.orig, PsycopgError)
    assert erro.value.orig.sqlstate == "23514"
    db.expire_all()
    salvo = db.get(CandidatoLegadoDecisao, decisao.id)
    assert salvo.situacao == "aprovado" and salvo.usuario_id == usuarios["admin"].id
    assert salvo.justificativa == pedido.justificativa


def test_aprovacao_e_replay_funcionam_com_ambos_triggers_ativos(historico_protegido, dados):
    db, usuarios, *_ = historico_protegido
    ref, _, _, prova, pedido = preparar_prova(db, dados)
    parametros = dict(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    decisao = aprovar_entrada(**parametros)
    assert aprovar_entrada(**parametros) == decisao
    for modelo in (CandidatoLegadoRecaptura, CandidatoLegadoDecisao, Notificacao):
        assert db.scalar(select(func.count()).select_from(modelo)) == 1
    assert db.get(CandidatoLegadoDecisao, decisao.id).recaptura_id == prova.id


def test_nova_recaptura_insere_sem_alterar_prova_anterior(historico_protegido, dados):
    db, *_ = historico_protegido
    ref, captura, origem, anterior, _ = preparar_prova(db, dados)
    anterior_id, anterior_hash = anterior.id, anterior.hash_conteudo
    # Outra rodada sintética, válida e já iniciada no passado.
    nova_origem = origem.model_copy(update={"iniciado_em": origem.iniciado_em - timedelta(seconds=1)})
    nova = registrar_recaptura(db=db, referencia=ref, captura=captura, origem=nova_origem)
    assert nova.id != anterior_id
    db.expire_all()
    assert db.get(CandidatoLegadoRecaptura, anterior_id).hash_conteudo == anterior_hash
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoRecaptura)) == 2
    assert db.scalar(select(func.count()).select_from(FonteCaptura)) == 2
