"""Reconcilia os convênios conhecidos com o dump oficial do SICONV.

Baixa os arquivos frescos a cada execução (``siconv_convenio`` ~16 MB; as
tabelas filhas, em especial ``siconv_pagamento`` e ``siconv_plano_aplicacao``,
somam centenas de MB). O antigo marcador Last-Modified era um arquivo local em
runner efêmero e podia ocultar divergências; o diff em banco torna reexecuções
idempotentes.

Atualiza ``Convenio`` e ``InstrumentoEquipamento`` na mesma transação. O
registro anterior em ``Convenio.siconv_raw`` serve como linha de base para o
registro principal e para as tabelas filhas (empenhos, desembolsos,
licitações, termos aditivos, pagamentos e itens do plano de aplicação),
comparadas por chave estável. A linha de base só vale depois que
``siconv_raw["_espelho"]`` existe: a primeira captura de cada convênio é
absorvida em silêncio (contada em ``fonte_captura.detalhes``), sem enxurrada de
avisos por diferenças acumuladas desde a carga original. Itens que a fonte
deixa de devolver, ou tabelas inteiras que falham ao baixar, preservam o
último valor confirmado.

Escopo: so instrumento com tipo_contratacao == "Convenio" (nr_convenio
aqui e o NR_CONVENIO real do SICONV). FAF/TED ficam de fora -- nr_convenio
deles e o NUP SEI (so digitos), nunca existiu no SICONV legado (achado
2026-09-10, ver docstring de InstrumentoEquipamento.nr_convenio).

Uso: python -m scripts.job_verificacao_siconv (de dentro de backend/, venv
ativo). ``--forcar`` permanece aceito por compatibilidade, sem efeito.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento, Notificacao, NotificacaoTipo
from app.pipeline.texto import parsear_valor_brasileiro
from app.repositories.espelho_siconv import bloquear_escopo_atual, numeros_oficiais_conhecidos
from app.repositories.notificacoes import criar_notificacao
from app.schemas_filhas_legado import chave_termo_aditivo
from app.services.capturas_fonte import CapturaEmAndamento, captura
from app.services.espelho_diff import DiffLista, diff_lista, mesclar_lista

# Reaproveita os helpers ja existentes de scripts/coletar_siconv_legado.py
# (download com retry/cache, parse do zip, filtro por NR_CONVENIO) em vez
# de duplicar -- ver docstring do modulo pra descricao de cada tabela.
from scripts.coletar_siconv_legado import (
    _filtrar_plano_aplicacao_por_id_proposta,
    _filtrar_por_numero_convenio,
)

NOME_TABELA = "siconv_convenio"
MARCADOR_BASELINE = "_espelho"

VALORES_SICONV = {
    "VL_GLOBAL_CONV": "valor_global",
    "VL_REPASSE_CONV": "valor_repasse",
    "VL_EMPENHADO_CONV": "valor_empenhado",
    "VL_DESEMBOLSADO_CONV": "valor_desembolsado",
    "VL_CONTRAPARTIDA_CONV": "valor_contrapartida",
    "VL_SALDO_CONTA": "valor_saldo_conta",
}

# chave em siconv_raw -> (arquivo do dump, coluna que identifica a linha, rótulo)
FILHAS = {
    "empenhos": ("siconv_empenho", "ID_EMPENHO", "Empenhos"),
    "desembolsos": ("siconv_desembolso", "ID_DESEMBOLSO", "Desembolsos"),
    "licitacoes": ("siconv_licitacao", "ID_LICITACAO", "Licitações"),
    "termos_aditivos": ("siconv_termo_aditivo", "CHAVE_ESPELHO", "Termos aditivos"),
    "pagamentos": ("siconv_pagamento", "NR_MOV_FIN", "Pagamentos"),
}
ITENS = ("itens_plano_aplicacao", "ID_ITEM_PAD", "Itens do plano de aplicação")
ROTULOS_FILHAS = {chave: rotulo for chave, (_, _, rotulo) in FILHAS.items()} | {ITENS[0]: ITENS[2]}

# Fração de convênios conhecidos ausentes do dump a partir da qual a resposta
# é tratada como parcial (alerta); abaixo disso fica só em ``detalhes``.
LIMITE_AUSENTES_PARCIAL = 0.2


def comparar_campos_oficiais(antigo: dict | None, novo: dict[str, str]) -> dict[str, tuple[str, str]]:
    """Não notifica a primeira captura nem colunas novas sem baseline."""
    if not antigo:
        return {}
    return {
        campo: (str(antigo[campo]), valor)
        for campo, valor in novo.items()
        if campo in antigo and str(antigo[campo]) != valor
    }


@dataclass
class ResultadoConvenio:
    mudancas: dict[str, tuple[str, str]] = field(default_factory=dict)
    filhas: dict[str, DiffLista] = field(default_factory=dict)
    alterou: bool = False
    carga_inicial: bool = False
    # Quantas diferenças a carga inicial absorveu sem avisar (só diagnóstico).
    absorvidas: int = 0

    @property
    def total_mudancas(self) -> int:
        return len(self.mudancas) + sum(len(d.adicionados) + len(d.alterados) for d in self.filhas.values())


def _total_pago(pagamentos: list[dict[str, Any]]) -> Decimal:
    total = Decimal(0)
    for pagamento in pagamentos:
        numero = parsear_valor_brasileiro(str(pagamento.get("VL_PAGO") or ""))
        if numero is None or not Decimal(str(numero)).is_finite():
            raise ValueError("Captura SICONV contém valor de pagamento ausente ou inválido.")
        total += Decimal(str(numero))
    return total


def _preparar_termos(registros: list[dict[str, str]], *, anteriores: bool = False) -> list[dict[str, str]]:
    resultado = []
    for registro in registros:
        solicitacao = str(registro.get("ID_SOLICITACAO") or "")
        numero_ta = str(registro.get("NUMERO_TA") or "")
        if anteriores and not solicitacao.strip() and not numero_ta.strip():
            # Evidência antiga sem identidade não pode ser apagada nem ligada
            # por aproximação. Somente a captura nova exige chave comprovada.
            resultado.append(registro)
        else:
            resultado.append({**registro, "CHAVE_ESPELHO": chave_termo_aditivo(solicitacao, numero_ta)})
    return resultado


def reconciliar_registro(
    convenio: Convenio | None,
    instrumento: InstrumentoEquipamento | None,
    registro: dict[str, str],
    filhas: dict[str, list[dict[str, str]]] | None = None,
) -> ResultadoConvenio:
    """Atualiza colunas derivadas e snapshot sem apagar valor por campo vazio.

    ``filhas`` só traz as tabelas que o dump devolveu nesta rodada; uma tabela
    ausente do dicionário (falha de download) não é tocada.
    """
    resultado = ResultadoConvenio()
    raw = dict(convenio.siconv_raw or {}) if convenio is not None else {}
    baseline = isinstance(raw.get(MARCADOR_BASELINE), dict)
    anterior = raw.get("convenio")
    campos = comparar_campos_oficiais(anterior if isinstance(anterior, dict) else None, registro)
    if baseline:
        resultado.mudancas = campos
    else:
        resultado.carga_inicial = convenio is not None
        resultado.absorvidas += len(campos)

    fonte_mudou, instrumento_mudou = reconciliar_situacao(convenio, instrumento, registro.get("SIT_CONVENIO"))
    resultado.alterou = fonte_mudou or instrumento_mudou
    if convenio is None:
        return resultado

    situacao_contratacao = registro.get("SITUACAO_CONTRATACAO")
    if situacao_contratacao and convenio.situacao_contratacao != situacao_contratacao:
        convenio.situacao_contratacao = situacao_contratacao
        resultado.alterou = True
    for campo_siconv, coluna in VALORES_SICONV.items():
        bruto = registro.get(campo_siconv)
        if not bruto:
            continue
        numero = parsear_valor_brasileiro(bruto)
        valor = Decimal(str(numero)) if numero is not None else None
        if valor is not None and getattr(convenio, coluna) != valor:
            setattr(convenio, coluna, valor)
            resultado.alterou = True

    novo_raw = {**raw, "convenio": {**(anterior if isinstance(anterior, dict) else {}), **registro}}
    for chave, coluna in [(c, definicao[1]) for c, definicao in FILHAS.items()] + [(ITENS[0], ITENS[1])]:
        if filhas is None or chave not in filhas:
            continue
        antigas = raw.get(chave)
        antigas = antigas if isinstance(antigas, list) else None
        novas = filhas[chave]
        if chave == "termos_aditivos":
            antigas = _preparar_termos(antigas, anteriores=True) if antigas is not None else None
            novas = _preparar_termos(novas)
        diff = diff_lista(antigas if baseline else None, novas, coluna)
        if baseline and not diff.vazio:
            resultado.filhas[chave] = diff
        elif not baseline and antigas is not None:
            resultado.absorvidas += len(diff_lista(antigas, novas, coluna).adicionados)
        novo_raw[chave] = mesclar_lista(antigas, novas, coluna)

    pagamentos = novo_raw.get("pagamentos")
    if filhas is not None and "pagamentos" in filhas and isinstance(pagamentos, list):
        total = _total_pago(pagamentos) if pagamentos else None
        if convenio.valor_pago_fornecedor != total or convenio.pagamentos_count != len(pagamentos):
            convenio.valor_pago_fornecedor = float(total) if total is not None else None
            convenio.pagamentos_count = len(pagamentos)
            resultado.alterou = True

    if not baseline:
        novo_raw[MARCADOR_BASELINE] = {"versao": 1, "capturado_em": datetime.now(UTC).isoformat()}
    if novo_raw != (convenio.siconv_raw or {}):
        convenio.siconv_raw = novo_raw
        resultado.alterou = True
    return resultado


def resumo_campos(mudancas: dict[str, tuple[str, str]]) -> str:
    return "; ".join(
        f"{campo}: {antigo or '(vazio)'} → {novo or '(vazio)'}" for campo, (antigo, novo) in mudancas.items()
    )


def resumo_filhas(filhas: dict[str, DiffLista]) -> str:
    partes = []
    for chave, diff in filhas.items():
        detalhe = []
        if diff.adicionados:
            detalhe.append(f"{len(diff.adicionados)} novo(s)")
        if diff.alterados:
            detalhe.append(f"{len(diff.alterados)} alterado(s)")
            detalhe.extend(
                f"registro {identificador}: {resumo_campos(campos)}" for identificador, campos in diff.alterados
            )
        partes.append(f"{ROTULOS_FILHAS[chave]}: {', '.join(detalhe)}")
    return "; ".join(partes)


def resumo_convenio(resultado: ResultadoConvenio) -> str:
    return " | ".join(p for p in (resumo_campos(resultado.mudancas), resumo_filhas(resultado.filhas)) if p)


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


def _agrupar_por_numero(linhas: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    agrupado: dict[str, list[dict[str, str]]] = {}
    for linha in linhas:
        agrupado.setdefault(linha["NR_CONVENIO"], []).append(linha)
    return agrupado


def coletar_filhas(
    numeros: set[str], registros: dict[str, dict[str, str]], cap: CapturaEmAndamento
) -> dict[str, dict[str, list[dict[str, str]]]]:
    """Baixa cada tabela filha isoladamente; falha numa não derruba as demais.

    Devolve ``chave -> NR_CONVENIO -> linhas`` só das tabelas obtidas. Tabela
    que falha fica de fora, preservando o último valor, e marca a captura como
    parcial.
    """
    obtidas: dict[str, dict[str, list[dict[str, str]]]] = {}
    falhas: list[str] = []
    for chave, (arquivo, _, _) in FILHAS.items():
        try:
            obtidas[chave] = _agrupar_por_numero(_filtrar_por_numero_convenio(arquivo, numeros, atualizar_cache=True))
        except Exception as exc:
            falhas.append(f"{arquivo} ({type(exc).__name__})")
    ids_proposta = {r["ID_PROPOSTA"]: numero for numero, r in registros.items() if r.get("ID_PROPOSTA")}
    try:
        itens: dict[str, list[dict[str, str]]] = {}
        for item in _filtrar_plano_aplicacao_por_id_proposta(set(ids_proposta), atualizar_cache=True):
            itens.setdefault(ids_proposta[item["ID_PROPOSTA"]], []).append(item)
        obtidas[ITENS[0]] = itens
    except Exception as exc:
        falhas.append(f"siconv_plano_aplicacao ({type(exc).__name__})")
    if falhas:
        cap.detalhes["tabelas_com_falha"] = falhas
        _marcar_parcial(
            cap, f"Tabelas SICONV indisponíveis nesta rodada: {', '.join(falhas)}; dados anteriores preservados."
        )
    return obtidas


def _marcar_parcial(cap: CapturaEmAndamento, motivo: str) -> None:
    cap.parcial = f"{cap.parcial} {motivo}" if cap.parcial else motivo


def run(forcar: bool = False) -> None:
    if forcar:
        print("--forcar é redundante: este job sempre baixa a versão remota atual.")
    with captura("siconv_legado") as cap:
        _executar(cap)


def _executar(cap: CapturaEmAndamento) -> None:
    db = SessionLocal()
    atualizados = 0
    notificados = 0
    absorvidas = 0
    cargas_iniciais = 0
    try:
        numeros = numeros_oficiais_conhecidos(db)
        db.rollback()  # Não manter leitura/transação/conexão ocupada durante HTTP.
        if not numeros:
            print("Nenhum convênio oficial conhecido para verificar.")
        else:
            registros = _filtrar_por_numero_convenio(NOME_TABELA, numeros, atualizar_cache=True)
            if not registros:
                raise RuntimeError("Dump SICONV não retornou nenhum convênio conhecido; sincronização abortada.")
            registros_por_numero = {}
            for registro in registros:
                numero = registro.get("NR_CONVENIO")
                if not numero or numero not in numeros:
                    raise ValueError("Captura SICONV contém convênio fora do universo solicitado.")
                if numero in registros_por_numero:
                    raise ValueError("Captura SICONV contém identidade de convênio duplicada.")
                registros_por_numero[numero] = registro
            ausentes = sorted(numeros - set(registros_por_numero))
            cap.itens_verificados = len(numeros)
            cap.detalhes["ausentes_do_dump"] = len(ausentes)
            if len(ausentes) / len(numeros) >= LIMITE_AUSENTES_PARCIAL:
                _marcar_parcial(
                    cap,
                    f"{len(ausentes)} de {len(numeros)} convênios conhecidos não constam do dump; "
                    "os dados anteriores foram preservados.",
                )
            filhas_por_tabela = coletar_filhas(numeros, registros_por_numero, cap)
            convenios_por_numero, instrumentos_por_numero = bloquear_escopo_atual(db, numeros)
            cap.detalhes["fora_escopo_apos_coleta"] = 0

            for numero, registro in registros_por_numero.items():
                instrumento = instrumentos_por_numero.get(numero)
                convenio = convenios_por_numero.get(numero)
                if convenio is None and instrumento is None:
                    cap.detalhes["fora_escopo_apos_coleta"] += 1
                    continue
                filhas = {chave: tabela.get(numero, []) for chave, tabela in filhas_por_tabela.items()}
                resultado = reconciliar_registro(convenio, instrumento, registro, filhas)
                absorvidas += resultado.absorvidas
                cargas_iniciais += int(resultado.carga_inicial)
                if resultado.total_mudancas and instrumento is not None:
                    criar_notificacao(
                        db,
                        Notificacao(
                            tipo=NotificacaoTipo.atualizacao_api,
                            titulo=f"Convênio {numero}: {resultado.total_mudancas} mudança(s) no SICONV",
                            corpo=resumo_convenio(resultado),
                            entidade_id=instrumento.id,
                        ),
                    )
                    notificados += 1
                if resultado.alterou:
                    atualizados += 1
        db.commit()
    finally:
        db.close()

    cap.itens_alterados = atualizados
    cap.avisos_criados = notificados
    cap.detalhes.update(cargas_iniciais=cargas_iniciais, diferencas_absorvidas_na_carga_inicial=absorvidas)
    print(
        f"Concluído: {atualizados} convênio(s) reconciliado(s), {notificados} aviso(s) agrupado(s), "
        f"{cargas_iniciais} em carga inicial silenciosa."
    )


if __name__ == "__main__":
    run(forcar="--forcar" in sys.argv)
