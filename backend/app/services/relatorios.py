"""Orquestra a geração dos relatórios Excel/Word -- Plan Mode
docs/arquitetura/planmode-relatorios-2026-09-25.md, Bloco 2.

Compõe 3 seções (cobertura/déficit, convênios firmados, monitoramento
interno), todas filtradas pelo mesmo filtro geográfico hierárquico
(Brasil -> Região -> UF -> Município -> CNES). Nível "completo" no Word
fica limitado a agregação até UF (documento não vira milhares de
parágrafos em nível de município/CNES) -- granularidade linha a linha
fica reservada ao Excel.

A seção de cobertura não existe para escopo=cnes: MacroCoverage/
MunicipalityCoverage não têm granularidade por estabelecimento (mesma
limitação já documentada no CLAUDE.md -- "Cobertura/déficit/distância sem
granularidade por equipamento individual").
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.geo_reference import REGIOES, ufs_da_regiao
from app.reports import docx_builder, xlsx_builder
from app.repositories import cobertura_relatorio as cobertura_repo
from app.repositories import convenios as convenios_repo
from app.repositories import execucoes as execucoes_repo
from app.services.monitoramento_instrumentos import listar_instrumentos_monitorados

Escopo = Literal["brasil", "regiao", "uf", "municipio", "cnes"]
Nivel = Literal["simplificado", "completo"]
Formato = Literal["xlsx", "docx"]


@dataclass(frozen=True)
class FiltroRelatorio:
    escopo: Escopo
    regiao: str | None = None
    uf: str | None = None
    municipio: str | None = None
    cnes: str | None = None

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

    def titulo(self) -> str:
        if self.escopo == "brasil":
            return "Brasil"
        if self.escopo == "regiao":
            return f"Região {self.regiao}"
        if self.escopo == "uf":
            return f"UF {self.uf}"
        if self.escopo == "municipio":
            return f"{self.municipio}/{self.uf}"
        return f"CNES {self.cnes}"


def _secao_cobertura_linhas(db: Session, filtro: FiltroRelatorio, nivel: Nivel) -> list[tuple[str, list[str], list]]:
    if filtro.escopo == "cnes":
        return []
    ufs = filtro.ufs()
    municipio = filtro.municipio if filtro.escopo == "municipio" else None
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


def _secao_convenios_linhas(db: Session, filtro: FiltroRelatorio, nivel: Nivel) -> tuple[list[str], list]:
    municipio = filtro.municipio if filtro.escopo == "municipio" else None
    cnes = filtro.cnes if filtro.escopo == "cnes" else None
    convenios = convenios_repo.listar_convenios_filtrados(db, ufs=filtro.ufs(), municipio=municipio, cnes=cnes)
    if nivel == "simplificado":
        colunas = ["Número", "Convenente", "UF", "Situação", "Valor global"]
        linhas = [[c.numero, c.convenente_nome, c.uf, c.situacao, c.valor_global] for c in convenios]
    else:
        colunas = [
            "Número",
            "Convenente",
            "Município",
            "UF",
            "Tipo de contratação",
            "Situação",
            "Programa",
            "Valor global",
            "Valor desembolsado",
        ]
        linhas = [
            [
                c.numero,
                c.convenente_nome,
                c.municipio,
                c.uf,
                c.tipo_contratacao,
                c.situacao,
                c.programa,
                c.valor_global,
                c.valor_desembolsado,
            ]
            for c in convenios
        ]
    return colunas, linhas


def _secao_monitoramento_linhas(db: Session, filtro: FiltroRelatorio, nivel: Nivel) -> tuple[list[str], list]:
    municipio = filtro.municipio if filtro.escopo == "municipio" else None
    cnes = filtro.cnes if filtro.escopo == "cnes" else None
    instrumentos = listar_instrumentos_monitorados(db=db, ufs=filtro.ufs(), municipio=municipio, cnes=cnes)
    if nivel == "simplificado":
        colunas = ["Convênio", "Convenente", "UF", "Fase atual"]
        linhas = [
            [i.instrumento.nr_convenio, i.instrumento.nome_convenente, i.instrumento.uf, i.fase_atual]
            for i in instrumentos
        ]
    else:
        colunas = ["Convênio", "Convenente", "Município", "UF", "CNES", "Tipo de contratação", "Fase atual"]
        linhas = [
            [
                i.instrumento.nr_convenio,
                i.instrumento.nome_convenente,
                i.instrumento.municipio,
                i.instrumento.uf,
                i.instrumento.cnes,
                i.instrumento.tipo_contratacao,
                i.fase_atual,
            ]
            for i in instrumentos
        ]
    return colunas, linhas


def montar_relatorio(*, db: Session, formato: Formato, nivel: Nivel, filtro: FiltroRelatorio) -> bytes:
    if formato == "xlsx":
        return _montar_xlsx(db, filtro, nivel)
    return _montar_docx(db, filtro, nivel)


def _montar_xlsx(db: Session, filtro: FiltroRelatorio, nivel: Nivel) -> bytes:
    pasta = xlsx_builder.nova_pasta()
    for titulo_aba, colunas, linhas in _secao_cobertura_linhas(db, filtro, nivel):
        xlsx_builder.escrever_aba_tabela(pasta, titulo_aba, colunas, linhas)
    colunas, linhas = _secao_convenios_linhas(db, filtro, nivel)
    xlsx_builder.escrever_aba_tabela(pasta, "Convênios", colunas, linhas)
    colunas, linhas = _secao_monitoramento_linhas(db, filtro, nivel)
    xlsx_builder.escrever_aba_tabela(pasta, "Monitoramento", colunas, linhas)
    return xlsx_builder.gerar_bytes(pasta)


def _montar_docx(db: Session, filtro: FiltroRelatorio, nivel: Nivel) -> bytes:
    # Nivel completo continua limitado a agregacao por UF no Word mesmo
    # quando o escopo pedido e mais fino (ver docstring do modulo) --
    # aqui isso ja acontece naturalmente porque cobertura granular
    # (municipio) so aparece no nivel "completo" do Excel; o Word usa
    # sempre a mesma projecao "simplificado" de cobertura.
    documento = docx_builder.novo_documento(f"Relatório {filtro.titulo()}")
    for titulo_secao, colunas, linhas in _secao_cobertura_linhas(db, filtro, "simplificado"):
        docx_builder.adicionar_titulo(documento, titulo_secao)
        docx_builder.adicionar_tabela(documento, colunas, linhas)
    colunas, linhas = _secao_convenios_linhas(db, filtro, nivel)
    docx_builder.adicionar_titulo(documento, "Convênios firmados")
    docx_builder.adicionar_tabela(documento, colunas, linhas)
    colunas, linhas = _secao_monitoramento_linhas(db, filtro, nivel)
    docx_builder.adicionar_titulo(documento, "Monitoramento interno")
    docx_builder.adicionar_tabela(documento, colunas, linhas)
    return docx_builder.gerar_bytes(documento)
