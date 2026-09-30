"""Testa `_ao_vivo_de` (app/routers/monitoramento.py) -- sinalizacao de
`valor_suspeito` quando o Portal da Transparencia devolve `valor` (global)
menor que `valorLiberado`, assinatura do bug de truncamento confirmado
nesse campo (ver docstring de ValorSituacaoAoVivoRead) -- e os endpoints de
edicao (PATCH cadastro, POST evento com numero_documento/data_validade,
achados 2026-09-09).

Chama as funcoes do router direto (nao via TestClient -- esse padrao nao
existe no resto do repo, ver test_config_decisions.py) contra o banco real
configurado. `registrar_evento`/`atualizar_cadastro` fazem `db.commit()`
internamente (append-only / PATCH de verdade, nao dado de teste que se
descarta com rollback) -- por isso cada teste que escreve limpa o que
criou/reverte o que mudou no `finally`, pra nao deixar sujeira no banco de
dev compartilhado."""

from datetime import date, datetime, timedelta, timezone
from typing import cast
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.auth import (
    create_access_token,
    hash_password,
    require_admin_user,
    require_monitoramento_editor,
    verify_password,
)
from app.config import settings
from app.db.base import SessionLocal
from app.db.models import (
    AcaoMonitoramento,
    AuditLog,
    CnesEstabelecimento,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    MarcoCatalogo,
    Notificacao,
    NotificacaoTipo,
    User,
    UserRole,
)
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError, ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.routers.monitoramento import (
    AcaoMonitoramentoCreate,
    EventoMarcoCreate,
    InstrumentoEquipamentoCreate,
    InstrumentoEquipamentoUpdate,
    _ao_vivo_de,
    atualizar_cadastro,
    concluir_acao,
    criar_instrumento,
    listar_acoes,
    listar_instrumentos,
    obter_resumo,
    registrar_acao,
    registrar_evento,
)
from app.services.monitoramento_eventos import (
    NovoEventoMonitorado,
    atualizar_cadastro_instrumento,
    concluir_acao_monitorada,
    editar_acao_monitorada,
    editar_evento_monitorado,
    excluir_acao_monitorada,
    excluir_evento_monitorado,
    registrar_acao_monitorada,
    registrar_evento_monitorado,
)
from app.services.monitoramento_instrumentos import listar_instrumentos_monitorados

NR_CONVENIO_SEED = "948686"  # unico instrumento seedado (scripts/seed_monitoramento.py)


def criar_usuario_teste(db, *, role: UserRole = UserRole.colaborador):
    """`role=colaborador` por padrão (mesmo comportamento de sempre, usado
    pelos testes que exercitam titularidade de propósito). Testes que só
    querem validar regra de negócio -- não autorização -- devem passar
    `role=UserRole.gestor` (bypassa o gate de titular/suplente, achado ao
    vivo 2026-09-28: a remoção do fail-open "sem titular libera qualquer
    colaborador" quebrou toda essa segunda categoria de teste)."""
    user = User(
        name="Usuário Pytest",
        email=f"pytest-monitoramento-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_ao_vivo_indisponivel_quando_convenio_nao_encontrado():
    ao_vivo = _ao_vivo_de(None)
    assert ao_vivo.disponivel is False
    assert ao_vivo.valor is None
    assert ao_vivo.valor_suspeito is False


def test_ao_vivo_nao_suspeito_quando_valor_maior_que_liberado():
    # Caso normal: valor global >= valor liberado.
    ao_vivo = _ao_vivo_de({"valor": 9_500_000, "valorLiberado": 9_003_200, "situacao": "EM EXECUÇÃO"})
    assert ao_vivo.disponivel is True
    assert ao_vivo.valor_suspeito is False
    assert ao_vivo.valor == 9_500_000
    assert ao_vivo.situacao == "EM EXECUÇÃO"


def test_ao_vivo_suspeito_quando_valor_truncado():
    # Reproduz o bug real confirmado no convenio 971195 (Santa Casa de
    # Santos): valor global truncado pra 1050 (deveria ser 10.500.000),
    # mas valorLiberado correto (10.499.846) -- liberado > global e
    # logicamente impossivel, sinaliza suspeito.
    ao_vivo = _ao_vivo_de({"valor": 1050, "valorLiberado": 10_499_846, "situacao": "EM EXECUÇÃO"})
    assert ao_vivo.disponivel is True
    assert ao_vivo.valor_suspeito is True
    # Nao tenta "corrigir" o numero -- so sinaliza. O valor cru continua
    # exposto pro chamador decidir o que fazer.
    assert ao_vivo.valor == 1050


def test_ao_vivo_nao_suspeito_quando_valor_liberado_ausente():
    # Sem valorLiberado pra comparar, nao da pra afirmar que e suspeito.
    ao_vivo = _ao_vivo_de({"valor": 1050, "valorLiberado": None, "situacao": "NORMAL"})
    assert ao_vivo.valor_suspeito is False


def test_patch_cadastro_atualiza_so_o_campo_enviado():
    db = SessionLocal()
    audit_log_id = None
    notificacao_id = None
    usuario_teste = None
    try:
        instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).one()
        usuario_teste = criar_usuario_teste(db, role=UserRole.gestor)
        original_marca = instrumento.equipamento_marca
        original_tecnico = instrumento.tecnico_titular

        resultado = atualizar_cadastro(
            NR_CONVENIO_SEED,
            InstrumentoEquipamentoUpdate(equipamento_marca="TESTE — apagar"),
            db,
            usuario_teste,
        )
        assert resultado.equipamento_marca == "TESTE — apagar"
        # PATCH parcial nao pode zerar campo que nao veio no corpo.
        assert resultado.tecnico_titular == original_tecnico
        log = (
            db.query(AuditLog)
            .filter_by(entity_name="instrumento_equipamento", entity_id=instrumento.id)
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert log.details is not None
        audit_log_id = log.id
        assert log.user_id == usuario_teste.id
        assert log.action == "updated"
        assert log.details["changes"]["equipamento_marca"]["old"] == original_marca
        assert log.details["changes"]["equipamento_marca"]["new"] == "TESTE — apagar"

        # Radar de Convenios (2026-09-15) -- PATCH com mudanca real cria
        # notificacao camada 2 (edicao_manual).
        notificacao = (
            db.query(Notificacao)
            .filter_by(
                tipo=NotificacaoTipo.edicao_manual,
                entidade_id=instrumento.id,
            )
            .order_by(Notificacao.id.desc())
            .first()
        )
        assert notificacao is not None
        assert notificacao.corpo is not None
        notificacao_id = notificacao.id
        assert "equipamento_marca" in notificacao.corpo
    finally:
        # Sem rollback aqui (o commit do PATCH ja foi pra base) -- reverte
        # de volta ao valor original com outro PATCH de verdade.
        db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).update(
            {"equipamento_marca": original_marca}
        )
        if audit_log_id is not None:
            db.query(AuditLog).filter_by(id=audit_log_id).delete()
        if notificacao_id is not None:
            db.query(Notificacao).filter_by(id=notificacao_id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


def test_patch_cadastro_nunca_toca_equipamento_descricao():
    """equipamento_descricao e o equipamento PLANEJADO (SICONV) -- nao faz
    parte de InstrumentoEquipamentoUpdate de proposito (decisao do usuario
    2026-09-09: "não vamos alterar o equipamento que veio do SISCONV")."""
    assert "equipamento_descricao" not in InstrumentoEquipamentoUpdate.model_fields


def test_patch_cadastro_nunca_toca_tipo_contratacao():
    """tipo_contratacao (Convênio/FAF/TED) so vem da planilha/import --
    achado 2026-09-09, 2a rodada, nunca editavel a mao por aqui."""
    assert "tipo_contratacao" not in InstrumentoEquipamentoUpdate.model_fields


def test_criar_instrumento_via_post_cadastro_manual():
    """Radar de Convenios (2026-09-15) -- porta manual do POST novo (a
    outra porta, candidato aceito, ainda nao tem job de descoberta pra
    testar). NUP SEI-like sem numero real de convenio, mesmo padrao que
    FAF/TED ja usam."""
    db = SessionLocal()
    nr_convenio_teste = f"TESTE-{uuid4().hex[:10]}"
    audit_log_id = None
    usuario_teste = None
    try:
        usuario_teste = criar_usuario_teste(db)
        resultado = criar_instrumento(
            InstrumentoEquipamentoCreate(
                nr_convenio=nr_convenio_teste,
                cnpj_convenente="00000000000100",
                nome_convenente="Instituição Pytest",
                tipo_contratacao="FAF",
                municipio="Brasília",
                uf="DF",
                tecnico_titular_id=usuario_teste.id,
            ),
            db,
            usuario_teste,
        )
        assert resultado.nr_convenio == nr_convenio_teste
        assert resultado.tipo_contratacao == "FAF"

        log = (
            db.query(AuditLog)
            .filter_by(
                entity_name="instrumento_equipamento",
                entity_id=resultado.id,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )
        assert log is not None
        assert log.details is not None
        audit_log_id = log.id
        assert log.details is not None
        assert log.action == "created"
        assert log.details["nr_convenio"] == nr_convenio_teste

        # Segunda tentativa com o mesmo nr_convenio -- checagem de
        # duplicidade tem que barrar antes de criar linha repetida.
        with pytest.raises(ConflictError) as exc:
            criar_instrumento(
                InstrumentoEquipamentoCreate(
                    nr_convenio=nr_convenio_teste,
                    cnpj_convenente="x",
                    nome_convenente="x",
                    tipo_contratacao="FAF",
                    tecnico_titular_id=usuario_teste.id,
                ),
                db,
                usuario_teste,
            )
        assert exc.value.status_code == 409
    finally:
        if audit_log_id is not None:
            db.query(AuditLog).filter_by(id=audit_log_id).delete()
        db.query(InstrumentoEquipamento).filter_by(nr_convenio=nr_convenio_teste).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


def test_patch_cadastro_convenio_inexistente_404():
    db = SessionLocal()
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    try:
        with pytest.raises(NotFoundError) as exc:
            atualizar_cadastro("000000", InstrumentoEquipamentoUpdate(equipamento_marca="x"), db, usuario_teste)
        assert exc.value.status_code == 404
    finally:
        db.rollback()  # nada foi escrito (404 antes do commit) -- rollback so por seguranca
        db.close()


def test_registrar_evento_persiste_numero_documento_e_data_validade():
    db = SessionLocal()
    evento_id = None
    audit_log_id = None
    usuario_teste = None
    try:
        marco_licenca = db.query(MarcoCatalogo).filter_by(codigo="regulatorio_licenca_operacao").one()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        usuario_teste = criar_usuario_teste(db, role=UserRole.gestor)

        corpo = EventoMarcoCreate(
            marco_id=marco_licenca.id,
            data_ocorrencia=date(2026, 1, 10),
            numero_documento="TESTE-123",
            data_validade=date(2031, 1, 10),
            observacao="Evento de teste -- apagar",
            autor_nome="pytest",
            fase_geral_id=marco_fase.id,
        )
        resultado = registrar_evento(NR_CONVENIO_SEED, corpo, db, usuario_teste)
        evento_id = resultado.id
        assert resultado.autor_nome == usuario_teste.name
        assert resultado.numero_documento == "TESTE-123"
        assert resultado.data_validade == date(2031, 1, 10)
        log = db.query(AuditLog).filter_by(entity_name="evento_marco", entity_id=evento_id).one()
        audit_log_id = log.id
        assert log.user_id == usuario_teste.id
        assert log.action == "created"
        assert log.details is not None
        assert log.details["nr_convenio"] == NR_CONVENIO_SEED
    finally:
        if evento_id is not None:
            if audit_log_id is not None:
                db.query(AuditLog).filter_by(id=audit_log_id).delete()
            db.query(EventoMarco).filter_by(id=evento_id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


def test_registrar_evento_de_entrega_atualiza_equipamento_e_observacao():
    """Achado 2026-09-09, 2a rodada (pedido do usuario: "o equipamento
    entregue pode mover para eventos"): so o marco cronograma_entrega
    aplica os campos fisicos em InstrumentoEquipamento (estado atual) E
    compoe um resumo textual na observacao do evento (retrato historico)."""
    db = SessionLocal()
    evento_id = None
    audit_log_id = None
    usuario_teste = None
    instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).one()
    original = dict(
        marca=instrumento.equipamento_marca,
        modelo=instrumento.equipamento_modelo,
        serie=instrumento.equipamento_numero_serie,
        vida_util=instrumento.equipamento_vida_util_anos,
    )
    try:
        marco_entrega = db.query(MarcoCatalogo).filter_by(codigo="cronograma_entrega").one()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        usuario_teste = criar_usuario_teste(db, role=UserRole.gestor)
        corpo = EventoMarcoCreate(
            marco_id=marco_entrega.id,
            data_ocorrencia=date(2026, 2, 1),
            observacao="Entrega de teste -- apagar",
            autor_nome="pytest",
            equipamento_marca="MARCA TESTE",
            equipamento_modelo="MODELO TESTE",
            equipamento_numero_serie="SN-TESTE-1",
            equipamento_vida_util_anos=10,
            fase_geral_id=marco_fase.id,
        )
        resultado = registrar_evento(NR_CONVENIO_SEED, corpo, db, usuario_teste)
        evento_id = resultado.id
        audit_log_id = db.query(AuditLog).filter_by(entity_name="evento_marco", entity_id=evento_id).one().id
        assert "Equipamento entregue: MARCA TESTE MODELO TESTE" in resultado.observacao
        assert "Nº série SN-TESTE-1" in resultado.observacao
        assert "Vida útil 10 ano(s)" in resultado.observacao

        db.refresh(instrumento)
        assert instrumento.equipamento_marca == "MARCA TESTE"
        assert instrumento.equipamento_modelo == "MODELO TESTE"
        assert instrumento.equipamento_numero_serie == "SN-TESTE-1"
        assert instrumento.equipamento_vida_util_anos == 10
    finally:
        if evento_id is not None:
            if audit_log_id is not None:
                db.query(AuditLog).filter_by(id=audit_log_id).delete()
            db.query(EventoMarco).filter_by(id=evento_id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        instrumento.equipamento_marca = cast(str | None, original["marca"])
        instrumento.equipamento_modelo = cast(str | None, original["modelo"])
        instrumento.equipamento_numero_serie = cast(str | None, original["serie"])
        instrumento.equipamento_vida_util_anos = cast(int | None, original["vida_util"])
        db.commit()
        db.close()


def test_registrar_evento_fora_da_entrega_ignora_campos_de_equipamento():
    """Marco que nao seja cronograma_entrega nunca mexe em
    InstrumentoEquipamento por causa de equipamento_* no corpo -- so
    cronograma_entrega tem esse efeito colateral, de proposito."""
    db = SessionLocal()
    evento_id = None
    audit_log_id = None
    usuario_teste = None
    instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).one()
    original_marca = instrumento.equipamento_marca
    try:
        marco_licenca = db.query(MarcoCatalogo).filter_by(codigo="regulatorio_licenca_operacao").one()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        usuario_teste = criar_usuario_teste(db, role=UserRole.gestor)
        corpo = EventoMarcoCreate(
            marco_id=marco_licenca.id,
            autor_nome="pytest",
            observacao="Evento de teste -- apagar",
            equipamento_marca="NAO DEVERIA SALVAR",
            fase_geral_id=marco_fase.id,
        )
        resultado = registrar_evento(NR_CONVENIO_SEED, corpo, db, usuario_teste)
        evento_id = resultado.id
        audit_log_id = db.query(AuditLog).filter_by(entity_name="evento_marco", entity_id=evento_id).one().id
        assert "Equipamento entregue" not in (resultado.observacao or "")
        db.refresh(instrumento)
        assert instrumento.equipamento_marca == original_marca
    finally:
        if evento_id is not None:
            if audit_log_id is not None:
                db.query(AuditLog).filter_by(id=audit_log_id).delete()
            db.query(EventoMarco).filter_by(id=evento_id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


def test_resumo_traz_totais_e_lista_de_convenios():
    """DB de dev tem dado real importado (scripts/importar_planilha_monitoramento.py,
    2026-09-09) -- so checa estrutura/consistencia, nao conta exata (o
    numero de instrumentos cresce conforme a planilha da equipe muda)."""
    db = SessionLocal()
    try:
        resumo = obter_resumo(db)
        assert resumo.total_instrumentos >= 1
        assert NR_CONVENIO_SEED in resumo.nr_convenios
        assert len(resumo.nr_convenios) == resumo.total_instrumentos
        if resumo.pct_execucao_fisica_medio is not None:
            assert 0.0 <= resumo.pct_execucao_fisica_medio <= 1.0
            esperado = (
                sum(item.pct_referencia_fase or 0 for item in resumo.indicadores_por_instrumento)
                / resumo.total_instrumentos
            )
            assert resumo.pct_execucao_fisica_medio == pytest.approx(esperado)
        assert resumo.acoes_pendentes >= 0
        assert resumo.acoes_atrasadas <= resumo.acoes_pendentes
        # Toda inauguracao listada tem convenio real do resumo.
        for i in resumo.inauguracoes:
            assert i.nr_convenio in resumo.nr_convenios
        # Toda licenca por vencer listada tem convenio real do resumo.
        for licenca in resumo.licencas_vencendo:
            assert licenca.nr_convenio in resumo.nr_convenios
        # Achado 2026-09-09, 2a rodada: instrumento sem tecnico_titular
        # (NA/NI ja viram NULL na migration/import) sempre conta, com
        # rotulo proprio -- nunca "NA"/"NI" nem omitido silenciosamente.
        rotulos_tecnico = {c.rotulo for c in resumo.por_tecnico_titular}
        assert "NA" not in rotulos_tecnico
        assert "NI" not in rotulos_tecnico
        total_tecnico = sum(c.quantidade for c in resumo.por_tecnico_titular)
        assert total_tecnico == resumo.total_instrumentos
    finally:
        db.close()


def test_resumo_considera_somente_acoes_ativas_por_instrumento():
    db = SessionLocal()
    instrumento = InstrumentoEquipamento(
        nr_convenio=f"PYTEST-RESUMO-{uuid4()}",
        nome_convenente="Convenente do teste de resumo",
    )
    try:
        db.add(instrumento)
        db.flush()
        antiga = AcaoMonitoramento(
            instrumento_id=instrumento.id,
            descricao="Versão substituída",
            data_prevista=date.today() - timedelta(days=10),
        )
        vigente = AcaoMonitoramento(
            instrumento_id=instrumento.id,
            descricao="Versão vigente",
            data_prevista=date.today() + timedelta(days=5),
        )
        excluida = AcaoMonitoramento(
            instrumento_id=instrumento.id,
            descricao="Ação excluída",
            data_prevista=date.today() - timedelta(days=5),
            deletado_em=datetime.now(timezone.utc),
        )
        concluida = AcaoMonitoramento(
            instrumento_id=instrumento.id,
            descricao="Ação concluída",
            data_prevista=date.today() - timedelta(days=3),
            data_conclusao=date.today(),
        )
        db.add_all([antiga, vigente, excluida, concluida])
        db.flush()
        antiga.substituido_por_id = vigente.id
        db.flush()

        dados = monitoramento_repo.carregar_dados_resumo_monitoramento(db, hoje=date.today())
        assert dados.acoes_por_instrumento[instrumento.id] == (1, 0)
        assert [acao.id for acao, _ in dados.acoes_em_aberto if acao.instrumento_id == instrumento.id] == [vigente.id]
        resumo = obter_resumo(db)
        indicador = next(
            item for item in resumo.indicadores_por_instrumento if item.nr_convenio == instrumento.nr_convenio
        )
        assert (indicador.acoes_pendentes, indicador.acoes_atrasadas) == (1, 0)
    finally:
        db.rollback()
        db.close()


def test_registrar_e_concluir_acao():
    db = SessionLocal()
    acao_id = None
    audit_log_ids: list[int] = []
    usuario_teste = None
    try:
        usuario_teste = criar_usuario_teste(db, role=UserRole.gestor)
        criada = registrar_acao(
            NR_CONVENIO_SEED,
            AcaoMonitoramentoCreate(descricao="Ação de teste -- apagar", data_prevista=date(2026, 12, 1)),
            db,
            usuario_teste,
        )
        acao_id = criada.id
        log_criacao = (
            db.query(AuditLog).filter_by(entity_name="acao_monitoramento", entity_id=acao_id, action="created").one()
        )
        audit_log_ids.append(log_criacao.id)
        assert log_criacao.user_id == usuario_teste.id
        assert criada.data_conclusao is None  # criada = pendente
        assert criada.nr_convenio == NR_CONVENIO_SEED

        pendentes = listar_acoes(pendentes=True, limit=500, db=db)
        assert any(a.id == acao_id for a in pendentes)

        concluida = concluir_acao(acao_id, db, usuario_teste)
        assert concluida.data_conclusao == date.today()
        log_conclusao = (
            db.query(AuditLog).filter_by(entity_name="acao_monitoramento", entity_id=acao_id, action="completed").one()
        )
        audit_log_ids.append(log_conclusao.id)
        assert log_conclusao.details is not None
        assert log_conclusao.user_id == usuario_teste.id
        assert log_conclusao.details["new"] == date.today().isoformat()

        pendentes_depois = listar_acoes(pendentes=True, limit=500, db=db)
        assert not any(a.id == acao_id for a in pendentes_depois)
    finally:
        for audit_log_id in audit_log_ids:
            db.query(AuditLog).filter_by(id=audit_log_id).delete()
        if acao_id is not None:
            db.query(AcaoMonitoramento).filter_by(id=acao_id).delete()
        if usuario_teste is not None:
            db.query(User).filter_by(id=usuario_teste.id).delete()
            db.commit()
        db.close()


def test_registrar_acao_convenio_inexistente_404():
    db = SessionLocal()
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    try:
        with pytest.raises(NotFoundError) as exc:
            registrar_acao("000000", AcaoMonitoramentoCreate(descricao="x"), db, usuario_teste)
        assert exc.value.status_code == 404
    finally:
        db.rollback()
        db.close()


def test_concluir_acao_inexistente_404():
    db = SessionLocal()
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    try:
        with pytest.raises(NotFoundError) as exc:
            concluir_acao(999_999_999, db, usuario_teste)
        assert exc.value.status_code == 404
    finally:
        db.rollback()
        db.close()


def test_hash_password_verifica_senha_correta_e_rejeita_errada():
    senha_hash = hash_password("senha-correta")
    assert verify_password("senha-correta", senha_hash) is True
    assert verify_password("senha-errada", senha_hash) is False


def test_create_access_token_exige_jwt_secret(monkeypatch):
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    monkeypatch.setattr(settings, "jwt_secret", "")
    with pytest.raises(HTTPException) as exc:
        create_access_token(usuario_teste, refresh_token_id=1)
    assert exc.value.status_code == 503


def test_create_access_token_com_jwt_secret(monkeypatch):
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    monkeypatch.setattr(settings, "jwt_secret", "segredo-com-pelo-menos-32-bytes-ok")
    token = create_access_token(usuario_teste, refresh_token_id=1)
    assert isinstance(token, str)
    assert token


def test_perfil_leitor_nao_pode_editar_monitoramento():
    leitor = User(id=456, name="Leitor", email="leitor@example.com", role=UserRole.leitor)
    with pytest.raises(HTTPException) as exc:
        require_monitoramento_editor(leitor)
    assert exc.value.status_code == 403


def test_perfil_colaborador_pode_editar_monitoramento():
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    assert require_monitoramento_editor(usuario_teste) is usuario_teste


def test_perfil_gestor_edita_monitoramento_mas_nao_usuarios():
    gestor = User(id=123457, name="Gestor", email="gestor@example.com", role=UserRole.gestor)
    assert require_monitoramento_editor(gestor) is gestor
    with pytest.raises(HTTPException) as exc:
        require_admin_user(gestor)
    assert exc.value.status_code == 403


def test_atualizar_cadastro_nao_sincroniza_mais_responsavel_por_texto():
    """Inverte `test_atualizar_cadastro_sincroniza_responsavel_relacional`
    (achado ao vivo 2026-09-28, limpeza da titularidade): o espelho
    texto->relacional (`_EMAIL_RESPONSAVEL_POR_TEXTO`/
    `_sincronizar_responsaveis_relacionais`) foi removido de propósito --
    "não é aceitável inferir qual colaborador corresponde a cada nome"
    (docs/arquitetura/planmode-governanca-dados-2026-09-28.md). PATCH em
    `tecnico_titular` só atualiza o texto legado agora; vínculo relacional
    exige atribuição explícita de um gestor."""
    db = SessionLocal()
    usuario_teste = criar_usuario_teste(db, role=UserRole.gestor)
    nr_convenio = f"PYTEST-RESP-{uuid4()}"
    instrumento = InstrumentoEquipamento(
        nr_convenio=nr_convenio,
        nome_convenente="Convenente Pytest",
        tipo_contratacao="Convênio",
    )
    try:
        db.add(instrumento)
        db.commit()

        resultado = atualizar_cadastro_instrumento(
            nr_convenio=nr_convenio,
            alteracoes_brutas={"tecnico_titular": "BRUNA"},
            db=db,
            usuario=usuario_teste,
        )

        assert resultado.tecnico_titular == "BRUNA"
        assert db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).first() is None
    finally:
        db.query(AuditLog).filter_by(entity_name="instrumento_equipamento", entity_id=instrumento.id).delete()
        db.delete(instrumento)
        db.query(User).filter_by(id=usuario_teste.id).delete()
        db.commit()
        db.close()


# Plan Mode segurança 2026-09-16, Bloco 3: a checagem de role precisa viver
# no Service, não só no Depends do router -- os 4 testes abaixo chamam a
# função de Service diretamente (sem passar por require_monitoramento_editor
# nenhum), provando que um `leitor` é rejeitado mesmo bypassando o HTTP.
def test_atualizar_cadastro_instrumento_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999001, name="Leitor", email="leitor-bloco3@example.com", role=UserRole.leitor)
        with pytest.raises(AuthorizationError) as exc:
            atualizar_cadastro_instrumento(
                nr_convenio=NR_CONVENIO_SEED,
                alteracoes_brutas={"tecnico_suplente": "X"},
                db=db,
                usuario=leitor,
            )
        assert exc.value.status_code == 403
    finally:
        db.close()


def test_registrar_evento_monitorado_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999002, name="Leitor", email="leitor-bloco3-evento@example.com", role=UserRole.leitor)
        with pytest.raises(AuthorizationError) as exc:
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(marco_id=1),
                db=db,
                usuario=leitor,
            )
        assert exc.value.status_code == 403
    finally:
        db.close()


def test_evento_realizado_rejeita_data_futura_e_orienta_atualizacao():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco = db.query(MarcoCatalogo).filter_by(codigo="cronograma_previsao_inauguracao").one()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        with pytest.raises(ValidationError, match="Atualize-a para a data real"):
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(
                    marco_id=marco.id,
                    data_ocorrencia=date.today() + timedelta(days=1),
                    fase_geral_id=marco_fase.id,
                ),
                db=db,
                usuario=usuario,
            )
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_reprogramacao_de_data_prevista_exige_justificativa():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).one()
        marco = db.query(MarcoCatalogo).filter_by(codigo="cronograma_previsao_inauguracao").one()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        db.add(
            EventoMarco(
                instrumento_id=instrumento.id,
                marco_id=marco.id,
                data_prevista=date.today() + timedelta(days=10),
                autor_id=usuario.id,
            )
        )
        db.flush()
        with pytest.raises(ValidationError, match="justificativa"):
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(
                    marco_id=marco.id,
                    data_prevista=date.today() + timedelta(days=20),
                    fase_geral_id=marco_fase.id,
                ),
                db=db,
                usuario=usuario,
            )
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_registrar_acao_monitorada_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999003, name="Leitor", email="leitor-bloco3-acao@example.com", role=UserRole.leitor)
        with pytest.raises(AuthorizationError) as exc:
            registrar_acao_monitorada(
                nr_convenio=NR_CONVENIO_SEED,
                descricao="x",
                data_prevista=None,
                responsavel=None,
                db=db,
                usuario=leitor,
            )
        assert exc.value.status_code == 403
    finally:
        db.close()


def test_concluir_acao_monitorada_bloqueia_leitor_no_service():
    # Precisa de uma ação real -- desde a autorização por titularidade
    # (2026-09-25), `concluir_acao_monitorada` carrega a ação (404 se não
    # existe) ANTES de autorizar, então um `acao_id` inventado levantaria
    # NotFoundError em vez de AuthorizationError.
    db = SessionLocal()
    instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=NR_CONVENIO_SEED).one()
    acao = AcaoMonitoramento(instrumento_id=instrumento.id, descricao="Ação pytest bloco3", criado_por_id=None)
    try:
        db.add(acao)
        db.commit()
        leitor = User(id=999004, name="Leitor", email="leitor-bloco3-concluir@example.com", role=UserRole.leitor)
        with pytest.raises(AuthorizationError) as exc:
            concluir_acao_monitorada(acao_id=acao.id, db=db, usuario=leitor)
        assert exc.value.status_code == 403
    finally:
        db.rollback()
        db.delete(db.query(AcaoMonitoramento).filter_by(id=acao.id).one())
        db.commit()
        db.close()


# ---------------------------------------------------------------------
# Autorização por titularidade (pedido do usuário, 2026-09-25): colaborador
# só edita instrumento onde é titular/suplente designado
# (InstrumentoResponsavel); admin/gestor editam qualquer um; instrumento sem
# ninguém designado fica liberado pra qualquer colaborador. Usa instrumento
# PRÓPRIO (scratch, nunca NR_CONVENIO_SEED) pra não vincular titular ao
# instrumento compartilhado -- isso quebraria os outros testes deste arquivo,
# que editam NR_CONVENIO_SEED com um colaborador qualquer contando com o
# fail-open de "sem responsável designado".
# ---------------------------------------------------------------------


def _criar_instrumento_scratch(db, *, sufixo: str) -> InstrumentoEquipamento:
    instrumento = InstrumentoEquipamento(
        nr_convenio=f"PYTEST-TITULAR-{sufixo}-{uuid4()}",
        nome_convenente="Convenente Pytest Titularidade",
        tipo_contratacao="Convênio",
    )
    db.add(instrumento)
    db.commit()
    return instrumento


def test_colaborador_nao_titular_nao_pode_registrar_evento_de_outro_tecnico():
    db = SessionLocal()
    titular = criar_usuario_teste(db)
    outro = criar_usuario_teste(db)
    instrumento = _criar_instrumento_scratch(db, sufixo="EVT-NEGADO")
    try:
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=titular.id, papel="titular"))
        db.commit()

        marco = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        with pytest.raises(AuthorizationError) as exc:
            registrar_evento_monitorado(
                nr_convenio=instrumento.nr_convenio,
                dados=NovoEventoMonitorado(marco_id=marco.id),
                db=db,
                usuario=outro,
            )
        assert exc.value.status_code == 403
    finally:
        db.rollback()
        db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).delete()
        db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        db.query(User).filter(User.id.in_([titular.id, outro.id])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_colaborador_titular_pode_registrar_evento_no_proprio_instrumento():
    db = SessionLocal()
    titular = criar_usuario_teste(db)
    instrumento = _criar_instrumento_scratch(db, sufixo="EVT-PERMITIDO")
    evento = None
    try:
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=titular.id, papel="titular"))
        db.commit()

        marco = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        evento = registrar_evento_monitorado(
            nr_convenio=instrumento.nr_convenio,
            dados=NovoEventoMonitorado(marco_id=marco.id),
            db=db,
            usuario=titular,
        )
        assert evento.instrumento_id == instrumento.id
    finally:
        db.rollback()
        if evento is not None:
            db.query(AuditLog).filter_by(entity_name="evento_marco", entity_id=evento.id).delete()
            db.query(Notificacao).filter_by(entidade_id=instrumento.id).delete()
            db.query(EventoMarco).filter_by(id=evento.id).delete()
        db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).delete()
        db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        db.query(User).filter_by(id=titular.id).delete()
        db.commit()
        db.close()


def test_colaborador_nao_titular_nao_pode_excluir_acao_de_outro_tecnico():
    """`excluir_acao_monitorada` só recebe `acao_id` -- cobre o grupo de
    funções que precisa carregar a entidade ANTES de autorizar (diferente de
    `registrar_evento_monitorado`, que já recebe `nr_convenio`)."""
    db = SessionLocal()
    titular = criar_usuario_teste(db)
    outro = criar_usuario_teste(db)
    instrumento = _criar_instrumento_scratch(db, sufixo="ACAO-NEGADO")
    acao = AcaoMonitoramento(instrumento_id=instrumento.id, descricao="Ação pytest titularidade")
    try:
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=titular.id, papel="titular"))
        db.add(acao)
        db.commit()

        with pytest.raises(AuthorizationError) as exc:
            excluir_acao_monitorada(acao_id=acao.id, motivo="teste pytest", db=db, usuario=outro)
        assert exc.value.status_code == 403
    finally:
        db.rollback()
        db.query(AcaoMonitoramento).filter_by(id=acao.id).delete()
        db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).delete()
        db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        db.query(User).filter(User.id.in_([titular.id, outro.id])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_instrumento_sem_titular_designado_libera_qualquer_colaborador():
    db = SessionLocal()
    qualquer = criar_usuario_teste(db)
    instrumento = _criar_instrumento_scratch(db, sufixo="SEM-TITULAR")
    evento = None
    try:
        marco = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        evento = registrar_evento_monitorado(
            nr_convenio=instrumento.nr_convenio,
            dados=NovoEventoMonitorado(marco_id=marco.id),
            db=db,
            usuario=qualquer,
        )
        assert evento.instrumento_id == instrumento.id
    finally:
        db.rollback()
        if evento is not None:
            db.query(AuditLog).filter_by(entity_name="evento_marco", entity_id=evento.id).delete()
            db.query(Notificacao).filter_by(entidade_id=instrumento.id).delete()
            db.query(EventoMarco).filter_by(id=evento.id).delete()
        db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        db.query(User).filter_by(id=qualquer.id).delete()
        db.commit()
        db.close()


def test_listar_instrumentos_calcula_pode_editar_por_titularidade():
    db = SessionLocal()
    titular = criar_usuario_teste(db)
    outro = criar_usuario_teste(db)
    instrumento = _criar_instrumento_scratch(db, sufixo="LISTAGEM")
    try:
        db.add(InstrumentoResponsavel(instrumento_id=instrumento.id, usuario_id=titular.id, papel="titular"))
        db.commit()

        por_titular = {i.nr_convenio: i.pode_editar for i in listar_instrumentos(limit=500, db=db, usuario=titular)}
        por_outro = {i.nr_convenio: i.pode_editar for i in listar_instrumentos(limit=500, db=db, usuario=outro)}
        assert por_titular[instrumento.nr_convenio] is True
        assert por_outro[instrumento.nr_convenio] is False
    finally:
        db.rollback()
        db.query(InstrumentoResponsavel).filter_by(instrumento_id=instrumento.id).delete()
        db.query(InstrumentoEquipamento).filter_by(id=instrumento.id).delete()
        db.query(User).filter(User.id.in_([titular.id, outro.id])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_listar_instrumentos_expoe_coordenadas_do_cnes():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    codigo = str(uuid4().int % 10_000_000).zfill(7)
    while db.get(CnesEstabelecimento, codigo) is not None:
        codigo = str(uuid4().int % 10_000_000).zfill(7)
    referencia = CnesEstabelecimento(
        cnes=codigo,
        nome_estabelecimento="Hospital sintético do teste",
        latitude=-15.78,
        longitude=-47.93,
    )
    db.add(referencia)
    db.commit()
    instrumento = _criar_instrumento_scratch(db, sufixo="MAPA-CNES")
    sem_cnes = _criar_instrumento_scratch(db, sufixo="MAPA-SEM-CNES")
    try:
        instrumento.cnes = codigo
        db.commit()

        itens = {item.nr_convenio: item for item in listar_instrumentos(limit=500, db=db, usuario=usuario)}

        assert itens[instrumento.nr_convenio].latitude == pytest.approx(-15.78)
        assert itens[instrumento.nr_convenio].longitude == pytest.approx(-47.93)
        assert itens[sem_cnes.nr_convenio].latitude is None
        assert itens[sem_cnes.nr_convenio].longitude is None
    finally:
        db.rollback()
        db.query(InstrumentoEquipamento).filter(InstrumentoEquipamento.id.in_([instrumento.id, sem_cnes.id])).delete()
        db.query(CnesEstabelecimento).filter_by(cnes=codigo).delete()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


# ---------------------------------------------------------------------
# Plan Mode monitoramento-evolucao 2026-09-19, Bloco 1/2: ciclo de vida
# append-only de evento/ação (editar = novo registro + fecha o antigo via
# substituido_por_id; excluir = soft delete com motivo), vínculo
# fase_geral_id obrigatório em marco físico/regulatório, criado_por_id em
# AcaoMonitoramento, e o CHECK de tipologia/modalidade_onco. Mesmo padrão
# de limpeza do resto do arquivo: usuário criado via criar_usuario_teste
# (comita), evento/ação/instrumento só com db.flush() (nunca commit) --
# db.rollback() no finally descarta tudo isso de uma vez, só o usuário
# precisa de delete explícito.
# ---------------------------------------------------------------------


def test_evento_fisico_sem_fase_geral_id_rejeitado():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco_fisico = db.query(MarcoCatalogo).filter_by(codigo="cronograma_entrega").one()
        with pytest.raises(ValidationError, match="fase geral"):
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(marco_id=marco_fisico.id, data_ocorrencia=date(2026, 1, 1)),
                db=db,
                usuario=usuario,
            )
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_evento_fisico_com_fase_geral_invalida_rejeitado():
    """`fase_geral_id` precisa apontar pra um marco de grupo=fase_geral --
    apontar pra outro marco físico/regulatório (ou qualquer id que não seja
    fase_geral) é rejeitado."""
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco_fisico = db.query(MarcoCatalogo).filter_by(codigo="cronograma_entrega").one()
        outro_marco_fisico = db.query(MarcoCatalogo).filter_by(codigo="cronograma_instalacao_inicio").one()
        with pytest.raises(ValidationError, match="fase geral válido"):
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(
                    marco_id=marco_fisico.id,
                    data_ocorrencia=date(2026, 1, 1),
                    fase_geral_id=outro_marco_fisico.id,
                ),
                db=db,
                usuario=usuario,
            )
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_editar_evento_monitorado_corrige_e_fecha_original():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco_fisico = db.query(MarcoCatalogo).filter_by(codigo="cronograma_entrega").one()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        antigo = registrar_evento_monitorado(
            nr_convenio=NR_CONVENIO_SEED,
            dados=NovoEventoMonitorado(
                marco_id=marco_fisico.id,
                data_ocorrencia=date(2026, 1, 1),
                fase_geral_id=marco_fase.id,
            ),
            db=db,
            usuario=usuario,
        )
        antigo_id = antigo.id

        novo = editar_evento_monitorado(
            evento_id=antigo_id,
            dados=NovoEventoMonitorado(
                marco_id=0,  # ignorado -- mantém o marco do evento original
                data_ocorrencia=date(2026, 1, 2),
                fase_geral_id=marco_fase.id,
                observacao="corrigido",
            ),
            db=db,
            usuario=usuario,
        )

        assert novo.id != antigo_id
        assert novo.marco_id == marco_fisico.id
        assert novo.data_ocorrencia == date(2026, 1, 2)
        assert antigo.substituido_por_id == novo.id
        assert antigo.atualizado_em is not None

        ativos = [e.id for e in _eventos_ativos_do_instrumento(db, NR_CONVENIO_SEED)]
        assert novo.id in ativos
        assert antigo_id not in ativos
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_editar_evento_ja_substituido_rejeitado():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_em_licitacao").one()
        antigo = registrar_evento_monitorado(
            nr_convenio=NR_CONVENIO_SEED,
            dados=NovoEventoMonitorado(marco_id=marco_fase.id, data_ocorrencia=date(2026, 1, 1)),
            db=db,
            usuario=usuario,
        )
        editar_evento_monitorado(
            evento_id=antigo.id,
            dados=NovoEventoMonitorado(marco_id=0, data_ocorrencia=date(2026, 1, 2)),
            db=db,
            usuario=usuario,
        )
        with pytest.raises(ValidationError, match="já foi excluído ou corrigido"):
            editar_evento_monitorado(
                evento_id=antigo.id,
                dados=NovoEventoMonitorado(marco_id=0, data_ocorrencia=date(2026, 1, 3)),
                db=db,
                usuario=usuario,
            )
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_conclusao_confirma_inauguracao_e_fecha_previsao_anterior():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    instrumento = InstrumentoEquipamento(
        nr_convenio=f"PYTEST-CONCLUSAO-{uuid4()}",
        nome_convenente="Convenente Pytest",
        tipo_contratacao="Convênio",
    )
    try:
        db.add(instrumento)
        db.flush()
        marco_concluido = db.query(MarcoCatalogo).filter_by(codigo="fase_concluido").one()
        marco_inauguracao = db.query(MarcoCatalogo).filter_by(codigo="cronograma_previsao_inauguracao").one()
        previsao = EventoMarco(
            instrumento_id=instrumento.id,
            marco_id=marco_inauguracao.id,
            data_prevista=date(2025, 9, 1),
            autor_id=usuario.id,
        )
        db.add(previsao)
        db.flush()

        concluido = registrar_evento_monitorado(
            nr_convenio=instrumento.nr_convenio,
            dados=NovoEventoMonitorado(
                marco_id=marco_concluido.id,
                data_ocorrencia=date(2025, 9, 2),
                confirmar_inauguracao=True,
            ),
            db=db,
            usuario=usuario,
        )

        inauguracao = monitoramento_repo.obter_evento_mais_recente_do_marco(
            db,
            instrumento_id=instrumento.id,
            marco_id=marco_inauguracao.id,
        )
        assert concluido.data_ocorrencia == date(2025, 9, 2)
        assert inauguracao is not None and inauguracao.data_ocorrencia == date(2025, 9, 2)
        assert inauguracao.fase_geral_id == marco_concluido.id
        assert previsao.substituido_por_id == inauguracao.id
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_fase_geral_rejeita_data_prevista_e_conclusao_sem_confirmacao():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco = db.query(MarcoCatalogo).filter_by(codigo="fase_concluido").one()
        with pytest.raises(ValidationError, match="não aceita data prevista"):
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(marco_id=marco.id, data_prevista=date(2025, 9, 1)),
                db=db,
                usuario=usuario,
            )
        with pytest.raises(ValidationError, match="Confirme a inauguração"):
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED,
                dados=NovoEventoMonitorado(marco_id=marco.id, data_ocorrencia=date(2025, 9, 2)),
                db=db,
                usuario=usuario,
            )
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_excluir_evento_monitorado_soft_delete():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_em_licitacao").one()
        evento = registrar_evento_monitorado(
            nr_convenio=NR_CONVENIO_SEED,
            dados=NovoEventoMonitorado(marco_id=marco_fase.id, data_ocorrencia=date(2026, 1, 1)),
            db=db,
            usuario=usuario,
        )
        evento_id = evento.id

        excluido = excluir_evento_monitorado(evento_id=evento_id, motivo="teste pytest", db=db, usuario=usuario)

        assert excluido.deletado_em is not None
        assert excluido.deletado_por_id == usuario.id
        assert excluido.motivo_exclusao == "teste pytest"
        # Registro nunca some fisicamente -- continua existindo na tabela.
        assert db.get(EventoMarco, evento_id) is not None
        ativos = [e.id for e in _eventos_ativos_do_instrumento(db, NR_CONVENIO_SEED)]
        assert evento_id not in ativos
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_excluir_evento_ja_excluido_rejeitado():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_em_licitacao").one()
        evento = registrar_evento_monitorado(
            nr_convenio=NR_CONVENIO_SEED,
            dados=NovoEventoMonitorado(marco_id=marco_fase.id, data_ocorrencia=date(2026, 1, 1)),
            db=db,
            usuario=usuario,
        )
        excluir_evento_monitorado(evento_id=evento.id, motivo="primeira exclusão", db=db, usuario=usuario)
        with pytest.raises(ValidationError, match="já está excluído"):
            excluir_evento_monitorado(evento_id=evento.id, motivo="segunda tentativa", db=db, usuario=usuario)
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def _eventos_ativos_do_instrumento(db, nr_convenio: str) -> list[EventoMarco]:
    instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=nr_convenio).one()
    return [
        e
        for e in db.query(EventoMarco).filter_by(instrumento_id=instrumento.id).all()
        if e.deletado_em is None and e.substituido_por_id is None
    ]


def test_evento_excluido_nao_conta_para_fase_atual():
    """Reproduz o bug real corrigido no Bloco 0/1: evento de fase excluído
    não pode continuar empurrando `fase_atual` pra frente."""
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    instrumento_teste = InstrumentoEquipamento(
        nr_convenio=f"PYTEST-FASE-{uuid4()}",
        nome_convenente="Convenente Pytest",
        tipo_contratacao="Convênio",
    )
    try:
        db.add(instrumento_teste)
        db.flush()
        marco_fase = db.query(MarcoCatalogo).filter_by(codigo="fase_contratado").one()
        evento = registrar_evento_monitorado(
            nr_convenio=instrumento_teste.nr_convenio,
            dados=NovoEventoMonitorado(marco_id=marco_fase.id, data_ocorrencia=date(2026, 1, 1)),
            db=db,
            usuario=usuario,
        )

        itens = listar_instrumentos_monitorados(db=db)
        item = next(i for i in itens if i.instrumento.nr_convenio == instrumento_teste.nr_convenio)
        assert item.fase_atual == marco_fase.rotulo

        excluir_evento_monitorado(evento_id=evento.id, motivo="teste pytest", db=db, usuario=usuario)

        itens_apos = listar_instrumentos_monitorados(db=db)
        item_apos = next(i for i in itens_apos if i.instrumento.nr_convenio == instrumento_teste.nr_convenio)
        assert item_apos.fase_atual == "Não iniciado"
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_registrar_acao_monitorada_seta_criado_por_id():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        acao = registrar_acao_monitorada(
            nr_convenio=NR_CONVENIO_SEED,
            descricao="ação pytest",
            data_prevista=None,
            responsavel=None,
            db=db,
            usuario=usuario,
        )
        assert acao.criado_por_id == usuario.id
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_editar_acao_monitorada_corrige_e_fecha_original():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        antiga = registrar_acao_monitorada(
            nr_convenio=NR_CONVENIO_SEED,
            descricao="ação original",
            data_prevista=None,
            responsavel=None,
            db=db,
            usuario=usuario,
        )
        antiga_id = antiga.id

        nova = editar_acao_monitorada(
            acao_id=antiga_id,
            descricao="ação corrigida",
            data_prevista=None,
            responsavel=None,
            responsavel_id=None,
            db=db,
            usuario=usuario,
        )

        assert nova.id != antiga_id
        assert nova.descricao == "ação corrigida"
        assert nova.criado_por_id == usuario.id
        assert antiga.substituido_por_id == nova.id
        assert antiga.atualizado_em is not None
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_excluir_acao_monitorada_soft_delete():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        acao = registrar_acao_monitorada(
            nr_convenio=NR_CONVENIO_SEED,
            descricao="ação pra excluir",
            data_prevista=None,
            responsavel=None,
            db=db,
            usuario=usuario,
        )
        acao_id = acao.id

        excluida = excluir_acao_monitorada(acao_id=acao_id, motivo="teste pytest", db=db, usuario=usuario)

        assert excluida.deletado_em is not None
        assert excluida.deletado_por_id == usuario.id
        assert db.get(AcaoMonitoramento, acao_id) is not None
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_concluir_acao_ja_excluida_rejeitada():
    db = SessionLocal()
    usuario = criar_usuario_teste(db, role=UserRole.gestor)
    try:
        acao = registrar_acao_monitorada(
            nr_convenio=NR_CONVENIO_SEED,
            descricao="ação pra excluir e concluir",
            data_prevista=None,
            responsavel=None,
            db=db,
            usuario=usuario,
        )
        excluir_acao_monitorada(acao_id=acao.id, motivo="teste pytest", db=db, usuario=usuario)
        with pytest.raises(ValidationError, match="já foi excluída ou corrigida"):
            concluir_acao_monitorada(acao_id=acao.id, db=db, usuario=usuario)
    finally:
        db.rollback()
        db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_atualizar_cadastro_tipologia_invalida_rejeitada():
    db = SessionLocal()
    colaborador = User(
        id=999005,
        name="Colaborador",
        email="colab-tipologia@example.com",
        role=UserRole.gestor,
    )
    try:
        with pytest.raises(ValidationError, match="Tipologia"):
            atualizar_cadastro_instrumento(
                nr_convenio=NR_CONVENIO_SEED,
                alteracoes_brutas={"tipologia": "ZZ"},
                db=db,
                usuario=colaborador,
            )
    finally:
        db.rollback()
        db.close()


def test_atualizar_cadastro_modalidade_invalida_rejeitada():
    db = SessionLocal()
    colaborador = User(
        id=999006,
        name="Colaborador",
        email="colab-modalidade@example.com",
        role=UserRole.gestor,
    )
    try:
        with pytest.raises(ValidationError, match="Modalidade"):
            atualizar_cadastro_instrumento(
                nr_convenio=NR_CONVENIO_SEED,
                alteracoes_brutas={"modalidade_onco": "Inválida"},
                db=db,
                usuario=colaborador,
            )
    finally:
        db.rollback()
        db.close()
