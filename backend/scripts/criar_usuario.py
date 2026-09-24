"""Cria ou atualiza um usuario local do SIGEO.

Uso:
  uv run python scripts/criar_usuario.py --name "Nome" --email nome@org.gov.br --role colaborador

A senha e lida de forma interativa, sem aparecer no terminal.
"""

from __future__ import annotations

import argparse
from getpass import getpass

from sqlalchemy import select

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import User, UserRole, UserStatus


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", choices=[r.value for r in UserRole], default=UserRole.colaborador.value)
    args = parser.parse_args()

    senha = getpass("Senha: ")
    confirmar = getpass("Confirmar senha: ")
    if senha != confirmar:
        raise SystemExit("Senhas nao conferem.")
    if len(senha) < 10:
        raise SystemExit("Use uma senha com pelo menos 10 caracteres.")

    email = args.email.lower().strip()
    db = SessionLocal()
    try:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            user = User(
                name=args.name,
                email=email,
                password_hash=hash_password(senha),
                role=UserRole(args.role),
                status=UserStatus.active,
            )
            db.add(user)
            acao = "criado"
        else:
            user.name = args.name
            user.password_hash = hash_password(senha)
            user.role = UserRole(args.role)
            user.status = UserStatus.active
            user.deleted_at = None
            acao = "atualizado"
        db.commit()
        print(f"Usuario {acao}: {email} ({args.role})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
