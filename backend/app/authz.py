"""Autorização central -- Plan Mode segurança 2026-09-16, Bloco 3.

Núcleo Duro (`padroes/AGENTS.md`): autorização sempre no backend/banco,
nunca só dependency HTTP. Até este bloco, `require_monitoramento_editor`
(`app/auth.py`) só existia como `Depends(...)` de rota -- uma chamada de
service por fora do router (script, outro service, job futuro) não
esbarrava em checagem nenhuma. As funções abaixo são chamadas de DENTRO dos
services (não só do router), pra fechar essa lacuna.

Baseline documentado aqui: `UserRole` é
`admin`/`gestor`/`colaborador`/`leitor`. `assert_e_admin`
(Módulo de gestão de usuários, 2026-09-17) é a primeira checagem real de
`UserRole.admin` no código, só pra esse módulo específico -- não altera o
gate binário do resto do app.

Autorização por titularidade (pedido do usuário, 2026-09-25):
`assert_pode_editar_monitoramento` continua sendo o gate GROSSO (só bloqueia
`leitor`), usado onde ainda não existe instrumento pra checar titularidade
(criação, `criar_instrumento_monitorado`). `assert_pode_editar_instrumento`
é o gate FINO, usado em toda mutação de um instrumento JÁ existente
(cadastro/evento/ação): `admin`/`gestor` editam qualquer instrumento;
`colaborador` só edita onde é titular/suplente designado
(`instrumento_responsavel`) -- instrumento sem ninguém designado ainda fica
liberado pra qualquer colaborador, pra não travar a configuração inicial.
`leitor` nunca edita, em nenhum dos dois gates.
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


def usuario_pode_editar_instrumento(usuario: User, ids_responsaveis: set[int]) -> bool:
    """admin/gestor editam qualquer instrumento. colaborador só edita onde é
    titular/suplente designado -- instrumento sem ninguém designado
    (`ids_responsaveis` vazio) fica liberado pra qualquer colaborador, pra
    não travar a configuração inicial (decisão do usuário, 2026-09-25).
    leitor nunca edita, em nenhum caso. Função pura (sem DB) pra poder ser
    testada direto e reaproveitada tanto pela autorização de escrita quanto
    pelo campo `pode_editar` exposto na leitura."""
    if usuario.role == UserRole.leitor:
        return False
    if usuario.role in (UserRole.admin, UserRole.gestor):
        return True
    return usuario.id in ids_responsaveis


def assert_pode_editar_instrumento(usuario: User, ids_responsaveis: set[int]) -> None:
    if not usuario_pode_editar_instrumento(usuario, ids_responsaveis):
        raise AuthorizationError("Você não é o técnico titular/suplente deste instrumento.")


def assert_e_admin(usuario: User) -> None:
    """Mesma regra de `require_admin_user` (`app/auth.py`), chamável de
    dentro de um Service -- protege o módulo de gestão de usuários mesmo se
    algo chamar o service sem passar pelo Depends do router."""
    if usuario.role != UserRole.admin:
        raise AuthorizationError("Apenas administradores podem realizar esta ação.")
