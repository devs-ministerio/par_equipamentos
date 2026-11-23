"""Painel individual do técnico (monitoramento interno).

Colaborador (e leitor) vê só o próprio painel e a própria região. Gestor e admin veem todos, com filtro por colaborador.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.db.models import User, UserRole, UserStatus
from app.domain_errors import AuthorizationError, NotFoundError
from app.repositories import painel_tecnico as repo
from app.schemas_painel_tecnico import PainelTecnicoRead, PainelTecnicoResumoRead

_GESTAO = (UserRole.admin, UserRole.gestor)


def listar_tecnicos(*, db: Session, usuario: User) -> list[PainelTecnicoResumoRead]:
    if usuario.role not in _GESTAO:
        raise AuthorizationError("Apenas gestor e administrador veem a lista de colaboradores.")
    return [PainelTecnicoResumoRead(**t) for t in repo.listar_tecnicos(db)]


def obter_painel(*, db: Session, usuario: User, usuario_id: int | None = None) -> PainelTecnicoRead:
    alvo: User | None
    if usuario.role in _GESTAO:
        if usuario_id is None:
            alvo = None
        else:
            alvo = db.get(User, usuario_id)
            if alvo is None or alvo.deleted_at is not None or alvo.status != UserStatus.active:
                raise NotFoundError("Colaborador não encontrado.")
    else:
        if usuario_id is not None and usuario_id != usuario.id:
            raise AuthorizationError("Você só vê o seu próprio painel.")
        alvo = usuario
    ufs = None if alvo is None else repo.ufs_do_usuario(db, alvo.id)
    uid = None if alvo is None else alvo.id
    carteira, faltantes = repo.carteira_da_regiao(db, ufs)
    return PainelTecnicoRead(
        escopo="todos" if alvo is None else "individual",
        usuario=None if alvo is None else {"id": alvo.id, "nome": alvo.name, "papel": alvo.role.value},
        ufs=ufs,
        gerado_em=datetime.now(UTC),
        carteira=carteira,
        faltantes=faltantes,
        regiao=repo.contagens_regiao(db, ufs),
        regiao_sem_titular=repo.sem_titular_na_regiao(db, ufs),
        meus=repo.contagens_do_usuario(db, uid),
        atividade=repo.atividade(db, uid),
        acoes=repo.acoes(db, uid, datetime.now(UTC).date()),
        meus_sem_registro=repo.sem_registro_do_usuario(db, uid),
    )
