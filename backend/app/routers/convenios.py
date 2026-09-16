"""Instrumentos firmados -- achado 2026-09-16, pedido do usuário: "vamos
parar de usar json estático, coloque tudo no banco". Substitui o merge
client-side de `convenios.json`/`siconv.json`/`transferegov.json`
(`frontend/src/lib/mesclar-convenios.ts`) por leitura direta da tabela
`convenio` (carregada por `scripts/importar_convenios_banco.py`).

Filtros espelham o que `MonitoramentoEquipamentosPage.tsx` já filtrava
client-side (busca/UF/equipamento/situação/ano/programa) -- movidos pro
banco junto com a paginação, em vez de trazer os 403 inteiros pro front
sempre. Leitura pública, mesmo padrão de `GET /monitoramento/instrumentos`
(só mutação exige editor -- e aqui não tem mutação nenhuma, `convenio` só
é escrito pelo script de import).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import CnesEstabelecimento, Convenio

router = APIRouter(prefix="/convenios", tags=["convenios"])


class ConvenioRead(BaseModel):
    numero: str
    numero_instrumento: str | None
    ano_instrumento: int | None
    objeto: str | None
    situacao: str | None
    situacao_portal: str | None
    situacao_contratacao: str | None
    convenente_nome: str
    convenente_cnpj: str
    convenente_tipo: str | None
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
    equipamentos_tags: list[str] | None
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


def _com_nome_cnes(db: Session, convenios: list[Convenio], modelo: type[BaseModel] = ConvenioRead) -> list[BaseModel]:
    codigos = {c.cnes for c in convenios if c.cnes}
    nomes = {}
    if codigos:
        nomes = {
            row.cnes: row.nome_estabelecimento
            for row in db.execute(select(CnesEstabelecimento).where(CnesEstabelecimento.cnes.in_(codigos))).scalars()
        }
    return [
        modelo.model_validate(c).model_copy(update={"cnes_nome_estabelecimento": nomes.get(c.cnes)})
        for c in convenios
    ]


@router.get("", response_model=ConvenioListaRead)
def listar_convenios(
    busca: str | None = None,
    uf: str | None = None,
    equipamento: str | None = None,
    situacao: str | None = None,
    ano: int | None = None,
    programa: str | None = None,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = select(Convenio)
    if uf:
        query = query.where(Convenio.uf == uf)
    if equipamento:
        query = query.where(Convenio.equipamentos_tags.contains([equipamento]))
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

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar_one()
    itens = db.execute(
        query.order_by(Convenio.numero).offset((pagina - 1) * tamanho_pagina).limit(tamanho_pagina)
    ).scalars().all()
    return ConvenioListaRead(total=total, itens=_com_nome_cnes(db, itens))


@router.get("/{numero}", response_model=ConvenioDetalheRead)
def obter_convenio(numero: str, db: Session = Depends(get_db)):
    convenio = db.execute(select(Convenio).where(Convenio.numero == numero)).scalar_one_or_none()
    if convenio is None:
        raise HTTPException(404, f"Convênio {numero} não encontrado.")
    return _com_nome_cnes(db, [convenio], ConvenioDetalheRead)[0]
