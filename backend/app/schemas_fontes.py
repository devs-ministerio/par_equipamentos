"""Contrato de `/fontes/capturas`: detalhe completo só para admin; demais papéis veem o resumo."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FonteResumoRead(BaseModel):
    fonte: str
    rotulo: str
    ultimo_sucesso_em: datetime | None


class FonteSituacaoRead(FonteResumoRead):
    status: str
    ultima_tentativa_em: datetime
    defasada: bool
    itens_verificados: int
    itens_alterados: int
    erro: str | None
