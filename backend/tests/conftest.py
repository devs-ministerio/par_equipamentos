"""Protecao dos testes que encostam em banco.

Os testes de integracao deste projeto usam SQL real e alguns fazem commit
para validar comportamento de transacao/auditoria. Por isso eles so rodam
quando TEST_DATABASE_URL aponta para um banco PostgreSQL dedicado de teste.
Sem essa variavel, a suite ainda coleta os arquivos, mas pula esses modulos.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from sqlalchemy.engine import make_url

# TrustedHostMiddleware (Plan Mode fechamento final 2026-09-25, Bloco 6) --
# TestClient(app) sem base_url explícito manda Host: testserver por
# convenção do Starlette; isso nunca deve entrar no default de produção
# (app/config.py::allowed_hosts), só no ambiente de teste. `setdefault`
# não sobrescreve se algo já setou a variável antes.
os.environ.setdefault("ALLOWED_HOSTS", "testserver,localhost,127.0.0.1")

_DB_TEST_MODULES = {
    "test_relatorios_encerrados_db.py",
    "test_relatorios_persus_db.py",
    "test_relatorios_tcp_db.py",
    "test_relatorios_carga_preenchida_db.py",
    "test_relatorios_lotes_db.py",
    "test_relatorios_volume_docx_db.py",
    "test_relatorios_volume_arquivos_db.py",
    "test_relatorios_concorrencia_http_db.py",
    "test_relatorios_tabelas_longas_db.py",
    "test_relatorios_monitoramento_limite_db.py",
    "test_relatorios_limites_db.py",
    "test_relatorios_merito_db.py",
    "test_relatorios_cruzados_db.py",
    "test_relatorios_matriz_db.py",
    "test_descoberta_nova_api_integrada_db.py",
    "test_ciclo_descoberta_legado_db.py",
    "test_revalidacao_legado_db.py",
    "test_runtime_radar_fixture_db.py",
    "test_restore_operacional_db.py",
    "test_job_recaptura_legado_db.py",
    "executar_aprovacao_navegador.py",
    "test_consulta_prova_legado_http_db.py",
    "test_aprovacao_legado_http_db.py",
    "test_runtime_clone_recuperacao_db.py",
    "test_promover_clone_recuperacao_db.py",
    "test_schema_adocao_recuperacao_db.py",
    "test_adocao_atomica_sintetica_db.py",
    "test_inventario_textos_clone_db.py",
    "test_transferencia_privacidade_sintetica_db.py",
    "test_neutralizar_acesso_sintetico_db.py",
    "test_transferencia_sintetica_recuperacao_db.py",
    "test_preflight_clone_recuperacao_db.py",
    "test_identidade_legado_integral_db.py",
    "test_escopo_carteira_recuperada_db.py",
    "test_fluxo_radar_schema_versionado_db.py",
    "test_migrations_prova_aprovacao_aditivas_db.py",
    "test_migration_escopo_radar_aditiva_db.py",
    "test_rollback_snapshot_recuperacao_db.py",
    "test_cadeia_migrations_recuperacao_db.py",
    "test_central_radar_sessao_real_db.py",
    "test_primeira_descoberta_notificacao_db.py",
    "test_avisos_descoberta_radar_db.py",
    "test_notificacao_aprovacao_carteira_db.py",
    "test_radar_runtime_restrito_db.py",
    "test_radar_append_only_recuperado_db.py",
    "test_migration_identidade_radar_recuperada_db.py",
    "test_migration_aviso_carteira_recuperada_db.py",
    "test_migration_decisoes_radar_recuperada_db.py",
    "test_aprovacao_legado_recuperada_db.py",
    "test_revisao_legado_recuperada_db.py",
    "test_carteira_legado_recuperada_db.py",
    "test_recapturas_legado_service_db.py",
    "test_recapturas_legado_persistencia_db.py",
    "test_contrato_escopo_legado_db.py",
    "test_recaptura_propostas_local_db.py",
    "test_notificacoes_destinatarios_db.py",
    "test_auditoria.py",
    "test_auth_session.py",
    "test_capturas_fonte.py",
    "test_jobs_capturas_integracao.py",
    "test_job_siconv_filhas_db.py",
    "test_descoberta_transferegov_espelho_db.py",
    "test_descoberta_legado_db.py",
    "test_candidatos_legados_db.py",
    "test_decisoes_legado_db.py",
    "test_competency_por_familia.py",
    "test_convenios_contracts.py",
    "test_config_decisions.py",
    "test_csrf.py",
    "test_equipment_offer_contracts.py",
    "test_equipment_totals.py",
    "test_equipamento_marcadores.py",
    "test_evidencias_transferegov.py",
    "test_execucoes.py",
    "test_integridade_constraints.py",
    "test_integridade_fk_cnes.py",
    "test_job_verificacao_siconv_db.py",
    "test_job_verificacao_siconv_db.py",
    "test_monitoramento.py",
    "test_monitoramento_eventos_titularidade.py",
    "test_monitoramento_instrumentos_elegibilidade.py",
    "test_migrar_eventos_inauguracao_prevista.py",
    "test_normalizar_cnpj_database.py",
    "test_monitoramento_auth.py",
    "test_monitoramento_queries.py",
    "test_municipality_coverage.py",
    "test_notificacoes.py",
    "test_notificacoes_central_db.py",
    "test_pipeline_dedup.py",
    "test_pipeline_runner.py",
    "test_propostas_candidatas.py",
    "test_relatorios_contracts.py",
    "test_repositories_qualidade.py",
    "test_repositories_relatorios.py",
    "test_schema_migrations.py",
    "test_service_notificacoes.py",
    "test_services_relatorios.py",
    "test_usuarios.py",
    # Achado ao vivo 2026-09-28: estes 7 arquivos gravam usuário/dado real via
    # `SessionLocal()` direto (ou consomem a fixture `headers_autenticados`,
    # que também grava) mas nunca tinham entrado nesta lista -- sem
    # TEST_DATABASE_URL setado, rodavam sem guarda nenhuma contra o
    # DATABASE_URL comum (Neon real neste projeto), criando usuários
    # `pytest-*@example.com` de verdade. Mesma classe do incidente
    # 2026-09-25 já registrado no CLAUDE.md, agravado por esta lacuna.
}


def _test_database_url() -> str | None:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        return None

    parsed = make_url(url)
    if parsed.get_backend_name() != "postgresql":
        pytest.exit("TEST_DATABASE_URL precisa usar PostgreSQL para validar comportamento real do banco.")

    database = (parsed.database or "").lower()
    if "test" not in database and "pytest" not in database:
        pytest.exit(
            "TEST_DATABASE_URL precisa apontar para um banco dedicado de teste (nome contendo 'test' ou 'pytest')."
        )

    return url


_TEST_DATABASE_URL = _test_database_url()
if _TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = _TEST_DATABASE_URL


def pytest_sessionstart(session: pytest.Session) -> None:
    if not _TEST_DATABASE_URL:
        return

    from scripts.seed_monitoramento import run as seed_monitoramento
    from tests.fixtures_cobertura import seed_cobertura

    seed_monitoramento()
    seed_cobertura()


@pytest.fixture(scope="session")
def headers_autenticados():
    """Header `Cookie: sigeo_access=<token>` de um usuário de teste --
    várias leituras (monitoramento, propostas-candidatas, convênios,
    macro/municipality-coverage, equipment-offer-rows) passaram a exigir
    sessão (Plan Mode segurança 2026-09-16, decisão do usuário 2026-09-17:
    todo o app fica atrás de login). `scope="session"` -- 1 usuário/token
    só, reaproveitado por toda a suíte, criado e limpo 1x.

    O bearer fallback (`Authorization: Bearer`) foi removido em 2026-09-17
    (Bloco 2 do Plan Mode consolidação) -- `require_current_user` só lê o
    cookie `sigeo_access` agora. Setar o header `Cookie` diretamente (em
    vez de `client.cookies.set(...)`) evita depender do ciclo de vida do
    `TestClient`, que é function-scoped em vários módulos enquanto este
    fixture é session-scoped. Só cobre leitura (GET) -- rotas mutáveis
    exigem também o header CSRF (`X-CSRF-Token`), fora do escopo deste
    fixture."""
    from uuid import uuid4

    from app.auth import ACCESS_COOKIE_NAME, create_access_token, create_refresh_token, hash_password
    from app.db.base import SessionLocal
    from app.db.models import User, UserRole

    db = SessionLocal()
    user = User(
        name="Pytest Sessão",
        email=f"pytest-headers-autenticados-{uuid4()}@example.com",
        password_hash=hash_password("senha-pytest"),
        role=UserRole.colaborador,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _, refresh_token_id = create_refresh_token(db, user)
    db.commit()
    token = create_access_token(user, refresh_token_id)
    user_id = user.id
    db.close()

    yield {"Cookie": f"{ACCESS_COOKIE_NAME}={token}"}

    db = SessionLocal()
    db.query(User).filter_by(id=user_id).delete()
    db.commit()
    db.close()


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    db_marker = pytest.mark.db
    if _TEST_DATABASE_URL:
        for item in items:
            path = Path(getattr(item, "path", item.fspath))
            if path.name in _DB_TEST_MODULES:
                item.add_marker(db_marker)
        return

    skip_db = pytest.mark.skip(reason="requer TEST_DATABASE_URL apontando para banco PostgreSQL de teste")
    for item in items:
        path = Path(getattr(item, "path", item.fspath))
        if path.name in _DB_TEST_MODULES:
            item.add_marker(db_marker)
            item.add_marker(skip_db)
