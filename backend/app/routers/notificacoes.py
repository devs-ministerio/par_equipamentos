"""Notificacoes do Radar de Convenios -- 2 camadas + candidato pendente (ver
app/db/models.py::Notificacao e docs/arquitetura/fluxo_requisicao.md).
Quem CRIA notificacao sao os jobs de descoberta/verificacao (ainda a
implementar) e o PATCH de instrumento (via log_action, camada
"edicao_manual") -- este router so LE e marca como lida.

`nivel_minimo` existe no modelo mas a hierarquia de usuario ainda nao foi
definida (pedido do usuario 2026-09-15: "isso sera mostrado apenas para os
niveis de usuario acima de tecnico... ainda vamos definir") -- por isso
`listar_notificacoes` NAO filtra por role ainda, so devolve tudo. Filtrar
fica pra quando a hierarquia fechar, sem travar o resto do fluxo nessa
decisao pendente.

Router fino (Plan Mode backend 2026-09-17, Bloco C -- feature-piloto de
Router -> Service -> Repository): so monta `Depends`, chama o Service e
devolve o retorno. Regra de negocio e commit vivem em
`app/services/notificacoes.py`; query direta vive em
`app/repositories/notificacoes.py`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
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
    limit: int = 20,
    offset: int = 0,
    apenas_nao_lidas: bool = False,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    pagina = listar_notificacoes_service(db=db, limit=limit, offset=offset, apenas_nao_lidas=apenas_nao_lidas)
    itens = [NotificacaoRead.model_validate(n) for n in pagina.itens]
    return NotificacoesListRead(itens=itens, total=pagina.total, nao_lidas=pagina.nao_lidas)


@router.patch("/{notificacao_id}", response_model=NotificacaoRead)
def marcar_lida(
    notificacao_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return marcar_notificacao_lida(db=db, notificacao_id=notificacao_id)
