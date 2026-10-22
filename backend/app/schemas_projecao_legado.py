"""Projeção explícita da recaptura para a carteira, sem cadastro humano."""

from datetime import date
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, ConfigDict, JsonValue, field_validator


class FinanceiroSiconv(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")
    VL_REPASSE_CONV: Decimal | None = None
    VL_EMPENHADO_CONV: Decimal | None = None
    VL_DESEMBOLSADO_CONV: Decimal | None = None
    VL_CONTRAPARTIDA_CONV: Decimal | None = None
    VL_SALDO_CONTA: Decimal | None = None

    @field_validator("*", mode="before")
    @classmethod
    def valor_oficial(cls, valor: str | None) -> Decimal | None:
        if valor is None:
            return None
        if not isinstance(valor, str):
            raise ValueError("Valor financeiro oficial inválido.")
        if not valor.strip():
            return None
        try:
            numero = Decimal(valor.replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError("Valor financeiro oficial inválido.") from exc
        if not numero.is_finite():
            raise ValueError("Valor financeiro oficial inválido.")
        return numero


class ProjecaoCarteiraLegado(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    numero: str
    numero_instrumento: str
    ano_instrumento: int | None
    objeto: str
    situacao: str
    situacao_portal: str | None
    situacao_contratacao: str | None
    convenente_nome: str
    convenente_cnpj: str
    convenente_tipo: str | None
    municipio: str
    uf: str
    codigo_ibge: str | None
    regiao: str
    numero_processo: str | None
    programa: str | None
    data_publicacao: date
    data_inicio_vigencia: date | None
    data_final_vigencia: date | None
    data_conclusao: date | None
    data_ultima_liberacao: date | None
    valor_global: Decimal
    valor_repasse: Decimal | None
    valor_empenhado: Decimal | None
    valor_desembolsado: Decimal | None
    valor_contrapartida: Decimal | None
    valor_saldo_conta: Decimal | None
    valor_ultima_liberacao: Decimal | None
    valor_pago_fornecedor: Decimal | None
    pagamentos_count: int
    financeiro_fonte_confiavel: bool
    tipo_contratacao: str
    siconv_raw: dict[str, JsonValue]
