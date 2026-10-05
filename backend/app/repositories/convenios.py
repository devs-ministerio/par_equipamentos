"""Acesso a dados de Convenio para os relatorios (Plan Mode docs/arquitetura/
planmode-relatorios-2026-09-25.md, Blocos 2 e 7).

Separado da query de `app/routers/convenios.py::_aplicar_filtros_convenio`
de proposito -- essa e paginada (uso de UI), o relatorio precisa do
universo inteiro que bate o filtro, sem paginacao. Função solta com
`db: Session` posicional, mesmo contrato de app/repositories/monitoramento.py.
"""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, aliased

from app.db.models import Convenio, EquipamentoCatalogo, EquipamentoMarcador
from app.domain_errors import ValidationError
from app.pipeline.texto import normalizar_texto

# Teto de seguranca do relatorio -- nao paginacao de UI (mesmo espirito do
# Bloco 4 do Plan Mode consolidacao 2026-09-17). 581 convenios hoje, bem
# abaixo disso.
LIMITE_RELATORIO = 5000


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
    # centenas no pior caso) pra filtrar depois de trazer.
    stmt = select(Convenio)
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
    alvo_municipio = normalizar_texto(municipio) if municipio else None
    resultado: list[Convenio] = []
    for convenio in db.execute(stmt.execution_options(yield_per=500)).scalars():
        if alvo_municipio and normalizar_texto(convenio.municipio) != alvo_municipio:
            continue
        resultado.append(convenio)
        if len(resultado) > LIMITE_RELATORIO:
            raise ValidationError("O recorte contém convênios demais para uma exportação. Refine os filtros.")
    return resultado
