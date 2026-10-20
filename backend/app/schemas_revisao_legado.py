"""Resultado interno da preparação; não é resposta da API nem aprovação."""

from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas_projecao_legado import ProjecaoCarteiraLegado


class RevisaoLegadoPreparada(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    usuario_id: int
    candidato_id: int
    captura_id: int
    recaptura_id: int
    fonte_captura_id: int
    versao: int
    situacao_anterior: Literal["novo", "em_analise"]
    hash_conteudo: str
    projecao: ProjecaoCarteiraLegado
