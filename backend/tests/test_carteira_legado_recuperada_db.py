"""Inserção da projeção com SQL real; não executa aprovação humana."""

from decimal import Decimal

import pytest
from psycopg import Error as DatabaseDriverError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.db.models import Convenio, InstrumentoEquipamento
from app.repositories.carteira_legado import adicionar
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao
from app.services.projecao_legado import projetar_carteira
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados


def test_sql_preserva_decimal_fonte_baseline_sem_criar_monitoramento(matriz, dados):
    db, *_ = matriz
    dados["convenio"]["SIT_CONVENIO"] = "Prestação de Contas Concluída"
    dados["convenio"]["VL_GLOBAL_CONV"] = "1000.1234567890123456789"
    p = projetar_carteira(CapturaLegadoParaPromocao.model_validate(dados))
    registro = adicionar(db, p)
    identificador = registro.id
    db.commit()
    db.expire_all()
    salvo = db.get(Convenio, identificador)
    assert salvo.valor_global == Decimal("1000.1234567890123456789")
    assert salvo.situacao == "Prestação de Contas Concluída" and salvo.cnes is None
    assert salvo.equipamentos_tags is None and salvo.siconv_raw == p.siconv_raw
    assert db.scalar(select(func.count()).select_from(InstrumentoEquipamento)) == 1


def test_numero_existente_conflita_sem_upsert_ou_sobrescrita(matriz, dados):
    db, *_ = matriz
    p = projetar_carteira(CapturaLegadoParaPromocao.model_validate(dados))
    antigo = adicionar(db, p)
    db.commit()
    with pytest.raises(IntegrityError) as erro, db.begin_nested():
        adicionar(db, p.model_copy(update={"situacao": "Alteração indevida"}))
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.diag.constraint_name == "uq_convenio_numero"
    assert db.get(Convenio, antigo.id).situacao == "Em execução"


def test_repository_nao_comita_e_rollback_remove_so_a_insercao(matriz, dados):
    db, *_ = matriz
    p = projetar_carteira(CapturaLegadoParaPromocao.model_validate(dados))
    adicionar(db, p)
    db.rollback()
    assert db.scalar(select(func.count()).select_from(Convenio)) == 1
    assert db.scalar(select(Convenio.numero)) == "123"
