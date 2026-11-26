"""Contexto por instrumento: o que os três modelos de relatório repetem em cada linha."""

from sqlalchemy.orm import Session

from app.geo_reference import REGIAO_POR_UF
from app.pipeline.texto import capitalizar_nome
from app.repositories import relatorios_contexto as repo
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_modelo import ContextoInstrumento

# Task 0, passo 1: situação oficial do convênio (a fase interna fica em Situação (Monitoramento)).
SITUACAO_SITE_CAMPO = "situacao"


def contexto_do(instrumento, fase: str | None, convenio, nome_cnes: str | None) -> ContextoInstrumento:
    uf = (instrumento.uf or "").upper() or None
    return ContextoInstrumento(
        numero=instrumento.nr_convenio,
        cnes=instrumento.cnes,
        estabelecimento=nome_cnes or instrumento.nome_convenente,
        municipio=capitalizar_nome(instrumento.municipio),
        uf=uf,
        regiao=REGIAO_POR_UF.get(uf) if uf else None,
        contratacao=instrumento.tipo_contratacao,
        situacao_site=getattr(convenio, SITUACAO_SITE_CAMPO, None) if convenio else None,
        situacao_monitoramento=fase,
        numero_processo=convenio.numero_processo if convenio else None,
        ano=instrumento.ano_instrumento,
        inicio_vigencia=convenio.data_inicio_vigencia if convenio else None,
        fim_vigencia=convenio.data_final_vigencia if convenio else None,
        tecnico=instrumento.tecnico_titular,
    )


def carregar_contextos(db: Session, recorte: list[InstrumentoComFase]) -> dict[str, ContextoInstrumento]:
    instrumentos = [i.instrumento for i in recorte]
    convenios = repo.convenios_por_numero(db, {i.nr_convenio for i in instrumentos})
    nomes = repo.nomes_cnes(db, {i.cnes for i in instrumentos if i.cnes})
    return {
        c.instrumento.nr_convenio: contexto_do(
            c.instrumento, c.fase_atual, convenios.get(c.instrumento.nr_convenio), nomes.get(c.instrumento.cnes or "")
        )
        for c in recorte
    }
