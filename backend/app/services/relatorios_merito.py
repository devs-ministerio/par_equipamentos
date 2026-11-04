"""Relatório de análise de mérito (cobertura e déficit).

Parte do pacote de relatórios; a fachada pública é `app.services.relatorios`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.db.models import (
    Competency,
    Execution,
)
from app.reports import docx_builder, xlsx_builder
from app.reports.docx_tabelado import SecaoTabela, gerar_bytes_tabelados
from app.repositories import cobertura_relatorio as cobertura_repo
from app.repositories import execucoes as execucoes_repo
from app.services.relatorios_filtro import _NOTA_VALOR_PERSUS_I, FiltroRelatorio, Formato, Nivel, TipoRelatorio

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
        linhas.append(["Fonte", "Cobertura publicada no SISGEO; oferta SUS e em uso (CNES/ElastiCNES)"])
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
                    "Situação",
                    "Vale só para a origem escolhida (instrumento, monitoramento ou proposta); as seções de outras origens ficam fora do arquivo.",
                ],
                [
                    "Programa, tipo de contratação, equipamento e busca",
                    "Filtram convênios, propostas e monitoramento.",
                ],
                ["Valor", f"Soma apenas valores informados; não estima registros sem valor. {_NOTA_VALOR_PERSUS_I}"],
                ["Contagem de convênios", contagens.get("convenios", 0)],
                ["Contagem de propostas", contagens.get("propostas", 0)],
                ["Contagem de instrumentos monitorados", contagens.get("monitoramento", 0)],
            ]
        )
        for rotulo, valor in (
            (filtro.rotulo_situacao(), filtro.situacao),
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
    for familia, competencia in competencias.items():
        docx_builder.adicionar_paragrafo_rotulo_valor(documento, f"Competência {familia}", competencia)
    tabelas = [
        SecaoTabela(
            titulo_secao,
            colunas,
            docx_builder.linhas_como_texto(
                colunas, linhas, colunas_inteiro=["População", "Necessário", "Disponível SUS", "Saldo"]
            ),
            pesos_colunas=[3, 0.5, 1.5, 1.3, 1.5, 1] if len(colunas) == 6 else None,
            fonte_pt=11 if len(colunas) == 6 else None,
        )
        for titulo_secao, colunas, linhas in secoes
    ]
    return gerar_bytes_tabelados(documento, tabelas)
