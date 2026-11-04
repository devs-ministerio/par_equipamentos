"""Schemas de leitura das propostas candidatas (Radar de Convênios)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas_equipamentos import EquipamentoMarcadorRead


class PropostaCandidataRead(BaseModel):
    id: int
    id_proposta: int
    cnpj_ente_recebedor: str
    nm_proponente: str
    municipio: str | None
    uf: str | None
    ds_objeto: str
    nm_programa: str
    id_programa: int
    componente_batido: str
    equipamentos: list[EquipamentoMarcadorRead] = Field(default_factory=list)
    equipamento_detectado: str | None
    # float, não Decimal -- Pydantic v2 serializa Decimal como STRING no
    # JSON (perde precisão de float de propósito), quebrando o parse do
    # lado do front sem erro visível (achado 2026-09-15, mesma convenção
    # de MarcoCatalogoRead.execucao_fisica_pct_referencia acima).
    vl_global_proposta: float | None
    situacao_proposta: str | None
    data_proposta: date | None
    # Mantido na listagem de propósito: o card e os filtros client-side
    # (situação de fato, equipamento via itens) ainda leem o JSON. Diferente
    # de `convenio.siconv_raw`, aqui não há payload "cru de detalhe" separado
    # -- o resumo *é* o dado exibido. Extrair colunas derivadas fica pra
    # bloco futuro, quando o filtro de equipamento/situação subir pro SQL.
    metas_resumo: dict | None
    cnes: str | None
    # Achado 2026-09-16, pedido do usuário: "aplique tudo que pedi para
    # instrumentos firmados em Linhas de financiamento" -- mesmo padrão de
    # `ConvenioRead.cnes_nome_estabelecimento` (convenios.py): não é coluna
    # de `PropostaCandidata`, resolvido em lote por `cnes` (ver `_com_nome_cnes`).
    cnes_nome_estabelecimento: str | None = None
    tem_parceria: bool
    cd_parceria: str | None
    # Resolvido no backend (`app/pipeline/tipo_proposta.py`); o front não interpreta o JSON cru.
    tipo_contratacao: str = "FAF"
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PropostaCandidataListaRead(BaseModel):
    total: int
    itens: list[PropostaCandidataRead]
