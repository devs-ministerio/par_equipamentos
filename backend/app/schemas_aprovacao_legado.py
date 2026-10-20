"""Pedido humano referencia prova do servidor, nunca payload do navegador.

O navegador envia somente referências à prova persistida e à versão revisada.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas_legado import DecisaoLegadoRead


class ReferenciaProvaLegado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)
    captura_id: int = Field(gt=0, strict=True)
    recaptura_id: int = Field(gt=0, strict=True)
    hash_revisado: str = Field(pattern=r"^[a-f0-9]{64}$")
    versao: int = Field(ge=0, strict=True)


class AprovacaoLegadoCreate(ReferenciaProvaLegado):
    chave: UUID
    justificativa: str = Field(min_length=3, max_length=1000)


class ProvaLegadoRead(ReferenciaProvaLegado):
    """Resumo para conferência humana; não devolve o JSONB da coleta."""

    candidato_id: int = Field(gt=0)
    numero: str
    situacao: str
    valor_global: Decimal
    convenente_nome: str
    municipio: str
    uf: str
    capturado_em: datetime
    expira_em: datetime


class AprovacaoLegadoRead(DecisaoLegadoRead):
    """Confirma os vínculos criados sem devolver payload bruto da fonte."""

    convenio_id: int = Field(gt=0)
    recaptura_id: int = Field(gt=0)
