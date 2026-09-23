"""Constraint fisica coberta por teste de violacao real (Item 1 do Plan Mode
database 2026-09-16, `docs/arquitetura/planmode-database-2026-09-16.md`).

Constituicao database Secao 9 exige "constraint... coberta por teste que
confirma que a violacao e rejeitada pelo banco, nao so pela aplicacao" --
o planmode doc (linha 21) fala em "cobre os grupos ja existentes". Este
arquivo cobre por MECANISMO de constraint (CHECK simples, CHECK nullable
"IS NULL OR", CHECK de formato, CHECK de intervalo fechado, UNIQUE simples,
UNIQUE composta, UNIQUE parcial, FK fisica), nao cada instancia individual
(~40 CHECKs de nao-negatividade so repetem o mesmo mecanismo em colunas
diferentes -- testar todas nao aumenta confianca sobre o Postgres, so
manutencao). UNIQUE composta de `Competency(label, equipment_family)` ja
tem cobertura dedicada em test_competency_por_familia.py, nao duplicada
aqui -- usa-se `Execution(competency_id, version)` como segundo exemplo de
UNIQUE composta. FK fisica de CNES orfao ja tem 1 exemplo em
`Convenio.cnes` (test_integridade_fk_cnes.py); aqui complementa com
`InstrumentoEquipamento.cnes`.

Cada teste cria seu proprio dado minimo (nao depende de seed/dado real) e
faz so `flush()` (nunca `commit()`) -- constraint imediata do Postgres ja e
verificada no flush, e nada de teste fica gravado no banco.
"""
from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.base import SessionLocal
from app.db.models import (
    CnesEstabelecimento,
    Competency,
    ConfigDecision,
    Convenio,
    DeficitStatus,
    EquipamentoCatalogo,
    EquipamentoMarcador,
    Execution,
    ExecutionMode,
    IncaEstimate,
    IncaEstimateLevel,
    InstrumentoEquipamento,
    MacroCoverage,
    MarcoCatalogo,
    MarcoGrupo,
)


@pytest.mark.db
def test_unique_parcial_marcador_rejeita_mesma_evidencia_no_mesmo_convenio():
    """Os índices parciais preservam uma evidência por origem/item/chave."""
    db = SessionLocal()
    try:
        catalogo = EquipamentoCatalogo(
            codigo="__teste_marcador_catalogo__", nome="__teste_marcador_catalogo__",
        )
        convenio = Convenio(numero="__teste_marcador_convenio__", convenente_nome="__teste__")
        db.add_all([catalogo, convenio])
        db.flush()

        comum = dict(
            equipamento_catalogo_id=catalogo.id,
            convenio_id=convenio.id,
            descricao_original="__teste__",
            tipo_evidencia="legado",
            relacao="mencao",
            confianca=0,
            chave_evidencia="__teste_marcador_chave__",
        )
        db.add(EquipamentoMarcador(**comum))
        db.flush()

        db.add(EquipamentoMarcador(**comum))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_check_nao_negatividade_simples_rejeitado():
    """Mecanismo `CHECK (col >= 0)` -- representante: ck_inca_estimate_estimated_cases."""
    db = SessionLocal()
    try:
        db.add(IncaEstimate(
            level=IncaEstimateLevel.uf, uf="ZZ",
            estimated_cases=-1, triennium="__teste_check_simples__",
        ))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_check_nao_negatividade_nullable_rejeitado():
    """Mecanismo `CHECK (col IS NULL OR col >= 0)` -- representante:
    ck_macro_coverage_population. Cria Competency/Execution proprios pra nao
    depender de execucao real ja carregada no banco de teste."""
    db = SessionLocal()
    try:
        competency = Competency(label="__teste_check_nullable__", equipment_family="__TESTE__")
        db.add(competency)
        db.flush()

        execution = Execution(
            competency_id=competency.id, version=1, mode=ExecutionMode.manual,
            config_chave_macrorregiao="__teste__", config_denominador_oferta="__teste__",
        )
        db.add(execution)
        db.flush()

        db.add(MacroCoverage(
            execution_id=execution.id, macro_code="ZZ", macro_name="__teste__", state="ZZ",
            equipment_family="__TESTE__", population=-1, deficit_status=DeficitStatus.not_available,
        ))
        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_check_formato_cnes_rejeitado():
    """Mecanismo CHECK de formato (regex) -- ck_cnes_estabelecimento_cnes_formato.
    Distinto do CHECK `>=` -- e um caso de violacao ainda nao coberto (o
    teste de FK orfao existente em test_integridade_fk_cnes.py usa "0000000",
    que E valido em formato, so orfao)."""
    db = SessionLocal()
    try:
        db.add(CnesEstabelecimento(cnes="ABCDEFG", nome_estabelecimento="__teste_formato_cnes__"))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_check_intervalo_fechado_rejeitado():
    """Mecanismo CHECK de intervalo com dois limites (>= e <=) --
    ck_marco_catalogo_execucao_pct (0 a 1), unico caso do schema com essa
    forma."""
    db = SessionLocal()
    try:
        db.add(MarcoCatalogo(
            codigo="__teste_intervalo_pct__", grupo=MarcoGrupo.fase_geral,
            execucao_fisica_pct_referencia=1.5, rotulo="__teste__",
        ))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_unique_simples_rejeitado():
    """Mecanismo UNIQUE de coluna simples -- representante:
    instrumento_equipamento.nr_convenio (menos colunas NOT NULL que os
    outros 4 exemplos do schema, setup mais enxuto pro mesmo mecanismo)."""
    db = SessionLocal()
    try:
        comum = "__teste_unique_simples__"
        db.add(
            InstrumentoEquipamento(
                nr_convenio=comum,
                cnpj_convenente="00000000000000",
                nome_convenente="__teste_a__",
            )
        )
        db.flush()

        db.add(
            InstrumentoEquipamento(
                nr_convenio=comum,
                cnpj_convenente="00000000000000",
                nome_convenente="__teste_b__",
            )
        )
        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_unique_composta_execution_rejeitado():
    """Mecanismo UNIQUE composta (2 colunas) -- representante:
    execution(competency_id, version). Competency(label, equipment_family)
    ja tem teste dedicado em test_competency_por_familia.py, nao duplicado
    aqui."""
    db = SessionLocal()
    try:
        competency = Competency(label="__teste_unique_composta_exec__", equipment_family="__TESTE__")
        db.add(competency)
        db.flush()

        comuns = dict(
            competency_id=competency.id, version=1, mode=ExecutionMode.manual,
            config_chave_macrorregiao="__teste__", config_denominador_oferta="__teste__",
        )
        db.add(Execution(**comuns))
        db.flush()

        db.add(Execution(**comuns))
        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_unique_parcial_config_decision_rejeita_duas_vigentes():
    """Mecanismo UNIQUE parcial (indice unico so sobre `valid_to IS NULL`) --
    ux_config_decision_key_vigente/uq_config_decision_key_vigente. Mecanismo
    estruturalmente diferente das UNIQUE simples/composta: so e unico entre
    linhas VIGENTES, nao entre todas. `ConfigDecision` sempre tem exatamente
    1 linha vigente por chave em runtime normal (SCD2, ver docstring da
    classe) -- usa a vigente real ja existente em vez de criar as duas
    linhas do teste, pra nao depender de nenhuma chave especifica."""
    db = SessionLocal()
    try:
        vigente = db.query(ConfigDecision).filter(ConfigDecision.valid_to.is_(None)).first()
        if vigente is None:
            pytest.skip("sem ConfigDecision vigente no banco de teste")

        db.add(ConfigDecision(key=vigente.key, value="__teste_vigente_duplicada__", valid_to=None))
        with pytest.raises(IntegrityError):
            db.flush()

        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_unique_parcial_config_decision_permite_vigente_e_historica():
    """Contraparte do teste acima: uma linha HISTORICA (`valid_to`
    preenchido) com a MESMA chave da vigente real nao viola o indice
    parcial -- prova que a restricao e mesmo sobre o subconjunto
    `valid_to IS NULL`, nao sobre a coluna `key` inteira."""
    from datetime import datetime, timezone

    db = SessionLocal()
    try:
        vigente = db.query(ConfigDecision).filter(ConfigDecision.valid_to.is_(None)).first()
        if vigente is None:
            pytest.skip("sem ConfigDecision vigente no banco de teste")

        db.add(ConfigDecision(
            key=vigente.key, value="__teste_historica__",
            valid_to=datetime.now(timezone.utc),
        ))
        db.flush()  # nao pode levantar -- so nao-vigente, coexiste com a vigente real

        db.rollback()
    finally:
        db.close()


@pytest.mark.db
def test_fk_cnes_orfao_instrumento_equipamento_rejeitado():
    """FK fisica de CNES em `instrumento_equipamento.cnes` -- complementa o
    exemplo ja existente em `convenio.cnes`
    (test_integridade_fk_cnes.py::test_banco_rejeita_convenio_com_cnes_orfao),
    confirmando que o `ondelete=SET NULL, onupdate=RESTRICT` compartilhado
    tambem rejeita insercao direta com CNES inexistente nesta segunda
    tabela."""
    db = SessionLocal()
    try:
        db.add(InstrumentoEquipamento(
            nr_convenio="__teste_fk_cnes_instrumento__",
            cnpj_convenente="00000000000000", nome_convenente="__teste__",
            cnes="0000000",  # 7 digitos, formato valido, mas fora de cnes_estabelecimento
        ))
        with pytest.raises(IntegrityError):
            db.flush()
        db.rollback()
    finally:
        db.close()
