"""app/config_decisions.py -- ConfigDecision e append-only (SCD Type 2):
trocar o valor de uma chave nunca e UPDATE, e sempre fechar a vigente
(valid_to) + inserir a nova, na mesma transacao. Roda contra o banco
configurado (mesmo padrao de test_pipeline_dedup.py), sempre com
db.rollback() no final -- nunca commita dado de teste.
"""
from __future__ import annotations

from app.config_decisions import decisao_vigente, registrar_decisao
from app.db.base import SessionLocal
from app.db.models import ConfigDecision, ConfigDecisionKey


def test_primeira_decisao_da_chave_fica_vigente():
    db = SessionLocal()
    try:
        decisao = registrar_decisao(
            db, key=ConfigDecisionKey.metrica_cobertura, value="coverage_percentage",
            confirmed=True, confirmed_by=None,
        )
        assert decisao.valid_to is None
        vigente = decisao_vigente(db, ConfigDecisionKey.metrica_cobertura)
        assert vigente is not None
        assert vigente.id == decisao.id
    finally:
        db.rollback()
        db.close()


def test_trocar_decisao_fecha_a_vigente_anterior_e_abre_a_nova():
    db = SessionLocal()
    try:
        antiga = registrar_decisao(
            db, key=ConfigDecisionKey.denominador_oferta, value="qt_existente",
            confirmed=True, confirmed_by=None,
        )
        nova = registrar_decisao(
            db, key=ConfigDecisionKey.denominador_oferta, value="qt_existente_sus",
            confirmed=True, confirmed_by=None,
        )

        db.refresh(antiga)
        assert antiga.valid_to is not None  # fechada, nunca apagada -- historico preservado
        assert nova.valid_to is None
        vigente = decisao_vigente(db, ConfigDecisionKey.denominador_oferta)
        assert vigente is not None
        assert vigente.id == nova.id
    finally:
        db.rollback()
        db.close()


def test_indice_unico_parcial_impede_duas_vigentes_pra_mesma_chave():
    """Regressao de schema: garante que o indice unico parcial
    (valid_to IS NULL) esta de fato aplicado no banco, nao so no
    modelo -- um segundo INSERT direto (sem passar por
    registrar_decisao) tentando abrir uma segunda linha vigente pra
    mesma chave tem que ser rejeitado pelo Postgres. Usa
    registrar_decisao pra fechar a vigente real (a chave ja vem
    seedada em dev/prod, ver D-02 em docs/metodologia-parametros.md)
    antes de tentar a violacao."""
    import pytest
    from sqlalchemy.exc import IntegrityError

    db = SessionLocal()
    try:
        registrar_decisao(
            db, key=ConfigDecisionKey.chave_macrorregiao, value="ibge_municipio",
            confirmed=False, confirmed_by=None,
        )
        db.add(ConfigDecision(
            key=ConfigDecisionKey.chave_macrorregiao, value="cnes_regiao_saude", confirmed=False,
        ))
        with pytest.raises(IntegrityError):
            db.flush()
    finally:
        db.rollback()
        db.close()
