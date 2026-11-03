"""Contrato da prévia e da extração de conclusão e previsões (uma linha por instrumento monitorado)."""

from datetime import date

from pydantic import BaseModel, ConfigDict


class RegistroPrevisao(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrumento: str
    convenente: str
    tipo: str
    uf: str | None
    municipio: str | None
    fase_atual: str
    situacao: str
    categoria: str
    data_conclusao: date | None = None
    inauguracao_real: date | None = None
    previsao_inauguracao: date | None = None
    dias_ate_previsao: int | None = None


class ContagemSituacao(BaseModel):
    codigo: str
    rotulo: str
    quantidade: int


class PreviaPrevisoes(BaseModel):
    total: int
    pagina: int
    limite: int
    itens: list[RegistroPrevisao]
    contagens: list[ContagemSituacao]
