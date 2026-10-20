"""Inventário read-only de acesso/privacidade; não copia nem certifica anonimato.

Sem CLI, Settings ou dados de linha na saída. Credenciais sempre exigem troca
no futuro destino; hashes existentes não demonstram que o segredo é local.
Provas imutáveis exigem revisão própria, nunca saneamento in-place.
"""

import re
from dataclasses import dataclass

from sqlalchemy import Connection, text

CLONE_PRESERVADO = "sigeo_homologacao_clone_20261006"
REVISAO_CLONE = "e6a7b8c9d0f1"
REVISAO_SINTETICA = "b7f35c806e4a"


@dataclass(frozen=True)
class InventarioAcessoClone:
    usuarios: int
    identidades_fora_padrao_protegido: int
    convites_com_segredo_ou_validade: int
    sessoes_armazenadas: int
    sessoes_potencialmente_validas: int
    auditorias_sem_marcador_protecao: int
    provas_imutaveis_para_revisao: int

    @property
    def credenciais_a_substituir_no_destino(self) -> int:
        return self.usuarios


def inventariar_acesso_clone(conn: Connection) -> InventarioAcessoClone:
    """Contagens mínimas, sem autorizar adoção nem atestar proteção integral."""
    url = conn.engine.url
    if url.get_backend_name() != "postgresql" or url.host not in {"127.0.0.1", "localhost", "::1"} or url.query:
        raise ValueError("Inventário exige PostgreSQL loopback sem opções extras.")
    nome = url.database or ""
    sintetico = re.fullmatch(r"sigeo_test_migrations_[a-f0-9]{32}", nome) is not None
    if nome != CLONE_PRESERVADO and not sintetico:
        raise ValueError("Banco fora do escopo do inventário protegido.")
    if conn.scalar(text("SELECT current_database()")) != nome:
        raise ValueError("Banco efetivo diferente do banco validado.")
    if conn.scalar(text("SHOW transaction_read_only")) != "on":
        raise ValueError("Inventário exige transação read-only.")
    if conn.scalar(text("SHOW transaction_isolation")) != "repeatable read":
        raise ValueError("Inventário exige snapshot REPEATABLE READ.")
    revisao = REVISAO_SINTETICA if sintetico else REVISAO_CLONE
    if conn.scalars(text("SELECT version_num FROM public.alembic_version")).all() != [revisao]:
        raise ValueError("Revisão fora do contrato de inventário.")
    usuarios, identidades, convites = conn.execute(
        text("""
        SELECT count(*), count(*) FILTER (WHERE
            email <> 'usuario-local-' || id::text || '@example.com'
            OR NOT (name ~ '^Pessoa local [a-f0-9]{10}$' OR name = 'Usuário local ' || id::text)),
            count(*) FILTER (WHERE activation_token_hash IS NOT NULL OR activation_expires_at IS NOT NULL)
        FROM public."user"
        """)
    ).one()
    sessoes, validas = conn.execute(
        text("""
        SELECT count(*), count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > transaction_timestamp())
        FROM public.refresh_token
        """)
    ).one()
    auditorias = conn.scalar(
        text("""
        SELECT count(*) FROM public.audit_log
        WHERE details IS DISTINCT FROM jsonb_build_object('protegido_no_clone_local',true)
        """)
    )
    provas = conn.scalar(text("SELECT count(*) FROM public.candidato_legado_recaptura"))
    return InventarioAcessoClone(
        usuarios=int(usuarios),
        identidades_fora_padrao_protegido=int(identidades),
        convites_com_segredo_ou_validade=int(convites),
        sessoes_armazenadas=int(sessoes),
        sessoes_potencialmente_validas=int(validas),
        auditorias_sem_marcador_protecao=int(auditorias or 0),
        provas_imutaveis_para_revisao=int(provas or 0),
    )
