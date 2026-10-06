"""Reconcilia os convênios conhecidos com o registro principal do SICONV.

Baixa ``siconv_convenio.csv.zip`` fresco a cada execução (cerca de 16 MB).
O antigo marcador Last-Modified era um arquivo local em runner efêmero e
podia ocultar divergências; o diff em banco já torna reexecuções idempotentes.
Atualiza ``Convenio`` e ``InstrumentoEquipamento`` na mesma transação. O
registro anterior em ``Convenio.siconv_raw['convenio']`` serve como linha de
base para comparar todos os campos da tabela principal; tabelas filhas
(pagamentos, licitações, itens) ainda não são cobertas por este job.

Escopo: so instrumento com tipo_contratacao == "Convenio" (nr_convenio
aqui e o NR_CONVENIO real do SICONV). FAF/TED ficam de fora -- nr_convenio
deles e o NUP SEI (so digitos), nunca existiu no SICONV legado (achado
2026-09-10, ver docstring de InstrumentoEquipamento.nr_convenio).

Uso: python -m scripts.job_verificacao_siconv (de dentro de backend/, venv
ativo). ``--forcar`` permanece aceito por compatibilidade, sem efeito.
"""

from __future__ import annotations

import sys
from decimal import Decimal

from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento, Notificacao, NotificacaoTipo
from app.pipeline.texto import parsear_valor_brasileiro
from app.repositories.notificacoes import criar_notificacao

# Reaproveita os helpers ja existentes de scripts/coletar_siconv_legado.py
# (download com retry/cache, parse do zip, filtro por NR_CONVENIO) em vez
# de duplicar -- ver docstring do modulo pra descricao de cada tabela.
from scripts.coletar_siconv_legado import (
    _filtrar_por_numero_convenio,
)

NOME_TABELA = "siconv_convenio"

VALORES_SICONV = {
    "VL_GLOBAL_CONV": "valor_global",
    "VL_REPASSE_CONV": "valor_repasse",
    "VL_EMPENHADO_CONV": "valor_empenhado",
    "VL_DESEMBOLSADO_CONV": "valor_desembolsado",
    "VL_CONTRAPARTIDA_CONV": "valor_contrapartida",
    "VL_SALDO_CONTA": "valor_saldo_conta",
}


def comparar_campos_oficiais(antigo: dict | None, novo: dict[str, str]) -> dict[str, tuple[str, str]]:
    """Não notifica a primeira captura nem colunas novas sem baseline."""
    if not antigo:
        return {}
    return {
        campo: (str(antigo[campo]), valor)
        for campo, valor in novo.items()
        if campo in antigo and str(antigo[campo]) != valor
    }


def reconciliar_registro(
    convenio: Convenio | None,
    instrumento: InstrumentoEquipamento | None,
    registro: dict[str, str],
) -> tuple[dict[str, tuple[str, str]], bool]:
    """Atualiza colunas derivadas e snapshot sem apagar valor por campo vazio."""
    anterior = (convenio.siconv_raw or {}).get("convenio") if convenio is not None else None
    mudancas = comparar_campos_oficiais(anterior if isinstance(anterior, dict) else None, registro)
    fonte_mudou, instrumento_mudou = reconciliar_situacao(convenio, instrumento, registro.get("SIT_CONVENIO"))
    colunas_mudaram = fonte_mudou or instrumento_mudou

    if convenio is not None:
        situacao_contratacao = registro.get("SITUACAO_CONTRATACAO")
        if situacao_contratacao and convenio.situacao_contratacao != situacao_contratacao:
            convenio.situacao_contratacao = situacao_contratacao
            colunas_mudaram = True
        for campo_siconv, coluna in VALORES_SICONV.items():
            bruto = registro.get(campo_siconv)
            if not bruto:
                continue
            numero = parsear_valor_brasileiro(bruto)
            valor = Decimal(str(numero)) if numero is not None else None
            if valor is not None and getattr(convenio, coluna) != valor:
                setattr(convenio, coluna, valor)
                colunas_mudaram = True
        if anterior != registro:
            convenio.siconv_raw = {**(convenio.siconv_raw or {}), "convenio": registro}
            colunas_mudaram = True
    return mudancas, colunas_mudaram


def resumo_campos(mudancas: dict[str, tuple[str, str]]) -> str:
    return "; ".join(f"{campo}: {antigo or '(vazio)'} → {novo or '(vazio)'}" for campo, (antigo, novo) in mudancas.items())


def reconciliar_situacao(
    convenio: Convenio | None,
    instrumento: InstrumentoEquipamento | None,
    nova_situacao: str | None,
) -> tuple[bool, bool]:
    """Espelha a situação oficial nos dois leitores sem apagar dado conhecido.

    Retorna mudança na fonte persistida e necessidade de backfill do
    monitoramento. O segundo caso isolado não deve notificar como novidade.
    """
    if not nova_situacao:
        return False, False

    fonte_mudou = convenio is not None and convenio.situacao != nova_situacao
    if fonte_mudou and convenio is not None:
        convenio.situacao = nova_situacao

    instrumento_mudou = instrumento is not None and instrumento.situacao_prestacao_contas != nova_situacao
    if instrumento_mudou and instrumento is not None:
        instrumento.situacao_prestacao_contas = nova_situacao
    return fonte_mudou, instrumento_mudou


def run(forcar: bool = False) -> None:
    if forcar:
        print("--forcar é redundante: este job sempre baixa a versão remota atual.")

    db = SessionLocal()
    atualizados = 0
    notificados = 0
    try:
        instrumentos = (
            db.query(InstrumentoEquipamento).filter(InstrumentoEquipamento.tipo_contratacao == "Convênio").all()
        )
        convenios = db.query(Convenio).filter(Convenio.tipo_contratacao == "Convênio").all()
        convenios_por_numero = {c.numero: c for c in convenios}
        instrumentos_por_numero = {i.nr_convenio: i for i in instrumentos}
        numeros = set(convenios_por_numero) | set(instrumentos_por_numero)
        if not numeros:
            print("Nenhum convênio oficial conhecido para verificar.")
        else:
            registros = _filtrar_por_numero_convenio(NOME_TABELA, numeros, atualizar_cache=True)
            if not registros:
                raise RuntimeError("Dump SICONV não retornou nenhum convênio conhecido; sincronização abortada.")
            registros_por_numero = {r["NR_CONVENIO"]: r for r in registros}

            for numero, registro in registros_por_numero.items():
                instrumento = instrumentos_por_numero.get(numero)
                convenio = convenios_por_numero.get(numero)
                mudancas, alterou = reconciliar_registro(convenio, instrumento, registro)
                if mudancas and instrumento is not None:
                    criar_notificacao(
                        db,
                        Notificacao(
                            tipo=NotificacaoTipo.atualizacao_api,
                            titulo=f"Convênio {numero}: {len(mudancas)} campo(s) alterado(s) no SICONV",
                            corpo=resumo_campos(mudancas),
                            entidade_id=instrumento.id,
                        ),
                    )
                    notificados += 1
                if alterou:
                    atualizados += 1
        db.commit()
    finally:
        db.close()

    print(f"Concluído: {atualizados} convênio(s) reconciliado(s), {notificados} aviso(s) agrupado(s).")


if __name__ == "__main__":
    run(forcar="--forcar" in sys.argv)
