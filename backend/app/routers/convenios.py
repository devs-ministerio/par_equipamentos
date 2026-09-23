"""Instrumentos firmados -- achado 2026-09-16, pedido do usuário: "vamos
parar de usar json estático, coloque tudo no banco". Substitui o merge
client-side de `convenios.json`/`siconv.json`/`transferegov.json`
(`frontend/src/lib/mesclar-convenios.ts`) por leitura direta da tabela
`convenio` (carregada por `scripts/importar_convenios_banco.py`).

Filtros espelham o que `MonitoramentoEquipamentosPage.tsx` já filtrava
client-side (busca/UF/equipamento/situação/ano/programa) -- movidos pro
banco junto com a paginação, em vez de trazer os 403 inteiros pro front
sempre.

Leitura exige sessão (`require_current_user`) desde 2026-09-17, decisão do
usuário: todo o app fica atrás de login por enquanto (Plan Mode segurança
2026-09-16, Bloco 5) -- não só por paridade com o resto do app, mas porque
`GET /convenios/{numero}` devolve `siconv_raw`/`transferegov_raw` por
inteiro, que contêm CEP/endereço do item (`CEP_ITEM`/`ENDERECO_ITEM`/
`ed_cep`), confirmado em registro real do banco. Sem mutação (`convenio`
só é escrito pelo script de import), então não há distinção editor/leitor
aqui, só sessão válida.
"""

from __future__ import annotations

from datetime import date
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased, load_only

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import CnesEstabelecimento, Convenio, EquipamentoCatalogo, EquipamentoMarcador, User
from app.repositories.equipamento_marcadores import listar_por_origens
from app.schemas_equipamentos import EquipamentoMarcadorRead, serializar_marcadores

router = APIRouter(prefix="/convenios", tags=["convenios"])

TIPOS_SEM_DADOS_OFICIAIS = frozenset({"FAF", "TED", "PERSUS I", "PERSUS II", "PRONON"})


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


CONVENIO_LIST_LOAD_ONLY = (
    Convenio.numero,
    Convenio.numero_instrumento,
    Convenio.ano_instrumento,
    Convenio.objeto,
    Convenio.situacao,
    Convenio.situacao_portal,
    Convenio.situacao_contratacao,
    Convenio.convenente_nome,
    Convenio.convenente_cnpj,
    Convenio.convenente_tipo,
    Convenio.tipo_contratacao,
    Convenio.tipologia,
    Convenio.municipio,
    Convenio.uf,
    Convenio.codigo_ibge,
    Convenio.regiao,
    Convenio.orgao,
    Convenio.unidade_gestora,
    Convenio.subfuncao,
    Convenio.funcao,
    Convenio.tipo_instrumento,
    Convenio.numero_processo,
    Convenio.programa,
    Convenio.data_publicacao,
    Convenio.data_inicio_vigencia,
    Convenio.data_final_vigencia,
    Convenio.data_conclusao,
    Convenio.data_ultima_liberacao,
    Convenio.valor_global,
    Convenio.valor_repasse,
    Convenio.valor_empenhado,
    Convenio.valor_desembolsado,
    Convenio.valor_contrapartida,
    Convenio.valor_saldo_conta,
    Convenio.valor_ultima_liberacao,
    Convenio.valor_pago_fornecedor,
    Convenio.pagamentos_count,
    Convenio.financeiro_fonte_confiavel,
    Convenio.cnes,
)


def _com_nome_cnes(db: Session, convenios: list[Convenio], modelo: type[BaseModel] = ConvenioRead) -> list[BaseModel]:
    codigos = {c.cnes for c in convenios if c.cnes}
    nomes = {}
    if codigos:
        nomes = {
            row.cnes: row.nome_estabelecimento
            for row in db.execute(select(CnesEstabelecimento).where(CnesEstabelecimento.cnes.in_(codigos))).scalars()
        }
    marcadores = listar_por_origens(db, convenio_ids={c.id for c in convenios})
    resultado = []
    for convenio in convenios:
        disponibilidade = _projecao_disponibilidade_dados(convenio)
        campos = {
            "cnes_nome_estabelecimento": nomes.get(convenio.cnes or ""),
            "equipamentos": serializar_marcadores(marcadores.get(("convenio", convenio.id), [])),
            **disponibilidade,
        }
        if modelo is ConvenioDetalheRead and not disponibilidade["dados_oficiais_disponiveis"]:
            campos.update(siconv_raw=None, transferegov_raw=None)
        resultado.append(modelo.model_validate(convenio).model_copy(update=campos))
    return resultado


def _projecao_disponibilidade_dados(convenio: Convenio) -> dict[str, bool | float | None]:
    """Projeta o que pode ser afirmado para a origem do instrumento.

    Cargas manuais não possuem execução extraída de API. O valor global é
    tratado como integralmente desembolsado por regra explícita da carteira,
    sem fingir que os demais detalhes financeiros existem.
    """
    carga_manual = convenio.tipo_contratacao in TIPOS_SEM_DADOS_OFICIAIS
    return {
        "dados_oficiais_disponiveis": not carga_manual,
        "valor_desembolsado": convenio.valor_global if carga_manual else convenio.valor_desembolsado,
        "desembolso_integral_da_carga": carga_manual,
    }


def _aplicar_filtros_convenio(
    query,
    *,
    busca: str | None,
    uf: str | None,
    equipamento: str | None,
    situacao: str | None,
    ano: int | None,
    programa: str | None,
    tipo_contratacao: str | None,
):
    if tipo_contratacao:
        query = query.where(Convenio.tipo_contratacao == tipo_contratacao)
    if uf:
        query = query.where(Convenio.uf == uf)
    if equipamento:
        catalogo_alvo = aliased(EquipamentoCatalogo)
        query = query.where(
            select(EquipamentoMarcador.id)
            .join(
                catalogo_alvo,
                catalogo_alvo.id == EquipamentoMarcador.equipamento_catalogo_id,
            )
            .where(
                EquipamentoMarcador.convenio_id == Convenio.id,
                catalogo_alvo.nome == equipamento,
            )
            .exists()
        )
    if situacao:
        query = query.where(Convenio.situacao == situacao)
    if ano:
        query = query.where(Convenio.ano_instrumento == ano)
    if programa:
        query = query.where(Convenio.programa == programa)
    if busca:
        alvo = f"%{busca}%"
        query = query.where(
            Convenio.numero.ilike(alvo)
            | Convenio.convenente_nome.ilike(alvo)
            | Convenio.convenente_cnpj.ilike(alvo)
            | Convenio.municipio.ilike(alvo)
            | Convenio.objeto.ilike(alvo)
        )
    return query


@router.get("", response_model=ConvenioListaRead)
def listar_convenios(
    busca: str | None = None,
    uf: str | None = None,
    equipamento: str | None = None,
    situacao: str | None = None,
    ano: int | None = None,
    programa: str | None = None,
    tipo_contratacao: str | None = None,
    pagina: int = Query(1, ge=1),
    # Teto subiu de 500 pra 1000 (correção 2026-09-18): universo de
    # "Instrumentos firmados" passou de 403 pra 581 com a entrada de FAF/
    # TED/PERSUS I/PERSUS II/PRONON -- ainda rede de segurança, não
    # paginação de UI real (ver CLAUDE.md, mesmo padrão do Plan Mode
    # consolidação 2026-09-17, Bloco 4).
    tamanho_pagina: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    count_query = _aplicar_filtros_convenio(
        select(func.count()).select_from(Convenio), busca=busca, uf=uf,
        equipamento=equipamento, situacao=situacao, ano=ano, programa=programa,
        tipo_contratacao=tipo_contratacao,
    )
    query = _aplicar_filtros_convenio(
        select(Convenio).options(load_only(*CONVENIO_LIST_LOAD_ONLY)),
        busca=busca, uf=uf, equipamento=equipamento, situacao=situacao,
        ano=ano, programa=programa, tipo_contratacao=tipo_contratacao,
    )

    total = db.execute(count_query).scalar_one()
    itens = (
        db.execute(query.order_by(Convenio.numero).offset((pagina - 1) * tamanho_pagina).limit(tamanho_pagina))
        .scalars()
        .all()
    )
    return ConvenioListaRead(total=total, itens=cast(list[ConvenioRead], _com_nome_cnes(db, list(itens))))


@router.get("/{numero}", response_model=ConvenioDetalheRead)
def obter_convenio(numero: str, db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    convenio = db.execute(select(Convenio).where(Convenio.numero == numero)).scalar_one_or_none()
    if convenio is None:
        raise HTTPException(404, f"Convênio {numero} não encontrado.")
    return _com_nome_cnes(db, [convenio], ConvenioDetalheRead)[0]
