"""Autorização central -- Plan Mode segurança 2026-09-16, Bloco 3.

Núcleo Duro (`padroes/AGENTS.md`): autorização sempre no backend/banco,
nunca só dependency HTTP. Até este bloco, `require_monitoramento_editor`
(`app/auth.py`) só existia como `Depends(...)` de rota -- uma chamada de
service por fora do router (script, outro service, job futuro) não
esbarrava em checagem nenhuma. As funções abaixo são chamadas de DENTRO dos
services (não só do router), pra fechar essa lacuna.

Baseline documentado aqui, não mudado por este bloco: `UserRole` é
`admin`/`colaborador`/`leitor`; o único gate real hoje é binário (`leitor`
bloqueado de mutação; `admin` e `colaborador` têm exatamente os mesmos
poderes -- nenhuma checagem de `UserRole.admin` existe em lugar nenhum do
código). Escopo de autorização por técnico/UF/órgão e diferenciação real
`admin` vs `colaborador` são decisão de produto pendente (Plan Mode, seção
3.2) -- não implementados aqui.
"""
from __future__ import annotations

from fastapi import HTTPException

from app.db.models import User, UserRole


def assert_pode_editar_monitoramento(usuario: User) -> None:
    """Mesma regra de `require_monitoramento_editor` (`app/auth.py`), mas
    chamável de dentro de um Service -- protege mutação de instrumento/
    evento/ação/proposta candidata mesmo se algo chamar o service sem
    passar pelo Depends do router."""
    if usuario.role == UserRole.leitor:
        raise HTTPException(status_code=403, detail="Perfil leitor não pode alterar monitoramento.")
