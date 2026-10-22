"""Credenciais sintéticas e arquivo privado exclusivo; nunca imprime segredos."""

import os
import re
import secrets
import stat
from collections.abc import Mapping
from pathlib import Path

from argon2 import PasswordHasher
from pydantic import SecretStr
from sqlalchemy import Connection, text

from scripts.promover_clone_recuperacao import CLONE_PERSISTENTE
from scripts.runtime_clone_recuperacao import RUNTIME_LOCAL, validar_destino_runtime

PAPEIS_LOCAIS = ("admin", "gestor", "colaborador", "leitor")


def gerar_senhas_locais() -> dict[str, SecretStr]:
    return {papel: SecretStr(secrets.token_urlsafe(32)) for papel in PAPEIS_LOCAIS}


def cadastrar_contas_locais(conn: Connection, senhas: Mapping[str, SecretStr]) -> None:
    if set(senhas) != set(PAPEIS_LOCAIS) or not conn.in_transaction():
        raise ValueError("Contas locais exigem quatro papéis e transação explícita.")
    banco = conn.engine.url.database or ""
    nome_role = (
        RUNTIME_LOCAL
        if banco == CLONE_PERSISTENTE
        else "sigeo_test_runtime_" + banco.removeprefix("sigeo_test_migrations_")
    )
    validar_destino_runtime(conn, nome_role)
    if conn.scalar(text("SELECT count(*) FROM public.\"user\" WHERE status<>'inactive'")):
        raise ValueError("Cópia ainda contém identidades habilitadas.")
    if conn.scalar(
        text(
            'SELECT count(*) FROM public."user" WHERE activation_token_hash IS NOT NULL OR activation_expires_at IS NOT NULL'
        )
    ):
        raise ValueError("Cópia ainda contém convites anteriores.")
    if conn.scalar(text("SELECT count(*) FROM public.refresh_token WHERE revoked_at IS NULL")):
        raise ValueError("Cópia ainda contém sessões anteriores.")
    hasher = PasswordHasher()
    for papel in PAPEIS_LOCAIS:
        senha = senhas[papel].get_secret_value()
        if len(senha) < 32:
            raise ValueError("Credencial sintética insuficiente.")
        conn.execute(
            text("""INSERT INTO public."user"(name,email,password_hash,role,status,activated_at)
            VALUES (:nome,:email,:hash,CAST(:papel AS user_role),'active',now())"""),
            {
                "nome": "Homologação local " + papel,
                "email": papel + ".homologacao@example.com",
                "hash": hasher.hash(senha),
                "papel": papel,
            },
        )
    conn.execute(
        text("""INSERT INTO public.audit_log(entity_name,action,details)
        VALUES ('homologacao_local','provisionamento',
        jsonb_build_object('protegido_no_clone_local',true,'contas_sinteticas',4))""")
    )


def gravar_configuracao_privada(path: Path, valores: Mapping[str, str]) -> None:
    """Só cria .env.local novo, em pasta privada existente; recusa symlinks."""
    if path.name != ".env.local" or not path.is_absolute():
        raise ValueError("Configuração exige caminho absoluto .env.local.")
    pasta = path.parent
    atributos = pasta.lstat()
    if pasta.resolve(strict=True) != pasta or not stat.S_ISDIR(atributos.st_mode):
        raise ValueError("Diretório privado não pode ser symlink.")
    if atributos.st_uid != os.getuid() or stat.S_IMODE(atributos.st_mode) != 0o700:
        raise ValueError("Diretório privado exige propriedade local e permissão 0700.")
    for chave, valor in valores.items():
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", chave) or any(c in valor for c in "'\n\r\x00"):
            raise ValueError("Configuração contém nome ou formato inválido.")
    descritor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descritor, "w", encoding="utf-8") as arquivo:
        for chave, valor in valores.items():
            arquivo.write(f"{chave}='{valor}'\n")
        arquivo.flush()
        os.fsync(arquivo.fileno())
