"""Estruturas e utilidades comuns aos modelos de relatório de Equipamentos, Instrumentos e Propostas."""

import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from typing import NamedTuple

from app.pipeline.texto import normalizar_texto
from app.services.relatorios_filtro import FiltroRelatorio, Nivel

Celula = str | int | float | date | None
ROTULO_TODOS_EQUIPAMENTOS = "Todos os Equipamentos em Oncologia"


def formatar_processo(valor: str | None) -> str | None:
    """NUP de 17 dígitos no padrão 25000.217837/2025-83; outro formato fica como veio, sem espaços."""
    if not valor or not valor.strip():
        return None
    digitos = re.sub(r"\D", "", valor)
    if len(digitos) != 17:
        return valor.strip()
    return f"{digitos[:5]}.{digitos[5:11]}/{digitos[11:15]}-{digitos[15:]}"


def formatar_cnpj(valor: str | None) -> str | None:
    """CNPJ de 14 dígitos no padrão 00.000.000/0000-00; outro formato fica como veio, sem espaços."""
    if not valor or not valor.strip():
        return None
    digitos = re.sub(r"\D", "", valor)
    if len(digitos) != 14:
        return valor.strip()
    return f"{digitos[:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:]}"


@dataclass(frozen=True)
class Tabela:
    titulo: str
    colunas: tuple[str, ...]
    linhas: list[tuple[Celula, ...]]
    colunas_data: tuple[str, ...] = ()
    colunas_moeda: tuple[str, ...] = ()
    legenda: tuple[tuple[str, str], ...] = ()


class EquipamentoDoInstrumento(NamedTuple):
    nome: str
    planejados: int
    entregues: int
    em_operacao: int
    valor_unitario: float | None = None

    @property
    def a_entregar(self) -> int:
        return max(0, self.planejados - self.entregues)


@dataclass(frozen=True)
class RelatorioMonitorado:
    titulo: str
    colunas: tuple[str, ...]
    linhas: list[tuple[Celula, ...]]
    total: int
    unidade: str
    criterios: tuple[str, ...] = ()
    cabecalho: tuple[tuple[str, str], ...] = ()
    indicadores: tuple[tuple[str, Celula], ...] = ()
    quebras: tuple[Tabela, ...] = ()
    abas: tuple[Tabela, ...] = ()
    legenda: tuple[tuple[str, str], ...] = ()
    colunas_data: tuple[str, ...] = ()
    colunas_moeda: tuple[str, ...] = ()
    arquivo_base: str = "relatorio"
    aba_registros: str = "Registros"
    equipamentos_por_instrumento: dict[str, list[EquipamentoDoInstrumento]] = field(default_factory=dict)


@dataclass(frozen=True)
class ContextoInstrumento:
    numero: str
    cnes: str | None
    estabelecimento: str | None
    municipio: str | None
    uf: str | None
    regiao: str | None
    contratacao: str | None
    situacao_site: str | None
    situacao_monitoramento: str | None
    numero_processo: str | None
    ano: int | None
    inicio_vigencia: date | None
    fim_vigencia: date | None
    tecnico: str | None


def _ascii(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return "-".join(sem_acento.lower().split())


def slug_recorte(filtro: FiltroRelatorio) -> str:
    if filtro.escopo == "brasil":
        return "BRASIL"
    if filtro.escopo == "uf":
        return (filtro.uf or "").upper()
    if filtro.escopo == "regiao":
        return f"regiao-{_ascii(filtro.regiao or '')}"
    if filtro.escopo == "municipio":
        return f"municipio-{_ascii(filtro.municipio or '')}-{(filtro.uf or '').upper()}"
    return f"cnes-{filtro.cnes}"


def nome_arquivo(tipo: str, filtro: FiltroRelatorio, nivel: Nivel, formato: str) -> str:
    return f"relatorio-{tipo}-{slug_recorte(filtro)}-{nivel}.{formato}"


def descrever_contratacoes(filtro: FiltroRelatorio, contratacoes: Iterable[str | None]) -> str:
    if filtro.tipo_contratacao:
        return filtro.tipo_contratacao
    return ", ".join(sorted({tipo for tipo in contratacoes if tipo}, key=normalizar_texto))


def descrever_filtros(
    filtro: FiltroRelatorio,
    *,
    situacoes: Sequence[str] = (),
    fases: Sequence[str] = (),
    contratacoes: Iterable[str | None] = (),
) -> str:
    partes = [filtro.equipamento or ROTULO_TODOS_EQUIPAMENTOS]
    if descricao := descrever_contratacoes(filtro, contratacoes):
        partes.append(descricao)
    if situacoes:
        partes.append(", ".join(situacoes))
    if fases:
        partes.append(", ".join(fases))
    if filtro.programa:
        partes.append(filtro.programa)
    return " · ".join(partes)


def cabecalho(
    filtro: FiltroRelatorio, *, referencia: date, fonte: str, filtros: str
) -> tuple[tuple[str, str], ...]:
    return (
        ("Recorte", filtro.titulo()),
        ("Filtros", filtros),
        ("Referência", referencia.strftime("%d/%m/%Y")),
        ("Fonte", fonte),
    )


def quebra_por(
    titulo: str, rotulo: str, valores: Iterable[str], *, ordem: Sequence[str] | None = None
) -> Tabela:
    contagem = Counter(valores)
    total = sum(contagem.values())
    chaves = [k for k in ordem if k in contagem] if ordem else sorted(contagem, key=lambda k: (-contagem[k], k))
    linhas: list[tuple[Celula, ...]] = [(k, contagem[k], f"{round(contagem[k] / total * 100)}%") for k in chaves]
    linhas.append(("Total", total, "100%" if total else "0%"))
    return Tabela(titulo, (rotulo, "Total", "%"), linhas)
