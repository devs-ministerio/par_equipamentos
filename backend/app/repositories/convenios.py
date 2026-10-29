"""Acesso a dados de Convenio para os relatorios (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Blocos 2 e 7).

Separado da query paginada `aplicar_filtros_convenio` (mais abaixo)
de proposito -- essa e paginada (uso de UI), o relatorio precisa do
universo inteiro que bate o filtro, sem paginacao. Função solta com
`db: Session` posicional, mesmo contrato de app/repositories/monitoramento.py.
"""

from __future__ import annotations

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, aliased, load_only
from sqlalchemy.sql.elements import ColumnElement

from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador, InstrumentoEquipamento
from app.pipeline.texto import normalizar_texto
from app.repositories.equipamento_marcadores import marcador_de_financiamento
from app.repositories.limites_relatorio import listar_sem_truncar

# Teto de seguranca do relatorio -- nao paginacao de UI (mesmo espirito do
# Bloco 4 do Plan Mode consolidacao 2026-09-17). 581 convenios hoje, bem
# abaixo disso.
LIMITE_RELATORIO = 5000


def convenio_no_escopo_de_equipamentos() -> ColumnElement[bool]:
    """Visibilidade da carteira; não apaga nem reclassifica a fonte oficial."""
    return Convenio.fora_escopo_equipamentos.is_(False)


def instrumento_no_escopo() -> ColumnElement[bool]:
    """O instrumento monitorado só existe para o SISGEO enquanto o convênio dele não está fora de escopo
    (por exemplo, convênio só de obra: fica no banco, mas não aparece em lugar nenhum)."""
    return ~exists().where(
        Convenio.numero == InstrumentoEquipamento.nr_convenio,
        func.coalesce(Convenio.tipo_contratacao, "Convênio")
        == func.coalesce(InstrumentoEquipamento.tipo_contratacao, "Convênio"),
        Convenio.fora_escopo_equipamentos.is_(True),
    )


def listar_numeros_fora_escopo(db: Session, numeros: set[str]) -> set[str]:
    """Consulta em lote a decisão de exclusão, sem exigir espelho para cargas internas."""
    if not numeros:
        return set()
    return set(
        db.scalars(
            select(Convenio.numero).where(Convenio.numero.in_(numeros), Convenio.fora_escopo_equipamentos.is_(True))
        )
    )


def listar_convenios_filtrados(
    db: Session,
    *,
    ufs: list[str] | None = None,
    municipio: str | None = None,
    cnes: str | None = None,
    ano_inicio: int | None = None,
    ano_fim: int | None = None,
    situacao: str | None = None,
    programa: str | None = None,
    tipo_contratacao: str | None = None,
    equipamento: str | None = None,
    busca: str | None = None,
) -> list[Convenio]:
    # Município comparado em Python, não em SQL (achado ao vivo, Plan Mode
    # relatorios 2026-09-25 Bloco 4: "SAO PAULO"/"São Paulo" convivem na
    # mesma coluna a depender da origem -- comparação exata sempre perdia
    # uma das grafias). Volume por UF é pequeno o bastante (algumas
    # centenas no pior caso); leitura em lotes aplica esse filtro antes do teto.
    stmt = select(Convenio).where(convenio_no_escopo_de_equipamentos())
    if ufs:
        stmt = stmt.where(Convenio.uf.in_(ufs))
    if cnes:
        stmt = stmt.where(Convenio.cnes == cnes)
    if ano_inicio is not None:
        stmt = stmt.where(Convenio.ano_instrumento >= ano_inicio)
    if ano_fim is not None:
        stmt = stmt.where(Convenio.ano_instrumento <= ano_fim)
    if situacao:
        stmt = stmt.where(Convenio.situacao == situacao)
    if programa:
        stmt = stmt.where(Convenio.programa == programa)
    if tipo_contratacao:
        stmt = stmt.where(Convenio.tipo_contratacao == tipo_contratacao)
    if equipamento:
        catalogo_alvo = aliased(EquipamentoCatalogo)
        stmt = stmt.where(
            select(EquipamentoMarcador.id)
            .join(catalogo_alvo, catalogo_alvo.id == EquipamentoMarcador.equipamento_catalogo_id)
            .where(
                EquipamentoMarcador.convenio_id == Convenio.id,
                marcador_de_financiamento(),
                catalogo_alvo.nome == equipamento,
            )
            .exists()
        )
    if busca:
        alvo = f"%{busca}%"
        stmt = stmt.where(
            or_(
                Convenio.numero.ilike(alvo),
                Convenio.convenente_nome.ilike(alvo),
                Convenio.convenente_cnpj.ilike(alvo),
                Convenio.municipio.ilike(alvo),
                Convenio.objeto.ilike(alvo),
            )
        )
    stmt = stmt.order_by(Convenio.numero, Convenio.id)
    if municipio:
        alvo_municipio = normalizar_texto(municipio)
        return listar_sem_truncar(
            db,
            stmt,
            limite=LIMITE_RELATORIO,
            corresponde=lambda convenio: normalizar_texto(convenio.municipio) == alvo_municipio,
        )
    return listar_sem_truncar(db, stmt, limite=LIMITE_RELATORIO)


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
    Convenio.codigo_ibge_municipio,
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


def aplicar_filtros_convenio(
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
    query = query.where(convenio_no_escopo_de_equipamentos())
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
                marcador_de_financiamento(),
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


def listar_convenios_paginados(
    db: Session,
    *,
    busca: str | None,
    uf: str | None,
    equipamento: str | None,
    situacao: str | None,
    ano: int | None,
    programa: str | None,
    tipo_contratacao: str | None,
    pagina: int,
    tamanho_pagina: int,
) -> tuple[int, list[Convenio]]:
    def com_filtros(query):
        return aplicar_filtros_convenio(
            query,
            busca=busca,
            uf=uf,
            equipamento=equipamento,
            situacao=situacao,
            ano=ano,
            programa=programa,
            tipo_contratacao=tipo_contratacao,
        )

    total = db.execute(com_filtros(select(func.count()).select_from(Convenio))).scalar_one()
    query = com_filtros(select(Convenio).options(load_only(*CONVENIO_LIST_LOAD_ONLY)))
    itens = (
        db.execute(query.order_by(Convenio.numero).offset((pagina - 1) * tamanho_pagina).limit(tamanho_pagina))
        .scalars()
        .all()
    )
    return total, list(itens)


def obter_convenio_por_numero(db: Session, numero: str) -> Convenio | None:
    return db.execute(
        select(Convenio).where(Convenio.numero == numero, convenio_no_escopo_de_equipamentos())
    ).scalar_one_or_none()
