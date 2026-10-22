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

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import NotificacaoTipo, User
from app.schemas import NotificacaoArquivoUpdate, NotificacaoRead, NotificacoesLeituraRead, NotificacoesListRead
from app.services.notificacoes import (
    arquivar_notificacao,
    corpo_publico_da_notificacao,
    marcar_notificacao_lida,
    marcar_todas_lidas,
)
from app.services.notificacoes import listar_notificacoes as listar_notificacoes_service

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])


@router.get("", response_model=NotificacoesListRead)
def listar_notificacoes(
    limit: int = Query(default=20, le=200, gt=0),
    offset: Annotated[int, Query(ge=0)] = 0,
    apenas_nao_lidas: bool = False,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
    busca: Annotated[str | None, Query(max_length=200)] = None,
    tipo: NotificacaoTipo | None = None,
    arquivadas: bool = False,
):
    pagina = listar_notificacoes_service(
        db=db,
        usuario_id=usuario.id,
        limit=limit,
        offset=offset,
        apenas_nao_lidas=apenas_nao_lidas,
        busca=busca,
        tipo=tipo,
        arquivadas=arquivadas,
    )
    itens = [
        NotificacaoRead.model_validate(item.notificacao).model_copy(
            update={
                "destino": item.destino,
                "lida": item.lida,
                "arquivada": item.arquivada,
                "corpo": corpo_publico_da_notificacao(item.notificacao),
            }
        )
        for item in pagina.itens
    ]
    return NotificacoesListRead(itens=itens, total=pagina.total, nao_lidas=pagina.nao_lidas)


@router.patch("/lidas", response_model=NotificacoesLeituraRead)
def marcar_todas(
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return NotificacoesLeituraRead(alteradas=marcar_todas_lidas(db=db, usuario_id=usuario.id))


@router.patch("/{notificacao_id}/arquivo", response_model=NotificacaoRead)
def atualizar_arquivo(
    notificacao_id: int,
    corpo: NotificacaoArquivoUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    resultado = arquivar_notificacao(
        db=db, usuario_id=usuario.id, notificacao_id=notificacao_id, arquivada=corpo.arquivada
    )
    return NotificacaoRead.model_validate(resultado.notificacao).model_copy(
        update={
            "lida": resultado.lida,
            "arquivada": resultado.arquivada,
            "corpo": corpo_publico_da_notificacao(resultado.notificacao),
        }
    )


@router.patch("/{notificacao_id}", response_model=NotificacaoRead)
def marcar_lida(
    notificacao_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    resultado = marcar_notificacao_lida(db=db, notificacao_id=notificacao_id, usuario_id=usuario.id)
    return NotificacaoRead.model_validate(resultado.notificacao).model_copy(
        update={
            "destino": resultado.destino,
            "lida": resultado.lida,
            "arquivada": resultado.arquivada,
            "corpo": corpo_publico_da_notificacao(resultado.notificacao),
        }
    )
