"""Schemas de leitura de "Instrumentos firmados" (`/convenios`)."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.schemas_equipamentos import EquipamentoMarcadorRead


class ConvenioRead(BaseModel):
    numero: str
    numero_instrumento: str | None
    ano_instrumento: int | None
    objeto: str | None
    situacao: str | None
    situacao_portal: str | None
    situacao_contratacao: str | None
    convenente_nome: str
    # Nulo pra PERSUS/PRONON (correção 2026-09-18, Plan Mode monitoramento-
    # ingestao) -- fonte não publica CNPJ, nunca inventado.
    convenente_cnpj: str | None
    convenente_tipo: str | None
    # Universo de "Instrumentos firmados" agora vai além de SICONV/
    # TransfereGov (correção 2026-09-18) -- distingue Convênio/FAF/TED/
    # PERSUS I/PERSUS II/PRONON. `None` só nos poucos registros antigos que
    # a migration não conseguiu backfillar (não deveria existir hoje).
    tipo_contratacao: str | None
    tipologia: str | None
    municipio: str | None
    uf: str | None
    codigo_ibge: str | None
    codigo_ibge_municipio: str | None
    regiao: str | None
    orgao: str | None
    unidade_gestora: str | None
    subfuncao: str | None
    funcao: str | None
    tipo_instrumento: str | None
    numero_processo: str | None
    programa: str | None
    data_publicacao: date | None
    data_inicio_vigencia: date | None
    data_final_vigencia: date | None
    data_conclusao: date | None
    data_ultima_liberacao: date | None
    valor_global: float | None
    valor_repasse: float | None
    valor_empenhado: float | None
    valor_desembolsado: float | None
    valor_contrapartida: float | None
    valor_saldo_conta: float | None
    valor_ultima_liberacao: float | None
    valor_pago_fornecedor: float | None
    pagamentos_count: int
    financeiro_fonte_confiavel: bool
    # Distingue contrato oficial completo de carga manual. A presença de
    # JSONB parcial nunca é evidência de que dados SICONV existam.
    dados_oficiais_disponiveis: bool = False
    desembolso_integral_da_carga: bool = False
    # Fonte de verdade central de equipamentos/evidências. A lista legada
    # permanece no contrato só até todos os consumidores migrarem.
    equipamentos: list[EquipamentoMarcadorRead] = Field(default_factory=list)
    cnes: str | None
    # Achado 2026-09-16 ("nome do estabelecimento abaixo do nome do
    # convenente") -- não é coluna de `Convenio` (evita duplicar o mesmo
    # nome em 357 linhas quando já está em CnesEstabelecimento por
    # `cnes`), resolvido aqui com 1 lookup em lote (ver `_com_nome_cnes`).
    cnes_nome_estabelecimento: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ConvenioDetalheRead(ConvenioRead):
    """Só na rota de detalhe (`GET /convenios/{numero}`) -- os 2 payloads
    crus (itens do plano de aplicação, propostas expandidas etc.), mesmo
    critério de não trazer isso na listagem (pesado, só o card expandido
    precisa)."""

    siconv_raw: dict | None
    transferegov_raw: dict | None


class ConvenioListaRead(BaseModel):
    total: int
    itens: list[ConvenioRead]
