"""`substituir_responsaveis_instrumento`/`atualizar_cadastro_instrumento`
(app/services/monitoramento_eventos.py) -- caminho de reatribuição de
titular/suplente nunca tinha teste nenhum (achado ao vivo 2026-09-28,
titularidade obrigatória): nem a validação (titular==suplente, titular não
colaborador ativo) nem o PATCH de `tecnico_titular_id`/`tecnico_suplente_id`
via `atualizar_cadastro_instrumento` eram exercitados."""

from uuid import uuid4

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, InstrumentoResponsavel, User, UserRole, UserStatus
from app.domain_errors import ValidationError
from app.services.monitoramento_eventos import atualizar_cadastro_instrumento, substituir_responsaveis_instrumento


def _colaborador(db, *, status: UserStatus = UserStatus.active) -> User:
    user = User(
        name="Colaborador Pytest",
        email=f"pytest-titularidade-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=UserRole.colaborador,
        status=status,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _gestor(db) -> User:
    user = User(
        name="Gestor Pytest",
        email=f"pytest-titularidade-gestor-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=UserRole.gestor,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _instrumento_scratch(db, *, sufixo: str) -> InstrumentoEquipamento:
    instrumento = InstrumentoEquipamento(
        nr_convenio=f"PYTEST-TITSVC-{sufixo}-{uuid4()}",
        nome_convenente="Convenente Pytest",
        tipo_contratacao="Convênio",
    )
    db.add(instrumento)
    db.commit()
    return instrumento


def test_substituir_responsaveis_rejeita_titular_igual_suplente():
    db = SessionLocal()
    titular = instrumento = None
    try:
        titular = _colaborador(db)
        instrumento = _instrumento_scratch(db, sufixo="IGUAL")
        try:
            substituir_responsaveis_instrumento(
                db=db, instrumento=instrumento, titular_id=titular.id, suplente_id=titular.id
            )
            assert False, "deveria ter levantado ValidationError"
        except ValidationError as exc:
            assert "colaboradores distintos" in str(exc)
    finally:
        db.rollback()
        if instrumento is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        if titular is not None:
            db.query(User).filter_by(id=titular.id).delete()
        db.commit()
        db.close()


def test_substituir_responsaveis_rejeita_titular_nao_colaborador_ativo():
    db = SessionLocal()
    gestor = instrumento = None
    try:
        gestor = _gestor(db)
        instrumento = _instrumento_scratch(db, sufixo="NAOCOLAB")
        try:
            substituir_responsaveis_instrumento(db=db, instrumento=instrumento, titular_id=gestor.id, suplente_id=None)
            assert False, "deveria ter levantado ValidationError"
        except ValidationError as exc:
            assert "colaborador ativo" in str(exc)
    finally:
        db.rollback()
        if instrumento is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        if gestor is not None:
            db.query(User).filter_by(id=gestor.id).delete()
        db.commit()
        db.close()


def test_substituir_responsaveis_com_titular_e_suplente_atualiza_espelho_textual():
    db = SessionLocal()
    titular = suplente = instrumento = None
    try:
        titular = _colaborador(db)
        suplente = _colaborador(db)
        instrumento = _instrumento_scratch(db, sufixo="DUPLA")

        titular_result, suplente_result = substituir_responsaveis_instrumento(
            db=db, instrumento=instrumento, titular_id=titular.id, suplente_id=suplente.id
        )
        db.flush()

        assert titular_result.id == titular.id
        assert suplente_result is not None
        assert suplente_result.id == suplente.id
        assert instrumento.tecnico_titular == titular.name
        assert instrumento.tecnico_suplente == suplente.name
        vinculos = {
            v.papel: v.usuario_id
            for v in db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).all()
        }
        assert vinculos == {"titular": titular.id, "suplente": suplente.id}
    finally:
        db.rollback()
        if instrumento is not None:
            db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).delete()
            db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        db.query(User).filter(User.id.in_([u.id for u in (titular, suplente) if u is not None])).delete(
            synchronize_session=False
        )
        db.commit()
        db.close()


def test_atualizar_cadastro_reatribui_titular_e_suplente_via_patch():
    db = SessionLocal()
    gestor = titular = suplente = instrumento = None
    try:
        gestor = _gestor(db)
        titular = _colaborador(db)
        suplente = _colaborador(db)
        instrumento = _instrumento_scratch(db, sufixo="PATCH")

        resultado = atualizar_cadastro_instrumento(
            nr_convenio=instrumento.nr_convenio,
            alteracoes_brutas={"tecnico_titular_id": titular.id, "tecnico_suplente_id": suplente.id},
            db=db,
            usuario=gestor,
        )

        assert resultado.tecnico_titular == titular.name
        assert resultado.tecnico_suplente == suplente.name
        vinculos = {
            v.papel: v.usuario_id
            for v in db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).all()
        }
        assert vinculos == {"titular": titular.id, "suplente": suplente.id}
    finally:
        db.rollback()
        if instrumento is not None:
            db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).delete()
            db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        usuarios = [u for u in (gestor, titular, suplente) if u is not None]
        if usuarios:
            db.query(User).filter(User.id.in_([u.id for u in usuarios])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_atualizar_cadastro_rejeita_cnes_inexistente():
    db = SessionLocal()
    gestor = instrumento = None
    try:
        gestor = _gestor(db)
        instrumento = _instrumento_scratch(db, sufixo="CNESRUIM")

        try:
            atualizar_cadastro_instrumento(
                nr_convenio=instrumento.nr_convenio,
                alteracoes_brutas={"cnes": "9999999"},
                db=db,
                usuario=gestor,
            )
            assert False, "deveria ter levantado ValidationError"
        except ValidationError as exc:
            assert "não encontrado na base de referência" in str(exc)
    finally:
        db.rollback()
        if instrumento is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        if gestor is not None:
            db.query(User).filter_by(id=gestor.id).delete()
        db.commit()
        db.close()
