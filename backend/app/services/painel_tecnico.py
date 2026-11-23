"""Painel individual do técnico (monitoramento interno).

Colaborador (e leitor) vê só o próprio painel e a própria região. Gestor e admin veem todos, com filtro por colaborador.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import InstrumentoEquipamento, User, UserRole, UserStatus
from app.domain_errors import AuthorizationError, NotFoundError
from app.repositories import painel_tecnico as repo
from app.schemas_painel_tecnico import PainelCarteiraLinhaRead, PainelTecnicoRead, PainelTecnicoResumoRead
from app.services.repasses import fases_calculadas_em_lote

_GESTAO = (UserRole.admin, UserRole.gestor)


def listar_tecnicos(*, db: Session, usuario: User) -> list[PainelTecnicoResumoRead]:
    if usuario.role not in _GESTAO:
        raise AuthorizationError("Apenas gestor e administrador veem a lista de colaboradores.")
    return [PainelTecnicoResumoRead(**t) for t in repo.listar_tecnicos(db)]


def _resolver_alvo(db: Session, usuario: User, usuario_id: int | None) -> User | None:
    """None = visão de todos (só gestão). Colaborador e leitor enxergam apenas o próprio painel."""
    if usuario.role in _GESTAO:
        if usuario_id is None:
            return None
        alvo = db.get(User, usuario_id)
        if alvo is None or alvo.deleted_at is not None or alvo.status != UserStatus.active:
            raise NotFoundError("Colaborador não encontrado.")
        return alvo
    if usuario_id is not None and usuario_id != usuario.id:
        raise AuthorizationError("Você só vê o seu próprio painel.")
    return usuario


def obter_painel(*, db: Session, usuario: User, usuario_id: int | None = None) -> PainelTecnicoRead:
    alvo = _resolver_alvo(db, usuario, usuario_id)
    ufs = None if alvo is None else repo.ufs_do_usuario(db, alvo.id)
    uid = None if alvo is None else alvo.id
    return PainelTecnicoRead(
        escopo="todos" if alvo is None else "individual",
        usuario=None if alvo is None else {"id": alvo.id, "nome": alvo.name, "papel": alvo.role.value},
        ufs=ufs,
        gerado_em=datetime.now(UTC),
        carteira=repo.resumo_carteira(db, ufs),
        regiao=repo.contagens_regiao(db, ufs),
        regiao_sem_titular=repo.sem_titular_na_regiao(db, ufs),
        meus=repo.contagens_do_usuario(db, uid),
        atividade=repo.atividade(db, uid),
    )


def obter_carteira(*, db: Session, usuario: User, usuario_id: int | None = None) -> list[PainelCarteiraLinhaRead]:
    alvo = _resolver_alvo(db, usuario, usuario_id)
    ufs = None if alvo is None else repo.ufs_do_usuario(db, alvo.id)
    uid = None if alvo is None else alvo.id
    linhas = repo.carteira_da_regiao(db, ufs, uid, datetime.now(UTC).date())
    ids = [linha["instrumento_id"] for linha in linhas if linha["instrumento_id"] is not None]
    instrumentos = (
        list(db.scalars(select(InstrumentoEquipamento).where(InstrumentoEquipamento.id.in_(ids)))) if ids else []
    )
    fases = fases_calculadas_em_lote(db, instrumentos) if instrumentos else {}
    resultado = []
    for linha in linhas:
        iid = linha.pop("instrumento_id")
        fase = fases.get(iid) if iid is not None else None
        resultado.append(PainelCarteiraLinhaRead(**linha, fase=fase.value if fase else None))
    return resultado
