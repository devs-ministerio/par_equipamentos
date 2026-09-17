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
from datetime import date
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.auth import create_access_token, hash_password, require_monitoramento_editor, verify_password
from app.config import settings
from app.db.base import SessionLocal
from app.db.models import (
    AcaoMonitoramento,
    AuditLog,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    Notificacao,
    NotificacaoTipo,
    User,
    UserRole,
)
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
    obter_resumo,
    registrar_acao,
    registrar_evento,
)
from app.services.monitoramento_eventos import (
    NovoEventoMonitorado,
    atualizar_cadastro_instrumento,
    concluir_acao_monitorada,
    registrar_acao_monitorada,
    registrar_evento_monitorado,
)

NR_CONVENIO_SEED = "948686"  # unico instrumento seedado (scripts/seed_monitoramento.py)

def criar_usuario_teste(db):
    user = User(
        name="Usuário Pytest",
        email=f"pytest-monitoramento-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        cpf_hash="cpf-pytest",
        role=UserRole.colaborador,
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
        usuario_teste = criar_usuario_teste(db)
        original_marca = instrumento.equipamento_marca
        original_tecnico = instrumento.tecnico_titular

        resultado = atualizar_cadastro(
            NR_CONVENIO_SEED, InstrumentoEquipamentoUpdate(equipamento_marca="TESTE — apagar"), db, usuario_teste,
        )
        assert resultado.equipamento_marca == "TESTE — apagar"
        # PATCH parcial nao pode zerar campo que nao veio no corpo.
        assert resultado.tecnico_titular == original_tecnico
        log = db.query(AuditLog).filter_by(entity_name="instrumento_equipamento", entity_id=instrumento.id).order_by(AuditLog.id.desc()).first()
        assert log is not None
        audit_log_id = log.id
        assert log.user_id == usuario_teste.id
        assert log.action == "updated"
        assert log.details["changes"]["equipamento_marca"]["old"] == original_marca
        assert log.details["changes"]["equipamento_marca"]["new"] == "TESTE — apagar"

        # Radar de Convenios (2026-09-15) -- PATCH com mudanca real cria
        # notificacao camada 2 (edicao_manual).
        notificacao = db.query(Notificacao).filter_by(
            tipo=NotificacaoTipo.edicao_manual, entidade_id=instrumento.id,
        ).order_by(Notificacao.id.desc()).first()
        assert notificacao is not None
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
            ),
            db,
            usuario_teste,
        )
        assert resultado.nr_convenio == nr_convenio_teste
        assert resultado.tipo_contratacao == "FAF"

        log = db.query(AuditLog).filter_by(
            entity_name="instrumento_equipamento", entity_id=resultado.id,
        ).order_by(AuditLog.id.desc()).first()
        assert log is not None
        audit_log_id = log.id
        assert log.action == "created"
        assert log.details["nr_convenio"] == nr_convenio_teste

        # Segunda tentativa com o mesmo nr_convenio -- checagem de
        # duplicidade tem que barrar antes de criar linha repetida.
        with pytest.raises(HTTPException) as exc:
            criar_instrumento(
                InstrumentoEquipamentoCreate(
                    nr_convenio=nr_convenio_teste, cnpj_convenente="x",
                    nome_convenente="x", tipo_contratacao="FAF",
                ),
                db, usuario_teste,
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
        with pytest.raises(HTTPException) as exc:
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
        usuario_teste = criar_usuario_teste(db)

        corpo = EventoMarcoCreate(
            marco_id=marco_licenca.id,
            data_ocorrencia=date(2026, 1, 10),
            numero_documento="TESTE-123",
            data_validade=date(2031, 1, 10),
            observacao="Evento de teste -- apagar",
            autor_nome="pytest",
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
        marca=instrumento.equipamento_marca, modelo=instrumento.equipamento_modelo,
        serie=instrumento.equipamento_numero_serie, vida_util=instrumento.equipamento_vida_util_anos,
    )
    try:
        marco_entrega = db.query(MarcoCatalogo).filter_by(codigo="cronograma_entrega").one()
        usuario_teste = criar_usuario_teste(db)
        corpo = EventoMarcoCreate(
            marco_id=marco_entrega.id,
            data_ocorrencia=date(2026, 2, 1),
            observacao="Entrega de teste -- apagar",
            autor_nome="pytest",
            equipamento_marca="MARCA TESTE",
            equipamento_modelo="MODELO TESTE",
            equipamento_numero_serie="SN-TESTE-1",
            equipamento_vida_util_anos=10,
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
        instrumento.equipamento_marca = original["marca"]
        instrumento.equipamento_modelo = original["modelo"]
        instrumento.equipamento_numero_serie = original["serie"]
        instrumento.equipamento_vida_util_anos = original["vida_util"]
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
        usuario_teste = criar_usuario_teste(db)
        corpo = EventoMarcoCreate(
            marco_id=marco_licenca.id, autor_nome="pytest",
            observacao="Evento de teste -- apagar", equipamento_marca="NAO DEVERIA SALVAR",
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


def test_registrar_e_concluir_acao():
    db = SessionLocal()
    acao_id = None
    audit_log_ids: list[int] = []
    usuario_teste = None
    try:
        usuario_teste = criar_usuario_teste(db)
        criada = registrar_acao(
            NR_CONVENIO_SEED,
            AcaoMonitoramentoCreate(descricao="Ação de teste -- apagar", data_prevista=date(2026, 12, 1)),
            db,
            usuario_teste,
        )
        acao_id = criada.id
        log_criacao = db.query(AuditLog).filter_by(entity_name="acao_monitoramento", entity_id=acao_id, action="created").one()
        audit_log_ids.append(log_criacao.id)
        assert log_criacao.user_id == usuario_teste.id
        assert criada.data_conclusao is None  # criada = pendente
        assert criada.nr_convenio == NR_CONVENIO_SEED

        pendentes = listar_acoes(pendentes=True, db=db)
        assert any(a.id == acao_id for a in pendentes)

        concluida = concluir_acao(acao_id, db, usuario_teste)
        assert concluida.data_conclusao == date.today()
        log_conclusao = db.query(AuditLog).filter_by(entity_name="acao_monitoramento", entity_id=acao_id, action="completed").one()
        audit_log_ids.append(log_conclusao.id)
        assert log_conclusao.user_id == usuario_teste.id
        assert log_conclusao.details["new"] == date.today().isoformat()

        pendentes_depois = listar_acoes(pendentes=True, db=db)
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
        with pytest.raises(HTTPException) as exc:
            registrar_acao("000000", AcaoMonitoramentoCreate(descricao="x"), db, usuario_teste)
        assert exc.value.status_code == 404
    finally:
        db.rollback()
        db.close()


def test_concluir_acao_inexistente_404():
    db = SessionLocal()
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    try:
        with pytest.raises(HTTPException) as exc:
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
        create_access_token(usuario_teste)
    assert exc.value.status_code == 503


def test_create_access_token_com_jwt_secret(monkeypatch):
    usuario_teste = User(id=123456, name="Usuário Pytest", email="pytest@example.com", role=UserRole.colaborador)
    monkeypatch.setattr(settings, "jwt_secret", "segredo-com-pelo-menos-32-bytes-ok")
    token = create_access_token(usuario_teste)
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


# Plan Mode segurança 2026-09-16, Bloco 3: a checagem de role precisa viver
# no Service, não só no Depends do router -- os 4 testes abaixo chamam a
# função de Service diretamente (sem passar por require_monitoramento_editor
# nenhum), provando que um `leitor` é rejeitado mesmo bypassando o HTTP.
def test_atualizar_cadastro_instrumento_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999001, name="Leitor", email="leitor-bloco3@example.com", role=UserRole.leitor)
        with pytest.raises(HTTPException) as exc:
            atualizar_cadastro_instrumento(
                nr_convenio=NR_CONVENIO_SEED, alteracoes_brutas={"tecnico_suplente": "X"}, db=db, usuario=leitor,
            )
        assert exc.value.status_code == 403
    finally:
        db.close()


def test_registrar_evento_monitorado_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999002, name="Leitor", email="leitor-bloco3-evento@example.com", role=UserRole.leitor)
        with pytest.raises(HTTPException) as exc:
            registrar_evento_monitorado(
                nr_convenio=NR_CONVENIO_SEED, dados=NovoEventoMonitorado(marco_id=1), db=db, usuario=leitor,
            )
        assert exc.value.status_code == 403
    finally:
        db.close()


def test_registrar_acao_monitorada_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999003, name="Leitor", email="leitor-bloco3-acao@example.com", role=UserRole.leitor)
        with pytest.raises(HTTPException) as exc:
            registrar_acao_monitorada(
                nr_convenio=NR_CONVENIO_SEED, descricao="x", data_prevista=None, responsavel=None, db=db, usuario=leitor,
            )
        assert exc.value.status_code == 403
    finally:
        db.close()


def test_concluir_acao_monitorada_bloqueia_leitor_no_service():
    db = SessionLocal()
    try:
        leitor = User(id=999004, name="Leitor", email="leitor-bloco3-concluir@example.com", role=UserRole.leitor)
        with pytest.raises(HTTPException) as exc:
            concluir_acao_monitorada(acao_id=1, db=db, usuario=leitor)
        assert exc.value.status_code == 403
    finally:
        db.close()
