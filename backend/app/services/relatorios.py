"""Orquestra a geração dos relatórios Excel/Word -- Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 2, 4 e 5.

Dois relatórios INDEPENDENTES (pedido do usuário 2026-09-26: "separar o
relatório de instrumentos e repasse do relatório de análise de mérito"):

- `instrumentos_repasse`: convênios firmados + propostas candidatas (linhas
  de financiamento do TransfereGov novo, ainda sem virar convênio) +
  monitoramento interno -- é o relatório com riqueza financeira/processual
  (tipo de contratação, componente, situação da proposta, todas as etapas
  do monitoramento). No Word, nível "completo" narra 1 bloco por instrumento
  (mesmo padrão dos briefings reais do departamento, ver `data/relatorios/`
  anexados pelo usuário 2026-09-26) em vez de só uma tabela achatada; no
  Excel continua tabela (pedido explícito do usuário: "o excel serão
  tabelas").
- `analise_merito`: só cobertura/déficit oncológico (MacroCoverage/
  MunicipalityCoverage) -- não existe pra escopo=cnes, que não tem
  granularidade por estabelecimento (mesma limitação já documentada no
  CLAUDE.md).

Ambos filtrados pelo mesmo filtro geográfico hierárquico (Brasil -> Região
-> UF -> Município -> CNES) + `ano` opcional (só usado por
`instrumentos_repasse` -- cobertura não tem essa dimensão, é execução/
competência, não ano civil).

Nível "simplificado" = estado ATUAL (fase corrente, sem histórico).
Nível "completo" = TUDO, inclusive a timeline inteira de eventos do
monitoramento interno.

Gaps conhecidos, NUNCA fabricados: "habilitação" CNES (não existe em
`CnesEstabelecimento`, só nome/endereço/CNPJ/município) e "produção
assistencial" (SIH/SIA/SUS por procedimento) -- essa última é dado do
projeto irmão `nota-informativa-decan` (DuckDB/parquet), fora do banco do
SIGEO; nenhuma das duas seções existe aqui até uma fonte real ser
integrada (ver plan-mode, "Fora de escopo").
"""

from __future__ import annotations

import itertools
from collections import Counter
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal

from docx.document import Document as DocumentType
from sqlalchemy.orm import Session

from app.db.models import Convenio, MarcoCatalogo, MarcoGrupo, PropostaCandidata
from app.domain_errors import ValidationError
from app.geo_reference import REGIOES, ufs_da_regiao
from app.reports import docx_builder, xlsx_builder
from app.reports.formatacao import formatar_data, formatar_moeda
from app.repositories import cobertura_relatorio as cobertura_repo
from app.repositories import convenios as convenios_repo
from app.repositories import execucoes as execucoes_repo
from app.repositories import monitoramento as monitoramento_repo
from app.repositories import propostas_candidatas_relatorio as propostas_repo
from app.services.monitoramento_instrumentos import InstrumentoComFase, listar_instrumentos_monitorados

Escopo = Literal["brasil", "regiao", "uf", "municipio", "cnes"]
Nivel = Literal["simplificado", "completo"]
Formato = Literal["xlsx", "docx"]
TipoRelatorio = Literal["instrumentos_repasse", "analise_merito"]

_ROTULO_GRUPO_MARCO = {
    MarcoGrupo.fase_geral: "Fase geral",
    MarcoGrupo.cronograma_fisico: "Cronograma físico",
    MarcoGrupo.regulatorio: "Regulatório",
}


@dataclass(frozen=True)
class FiltroRelatorio:
    escopo: Escopo
    regiao: str | None = None
    uf: str | None = None
    municipio: str | None = None
    cnes: str | None = None
    ano: int | None = None
    # Filtros novos (Plan Mode relatorios 2026-09-25, Bloco 7 -- "mesmos
    # filtros que temos no instrumentos/repasses") -- só aplicados na
    # seção de Convênios (situacao/programa/tipo_contratacao/busca) e, onde
    # o campo existe, em Monitoramento (tipo_contratacao/programa) e
    # Propostas (programa/situacao). Não fazem parte da validação de
    # escopo -- opcionais em qualquer combinação.
    situacao: str | None = None
    programa: str | None = None
    tipo_contratacao: str | None = None
    busca: str | None = None

    def __post_init__(self) -> None:
        if self.escopo == "regiao":
            if not self.regiao:
                raise ValidationError("Escopo 'regiao' exige o parâmetro 'regiao'.")
            if self.regiao not in REGIOES:
                raise ValidationError(f"Região '{self.regiao}' desconhecida. Use uma de: {', '.join(REGIOES)}.")
        elif self.escopo == "uf":
            if not self.uf:
                raise ValidationError("Escopo 'uf' exige o parâmetro 'uf'.")
        elif self.escopo == "municipio":
            if not (self.uf and self.municipio):
                raise ValidationError("Escopo 'municipio' exige os parâmetros 'uf' e 'municipio'.")
        elif self.escopo == "cnes" and not self.cnes:
            raise ValidationError("Escopo 'cnes' exige o parâmetro 'cnes'.")

    def ufs(self) -> list[str] | None:
        if self.escopo == "brasil" or self.escopo == "cnes":
            return None
        if self.escopo == "regiao":
            assert self.regiao is not None
            return ufs_da_regiao(self.regiao)
        assert self.uf is not None
        return [self.uf]

    def municipio_do_escopo(self) -> str | None:
        return self.municipio if self.escopo == "municipio" else None

    def cnes_do_escopo(self) -> str | None:
        return self.cnes if self.escopo == "cnes" else None

    def titulo(self) -> str:
        base = {
            "brasil": "Brasil",
            "regiao": f"Região {self.regiao}",
            "uf": f"UF {self.uf}",
            "municipio": f"{self.municipio}/{self.uf}",
            "cnes": f"CNES {self.cnes}",
        }[self.escopo]
        return f"{base} -- {self.ano}" if self.ano else base


# ---------------------------------------------------------------------
# Análise de mérito (cobertura/déficit) -- sem dimensão de ano.
# ---------------------------------------------------------------------


def _secao_cobertura_linhas(db: Session, filtro: FiltroRelatorio, nivel: Nivel) -> list[tuple[str, list[str], list]]:
    if filtro.escopo == "cnes":
        return []
    ufs = filtro.ufs()
    municipio = filtro.municipio_do_escopo()
    secoes: list[tuple[str, list[str], list]] = []
    for familia in execucoes_repo.listar_familias_publicadas(db):
        exec_id = execucoes_repo.obter_execucao_publicada_mais_recente(db, familia)
        if exec_id is None:
            continue
        if nivel == "simplificado":
            colunas = ["Macrorregião", "UF", "População", "Necessário", "Disponível SUS", "Saldo"]
            linhas = [
                [m.macro_name, m.state, m.population, m.required_qty, m.available_qty, m.balance]
                for m in cobertura_repo.listar_macro_coverage(db, execution_id=exec_id, ufs=ufs)
            ]
        else:
            colunas = ["Município", "UF", "População", "Necessário", "Disponível SUS", "Saldo"]
            linhas = [
                [m.municipality_name, m.state, m.population, m.required_qty, m.available_qty, m.balance]
                for m in cobertura_repo.listar_municipality_coverage(
                    db, execution_id=exec_id, ufs=ufs, municipio=municipio
                )
            ]
        secoes.append((f"Cobertura {familia}", colunas, linhas))
    return secoes


def _montar_analise_merito(db: Session, formato: Formato, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    secoes = _secao_cobertura_linhas(db, filtro, nivel)
    if not secoes:
        # Nenhuma família de equipamento com execução publicada pro recorte
        # pedido -- achado ao vivo (Bloco 5): sem isso, uma pasta Excel sem
        # nenhuma aba quebra ao salvar ("At least one sheet must be
        # visible"). Sempre devolve um arquivo válido, com aviso explícito
        # em vez de estourar erro pra um estado que não é entrada inválida.
        secoes = [
            (
                "Cobertura",
                ["Aviso"],
                [["Nenhuma família de equipamento com execução publicada para este filtro."]],
            )
        ]
    if formato == "xlsx":
        pasta = xlsx_builder.nova_pasta()
        for titulo_aba, colunas, linhas in secoes:
            xlsx_builder.escrever_aba_tabela(pasta, titulo_aba, colunas, linhas)
        return xlsx_builder.gerar_bytes(pasta)
    documento = docx_builder.novo_documento(f"Análise de mérito -- {filtro.titulo()}")
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    for titulo_secao, colunas, linhas in secoes:
        docx_builder.adicionar_titulo(documento, titulo_secao)
        docx_builder.adicionar_tabela(documento, colunas, docx_builder.linhas_como_texto(colunas, linhas))
    return docx_builder.gerar_bytes(documento)


# ---------------------------------------------------------------------
# Instrumentos e repasse (convênios + propostas candidatas + monitoramento).
# ---------------------------------------------------------------------


def _convenios(db: Session, filtro: FiltroRelatorio) -> list[Convenio]:
    return convenios_repo.listar_convenios_filtrados(
        db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        cnes=filtro.cnes_do_escopo(),
        ano_inicio=filtro.ano,
        ano_fim=filtro.ano,
        situacao=filtro.situacao,
        programa=filtro.programa,
        tipo_contratacao=filtro.tipo_contratacao,
        busca=filtro.busca,
    )


def _propostas(db: Session, filtro: FiltroRelatorio) -> list[PropostaCandidata]:
    # `programa`/`situacao` NÃO são repassados aqui de propósito (achado
    # ao vivo, Bloco 7): `PropostaCandidata.nm_programa`/`situacao_proposta`
    # usam vocabulário do TransfereGov novo, diferente do `Convenio.programa`/
    # `situacao` (SICONV) -- aplicar o mesmo valor filtraria pra um conjunto
    # vazio quase sempre, silenciosamente. Só `uf`/`ano` são comparáveis
    # 1:1 entre as duas fontes.
    return propostas_repo.listar_propostas_filtradas(
        db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        ano=filtro.ano,
    )


def _instrumentos(db: Session, filtro: FiltroRelatorio) -> list[InstrumentoComFase]:
    # `programa` também fica de fora aqui pelo mesmo motivo do comentário
    # acima -- é preenchido manualmente pela equipe, sem garantia de bater
    # com `Convenio.programa` string a string. `tipo_contratacao` é o
    # único desses 2 campos com vocabulário fechado e idêntico nas duas
    # tabelas (Convênio/FAF/TED/PERSUS I/PERSUS II), seguro de repassar.
    return listar_instrumentos_monitorados(
        db=db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        cnes=filtro.cnes_do_escopo(),
        ano_inicio=filtro.ano,
        ano_fim=filtro.ano,
        tipo_contratacao=filtro.tipo_contratacao,
    )


_COLUNAS_CONVENIO_SIMPLIFICADO = [
    "Número",
    "Convenente",
    "Município",
    "UF",
    "Tipo de contratação",
    "Situação",
    "Ano",
    "Valor global",
]
_COLUNAS_CONVENIO_COMPLETO = [
    "Número",
    "Convenente",
    "CNPJ",
    "Município",
    "UF",
    "Tipo de contratação",
    "Tipologia",
    "Programa",
    "Órgão",
    "Situação",
    "Situação da contratação",
    "Ano",
    "Publicação",
    "Início vigência",
    "Fim vigência",
    "Conclusão",
    "Valor global",
    "Valor repasse",
    "Valor empenhado",
    "Valor desembolsado",
    "Valor contrapartida",
    "Saldo em conta",
    "Valor pago ao fornecedor",
    "CNES",
]
_MOEDA_CONVENIO_SIMPLIFICADO = ["Valor global"]
_MOEDA_CONVENIO_COMPLETO = [
    "Valor global",
    "Valor repasse",
    "Valor empenhado",
    "Valor desembolsado",
    "Valor contrapartida",
    "Saldo em conta",
    "Valor pago ao fornecedor",
]
_DATA_CONVENIO_COMPLETO = ["Publicação", "Início vigência", "Fim vigência", "Conclusão"]


def _linhas_convenio(convenio: Convenio, *, completo: bool) -> list[object]:
    if not completo:
        return [
            convenio.numero,
            convenio.convenente_nome,
            convenio.municipio,
            convenio.uf,
            convenio.tipo_contratacao,
            convenio.situacao,
            convenio.ano_instrumento,
            convenio.valor_global,
        ]
    return [
        convenio.numero,
        convenio.convenente_nome,
        convenio.convenente_cnpj,
        convenio.municipio,
        convenio.uf,
        convenio.tipo_contratacao,
        convenio.tipologia,
        convenio.programa,
        convenio.orgao,
        convenio.situacao,
        convenio.situacao_contratacao,
        convenio.ano_instrumento,
        convenio.data_publicacao,
        convenio.data_inicio_vigencia,
        convenio.data_final_vigencia,
        convenio.data_conclusao,
        convenio.valor_global,
        convenio.valor_repasse,
        convenio.valor_empenhado,
        convenio.valor_desembolsado,
        convenio.valor_contrapartida,
        convenio.valor_saldo_conta,
        convenio.valor_pago_fornecedor,
        convenio.cnes,
    ]


def _tabela_convenios(convenios: Sequence[Convenio], nivel: Nivel) -> tuple[list[str], list[list[object]]]:
    completo = nivel == "completo"
    colunas = _COLUNAS_CONVENIO_COMPLETO if completo else _COLUNAS_CONVENIO_SIMPLIFICADO
    linhas = [_linhas_convenio(c, completo=completo) for c in convenios]
    return colunas, linhas


_COLUNAS_PROPOSTA_SIMPLIFICADO = ["Proposta", "Parceria", "Proponente", "Programa", "Situação", "Valor global"]
_COLUNAS_PROPOSTA_COMPLETO = [
    "Proposta",
    "Parceria",
    "Proponente",
    "CNPJ",
    "Município",
    "UF",
    "Programa",
    "Componente",
    "Equipamento detectado",
    "Situação",
    "Tem parceria formalizada",
    "Valor global",
    "Data da proposta",
    "CNES",
]
_MOEDA_PROPOSTA = ["Valor global"]
_DATA_PROPOSTA = ["Data da proposta"]


def _linhas_proposta(proposta: PropostaCandidata, *, completo: bool) -> list[object]:
    if not completo:
        return [
            proposta.id_proposta,
            proposta.cd_parceria,
            proposta.nm_proponente,
            proposta.nm_programa,
            proposta.situacao_proposta,
            proposta.vl_global_proposta,
        ]
    return [
        proposta.id_proposta,
        proposta.cd_parceria,
        proposta.nm_proponente,
        proposta.cnpj_ente_recebedor,
        proposta.municipio,
        proposta.uf,
        proposta.nm_programa,
        proposta.componente_batido,
        proposta.equipamento_detectado,
        proposta.situacao_proposta,
        "Sim" if proposta.tem_parceria else "Não",
        proposta.vl_global_proposta,
        proposta.data_proposta,
        proposta.cnes,
    ]


def _tabela_propostas(propostas: Sequence[PropostaCandidata], nivel: Nivel) -> tuple[list[str], list[list[object]]]:
    completo = nivel == "completo"
    colunas = _COLUNAS_PROPOSTA_COMPLETO if completo else _COLUNAS_PROPOSTA_SIMPLIFICADO
    linhas = [_linhas_proposta(p, completo=completo) for p in propostas]
    return colunas, linhas


_COLUNAS_MONITORAMENTO_SIMPLIFICADO = ["Convênio", "Convenente", "Município", "UF", "Tipo de contratação", "Fase atual"]
_COLUNAS_MONITORAMENTO_TIMELINE = [
    "Convênio",
    "Convenente",
    "Componente",
    "Marco",
    "Grupo",
    "Data ocorrência",
    "Data prevista",
    "Status regulatório",
    "Nº documento",
    "Validade",
    "Observação",
]
_DATA_MONITORAMENTO_TIMELINE = ["Data ocorrência", "Data prevista", "Validade"]


def _tabela_monitoramento_simplificado(
    instrumentos: Sequence[InstrumentoComFase],
) -> tuple[list[str], list[list[object]]]:
    linhas: list[list[object]] = [
        [
            i.instrumento.nr_convenio,
            i.instrumento.nome_convenente,
            i.instrumento.municipio,
            i.instrumento.uf,
            i.instrumento.tipo_contratacao,
            i.fase_atual,
        ]
        for i in instrumentos
    ]
    return _COLUNAS_MONITORAMENTO_SIMPLIFICADO, linhas


def _linhas_timeline_instrumento(
    db: Session, item: InstrumentoComFase, marcos: dict[int, MarcoCatalogo]
) -> list[list[object]]:
    inst = item.instrumento
    eventos = monitoramento_repo.listar_eventos_do_instrumento(db, inst.id)
    if not eventos:
        linha_sem_evento: list[object] = [
            inst.nr_convenio,
            inst.nome_convenente,
            inst.componente,
            "— nenhum evento registrado —",
        ]
        linha_sem_evento.extend([None] * 7)
        return [linha_sem_evento]
    linhas: list[list[object]] = []
    for evento in sorted(eventos, key=lambda e: e.data_ocorrencia or e.data_prevista or date.min):
        marco = marcos.get(evento.marco_id)
        linhas.append(
            [
                inst.nr_convenio,
                inst.nome_convenente,
                inst.componente,
                marco.rotulo if marco else None,
                _ROTULO_GRUPO_MARCO.get(marco.grupo) if marco else None,
                evento.data_ocorrencia,
                evento.data_prevista,
                evento.status_regulatorio,
                evento.numero_documento,
                evento.data_validade,
                evento.observacao,
            ]
        )
    return linhas


def _tabela_monitoramento_timeline(
    db: Session, instrumentos: Sequence[InstrumentoComFase]
) -> tuple[list[str], list[list[object]]]:
    marcos = {m.id: m for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)}
    linhas: list[list[object]] = []
    for item in instrumentos:
        linhas.extend(_linhas_timeline_instrumento(db, item, marcos))
    return _COLUNAS_MONITORAMENTO_TIMELINE, linhas


def _resumo_executivo(
    convenios: Sequence[Convenio], propostas: Sequence[PropostaCandidata], instrumentos: Sequence[InstrumentoComFase]
) -> tuple[list[str], list[list[object]]]:
    valor_total_convenios = sum(float(c.valor_global or 0) for c in convenios)
    propostas_aprovadas = sum(1 for p in propostas if p.situacao_proposta == "Aprovada")
    distribuicao_fase = Counter(i.fase_atual for i in instrumentos)
    colunas = ["Indicador", "Valor"]
    linhas: list[list[object]] = [
        ["Convênios encontrados", len(convenios)],
        ["Valor global total dos convênios", valor_total_convenios],
        ["Propostas candidatas encontradas", len(propostas)],
        ["Propostas aprovadas", propostas_aprovadas],
        ["Instrumentos monitorados", len(instrumentos)],
    ]
    for fase, quantidade in distribuicao_fase.most_common():
        linhas.append([f"Instrumentos na fase '{fase}'", quantidade])
    return colunas, linhas


def _montar_instrumentos_repasse_xlsx(db: Session, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    convenios = _convenios(db, filtro)
    propostas = _propostas(db, filtro)
    instrumentos = _instrumentos(db, filtro)

    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_tabela(
        pasta, "Resumo", *_resumo_executivo(convenios, propostas, instrumentos), colunas_moeda=["Valor"]
    )
    colunas_conv, linhas_conv = _tabela_convenios(convenios, nivel)
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Convênios",
        colunas_conv,
        linhas_conv,
        colunas_moeda=_MOEDA_CONVENIO_COMPLETO if nivel == "completo" else _MOEDA_CONVENIO_SIMPLIFICADO,
        colunas_data=_DATA_CONVENIO_COMPLETO if nivel == "completo" else [],
    )
    colunas_prop, linhas_prop = _tabela_propostas(propostas, nivel)
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Propostas candidatas",
        colunas_prop,
        linhas_prop,
        colunas_moeda=_MOEDA_PROPOSTA,
        colunas_data=_DATA_PROPOSTA,
    )
    if nivel == "simplificado":
        colunas_mon, linhas_mon = _tabela_monitoramento_simplificado(instrumentos)
        xlsx_builder.escrever_aba_tabela(pasta, "Monitoramento", colunas_mon, linhas_mon)
    else:
        colunas_mon, linhas_mon = _tabela_monitoramento_timeline(db, instrumentos)
        xlsx_builder.escrever_aba_tabela(
            pasta, "Monitoramento (timeline)", colunas_mon, linhas_mon, colunas_data=_DATA_MONITORAMENTO_TIMELINE
        )
    return xlsx_builder.gerar_bytes(pasta)


def _bloco_convenio_narrativo(documento: DocumentType, convenio: Convenio) -> None:
    docx_builder.adicionar_titulo(documento, f"{convenio.convenente_nome} -- Convênio {convenio.numero}", nivel=3)
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Objeto", convenio.objeto or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Convenente", f"{convenio.convenente_nome} (CNPJ {convenio.convenente_cnpj or '—'})"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Localização", f"{convenio.municipio or '—'}/{convenio.uf or '—'}"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Tipo de contratação",
        f"{convenio.tipo_contratacao or '—'} ({convenio.tipologia or 'sem tipologia'})",
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Programa", convenio.programa or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Situação", f"{convenio.situacao or '—'} ({convenio.situacao_contratacao or 'normal'})"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Vigência",
        f"{formatar_data(convenio.data_inicio_vigencia)} a {formatar_data(convenio.data_final_vigencia)}",
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Financeiro",
        f"Global {formatar_moeda(convenio.valor_global)} -- "
        f"Repasse {formatar_moeda(convenio.valor_repasse)} -- "
        f"Contrapartida {formatar_moeda(convenio.valor_contrapartida)} -- "
        f"Desembolsado {formatar_moeda(convenio.valor_desembolsado)}",
    )
    if convenio.cnes:
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "CNES", convenio.cnes)


def _bloco_monitoramento_narrativo(
    documento: DocumentType,
    db: Session,
    item: InstrumentoComFase,
    marcos: dict[int, MarcoCatalogo],
    contador: Iterator[int],
) -> None:
    inst = item.instrumento
    docx_builder.adicionar_titulo(documento, f"{inst.nome_convenente} -- Convênio {inst.nr_convenio}", nivel=3)
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Componente", inst.componente or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação atual", item.fase_atual)
    colunas = _COLUNAS_MONITORAMENTO_TIMELINE[3:]
    linhas = [linha[3:] for linha in _linhas_timeline_instrumento(db, item, marcos)]
    linhas_texto = docx_builder.linhas_como_texto(colunas, linhas, colunas_data=_DATA_MONITORAMENTO_TIMELINE)
    docx_builder.adicionar_tabela(documento, colunas, linhas_texto)
    docx_builder.adicionar_legenda_tabela(documento, next(contador), f"Linha do tempo -- Convênio {inst.nr_convenio}.")
    docx_builder.adicionar_fonte(documento, "Monitoramento interno, SIGEO.")


def _montar_instrumentos_repasse_docx(db: Session, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    convenios = _convenios(db, filtro)
    propostas = _propostas(db, filtro)
    instrumentos = _instrumentos(db, filtro)

    documento = docx_builder.novo_documento(f"Instrumentos e repasse -- {filtro.titulo()}")
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    contador: Iterator[int] = itertools.count(1)

    docx_builder.adicionar_titulo(documento, "Resumo executivo")
    colunas_resumo, linhas_resumo = _resumo_executivo(convenios, propostas, instrumentos)
    docx_builder.adicionar_tabela(
        documento,
        colunas_resumo,
        docx_builder.linhas_como_texto(colunas_resumo, linhas_resumo, colunas_moeda=["Valor"]),
    )
    docx_builder.adicionar_legenda_tabela(documento, next(contador), "Resumo executivo do recorte selecionado.")
    docx_builder.adicionar_fonte(
        documento,
        "Convênios (SICONV/TransfereGov), propostas candidatas (TransfereGov) e monitoramento interno, SIGEO.",
    )

    docx_builder.adicionar_titulo(documento, "Convênios firmados")
    if nivel == "simplificado" or not convenios:
        colunas, linhas = _tabela_convenios(convenios, nivel)
        docx_builder.adicionar_tabela(
            documento,
            colunas,
            docx_builder.linhas_como_texto(colunas, linhas, colunas_moeda=_MOEDA_CONVENIO_SIMPLIFICADO),
        )
        docx_builder.adicionar_legenda_tabela(documento, next(contador), "Convênios firmados no recorte selecionado.")
        docx_builder.adicionar_fonte(documento, "Convenio (SICONV/TransfereGov), SIGEO.")
    else:
        for convenio in convenios:
            _bloco_convenio_narrativo(documento, convenio)

    docx_builder.adicionar_titulo(documento, "Propostas candidatas (linhas de financiamento)")
    colunas_prop, linhas_prop = _tabela_propostas(propostas, "simplificado")
    docx_builder.adicionar_tabela(
        documento,
        colunas_prop,
        docx_builder.linhas_como_texto(colunas_prop, linhas_prop, colunas_moeda=_MOEDA_PROPOSTA),
    )
    docx_builder.adicionar_legenda_tabela(
        documento, next(contador), "Propostas candidatas (linhas de financiamento) ainda não convertidas em convênio."
    )
    docx_builder.adicionar_fonte(documento, "Propostas candidatas (TransfereGov), SIGEO.")

    docx_builder.adicionar_titulo(documento, "Monitoramento interno")
    if nivel == "simplificado" or not instrumentos:
        colunas, linhas = _tabela_monitoramento_simplificado(instrumentos)
        docx_builder.adicionar_tabela(documento, colunas, docx_builder.linhas_como_texto(colunas, linhas))
        docx_builder.adicionar_legenda_tabela(documento, next(contador), "Fase atual dos instrumentos monitorados.")
        docx_builder.adicionar_fonte(documento, "Monitoramento interno, SIGEO.")
    else:
        marcos = {m.id: m for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)}
        for item in instrumentos:
            _bloco_monitoramento_narrativo(documento, db, item, marcos, contador)

    return docx_builder.gerar_bytes(documento)


def _montar_instrumentos_repasse(db: Session, formato: Formato, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    if formato == "xlsx":
        return _montar_instrumentos_repasse_xlsx(db, nivel, filtro)
    return _montar_instrumentos_repasse_docx(db, nivel, filtro)


def montar_relatorio(
    *, db: Session, formato: Formato, nivel: Nivel, tipo_relatorio: TipoRelatorio, filtro: FiltroRelatorio
) -> bytes:
    if tipo_relatorio == "analise_merito":
        if filtro.escopo == "cnes":
            raise ValidationError(
                "Análise de mérito não tem granularidade por estabelecimento (CNES) -- "
                "cobertura/déficit é calculada por macrorregião/município. Escolha outro escopo."
            )
        return _montar_analise_merito(db, formato, nivel, filtro)
    return _montar_instrumentos_repasse(db, formato, nivel, filtro)
