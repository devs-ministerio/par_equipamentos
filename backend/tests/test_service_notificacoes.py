"""Testa app/services/notificacoes.py -- Service unitario do piloto Router ->
Service -> Repository (Plan Mode backend 2026-09-17, Bloco C). Complementa
test_notificacoes.py (contrato de router).

Desde o Plan Mode notificacoes-escopo (2026-09-25), toda Notificacao precisa
passar por `criar_notificacao` (materializa NotificacaoDestinatario) e toda
leitura/marcação é escopada por `usuario_id` -- os testes abaixo sempre criam
um usuário `colaborador` ativo de teste e o passam explicitamente."""

from uuid import uuid4

import pytest

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import (
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    Notificacao,
    NotificacaoTipo,
    PropostaCandidata,
    User,
    UserRole,
)
from app.domain_errors import NotFoundError
from app.repositories.notificacoes import criar_notificacao
from app.services.notificacoes import listar_notificacoes, marcar_notificacao_lida


def _criar_usuario_teste(db) -> User:
    usuario = User(
        name="Usuário Pytest",
        email=f"pytest-service-notificacoes-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=UserRole.colaborador,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def test_marcar_notificacao_lida_sucesso():
    db = SessionLocal()
    notificacao_id = None
    usuario = None
    try:
        usuario = _criar_usuario_teste(db)
        n = Notificacao(
            tipo=NotificacaoTipo.proposta_candidata,
            titulo=f"Teste service — apagar {uuid4()}",
            entidade_id=1,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        resultado = marcar_notificacao_lida(db=db, notificacao_id=notificacao_id, usuario_id=usuario.id)
        assert resultado.lida is True
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_marcar_notificacao_lida_id_inexistente_levanta_not_found_error():
    db = SessionLocal()
    usuario = None
    try:
        usuario = _criar_usuario_teste(db)
        with pytest.raises(NotFoundError) as exc:
            marcar_notificacao_lida(db=db, notificacao_id=999_999_999, usuario_id=usuario.id)
        assert exc.value.status_code == 404
    finally:
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_marcar_notificacao_lida_usuario_sem_ser_destinatario_levanta_not_found_error():
    """Notificação existe, mas o usuário autenticado não é destinatário dela
    (não é titular/suplente/gestor/admin) -- não pode marcar como lida algo
    que não é seu, mesmo comportamento de "não encontrado" que um id
    inexistente."""
    db = SessionLocal()
    notificacao_id = None
    usuario = None
    instrumento_id = None
    try:
        usuario = _criar_usuario_teste(db)
        instrumento = InstrumentoEquipamento(
            nr_convenio=f"TESTE-{uuid4()}",
            nome_convenente="Teste service — apagar",
        )
        db.add(instrumento)
        db.flush()
        instrumento_id = instrumento.id

        n = Notificacao(
            tipo=NotificacaoTipo.atualizacao_api,
            titulo="Teste service — apagar",
            entidade_id=instrumento.id,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        # Instrumento sem titular/suplente cadastrado cai no broadcast
        # (resolver_destinatarios) -- nosso usuário de teste É destinatário
        # aqui. Simula "outro usuário" usando um id que nunca foi
        # materializado como destinatário: 0 não é um id de User válido.
        with pytest.raises(NotFoundError):
            marcar_notificacao_lida(db=db, notificacao_id=notificacao_id, usuario_id=0)
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_nao_lidas_ignora_paginacao():
    db = SessionLocal()
    ids_criados = []
    usuario = None
    try:
        usuario = _criar_usuario_teste(db)
        for _ in range(3):
            n = Notificacao(
                tipo=NotificacaoTipo.proposta_candidata,
                titulo=f"Teste service — apagar {uuid4()}",
                entidade_id=1,
            )
            criar_notificacao(db, n)
            db.commit()
            ids_criados.append(n.id)

        # Marca 1 das 3 como lida pra esse usuário -- as outras 2 continuam
        # não lidas.
        marcar_notificacao_lida(db=db, notificacao_id=ids_criados[0], usuario_id=usuario.id)

        pagina = listar_notificacoes(db=db, usuario_id=usuario.id, limit=1, offset=0, apenas_nao_lidas=True)
        assert len(pagina.itens) == 1
        assert pagina.nao_lidas >= 2
    finally:
        for id_ in ids_criados:
            db.query(Notificacao).filter_by(id=id_).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_proposta_atualizada_resolve_destino_por_proposta():
    """Regressão: job_descoberta_transferegov.py gravava uma notificação de
    "proposta atualizada" com tipo=atualizacao_api mas entidade_id de uma
    PropostaCandidata -- listar_notificacoes tratava esse tipo como apontando
    pra InstrumentoEquipamento.id (contrato do docstring de
    db/models.py::Notificacao), então o destino resolvia contra a tabela
    errada. Corrigido pra tipo=proposta_candidata, que é o bucket certo pro
    id de uma PropostaCandidata (nova OU atualizada)."""
    db = SessionLocal()
    proposta_id = None
    notificacao_id = None
    usuario = None
    try:
        usuario = _criar_usuario_teste(db)
        proposta = PropostaCandidata(
            id_proposta=999_999,
            cnpj_ente_recebedor="00000000000191",
            nm_proponente="Teste service — apagar",
            ds_objeto="Teste",
            nm_programa="Teste",
            id_programa=1,
            componente_batido="Teste",
        )
        db.add(proposta)
        db.flush()
        proposta_id = proposta.id

        n = Notificacao(
            tipo=NotificacaoTipo.proposta_candidata,
            titulo=f"Proposta {proposta.id_proposta} atualizada",
            entidade_id=proposta.id,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        pagina = listar_notificacoes(db=db, usuario_id=usuario.id, limit=20, offset=0, apenas_nao_lidas=False)
        item = next(i for i in pagina.itens if i.notificacao.id == notificacao_id)
        assert item.destino == "/monitoramento-equipamentos?aba=componentes&subaba=novas"
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if proposta_id is not None:
            db.query(PropostaCandidata).filter_by(id=proposta_id).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_atualizacao_api_continua_resolvendo_por_instrumento():
    """Guarda o outro lado do contrato: tipo=atualizacao_api (job de
    verificação, achado real num InstrumentoEquipamento já monitorado)
    continua resolvendo destino contra InstrumentoEquipamento.id -- não pode
    regredir junto com a correção do teste acima. Usuário é titular
    explícito (não depende do fallback de broadcast -- gestor/admin
    pré-existentes no banco compartilhado de teste já bastam pra tornar o
    conjunto de destinatários não-vazio, então o fallback não dispara; ver
    test_listar_notificacoes_colaborador_so_ve_instrumento_que_e_titular_ou_suplente
    pra esse contrato de escopo)."""
    db = SessionLocal()
    instrumento_id = None
    notificacao_id = None
    usuario = None
    try:
        usuario = _criar_usuario_teste(db)
        instrumento = InstrumentoEquipamento(
            nr_convenio=f"TESTE-{uuid4()}",
            nome_convenente="Teste service — apagar",
        )
        db.add(instrumento)
        db.flush()
        instrumento_id = instrumento.id
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=usuario.id, papel="titular"))
        db.flush()

        n = Notificacao(
            tipo=NotificacaoTipo.atualizacao_api,
            titulo="Teste service — apagar",
            entidade_id=instrumento.id,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        pagina = listar_notificacoes(db=db, usuario_id=usuario.id, limit=20, offset=0, apenas_nao_lidas=False)
        item = next(i for i in pagina.itens if i.notificacao.id == notificacao_id)
        assert item.destino == f"/monitoramento-equipamentos/instrumentos/{instrumento.nr_convenio}"
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_colaborador_so_ve_instrumento_que_e_titular_ou_suplente():
    """Núcleo do Plan Mode notificacoes-escopo: colaborador SEM vínculo em
    InstrumentoResponsavel pro instrumento não deve ver notificação de
    atualizacao_api/edicao_manual desse instrumento -- mesmo estando
    autenticado e mesmo a notificação existindo pra outros."""
    db = SessionLocal()
    instrumento_id = None
    notificacao_id = None
    titular = None
    estranho = None
    try:
        titular = _criar_usuario_teste(db)
        estranho = _criar_usuario_teste(db)

        instrumento = InstrumentoEquipamento(
            nr_convenio=f"TESTE-{uuid4()}",
            nome_convenente="Teste service — apagar",
        )
        db.add(instrumento)
        db.flush()
        instrumento_id = instrumento.id
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=titular.id, papel="titular"))
        db.flush()

        n = Notificacao(
            tipo=NotificacaoTipo.atualizacao_api,
            titulo="Teste service — apagar",
            entidade_id=instrumento.id,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        pagina_titular = listar_notificacoes(
            db=db, usuario_id=titular.id, limit=20, offset=0, apenas_nao_lidas=False
        )
        assert any(i.notificacao.id == notificacao_id for i in pagina_titular.itens)

        pagina_estranho = listar_notificacoes(
            db=db, usuario_id=estranho.id, limit=20, offset=0, apenas_nao_lidas=False
        )
        assert all(i.notificacao.id != notificacao_id for i in pagina_estranho.itens)
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        for u in (titular, estranho):
            if u is not None:
                db.query(User).filter_by(id=u.id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_gestor_ve_mesmo_sem_ser_titular():
    """Gestor/admin recebem TODAS as notificações de instrumento monitorado,
    independente de estarem designados como titular/suplente (decisão do
    usuário 2026-09-25)."""
    db = SessionLocal()
    instrumento_id = None
    notificacao_id = None
    gestor = None
    try:
        gestor = User(
            name="Gestor Pytest",
            email=f"pytest-gestor-notificacoes-{uuid4()}@example.com",
            password_hash=hash_password("senha"),
            role=UserRole.gestor,
        )
        db.add(gestor)
        db.commit()

        instrumento = InstrumentoEquipamento(
            nr_convenio=f"TESTE-{uuid4()}",
            nome_convenente="Teste service — apagar",
        )
        db.add(instrumento)
        db.flush()
        instrumento_id = instrumento.id
        # Sem InstrumentoResponsavel nenhum -- gestor não é titular/suplente.

        n = Notificacao(
            tipo=NotificacaoTipo.atualizacao_api,
            titulo="Teste service — apagar",
            entidade_id=instrumento.id,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        pagina = listar_notificacoes(db=db, usuario_id=gestor.id, limit=20, offset=0, apenas_nao_lidas=False)
        assert any(i.notificacao.id == notificacao_id for i in pagina.itens)
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        if gestor is not None:
            db.query(User).filter_by(id=gestor.id).delete()
        db.commit()
        db.close()


def test_listar_notificacoes_leitor_nunca_recebe_nada():
    """Leitor não recebe nenhuma notificação, mesmo sendo (hipoteticamente)
    titular do instrumento -- decisão do usuário 2026-09-25: sino vazio pra
    esse perfil."""
    db = SessionLocal()
    instrumento_id = None
    notificacao_id = None
    leitor = None
    try:
        leitor = User(
            name="Leitor Pytest",
            email=f"pytest-leitor-notificacoes-{uuid4()}@example.com",
            password_hash=hash_password("senha"),
            role=UserRole.leitor,
        )
        db.add(leitor)
        db.commit()

        instrumento = InstrumentoEquipamento(
            nr_convenio=f"TESTE-{uuid4()}",
            nome_convenente="Teste service — apagar",
        )
        db.add(instrumento)
        db.flush()
        instrumento_id = instrumento.id
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=leitor.id, papel="titular"))
        db.flush()

        n = Notificacao(
            tipo=NotificacaoTipo.atualizacao_api,
            titulo="Teste service — apagar",
            entidade_id=instrumento.id,
        )
        criar_notificacao(db, n)
        db.commit()
        notificacao_id = n.id

        pagina = listar_notificacoes(db=db, usuario_id=leitor.id, limit=20, offset=0, apenas_nao_lidas=False)
        assert pagina.itens == []
        assert pagina.nao_lidas == 0
    finally:
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if instrumento_id is not None:
            db.query(InstrumentoEquipamento).filter_by(id=instrumento_id).delete()
        if leitor is not None:
            db.query(User).filter_by(id=leitor.id).delete()
        db.commit()
        db.close()
