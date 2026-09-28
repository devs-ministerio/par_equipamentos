from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import AuditLog, Convenio, InstrumentoEquipamento, PagamentoObraPersus
from scripts.normalizar_cnpj_database import cnpj_canonico, executar


def test_cnpj_canonico_so_remove_pontuacao_inequivoca():
    assert cnpj_canonico("12.345.678/0001-90") == ("12345678000190", "remove_pontuacao")
    assert cnpj_canonico("   ") == (None, "vazio_para_null")
    assert cnpj_canonico("sem-cnpj") == (None, None)


@pytest.mark.db
def test_normalizador_dry_run_aplica_com_auditoria_sem_cnpj_em_claro():
    db = SessionLocal()
    sufixo = str(uuid4())
    convenio = Convenio(
        numero=f"PYTEST-CNPJ-{sufixo}", convenente_nome="Convênio Pytest", convenente_cnpj="12.345.678/0001-90"
    )
    instrumento = InstrumentoEquipamento(
        nr_convenio=f"PYTEST-INSTR-{sufixo}", nome_convenente="Instrumento Pytest", cnpj_convenente=""
    )
    pagamento: PagamentoObraPersus | None = None
    try:
        db.add_all([convenio, instrumento])
        db.commit()
        db.refresh(instrumento)
        pagamento = PagamentoObraPersus(
            instrumento_id=instrumento.id,
            fornecedor_cnpj="98.765.432/0001-10",
            chave_origem=f"pytest-cnpj-{sufixo}",
        )
        db.add(pagamento)
        db.commit()

        ids_por_entidade = {
            "convenio": {convenio.id},
            "instrumento_equipamento": {instrumento.id},
            "pagamento_obra_persus": {pagamento.id},
        }
        simulacao = executar(dry_run=True, ids_por_entidade=ids_por_entidade)
        assert simulacao["alteracoes"] == 3
        db.refresh(convenio)
        db.refresh(instrumento)
        db.refresh(pagamento)
        assert convenio.convenente_cnpj == "12.345.678/0001-90"
        assert instrumento.cnpj_convenente == ""
        assert pagamento.fornecedor_cnpj == "98.765.432/0001-10"

        aplicado = executar(
            dry_run=False,
            backup_reference="pytest-snapshot",
            ids_por_entidade=ids_por_entidade,
        )
        assert aplicado["alteracoes"] == 3
        db.refresh(convenio)
        db.refresh(instrumento)
        db.refresh(pagamento)
        assert convenio.convenente_cnpj == "12345678000190"
        assert instrumento.cnpj_convenente is None
        assert pagamento.fornecedor_cnpj == "98765432000110"

        logs = (
            db.execute(
                select(AuditLog).where(
                    AuditLog.action == "normalizacao_cnpj",
                    AuditLog.entity_name.in_(ids_por_entidade),
                    AuditLog.entity_id.in_([convenio.id, instrumento.id, pagamento.id]),
                )
            )
            .scalars()
            .all()
        )
        assert len(logs) == 3
        assert all("12.345.678/0001-90" not in str(log.details) for log in logs)
        assert (
            executar(
                dry_run=False,
                backup_reference="pytest-snapshot",
                ids_por_entidade=ids_por_entidade,
            ).get("alteracoes", 0)
            == 0
        )
    finally:
        if pagamento is not None:
            db.query(AuditLog).filter_by(entity_name="pagamento_obra_persus", entity_id=pagamento.id).delete()
            db.delete(pagamento)
            # A FK do banco também faz cascade a partir do instrumento. Sem
            # flush, as duas remoções podem ser emitidas na ordem inversa e o
            # ORM avisa que a linha do pagamento já foi removida pelo cascade.
            db.flush()
        db.query(AuditLog).filter_by(entity_name="convenio", entity_id=convenio.id).delete()
        db.query(AuditLog).filter_by(entity_name="instrumento_equipamento", entity_id=instrumento.id).delete()
        db.delete(convenio)
        db.delete(instrumento)
        db.commit()
        db.close()


def test_normalizador_exige_referencia_de_backup_no_apply():
    with pytest.raises(ValueError, match="backup-reference"):
        executar(dry_run=False)
