"""Coleções oficiais consultadas; coleção vazia não é fonte omitida."""

from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas_identidade_legado import NumeroConvenioLegado


class RegistroFilho(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow", str_strip_whitespace=True)
    NR_CONVENIO: NumeroConvenioLegado


class EmpenhoRecapturado(RegistroFilho):
    ID_EMPENHO: str = Field(min_length=1)


class DesembolsoRecapturado(RegistroFilho):
    ID_DESEMBOLSO: str = Field(min_length=1)


class LicitacaoRecapturada(RegistroFilho):
    ID_LICITACAO: str = Field(min_length=1)


def chave_termo_aditivo(solicitacao: str, numero_ta: str) -> str:
    """A mesma solicitação pode possuir mais de um termo oficial."""
    solicitacao, numero_ta = solicitacao.strip(), numero_ta.strip()
    if solicitacao:
        return f"solicitacao:{solicitacao}" + (f"|numero_ta:{numero_ta}" if numero_ta else "")
    if numero_ta:
        return f"numero_ta:{numero_ta}"
    raise ValueError("Termo aditivo sem identificador oficial utilizável.")


class TermoRecapturado(RegistroFilho):
    ID_SOLICITACAO: str = ""
    CHAVE_ESPELHO: str = Field(min_length=1)

    @model_validator(mode="before")
    @classmethod
    def chave_estavel_sem_reescrever_id_oficial(cls, valor: object) -> object:
        if not isinstance(valor, dict):
            return valor
        dados = dict(valor)
        solicitacao = str(dados.get("ID_SOLICITACAO") or "").strip()
        numero_ta = str(dados.get("NUMERO_TA") or "").strip()
        dados["CHAVE_ESPELHO"] = chave_termo_aditivo(solicitacao, numero_ta)
        return dados


class PagamentoRecapturado(RegistroFilho):
    NR_MOV_FIN: str = Field(min_length=1)
    VL_PAGO: str

    @field_validator("VL_PAGO")
    @classmethod
    def valor_valido(cls, valor: str) -> str:
        try:
            numero = Decimal(valor.replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError("Valor de pagamento oficial inválido.") from exc
        # Preserva estornos oficiais negativos; não os transforma em zero.
        if not numero.is_finite():
            raise ValueError("Valor de pagamento oficial inválido.")
        return valor


CHAVES_FILHAS = {
    "empenhos": "ID_EMPENHO",
    "desembolsos": "ID_DESEMBOLSO",
    "licitacoes": "ID_LICITACAO",
    "termos_aditivos": "CHAVE_ESPELHO",
    "pagamentos": "NR_MOV_FIN",
}
ARQUIVOS_FILHAS = {
    campo: "siconv_" + nome
    for campo, nome in (
        ("empenhos", "empenho"),
        ("desembolsos", "desembolso"),
        ("licitacoes", "licitacao"),
        ("termos_aditivos", "termo_aditivo"),
        ("pagamentos", "pagamento"),
    )
}


class FilhasLegadoRecapturadas(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    empenhos: tuple[EmpenhoRecapturado, ...]
    desembolsos: tuple[DesembolsoRecapturado, ...]
    licitacoes: tuple[LicitacaoRecapturada, ...]
    termos_aditivos: tuple[TermoRecapturado, ...]
    pagamentos: tuple[PagamentoRecapturado, ...]

    @model_validator(mode="after")
    def chaves_unicas(self) -> "FilhasLegadoRecapturadas":
        for campo, chave in CHAVES_FILHAS.items():
            registros = getattr(self, campo)
            ids = [getattr(registro, chave) for registro in registros]
            if len(ids) != len(set(ids)):
                raise ValueError("Tabela filha contém identidade duplicada.")
        return self
