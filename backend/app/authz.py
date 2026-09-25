"""Autorização central -- Plan Mode segurança 2026-09-16, Bloco 3.

Núcleo Duro (`padroes/AGENTS.md`): autorização sempre no backend/banco,
nunca só dependency HTTP. Até este bloco, `require_monitoramento_editor`
(`app/auth.py`) só existia como `Depends(...)` de rota -- uma chamada de
service por fora do router (script, outro service, job futuro) não
esbarrava em checagem nenhuma. As funções abaixo são chamadas de DENTRO dos
services (não só do router), pra fechar essa lacuna.

Baseline documentado aqui: `UserRole` é
`admin`/`gestor`/`colaborador`/`leitor`; o gate de mutação do monitoramento
continua binário (`leitor` bloqueado; os demais podem editar). A associação
relacional de responsáveis fica em `instrumento_responsavel`; o recorte de
visibilidade por colaborador será aplicado junto da política de acesso por
instrumento, sem depender dos campos textuais legados. `assert_e_admin`
(Módulo de gestão de usuários, 2026-09-17) é a primeira checagem real de
`UserRole.admin` no código, só pra esse módulo específico -- não altera o
gate binário do resto do app.
"""

from __future__ import annotations

from app.db.models import User, UserRole
from app.domain_errors import AuthorizationError


def assert_pode_editar_monitoramento(usuario: User) -> None:
    """Mesma regra de `require_monitoramento_editor` (`app/auth.py`), mas
    chamável de dentro de um Service -- protege mutação de instrumento/
    evento/ação/proposta candidata mesmo se algo chamar o service sem
    passar pelo Depends do router."""
    if usuario.role == UserRole.leitor:
        raise AuthorizationError("Perfil leitor não pode alterar monitoramento.")


def assert_e_admin(usuario: User) -> None:
    """Mesma regra de `require_admin_user` (`app/auth.py`), chamável de
    dentro de um Service -- protege o módulo de gestão de usuários mesmo se
    algo chamar o service sem passar pelo Depends do router."""
    if usuario.role != UserRole.admin:
        raise AuthorizationError("Apenas administradores podem realizar esta ação.")
