"""Trava por instrumento na conclusão: precisa de transações reais (commit), por isso não usa a fixture com rollback."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.base import engine
from app.db.models import Convenio, InstrumentoEquipamento
from app.domain_errors import ConflictError
from app.repositories import conclusoes as repo
from app.services import conclusao_acompanhamento as svc


@pytest.fixture
def instrumento_gravado():
    numero = f"PYT{uuid4().hex[:8]}"
    with Session(engine) as s:
        s.add(Convenio(numero=numero, objeto="x", convenente_nome="x"))
        s.flush()
        inst = InstrumentoEquipamento(nr_convenio=numero, nome_convenente="x", tipo_contratacao="Convênio")
        s.add(inst)
        s.commit()
        instrumento_id = inst.id
    try:
        yield instrumento_id
    finally:
        with Session(engine) as s:
            s.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
            s.query(Convenio).filter_by(numero=numero).delete()
            s.commit()


def test_segunda_transacao_espera_a_primeira_e_desiste_com_conflito(instrumento_gravado, monkeypatch):
    monkeypatch.setattr(repo, "ESPERA_TRAVA_INSTRUMENTO", "300ms")
    with Session(engine) as a, Session(engine) as b:
        svc.travar_instrumento(a, instrumento_gravado)
        with pytest.raises(ConflictError, match="outra pessoa"):
            svc.travar_instrumento(b, instrumento_gravado)
        a.rollback()
        b.rollback()
        svc.travar_instrumento(b, instrumento_gravado)  # liberada: entra
        b.rollback()


def test_assert_nao_concluido_trava_o_instrumento(instrumento_gravado, monkeypatch):
    monkeypatch.setattr(repo, "ESPERA_TRAVA_INSTRUMENTO", "300ms")
    with Session(engine) as a, Session(engine) as b:
        svc.assert_nao_concluido(a, instrumento_gravado)
        with pytest.raises(ConflictError, match="outra pessoa"):
            svc.assert_nao_concluido(b, instrumento_gravado)
        a.rollback()
        b.rollback()


# --- Corrida depois da trava: quem esperou precisa reler o registro, não usar a versão carregada antes ---

import threading  # noqa: E402
import time  # noqa: E402
from datetime import date  # noqa: E402

from app.db.models import AcaoMonitoramento, EntregaEquipamento, User, UserRole  # noqa: E402
from app.domain_errors import ValidationError  # noqa: E402
from app.schemas_entregas import CorrecaoDataEntrega  # noqa: E402
from app.services import entregas_equipamento as entregas  # noqa: E402
from app.services import monitoramento_acoes as acoes  # noqa: E402


@pytest.fixture
def admin_gravado():
    sufixo = uuid4().hex[:8]
    with Session(engine) as s:
        usuario = User(
            name=f"Corrida {sufixo}", email=f"corrida-{sufixo}@exemplo.local", password_hash="x", role=UserRole.admin
        )
        s.add(usuario)
        s.commit()
        usuario_id = usuario.id
    try:
        yield usuario_id
    finally:
        with Session(engine) as s:
            s.query(User).filter_by(id=usuario_id).delete()
            s.commit()


def _disputar(instrumento_id, admin_id, operacao_a, operacao_b):
    """A segura a trava, B (em outra thread) carrega o registro e espera; A termina e libera. Devolve a exceção de B."""
    resultado: dict[str, BaseException | None] = {"erro": None}

    def rodar_b():
        with Session(engine) as b:
            try:
                operacao_b(b, b.get(User, admin_id))
            except BaseException as exc:  # noqa: BLE001
                resultado["erro"] = exc
            finally:
                b.rollback()

    with Session(engine) as a:
        usuario_a = a.get(User, admin_id)
        svc.assert_nao_concluido(a, instrumento_id)
        thread = threading.Thread(target=rodar_b)
        thread.start()
        time.sleep(0.6)  # B já carregou o registro e está esperando a trava
        operacao_a(a, usuario_a)
        thread.join(10)
    return resultado["erro"]


def test_duas_correcoes_da_mesma_acao_nao_criam_duas_sucessoras(instrumento_gravado, admin_gravado):
    with Session(engine) as s:
        acao = AcaoMonitoramento(instrumento_id=instrumento_gravado, descricao="original")
        s.add(acao)
        s.commit()
        acao_id = acao.id

    def corrigir(texto):
        return lambda db, usuario: acoes.editar_acao_monitorada(
            acao_id=acao_id,
            descricao=texto,
            data_prevista=None,
            responsavel=None,
            responsavel_id=None,
            db=db,
            usuario=usuario,
        )

    erro = _disputar(instrumento_gravado, admin_gravado, corrigir("A"), corrigir("B"))
    assert isinstance(erro, ValidationError) and "já foi excluída ou corrigida" in str(erro)
    with Session(engine) as s:
        ativas = (
            s.query(AcaoMonitoramento)
            .filter_by(instrumento_id=instrumento_gravado, substituido_por_id=None, deletado_em=None)
            .all()
        )
        assert [a.descricao for a in ativas] == ["A"]
        s.query(AcaoMonitoramento).filter_by(instrumento_id=instrumento_gravado).update({"substituido_por_id": None})
        s.query(AcaoMonitoramento).filter_by(instrumento_id=instrumento_gravado).delete()
        s.commit()


def test_corrigir_data_de_entrega_excluida_enquanto_esperava_a_trava_e_recusado(instrumento_gravado, admin_gravado):
    with Session(engine) as s:
        entrega = EntregaEquipamento(
            instrumento_id=instrumento_gravado, data_ocorrencia=date(2026, 1, 10), chave_idempotencia=uuid4().hex
        )
        s.add(entrega)
        s.commit()
        entrega_id = entrega.id

    def excluir(db, usuario):
        return entregas.excluir_entrega(entrega_id=entrega_id, motivo="duplicada", db=db, usuario=usuario)

    def corrigir(db, usuario):
        return entregas.corrigir_data_entrega(
            entrega_id=entrega_id,
            dados=CorrecaoDataEntrega(data_ocorrencia=date(2026, 1, 12), motivo="ajuste"),
            db=db,
            usuario=usuario,
        )

    erro = _disputar(instrumento_gravado, admin_gravado, excluir, corrigir)
    assert isinstance(erro, ValidationError) and "excluída" in str(erro)
    with Session(engine) as s:
        salva = s.get(EntregaEquipamento, entrega_id)
        assert salva is not None
        assert salva.deletado_em is not None and salva.data_ocorrencia == date(2026, 1, 10)
        s.query(EntregaEquipamento).filter_by(instrumento_id=instrumento_gravado).delete()
        s.commit()
