"""Notificacoes -- 4 origens, escopadas por destinatario (ver
app/db/models.py::Notificacao/NotificacaoDestinatario e
docs/arquitetura/planmode-notificacoes-escopo-2026-09-25.md). Quem CRIA
notificacao sao os jobs de descoberta/verificacao/alerta de vigencia e o
PATCH de instrumento/evento (via app.repositories.notificacoes::
criar_notificacao, camada "edicao_manual") -- este router so LE e marca
como lida, sempre escopado ao usuario autenticado (`NotificacaoDestinatario`
materializado no momento da criacao, nao em tempo de leitura).

`nivel_minimo` existe no modelo mas nunca foi usado (era um candidato a
RBAC antes da resolucao por `InstrumentoResponsavel` -- ver docstring de
`Notificacao`); mantido so por compatibilidade de schema, sem leitura em
codigo novo.

Router fino (Plan Mode backend 2026-09-17, Bloco C -- feature-piloto de
Router -> Service -> Repository): so monta `Depends`, chama o Service e
devolve o retorno. Regra de negocio e commit vivem em
`app/services/notificacoes.py`; query direta vive em
`app/repositories/notificacoes.py`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas import NotificacaoRead, NotificacoesListRead
from app.services.notificacoes import listar_notificacoes as listar_notificacoes_service
from app.services.notificacoes import marcar_notificacao_lida

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


@router.get("", response_model=NotificacoesListRead)
def listar_notificacoes(
    limit: int = Query(default=20, le=200, gt=0),
    offset: int = 0,
    apenas_nao_lidas: bool = False,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    pagina = listar_notificacoes_service(
        db=db, usuario_id=usuario.id, limit=limit, offset=offset, apenas_nao_lidas=apenas_nao_lidas
    )
    itens = [
        NotificacaoRead.model_validate(item.notificacao).model_copy(update={"destino": item.destino, "lida": item.lida})
        for item in pagina.itens
    ]
    return NotificacoesListRead(itens=itens, total=pagina.total, nao_lidas=pagina.nao_lidas)


@router.patch("/{notificacao_id}", response_model=NotificacaoRead)
def marcar_lida(
    notificacao_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    resultado = marcar_notificacao_lida(db=db, notificacao_id=notificacao_id, usuario_id=usuario.id)
    return NotificacaoRead.model_validate(resultado.notificacao).model_copy(
        update={"destino": resultado.destino, "lida": resultado.lida}
    )
