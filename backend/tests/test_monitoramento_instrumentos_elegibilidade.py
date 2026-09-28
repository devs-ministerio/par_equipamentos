"""`_valores_confiaveis_da_parceria` (app/services/monitoramento_instrumentos.py)
-- fronteira autoritativa da elegibilidade de Parceria TransfereGov (Plan
Mode filtros-painel 2026-09-28): browser nunca prova `tem_parceria`/
`cd_parceria`, o Service sempre resolve no banco. Achado ao vivo: essa
função nasceu sem nenhum teste, incluindo os 4 branches de rejeição que são
justamente a parte de segurança que importa."""

from typing import cast
from uuid import uuid4

from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.db.models import PropostaCandidata
from app.domain_errors import NotFoundError, ValidationError
from app.services.monitoramento_instrumentos import NovoInstrumentoMonitorado, _valores_confiaveis_da_parceria

_DB_NAO_USADO = cast(Session, None)  # branches sem DB (2 primeiros testes) nunca tocam em `db`


def _dados(*, tipo_contratacao: str, proposta_candidata_id: int | None) -> NovoInstrumentoMonitorado:
    return NovoInstrumentoMonitorado(
        nr_convenio="PYTEST-ELEG",
        cnpj_convenente="00000000000100",
        nome_convenente="Convenente Pytest",
        tipo_contratacao=tipo_contratacao,
        tecnico_titular_id=1,
        proposta_candidata_id=proposta_candidata_id,
    )


def test_referencia_de_proposta_rejeitada_fora_de_parceria_transferegov():
    dados = _dados(tipo_contratacao="FAF", proposta_candidata_id=123)
    try:
        _valores_confiaveis_da_parceria(dados, db=_DB_NAO_USADO)
        assert False, "deveria ter levantado ValidationError"
    except ValidationError as exc:
        assert "só é aceita para Parceria TransfereGov" in str(exc)


def test_faf_sem_proposta_id_devolve_valores_sem_alteracao():
    dados = _dados(tipo_contratacao="FAF", proposta_candidata_id=None)
    valores = _valores_confiaveis_da_parceria(dados, db=_DB_NAO_USADO)
    assert valores["nr_convenio"] == "PYTEST-ELEG"
    assert "proposta_candidata_id" not in valores


def test_parceria_transferegov_sem_proposta_id_rejeitada():
    dados = _dados(tipo_contratacao="Parceria TransfereGov", proposta_candidata_id=None)
    try:
        _valores_confiaveis_da_parceria(dados, db=_DB_NAO_USADO)
        assert False, "deveria ter levantado ValidationError"
    except ValidationError as exc:
        assert "Informe a proposta confirmada" in str(exc)


def test_parceria_transferegov_com_proposta_inexistente_rejeitada():
    db = SessionLocal()
    try:
        dados = _dados(tipo_contratacao="Parceria TransfereGov", proposta_candidata_id=-1)
        try:
            _valores_confiaveis_da_parceria(dados, db=db)
            assert False, "deveria ter levantado NotFoundError"
        except NotFoundError as exc:
            assert "não encontrada" in str(exc)
    finally:
        db.close()


def test_parceria_transferegov_com_proposta_em_tramitacao_rejeitada():
    db = SessionLocal()
    proposta = None
    try:
        proposta = PropostaCandidata(
            id_proposta=int(str(uuid4().int)[:9]),
            cnpj_ente_recebedor="00000000000100",
            nm_proponente="Proponente Pytest — apagar",
            ds_objeto="Objeto de teste",
            nm_programa="Programa de teste",
            id_programa=1,
            componente_batido="Tomógrafo",
            vl_global_proposta=1000,
            situacao_proposta="Em análise",
            tem_parceria=False,
        )
        db.add(proposta)
        db.commit()
        db.refresh(proposta)

        dados = _dados(tipo_contratacao="Parceria TransfereGov", proposta_candidata_id=proposta.id)
        try:
            _valores_confiaveis_da_parceria(dados, db=db)
            assert False, "deveria ter levantado ValidationError"
        except ValidationError as exc:
            assert "parceria confirmada" in str(exc)
    finally:
        if proposta is not None:
            db.query(PropostaCandidata).filter_by(id=proposta.id).delete()
        db.commit()
        db.close()


def test_parceria_transferegov_confirmada_substitui_valores_pela_proposta():
    db = SessionLocal()
    proposta = None
    try:
        proposta = PropostaCandidata(
            id_proposta=int(str(uuid4().int)[:9]),
            cnpj_ente_recebedor="00000000000100",
            nm_proponente="Proponente Pytest — apagar",
            municipio="Brasília",
            uf="DF",
            ds_objeto="Objeto de teste",
            nm_programa="Programa de teste",
            id_programa=1,
            componente_batido="Tomógrafo",
            vl_global_proposta=1000,
            situacao_proposta="Confirmada",
            tem_parceria=True,
            cd_parceria="202500099999",
        )
        db.add(proposta)
        db.commit()
        db.refresh(proposta)

        dados = _dados(tipo_contratacao="Parceria TransfereGov", proposta_candidata_id=proposta.id)
        valores = _valores_confiaveis_da_parceria(dados, db=db)

        assert valores["nr_convenio"] == "202500099999"
        assert valores["cnpj_convenente"] == "00000000000100"
        assert valores["uf"] == "DF"
        assert "proposta_candidata_id" not in valores
    finally:
        if proposta is not None:
            db.query(PropostaCandidata).filter_by(id=proposta.id).delete()
        db.commit()
        db.close()
