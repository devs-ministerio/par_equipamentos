"""Auditoria somente de leitura do espelho SICONV dos convênios conhecidos.

Compara o dump oficial fresco com as duas visões persistidas, sem modificar o
banco. Retorna código 1 quando encontra divergências ou ausência na fonte,
para servir como gate de diagnóstico antes de habilitar sincronização.

Uso: python -m scripts.auditar_espelho_siconv
"""

from __future__ import annotations

from dataclasses import dataclass

from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento
from scripts.coletar_siconv_legado import _filtrar_por_numero_convenio
from scripts.job_verificacao_siconv import comparar_campos_oficiais


@dataclass(frozen=True)
class DivergenciaSiconv:
    numero: str
    tipo: str
    valor_oficial: str | None
    valor_local: str | None


def comparar_situacoes(
    convenios: list[Convenio],
    instrumentos: list[InstrumentoEquipamento],
    registros: list[dict[str, str]],
) -> list[DivergenciaSiconv]:
    """Compara situação exposta e campos da tabela principal do dump."""
    convenios_por_numero = {c.numero: c for c in convenios}
    instrumentos_por_numero = {i.nr_convenio: i for i in instrumentos}
    oficiais = {r["NR_CONVENIO"]: r for r in registros}
    divergencias: list[DivergenciaSiconv] = []

    for numero in sorted(set(convenios_por_numero) | set(instrumentos_por_numero)):
        if numero not in oficiais:
            divergencias.append(DivergenciaSiconv(numero, "ausente_no_dump", None, None))
            continue
        registro = oficiais[numero]
        situacao = registro.get("SIT_CONVENIO")
        if not situacao:
            divergencias.append(DivergenciaSiconv(numero, "situacao_oficial_vazia", situacao, None))
            continue
        convenio = convenios_por_numero.get(numero)
        if convenio is not None and convenio.situacao != situacao:
            divergencias.append(DivergenciaSiconv(numero, "convenio", situacao, convenio.situacao))
        if convenio is not None:
            anterior = (convenio.siconv_raw or {}).get("convenio")
            if isinstance(anterior, dict):
                for campo, (local, oficial) in comparar_campos_oficiais(anterior, registro).items():
                    divergencias.append(DivergenciaSiconv(numero, f"campo:{campo}", oficial, local))
            else:
                divergencias.append(DivergenciaSiconv(numero, "snapshot_ausente", None, None))
        instrumento = instrumentos_por_numero.get(numero)
        if instrumento is not None and instrumento.situacao_prestacao_contas != situacao:
            divergencias.append(
                DivergenciaSiconv(numero, "monitoramento", situacao, instrumento.situacao_prestacao_contas)
            )
    return divergencias


def run() -> int:
    db = SessionLocal()
    try:
        convenios = db.query(Convenio).filter(Convenio.tipo_contratacao == "Convênio").all()
        instrumentos = (
            db.query(InstrumentoEquipamento).filter(InstrumentoEquipamento.tipo_contratacao == "Convênio").all()
        )
        numeros = {c.numero for c in convenios} | {i.nr_convenio for i in instrumentos}
        if not numeros:
            print("Nenhum convênio oficial conhecido para auditar.")
            return 0
        registros = _filtrar_por_numero_convenio("siconv_convenio", numeros, atualizar_cache=True)
        divergencias = comparar_situacoes(convenios, instrumentos, registros)
        for item in divergencias:
            print(f"{item.numero} | {item.tipo} | oficial={item.valor_oficial!r} | local={item.valor_local!r}")
        print(f"Auditados: {len(numeros)}; divergências: {len(divergencias)}.")
        return 1 if divergencias else 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(run())
