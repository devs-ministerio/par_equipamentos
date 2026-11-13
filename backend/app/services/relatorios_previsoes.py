"""Conclusão e previsões: uma linha por instrumento monitorado, com a situação da conclusão (D01)."""

from collections import Counter
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.pipeline.texto import capitalizar_nome
from app.schemas_relatorios_previsoes import ContagemSituacao, PreviaPrevisoes, RegistroPrevisao
from app.services.relatorios_conclusao import CATEGORIAS_CONCLUSAO, agenda_dos_instrumentos, categoria_da
from app.services.relatorios_filtro import FiltroRelatorio
from app.services.relatorios_monitoramento import carregar_monitoramento_relatorio
from app.services.relatorios_recorte import _instrumentos


@dataclass(frozen=True)
class ExtracaoPrevisoes:
    itens: list[RegistroPrevisao]
    contagens: list[ContagemSituacao]


def extrair_previsoes(*, db: Session, filtro: FiltroRelatorio, hoje: date | None = None) -> ExtracaoPrevisoes:
    if filtro.situacao_conclusao and filtro.situacao_conclusao not in CATEGORIAS_CONCLUSAO:
        raise ValidationError(f"Situação de conclusão desconhecida: {filtro.situacao_conclusao}.")
    hoje = hoje or date.today()
    instrumentos = _instrumentos(db, filtro)
    dados = carregar_monitoramento_relatorio(
        db=db, instrumento_ids=[i.instrumento.id for i in instrumentos], com_acoes=False
    )
    agenda = agenda_dos_instrumentos(instrumentos, dados, hoje)
    codigos = [categoria_da(a) for a in agenda]
    por_codigo = Counter(codigos)
    contagens = [
        ContagemSituacao(codigo=c, rotulo=r, quantidade=por_codigo.get(c, 0)) for c, r in CATEGORIAS_CONCLUSAO.items()
    ]
    itens = [
        RegistroPrevisao(
            instrumento=a.instrumento.instrumento.nr_convenio,
            convenente=a.instrumento.instrumento.nome_convenente or "",
            tipo=a.instrumento.instrumento.tipo_contratacao or "Convênio",
            uf=a.instrumento.instrumento.uf,
            municipio=capitalizar_nome(a.instrumento.instrumento.municipio) or None,
            fase_atual=a.instrumento.fase_atual,
            situacao=a.situacao,
            categoria=codigo,
            data_conclusao=a.conclusao,
            inauguracao_real=a.inauguracao_real,
            previsao_inauguracao=a.previsao,
            dias_ate_previsao=a.dias_ate_previsao(hoje),
        )
        for a, codigo in zip(agenda, codigos)
        if not filtro.situacao_conclusao or codigo == filtro.situacao_conclusao
    ]
    itens.sort(key=lambda r: (r.previsao_inauguracao or date.max, r.instrumento))
    return ExtracaoPrevisoes(itens, contagens)


def previa_previsoes(*, db: Session, filtro: FiltroRelatorio, pagina: int, limite: int) -> PreviaPrevisoes:
    extracao = extrair_previsoes(db=db, filtro=filtro)
    inicio = (pagina - 1) * limite
    return PreviaPrevisoes(
        total=len(extracao.itens),
        pagina=pagina,
        limite=limite,
        itens=extracao.itens[inicio : inicio + limite],
        contagens=extracao.contagens,
    )
