"""Fixture de convite vencido: só cria identidade nova e preserva auditoria."""

import hashlib
import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from uuid import uuid4

from argon2 import PasswordHasher
from pydantic import SecretStr
from sqlalchemy import Connection, text


@contextmanager
def convite_expirado_sintetico(conn: Connection) -> Iterator[SecretStr]:
    """Conexão exclusiva já validada pelo launcher; nunca recebe ID existente.

    O commit inicial permite que a API local veja o convite; o finally inativa
    apenas o ID/email criados aqui e apaga o token. Não apaga o usuário/log.
    """
    if conn.in_transaction():
        raise ValueError("Fixture exige conexão exclusiva sem transação aberta.")
    token = SecretStr(secrets.token_urlsafe(32))
    token_hash = hashlib.sha256(token.get_secret_value().encode()).hexdigest()
    senha_hash = PasswordHasher().hash(secrets.token_urlsafe(32))
    email = f"convite-expirado-e2e-{uuid4()}@example.com"
    with conn.begin():
        usuario_id = conn.scalar(
            text("""INSERT INTO public."user"
                (name,email,password_hash,role,status,activation_token_hash,activation_expires_at)
                VALUES ('Convite expirado sintético E2E',:email,:senha,'leitor','active',:token,now()-interval '1 day')
                RETURNING id"""),
            {"email": email, "senha": senha_hash, "token": token_hash},
        )
        conn.execute(
            text("""INSERT INTO public.audit_log(entity_name,entity_id,action)
                VALUES ('ensaio_convite_expirado',:id,'fixture_criada')"""),
            {"id": usuario_id},
        )
    try:
        yield token
    finally:
        with conn.begin():
            preservado = conn.scalar(
                text("""SELECT password_hash=:senha AND activation_token_hash=:token
                    AND activated_at IS NULL AND activation_expires_at<now()
                    FROM public."user" WHERE id=:id AND email=:email"""),
                {"senha": senha_hash, "token": token_hash, "id": usuario_id, "email": email},
            )
            conn.execute(
                text("""UPDATE public."user" SET status='inactive',activation_token_hash=NULL,
                    activation_expires_at=NULL WHERE id=:id AND email=:email"""),
                {"id": usuario_id, "email": email},
            )
            # Defesa adicional: um bug não pode deixar sessão da fixture ativa.
            conn.execute(
                text("UPDATE public.refresh_token SET revoked_at=now() WHERE user_id=:id AND revoked_at IS NULL"),
                {"id": usuario_id},
            )
            conn.execute(
                text("""INSERT INTO public.audit_log(entity_name,entity_id,action)
                    VALUES ('ensaio_convite_expirado',:id,'fixture_inativada')"""),
                {"id": usuario_id},
            )
        if preservado is not True:
            raise ValueError("Convite vencido foi alterado indevidamente; fixture já inativada.")
