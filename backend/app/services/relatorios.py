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
import re
from collections import Counter, defaultdict
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from docx.document import Document as DocumentType
from sqlalchemy.orm import Session

from app.db.models import (
    AcaoMonitoramento,
    Competency,
    Convenio,
    EventoMarco,
    Execution,
    MarcoCatalogo,
    MarcoGrupo,
    PropostaCandidata,
)
from app.domain_errors import ValidationError
from app.geo_reference import NOME_POR_UF, REGIOES, ufs_da_regiao
from app.pipeline.texto import capitalizar_nome, parsear_valor_brasileiro
from app.reports import docx_builder, xlsx_builder
from app.reports.formatacao import formatar_data, formatar_moeda
from app.repositories import cobertura_relatorio as cobertura_repo
from app.repositories import convenios as convenios_repo
from app.repositories import equipamento_marcadores as equipamento_marcadores_repo
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
    # Período de 2 datas (Bloco 8, Plan Mode relatorios 2026-09-27 -- pedido
    # do usuário: "a data deve ser dois campos pra gente escolher o
    # período"), substitui o antigo `ano` único. Só se aplica a
    # `instrumentos_repasse` -- `analise_merito` não tem dimensão de ano
    # civil (decisão do usuário, ver plan-mode).
    ano_inicio: int | None = None
    ano_fim: int | None = None
    # Filtros novos (Plan Mode relatorios 2026-09-25, Bloco 7 -- "mesmos
    # filtros que temos no instrumentos/repasses") -- só aplicados na
    # seção de Convênios (situacao/programa/tipo_contratacao/busca) e, onde
    # o campo existe, em Monitoramento (tipo_contratacao/programa) e
    # Propostas (programa/situacao). Não fazem parte da validação de
    # escopo -- opcionais em qualquer combinação.
    situacao: str | None = None
    programa: str | None = None
    tipo_contratacao: str | None = None
    # `equipamento` (Bloco 8 -- achado ao vivo: filtro de Equipamento da UI
    # nunca chegava no arquivo gerado) só filtra Convênios -- mesmo
    # mecanismo de `EquipamentoMarcador` do router `/convenios`. Propostas/
    # Monitoramento não têm essa granularidade hoje.
    equipamento: str | None = None
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
        # Se só 1 dos 2 campos do período vier, o outro assume o mesmo valor
        # (período de 1 ano só, mesmo comportamento do antigo `ano` único).
        if self.ano_inicio is not None and self.ano_fim is None:
            object.__setattr__(self, "ano_fim", self.ano_inicio)
        elif self.ano_fim is not None and self.ano_inicio is None:
            object.__setattr__(self, "ano_inicio", self.ano_fim)
        if self.ano_inicio is not None and self.ano_fim is not None and self.ano_inicio > self.ano_fim:
            raise ValidationError("'ano_inicio' não pode ser depois de 'ano_fim'.")

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
        if self.ano_inicio is None and self.ano_fim is None:
            return base
        if self.ano_inicio == self.ano_fim:
            return f"{base} -- {self.ano_inicio}"
        return f"{base} -- {self.ano_inicio} a {self.ano_fim}"

    def periodo_referencia(self) -> str | None:
        """Texto de "Período de referência" pro cabeçalho do Word (Bloco 8) --
        `None` quando nenhum dos 2 campos foi informado (omite a linha)."""
        if self.ano_inicio is None and self.ano_fim is None:
            return None
        if self.ano_inicio == self.ano_fim:
            return str(self.ano_inicio)
        return f"{self.ano_inicio} a {self.ano_fim}"


def _valor_global_confiavel(convenio: Convenio) -> float | None:
    """Mitigação de um bug real de ingestão achado ao vivo 2026-09-27
    (usuário, convênio 922037 -- "valor global quebrado do portal"):
    `scripts/importar_convenios_banco.py::_num_ou_none` faz `float(v)`
    direto, sem tratar vírgula decimal do SICONV bulk ("VL_GLOBAL_CONV":
    "5928266,99") -- `float("5928266,99")` estoura `ValueError`, o valor
    vira `None` e o import cai pro Portal da Transparência, que pra 3
    convênios confirmados (812878/922037/924078) devolve um valor ~10.000x
    menor que o repasse real. Corrigir a ingestão em si (reprocessar o
    banco) é uma decisão à parte, fora do escopo deste relatório -- aqui só
    EVITA propagar um valor obviamente quebrado: `Valor Global` nunca
    deveria ser menor que `Valor Repasse` (repasse é parte do global)."""
    if (
        convenio.valor_global is not None
        and convenio.valor_repasse is not None
        and convenio.valor_global < convenio.valor_repasse
    ):
        return None
    return convenio.valor_global


def _assunto(db: Session | None, filtro: FiltroRelatorio) -> str:
    """Texto de "Assunto" do cabeçalho (Bloco 8, mockup do usuário --
    `data/relatorios/relatorio_imip.pages`, "Assunto: IMIP (CNES:
    0000434)") -- nome do que foi pesquisado, não só o código."""
    if filtro.escopo == "cnes":
        assert filtro.cnes is not None
        assert db is not None
        estabelecimento = monitoramento_repo.obter_cnes_por_codigo(db, filtro.cnes)
        nome = estabelecimento.nome_estabelecimento if estabelecimento else f"CNES {filtro.cnes}"
        return f"{nome} (CNES: {filtro.cnes})"
    if filtro.escopo == "municipio":
        assert filtro.municipio is not None
        return f"{capitalizar_nome(filtro.municipio)}/{filtro.uf}"
    if filtro.escopo == "uf":
        return f"UF {filtro.uf}"
    if filtro.escopo == "regiao":
        return f"Região {filtro.regiao}"
    return "Brasil"


def _descricao_recorte(filtro: FiltroRelatorio) -> str:
    """Geografia e período compartilhados pelas fontes, sem atribuir a elas
    os filtros exclusivos de convênios."""
    if filtro.escopo == "brasil":
        lugar = "no Brasil"
    elif filtro.escopo == "regiao":
        lugar = f"na região {filtro.regiao}"
    elif filtro.escopo == "uf":
        nome = NOME_POR_UF.get(filtro.uf or "", filtro.uf or "")
        if filtro.uf == "DF":
            lugar = "no Distrito Federal"
        else:
            artigo = (
                "da"
                if filtro.uf in {"BA", "PB"}
                else "do"
                if filtro.uf in {"AC", "AP", "AM", "CE", "ES", "MA", "PA", "PR", "PI", "RJ", "RN", "RS", "TO"}
                else "de"
            )
            lugar = f"no estado {artigo} {nome}"
    elif filtro.escopo == "municipio":
        lugar = f"no município de {capitalizar_nome(filtro.municipio or '')}/{filtro.uf}"
    else:
        lugar = f"no CNES {filtro.cnes}"

    if filtro.ano_inicio is None:
        return lugar
    if filtro.ano_inicio == filtro.ano_fim:
        return f"{lugar} no ano de {filtro.ano_inicio}"
    return f"{lugar} no período de {filtro.ano_inicio} a {filtro.ano_fim}"


def _legendas_resumo(filtro: FiltroRelatorio) -> tuple[str, str, str]:
    recorte = _descricao_recorte(filtro)
    filtros_convenios = [
        f"{rotulo}: {valor}"
        for rotulo, valor in (
            ("situação", filtro.situacao),
            ("programa", filtro.programa),
            ("equipamento", filtro.equipamento),
            ("busca", filtro.busca),
        )
        if valor
    ]
    restricoes = f" Convênios filtrados por {'; '.join(filtros_convenios)}." if filtros_convenios else ""
    tipo_instrumentos = (
        f" Convênios e monitoramento filtrados por tipo de contratação: {filtro.tipo_contratacao}."
        if filtro.tipo_contratacao
        else ""
    )
    tipo_equipamentos = (
        f" Convênios filtrados por tipo de contratação: {filtro.tipo_contratacao}." if filtro.tipo_contratacao else ""
    )
    contexto_propostas = (
        "ano da proposta; sem filtros de convênios ou monitoramento"
        if filtro.ano_inicio is not None
        else "sem filtros de convênios ou monitoramento"
    )
    ressalva_monitoramento = ""
    if (
        filtro.ano_inicio is not None
        and filtro.ano_fim is not None
        and filtro.ano_inicio <= date.today().year <= filtro.ano_fim
    ):
        ressalva_monitoramento = " A carteira monitorada inclui instrumentos em andamento de anos anteriores."
    return (
        f"Instrumentos e programas {recorte}.{restricoes}{tipo_instrumentos}{ressalva_monitoramento}",
        f"Propostas candidatas {recorte} ({contexto_propostas}).",
        f"Equipamentos identificados em convênios {recorte}.{restricoes}{tipo_equipamentos}",
    )


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
        if nivel == "simplificado" and filtro.escopo != "municipio":
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


def _competencias_publicadas(db: Session) -> dict[str, str]:
    resultado: dict[str, str] = {}
    for familia in execucoes_repo.listar_familias_publicadas(db):
        execucao_id = execucoes_repo.obter_execucao_publicada_mais_recente(db, familia)
        execucao = db.get(Execution, execucao_id) if execucao_id is not None else None
        competencia = db.get(Competency, execucao.competency_id) if execucao else None
        if competencia:
            resultado[familia] = competencia.label
    return resultado


def _linhas_leitura(
    filtro: FiltroRelatorio,
    nivel: Nivel,
    tipo: TipoRelatorio,
    contagens: dict[str, int],
    competencias: dict[str, str] | None = None,
) -> list[list[object]]:
    linhas: list[list[object]] = [
        ["Relatório", "Análise de mérito" if tipo == "analise_merito" else "Instrumentos e repasse"],
        ["Recorte", filtro.titulo()],
        ["Nível", nivel.capitalize()],
        [
            "Gerado em (Brasília)",
            datetime.now(timezone.utc).astimezone(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y %H:%M"),
        ],
    ]
    if tipo == "analise_merito":
        linhas.append(["Fonte", "Cobertura publicada no SIGEO; oferta SUS e em uso (CNES/ElastiCNES)"])
        linhas.append(["Grão", "Município" if nivel == "completo" or filtro.escopo == "municipio" else "Macrorregião"])
        for familia, competencia in (competencias or {}).items():
            linhas.append([f"Competência {familia}", competencia])
        linhas.append(["Ano civil", "Não aplicável à cobertura; cada família usa sua execução publicada."])
    else:
        linhas.extend(
            [
                ["Fontes", "Convênios: SICONV/TransfereGov; propostas: TransfereGov; monitoramento: cadastro interno"],
                [
                    "Filtros gerais",
                    "Geografia e CNES; período por ano do instrumento/proposta. Monitoramento inclui fase aberta no ano corrente.",
                ],
                [
                    "Filtros exclusivos de convênios",
                    "Situação, programa, equipamento e busca não filtram propostas nem monitoramento.",
                ],
                ["Tipo de contratação", "Filtra convênios e monitoramento; não filtra propostas."],
                ["Valor", "Soma apenas valores informados; não estima registros sem valor."],
                ["Contagem de convênios", contagens.get("convenios", 0)],
                ["Contagem de propostas", contagens.get("propostas", 0)],
                ["Contagem de instrumentos monitorados", contagens.get("monitoramento", 0)],
            ]
        )
        for rotulo, valor in (
            ("Situação do convênio", filtro.situacao),
            ("Programa do convênio", filtro.programa),
            ("Tipo de contratação", filtro.tipo_contratacao),
            ("Equipamento do convênio", filtro.equipamento),
            ("Busca em convênios", filtro.busca),
        ):
            if valor:
                linhas.append([rotulo, valor])
    return linhas


def _montar_analise_merito(db: Session, formato: Formato, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    secoes = _secao_cobertura_linhas(db, filtro, nivel)
    competencias = _competencias_publicadas(db)
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
        xlsx_builder.escrever_aba_tabela(
            pasta,
            "Leitura",
            ["Campo", "Valor"],
            _linhas_leitura(filtro, nivel, "analise_merito", {}, competencias),
        )
        for titulo_aba, colunas, linhas in secoes:
            xlsx_builder.escrever_aba_tabela(pasta, titulo_aba, colunas, linhas)
        return xlsx_builder.gerar_bytes(pasta)
    documento = docx_builder.novo_documento(f"Análise de mérito -- {filtro.titulo()}")
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo(documento, "Cobertura por família com execução publicada; oferta SUS e em uso.")
    for titulo_secao, colunas, linhas in secoes:
        docx_builder.adicionar_titulo(documento, titulo_secao)
        familia = titulo_secao.removeprefix("Cobertura ")
        if familia in competencias:
            docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Competência", competencias[familia])
        docx_builder.adicionar_tabela(
            documento,
            colunas,
            docx_builder.linhas_como_texto(
                colunas, linhas, colunas_inteiro=["População", "Necessário", "Disponível SUS", "Saldo"]
            ),
        )
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
        ano_inicio=filtro.ano_inicio,
        ano_fim=filtro.ano_fim,
        situacao=filtro.situacao,
        programa=filtro.programa,
        tipo_contratacao=filtro.tipo_contratacao,
        equipamento=filtro.equipamento,
        busca=filtro.busca,
    )


def _propostas(db: Session, filtro: FiltroRelatorio) -> list[PropostaCandidata]:
    # `programa`/`situacao` NÃO são repassados aqui de propósito (achado
    # ao vivo, Bloco 7): `PropostaCandidata.nm_programa`/`situacao_proposta`
    # usam vocabulário do TransfereGov novo, diferente do `Convenio.programa`/
    # `situacao` (SICONV) -- aplicar o mesmo valor filtraria pra um conjunto
    # vazio quase sempre, silenciosamente. `uf`/`ano`/`cnes` são comparáveis
    # 1:1 entre as duas fontes. `cnes` (Bloco 8 -- lembrete do usuário
    # "as propostas devem responder ao filtro também") faltava: sem ele,
    # `escopo=cnes` rodava sem filtro nenhum (`ufs()`/`municipio_do_escopo()`
    # devolvem `None` pra esse escopo por design).
    return propostas_repo.listar_propostas_filtradas(
        db,
        ufs=filtro.ufs(),
        municipio=filtro.municipio_do_escopo(),
        cnes=filtro.cnes_do_escopo(),
        ano_inicio=filtro.ano_inicio,
        ano_fim=filtro.ano_fim,
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
        ano_inicio=filtro.ano_inicio,
        ano_fim=filtro.ano_fim,
        tipo_contratacao=filtro.tipo_contratacao,
        limite_estrito=True,
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
            capitalizar_nome(convenio.municipio),
            convenio.uf,
            convenio.tipo_contratacao,
            convenio.situacao,
            convenio.ano_instrumento,
            _valor_global_confiavel(convenio),
        ]
    return [
        convenio.numero,
        convenio.convenente_nome,
        convenio.convenente_cnpj,
        capitalizar_nome(convenio.municipio),
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
        _valor_global_confiavel(convenio),
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
        capitalizar_nome(proposta.municipio),
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
            capitalizar_nome(i.instrumento.municipio),
            i.instrumento.uf,
            i.instrumento.tipo_contratacao,
            i.fase_atual,
        ]
        for i in instrumentos
    ]
    return _COLUNAS_MONITORAMENTO_SIMPLIFICADO, linhas


_PADRAO_PROVENIENCIA_IMPORTACAO = re.compile(
    r"\s*Importado de .*?sha256:[0-9a-f]+(?:, linha \d+)?\.\s*$", re.IGNORECASE
)


def _observacao_publica(observacao: str | None) -> str | None:
    """Remove o rodapé de proveniência de importação em lote ("Importado de
    Controle PERSUS.xlsx · sha256:..., linha N.") do texto exibido no
    relatório -- achado ao vivo (Bloco 8, "dados feios"): 532 dos 984
    eventos carregados por `scripts/importar_programas_monitoramento.py`
    têm essa marca dentro do próprio campo `observacao`, útil como
    auditoria interna (mesmo espírito de `chave_origem`, nunca exposto na
    API/UI) mas sem sentido pra quem lê um relatório institucional. Só
    afeta a APRESENTAÇÃO -- o campo no banco continua intacto."""
    if not observacao:
        return observacao
    texto = _PADRAO_PROVENIENCIA_IMPORTACAO.sub("", observacao).strip()
    return texto or None


def _linhas_timeline_instrumento(
    db: Session,
    item: InstrumentoComFase,
    marcos: dict[int, MarcoCatalogo],
    eventos: Sequence[EventoMarco] | None = None,
) -> list[list[object]]:
    inst = item.instrumento
    if eventos is None:
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
                _observacao_publica(evento.observacao),
            ]
        )
    return linhas


def _tabela_monitoramento_timeline(
    db: Session, instrumentos: Sequence[InstrumentoComFase]
) -> tuple[list[str], list[list[object]]]:
    marcos = {m.id: m for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)}
    eventos_por_id = monitoramento_repo.listar_eventos_por_instrumentos(
        db, {item.instrumento.id for item in instrumentos}
    )
    linhas: list[list[object]] = []
    for item in instrumentos:
        linhas.extend(_linhas_timeline_instrumento(db, item, marcos, eventos_por_id.get(item.instrumento.id, [])))
    return _COLUNAS_MONITORAMENTO_TIMELINE, linhas


_ORDEM_TIPO_CONTRATACAO = ["Convênio", "FAF", "TED", "PERSUS I", "PERSUS II", "PRONON"]
_ROTULO_TIPO_CONTRATACAO = {"Convênio": "Convênios"}
_MARCO_INAUGURACAO_CODIGO = "cronograma_previsao_inauguracao"
# 3 grupos de origem pro "Informações Detalhadas" (Bloco 8, mockup do
# usuário -- `data/relatorios/relatorio_imip.pages`): Convênio/FAF/TED
# formam 1 grupo (mesmo vocabulário fechado, tratamento igual), PERSUS I/II
# outro. "Outros" (PRONON/tipo não mapeado) cobre o que sobrar -- nunca
# esconder convênio silenciosamente por não bater num dos 2 grupos
# conhecidos do mockup.
_GRUPOS_ORIGEM_CONVENIO: list[tuple[str, set[str]]] = [
    ("Convênios, TED e FAF:", {"Convênio", "FAF", "TED"}),
    ("PERSUS I e II:", {"PERSUS I", "PERSUS II"}),
]
_ROTULO_OUTROS_ORIGEM = "Outros instrumentos:"


def _valores_por_item_plano(convenio: Convenio) -> dict[str, float]:
    """`siconv_raw.itens_plano_aplicacao` (achado ao vivo 2026-09-27,
    lembrete do usuário: "no itens DL e no pagamentos ao fornecedor tem
    info do equipamento individual") tem `VALOR_TOTAL_ITEM` por item --
    `EquipamentoMarcador.descricao_original` é literalmente
    `item['DESCRICAO_ITEM']` sem alteração (mesma origem, ver
    `scripts/preencher_marcadores_itens_plano.sql`), então dá pra casar
    marcador -> valor por igualdade exata de string. Quando 2 itens têm a
    mesma descrição (não deveria acontecer -- cada instância já vem com
    sufixo numérico, ex. "Ultrassom Diagnóstico 1"/"...2") soma os 2."""
    itens = (convenio.siconv_raw or {}).get("itens_plano_aplicacao") or []
    valores: dict[str, float] = defaultdict(float)
    for item in itens:
        descricao = item.get("DESCRICAO_ITEM")
        valor = parsear_valor_brasileiro(item.get("VALOR_TOTAL_ITEM"))
        if descricao and valor is not None:
            valores[descricao] += valor
    return dict(valores)


def _carregar_equipamentos_por_convenio(
    db: Session, convenios: Sequence[Convenio]
) -> dict[int, list[tuple[str, float | None]]]:
    """`(nome do equipamento, valor individual ou None quando não achado no
    plano de aplicação)` por convênio."""
    marcadores = equipamento_marcadores_repo.listar_por_origens(db, convenio_ids={c.id for c in convenios})
    convenios_por_id = {c.id: c for c in convenios}
    resultado: dict[int, list[tuple[str, float | None]]] = {}
    for (origem, convenio_id), itens in marcadores.items():
        if origem != "convenio":
            continue
        convenio = convenios_por_id.get(convenio_id)
        valores_item = _valores_por_item_plano(convenio) if convenio else {}
        resultado[convenio_id] = [(m.nome, valores_item.get(m.descricao_original)) for m in itens]
    return resultado


def _resumo_instrumentos_programas(
    convenios: Sequence[Convenio], instrumentos: Sequence[InstrumentoComFase]
) -> tuple[list[str], list[list[object]]]:
    """1ª tabela do "Resumo executivo" (Bloco 8, mockup do usuário) --
    contagem + valor global conhecido por `tipo_contratacao`, mais a contagem (sem
    valor financeiro -- é acompanhamento) de instrumentos monitorados
    internamente."""
    colunas = ["Instrumentos/Programas", "Quantidade", "Valor"]
    contagem: Counter[str] = Counter()
    com_valor: Counter[str] = Counter()
    valor_por_tipo: dict[str, float] = defaultdict(float)
    for c in convenios:
        tipo = c.tipo_contratacao or "Convênio"
        contagem[tipo] += 1
        valor = _valor_global_confiavel(c)
        if valor is not None:
            com_valor[tipo] += 1
            valor_por_tipo[tipo] += float(valor)
    linhas: list[list[object]] = []
    tipos_em_ordem = [t for t in _ORDEM_TIPO_CONTRATACAO if t in contagem]
    tipos_em_ordem += sorted(t for t in contagem if t not in _ORDEM_TIPO_CONTRATACAO)
    for tipo in tipos_em_ordem:
        linhas.append(
            [
                _ROTULO_TIPO_CONTRATACAO.get(tipo, tipo),
                contagem[tipo],
                valor_por_tipo[tipo] if com_valor[tipo] else None,
            ]
        )
    linhas.append(["Instrumentos monitorados (carteira de acompanhamento)", len(instrumentos), None])
    return colunas, linhas


_SITUACOES_PROPOSTA = [
    ("Aprovada", "Propostas Aprovadas"),
    ("Rejeitada", "Propostas Rejeitadas"),
    ("Em Análise", "Propostas em Análise"),
    ("Em Elaboração", "Propostas em Elaboração"),
]


def _resumo_propostas(propostas: Sequence[PropostaCandidata]) -> tuple[list[str], list[list[object]]]:
    """2ª tabela -- por `situacao_proposta` (as 4 únicas confirmadas contra
    o banco real -- Bloco 8) + "Parcerias Firmadas" (`tem_parceria`)."""
    colunas = ["Propostas candidatas", "Quantidade", "Valor"]
    linhas: list[list[object]] = []
    for chave, rotulo in _SITUACOES_PROPOSTA:
        itens = [p for p in propostas if p.situacao_proposta == chave]
        linhas.append([rotulo, len(itens), sum(float(p.vl_global_proposta or 0) for p in itens)])
    parcerias = [p for p in propostas if p.tem_parceria]
    linhas.append(
        [
            "Parcerias firmadas (subconjunto das situações acima)",
            len(parcerias),
            sum(float(p.vl_global_proposta or 0) for p in parcerias),
        ]
    )
    return colunas, linhas


def _resumo_equipamentos(
    equipamentos_por_convenio: dict[int, list[tuple[str, float | None]]],
) -> tuple[list[str], list[list[object]]]:
    """3ª tabela -- agregado de `EquipamentoMarcador` por tipo entre todos
    os convênios do recorte. "Valor" soma o `VALOR_TOTAL_ITEM` do plano de
    aplicação (achado ao vivo 2026-09-27, lembrete do usuário). A soma
    contempla somente ocorrências com valor conhecido; as demais não são
    tratadas como zero."""
    colunas = ["Equipamentos", "Quantidade", "Valor"]
    contagem: Counter[str] = Counter()
    com_valor: Counter[str] = Counter()
    valor_por_nome: dict[str, float] = defaultdict(float)
    for itens in equipamentos_por_convenio.values():
        for nome, valor in itens:
            contagem[nome] += 1
            if valor is not None:
                valor_por_nome[nome] += valor
                com_valor[nome] += 1
    linhas: list[list[object]] = [
        [nome, quantidade, valor_por_nome[nome] if com_valor[nome] else None]
        for nome, quantidade in sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return colunas, linhas


def _montar_instrumentos_repasse_xlsx(db: Session, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    convenios = _convenios(db, filtro)
    propostas = _propostas(db, filtro)
    instrumentos = _instrumentos(db, filtro)
    equipamentos_por_convenio = _carregar_equipamentos_por_convenio(db, convenios)

    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Leitura",
        ["Campo", "Valor"],
        _linhas_leitura(
            filtro,
            nivel,
            "instrumentos_repasse",
            {"convenios": len(convenios), "propostas": len(propostas), "monitoramento": len(instrumentos)},
        ),
    )
    xlsx_builder.escrever_aba_tabela(
        pasta, "Resumo", *_resumo_instrumentos_programas(convenios, instrumentos), colunas_moeda=["Valor"]
    )
    xlsx_builder.escrever_aba_tabela(
        pasta, "Resumo (Propostas)", *_resumo_propostas(propostas), colunas_moeda=["Valor"]
    )
    colunas_equip, linhas_equip = _resumo_equipamentos(equipamentos_por_convenio)
    xlsx_builder.escrever_aba_tabela(
        pasta,
        "Resumo (Equipamentos)",
        colunas_equip,
        linhas_equip or [["Nenhum equipamento identificado", 0, None]],
        colunas_moeda=["Valor"],
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


def _formatar_ultima_acao(acao: AcaoMonitoramento) -> str:
    if acao.data_conclusao:
        return f"{acao.descricao} (concluída em {formatar_data(acao.data_conclusao)})"
    if acao.data_prevista:
        return f"{acao.descricao} (prevista para {formatar_data(acao.data_prevista)})"
    return acao.descricao


def _formatar_ultimo_evento(evento: EventoMarco, marcos: dict[int, MarcoCatalogo]) -> str:
    marco = marcos.get(evento.marco_id)
    rotulo = marco.rotulo if marco else "Marco"
    data = evento.data_ocorrencia or evento.data_prevista
    return f"{rotulo} ({formatar_data(data)})" if data else rotulo


def _data_inauguracao_previsao(fase_atual: str, eventos_inauguracao: Sequence[EventoMarco]) -> str:
    """Regra exata do usuário (Bloco 8): PERSUS/instrumento CONCLUÍDO usa a
    data de inauguração REAL (`data_ocorrencia`); em andamento mostra a
    PREVISÃO (`data_prevista`) -- mesmo evento (marco
    `cronograma_previsao_inauguracao`) carrega os 2 campos."""
    if not eventos_inauguracao:
        return "—"
    evento = eventos_inauguracao[0]
    if fase_atual == "Concluído" and evento.data_ocorrencia:
        return formatar_data(evento.data_ocorrencia)
    if evento.data_prevista:
        return f"{formatar_data(evento.data_prevista)} (previsão)"
    if evento.data_ocorrencia:
        return formatar_data(evento.data_ocorrencia)
    return "—"


_SITUACAO_SEM_MONITORAMENTO_ESPERADO = "Em contratação"


_COLUNAS_ACOES_BLOCO = ["Descrição", "Responsável", "Prevista", "Conclusão"]
_DATA_ACOES_BLOCO = ["Prevista", "Conclusão"]
# Timeline por instrumento (Fase 2) reaproveita `_linhas_timeline_instrumento`
# (mesma função já usada pela aba "Monitoramento (timeline)" do xlsx) --
# descarta as 3 primeiras colunas (Convênio/Convenente/Componente), já
# implícitas no bloco narrativo em volta, e a última ("Observação" --
# pedido do usuário depois de ver a amostra: "pode tirar o observação").
_COLUNAS_TIMELINE_BLOCO = _COLUNAS_MONITORAMENTO_TIMELINE[3:-1]
_DATA_TIMELINE_BLOCO = _DATA_MONITORAMENTO_TIMELINE


def _tabela_acoes_bloco(
    documento: DocumentType,
    db: Session,
    instrumento_id: int,
    acoes: Sequence[AcaoMonitoramento] | None = None,
) -> None:
    """Lista completa de `AcaoMonitoramento` do instrumento (Fase 2, nível
    Completo) -- "mais etapas, não só a última" (pedido do usuário ao
    comparar com o exemplo do mockup)."""
    docx_builder.adicionar_titulo(documento, "Ações", nivel=4)
    if acoes is None:
        acoes = monitoramento_repo.listar_acoes_do_instrumento(db, instrumento_id)
    if not acoes:
        docx_builder.adicionar_paragrafo(documento, "— nenhuma ação registrada —")
        return
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, (a.responsavel_id for a in acoes))
    linhas: list[list[object]] = [
        [
            acao.descricao,
            (nomes.get(acao.responsavel_id) if acao.responsavel_id else None) or acao.responsavel or "—",
            acao.data_prevista,
            acao.data_conclusao,
        ]
        for acao in acoes
    ]
    docx_builder.adicionar_tabela(
        documento,
        _COLUNAS_ACOES_BLOCO,
        docx_builder.linhas_como_texto(_COLUNAS_ACOES_BLOCO, linhas, colunas_data=_DATA_ACOES_BLOCO),
    )


def _secao_monitoramento_interno(
    documento: DocumentType,
    db: Session,
    inst: InstrumentoComFase | None,
    marco_inauguracao_id: int | None,
    situacao_convenio: str | None = None,
    *,
    nivel: Nivel = "simplificado",
    eventos: Sequence[EventoMarco] | None = None,
    acoes: Sequence[AcaoMonitoramento] | None = None,
    marcos: dict[int, MarcoCatalogo] | None = None,
) -> None:
    """Seção nova (Bloco 8, mockup do usuário) -- nível Simplificado mostra
    o estado ATUAL do monitoramento interno (4 rótulos, mesmo sem
    instrumento monitorado, reproduzindo exatamente o mockup); nível
    Completo (Fase 2) troca isso pela timeline inteira de eventos mais a
    lista completa de ações, em vez de só o mais recente de cada.

    Achado ao vivo 2026-09-27 (usuário, PERSUS II): "—" sem contexto parece
    lacuna, mas os 50 convênios PERSUS II têm `situacao="Em contratação"`
    sem exceção -- ainda não existe obra/equipamento/licença pra registrar
    nessa fase (só assinatura). Explicita isso em vez de deixar como se
    fosse dado faltando."""
    docx_builder.adicionar_titulo(documento, "Monitoramento Interno", nivel=4)
    if inst is None and situacao_convenio == _SITUACAO_SEM_MONITORAMENTO_ESPERADO:
        docx_builder.adicionar_paragrafo(
            documento,
            "Instrumento ainda em fase de contratação -- sem obra, equipamento ou licença pra registrar "
            "no monitoramento interno até a assinatura/repasse ser concluído.",
        )
        return
    if nivel == "completo":
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação", inst.fase_atual if inst else "—")
        if inst is None:
            docx_builder.adicionar_paragrafo(documento, "— nenhum evento ou ação registrado —")
            return
        if marcos is None:
            marcos = {m.id: m for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)}
        linhas_timeline = [linha[3:-1] for linha in _linhas_timeline_instrumento(db, inst, marcos, eventos)]
        docx_builder.adicionar_tabela(
            documento,
            _COLUNAS_TIMELINE_BLOCO,
            docx_builder.linhas_como_texto(_COLUNAS_TIMELINE_BLOCO, linhas_timeline, colunas_data=_DATA_TIMELINE_BLOCO),
        )
        _tabela_acoes_bloco(documento, db, inst.instrumento.id, acoes)
        return
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação", inst.fase_atual if inst else "—")
    if inst is None:
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Última Ação", "—")
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Último Evento", "—")
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Data de Inauguração/Previsão", "—")
        return
    if acoes is None:
        acoes = monitoramento_repo.listar_acoes_do_instrumento(db, inst.instrumento.id)
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Última Ação", _formatar_ultima_acao(acoes[0]) if acoes else "—"
    )
    if eventos is None:
        eventos = monitoramento_repo.listar_eventos_do_instrumento(db, inst.instrumento.id)
    if marcos is None:
        marcos = {m.id: m for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)}
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Último Evento", _formatar_ultimo_evento(eventos[0], marcos) if eventos else "—"
    )
    eventos_inauguracao = [e for e in eventos if marco_inauguracao_id and e.marco_id == marco_inauguracao_id]
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Data de Inauguração/Previsão", _data_inauguracao_previsao(inst.fase_atual, eventos_inauguracao)
    )


def _tabela_equipamentos_bloco(documento: DocumentType, itens: Sequence[tuple[str, float | None]]) -> None:
    docx_builder.adicionar_titulo(documento, "Equipamentos", nivel=4)
    if not itens:
        docx_builder.adicionar_paragrafo(documento, "— nenhum equipamento identificado —")
        return
    valores_por_nome: dict[str, list[float | None]] = defaultdict(list)
    for nome, valor in itens:
        valores_por_nome[nome].append(valor)
    colunas = ["Equipamentos", "Quantidade", "Valor"]
    linhas: list[list[object]] = []
    for nome, valores in sorted(valores_por_nome.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        preenchidos = [v for v in valores if v is not None]
        linhas.append(
            [
                nome,
                len(valores),
                sum(preenchidos) if preenchidos else None,
            ]
        )
    docx_builder.adicionar_tabela(
        documento, colunas, docx_builder.linhas_como_texto(colunas, linhas, colunas_moeda=["Valor"])
    )


def _tabela_financeiro_bloco(documento: DocumentType, convenio: Convenio) -> None:
    docx_builder.adicionar_titulo(documento, "Financeiro", nivel=4)
    colunas = ["Financeiro", "Valor"]
    linhas: list[list[object]] = [
        ["Valor Global", _valor_global_confiavel(convenio)],
        ["Valor Repasse", convenio.valor_repasse],
        ["Contrapartida", convenio.valor_contrapartida],
    ]
    docx_builder.adicionar_tabela(
        documento, colunas, docx_builder.linhas_como_texto(colunas, linhas, colunas_moeda=["Valor"])
    )


def _bloco_instrumento_narrativo(
    documento: DocumentType,
    db: Session,
    convenio: Convenio,
    inst: InstrumentoComFase | None,
    equipamentos_por_convenio: dict[int, list[tuple[str, float | None]]],
    marco_inauguracao_id: int | None,
    nivel: Nivel,
    eventos_por_id: dict[int, list[EventoMarco]],
    acoes_por_id: dict[int, list[AcaoMonitoramento]],
    marcos: dict[int, MarcoCatalogo],
) -> None:
    # Rótulo dinâmico (achado ao vivo 2026-09-27, usuário: "PERSUS, TED e FAF
    # não são tratados como convênio e sim como instrumentos/programas") --
    # antes o cabeçalho/rótulo dizia "Convênio" pra QUALQUER tipo, inclusive
    # PERSUS I/II (que não são convênio nenhum). Usa o `tipo_contratacao`
    # real do registro.
    tipo_rotulo = convenio.tipo_contratacao or "Convênio"
    docx_builder.adicionar_titulo(documento, f"{convenio.convenente_nome} -- {tipo_rotulo} {convenio.numero}", nivel=3)
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Número", convenio.numero)
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Convenente", convenio.convenente_nome)
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "CNPJ", convenio.convenente_cnpj or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "CNES", convenio.cnes or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Objeto", convenio.objeto or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Município/UF", f"{capitalizar_nome(convenio.municipio) or '—'}/{convenio.uf or '—'}"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Tipo de contratação", convenio.tipo_contratacao or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Situação (Site)",
        f"{convenio.situacao or '—'} ({convenio.situacao_contratacao or 'normal'})",
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento,
        "Vigência",
        f"{formatar_data(convenio.data_inicio_vigencia)} a {formatar_data(convenio.data_final_vigencia)}",
    )
    _secao_monitoramento_interno(
        documento,
        db,
        inst,
        marco_inauguracao_id,
        convenio.situacao,
        nivel=nivel,
        eventos=eventos_por_id.get(inst.instrumento.id, []) if inst else None,
        acoes=acoes_por_id.get(inst.instrumento.id, []) if inst else None,
        marcos=marcos,
    )
    _tabela_equipamentos_bloco(documento, equipamentos_por_convenio.get(convenio.id, []))
    _tabela_financeiro_bloco(documento, convenio)


def _bloco_proposta_narrativo(documento: DocumentType, proposta: PropostaCandidata) -> None:
    docx_builder.adicionar_titulo(documento, f"{proposta.nm_proponente} -- Proposta {proposta.id_proposta}", nivel=3)
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Proponente", f"{proposta.nm_proponente} (CNPJ {proposta.cnpj_ente_recebedor or '—'})"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Município/UF", f"{capitalizar_nome(proposta.municipio) or '—'}/{proposta.uf or '—'}"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Programa", proposta.nm_programa or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Situação", proposta.situacao_proposta or "—")
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Parceria formalizada", "Sim" if proposta.tem_parceria else "Não"
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(
        documento, "Valor global", formatar_moeda(proposta.vl_global_proposta)
    )
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Data da proposta", formatar_data(proposta.data_proposta))


def _montar_instrumentos_repasse_docx(db: Session, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    convenios = _convenios(db, filtro)
    propostas = _propostas(db, filtro)
    instrumentos = _instrumentos(db, filtro)
    equipamentos_por_convenio = _carregar_equipamentos_por_convenio(db, convenios)

    documento = docx_builder.novo_documento(f"Instrumentos e repasse -- {filtro.titulo()}")
    docx_builder.adicionar_cabecalho_institucional(documento, gerado_em=datetime.now(timezone.utc))
    docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Assunto", _assunto(db, filtro))
    periodo = filtro.periodo_referencia()
    if periodo:
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, "Período de referência", periodo)
    filtros_exclusivos = [
        f"{rotulo}: {valor}"
        for rotulo, valor in (
            ("situação", filtro.situacao),
            ("programa", filtro.programa),
            ("equipamento", filtro.equipamento),
            ("busca", filtro.busca),
        )
        if valor
    ]
    if filtros_exclusivos:
        docx_builder.adicionar_paragrafo_rotulo_valor(
            documento, "Filtros exclusivos de convênios", "; ".join(filtros_exclusivos)
        )
    if filtro.tipo_contratacao:
        docx_builder.adicionar_paragrafo_rotulo_valor(
            documento, "Tipo de contratação (convênios e monitoramento)", filtro.tipo_contratacao
        )
    docx_builder.adicionar_paragrafo(
        documento, "No que compete ao Departamento de Atenção ao Câncer – DECAN, informa-se:"
    )
    contador: Iterator[int] = itertools.count(1)

    docx_builder.adicionar_titulo(documento, "Resumo executivo")
    legenda_instrumentos, legenda_propostas, legenda_equipamentos = _legendas_resumo(filtro)
    for colunas_resumo, linhas_resumo, legenda in (
        (*_resumo_instrumentos_programas(convenios, instrumentos), legenda_instrumentos),
        (*_resumo_propostas(propostas), legenda_propostas),
        (*_resumo_equipamentos(equipamentos_por_convenio), legenda_equipamentos),
    ):
        if not linhas_resumo:
            docx_builder.adicionar_paragrafo(documento, "Nenhum equipamento identificado neste recorte.")
            continue
        docx_builder.adicionar_tabela(
            documento,
            colunas_resumo,
            docx_builder.linhas_como_texto(colunas_resumo, linhas_resumo, colunas_moeda=["Valor"]),
        )
        docx_builder.adicionar_legenda_tabela(documento, next(contador), legenda)
    docx_builder.adicionar_fonte(
        documento,
        "Convênios (SICONV/TransfereGov), propostas candidatas (TransfereGov) e monitoramento interno, SIGEO.",
    )
    docx_builder.adicionar_paragrafo(
        documento, "Os valores somam apenas registros com valor informado; não estimam os demais."
    )
    persus_ii_do_recorte = [c for c in convenios if c.tipo_contratacao == "PERSUS II"]
    if persus_ii_do_recorte and all(c.situacao == _SITUACAO_SEM_MONITORAMENTO_ESPERADO for c in persus_ii_do_recorte):
        docx_builder.adicionar_paragrafo(
            documento,
            f"Nota: os {len(persus_ii_do_recorte)} instrumento(s) PERSUS II deste recorte estão em fase de "
            "contratação -- ainda sem obra, equipamento ou licença pra registrar no monitoramento interno.",
        )

    docx_builder.adicionar_titulo(documento, "Informações Detalhadas")
    instrumentos_por_nr = {i.instrumento.nr_convenio: i for i in instrumentos}
    instrumento_ids = {i.instrumento.id for i in instrumentos}
    eventos_por_id = monitoramento_repo.listar_eventos_por_instrumentos(db, instrumento_ids)
    acoes_por_id = monitoramento_repo.listar_acoes_por_instrumentos(db, instrumento_ids)
    marcos = {m.id: m for m in monitoramento_repo.listar_marcos_catalogo(db, limit=200)}
    marco_inauguracao = monitoramento_repo.obter_marco_por_codigo(db, _MARCO_INAUGURACAO_CODIGO)
    marco_inauguracao_id = marco_inauguracao.id if marco_inauguracao else None

    tipos_ja_agrupados: set[str] = set()
    for rotulo_grupo, tipos in _GRUPOS_ORIGEM_CONVENIO:
        tipos_ja_agrupados |= tipos
        itens_grupo = [c for c in convenios if (c.tipo_contratacao or "Convênio") in tipos]
        if not itens_grupo:
            continue
        docx_builder.adicionar_titulo(documento, rotulo_grupo, nivel=2)
        for convenio in itens_grupo:
            _bloco_instrumento_narrativo(
                documento,
                db,
                convenio,
                instrumentos_por_nr.get(convenio.numero),
                equipamentos_por_convenio,
                marco_inauguracao_id,
                nivel,
                eventos_por_id,
                acoes_por_id,
                marcos,
            )
    itens_outros = [c for c in convenios if (c.tipo_contratacao or "Convênio") not in tipos_ja_agrupados]
    if itens_outros:
        docx_builder.adicionar_titulo(documento, _ROTULO_OUTROS_ORIGEM, nivel=2)
        for convenio in itens_outros:
            _bloco_instrumento_narrativo(
                documento,
                db,
                convenio,
                instrumentos_por_nr.get(convenio.numero),
                equipamentos_por_convenio,
                marco_inauguracao_id,
                nivel,
                eventos_por_id,
                acoes_por_id,
                marcos,
            )

    if propostas:
        docx_builder.adicionar_titulo(documento, "Propostas e Parcerias (Novo TransfereGOV):", nivel=2)
        for proposta in propostas:
            _bloco_proposta_narrativo(documento, proposta)

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
