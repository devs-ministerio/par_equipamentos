"""Verifica a situação dos convênios conhecidos contra o arquivo SICONV.

Baixa ``siconv_convenio.csv.zip`` fresco a cada execução (cerca de 16 MB).
O antigo marcador Last-Modified era um arquivo local em runner efêmero e
podia ocultar divergências; o diff em banco já torna reexecuções idempotentes.
Atualiza ``Convenio`` e ``InstrumentoEquipamento`` na mesma transação.

Escopo: so instrumento com tipo_contratacao == "Convenio" (nr_convenio
aqui e o NR_CONVENIO real do SICONV). FAF/TED ficam de fora -- nr_convenio
deles e o NUP SEI (so digitos), nunca existiu no SICONV legado (achado
2026-09-10, ver docstring de InstrumentoEquipamento.nr_convenio).

Uso: python -m scripts.job_verificacao_siconv (de dentro de backend/, venv
ativo). ``--forcar`` permanece aceito por compatibilidade, sem efeito.
"""

from __future__ import annotations

import sys

from app.db.base import SessionLocal
from app.db.models import Convenio, InstrumentoEquipamento, Notificacao, NotificacaoTipo
from app.repositories.notificacoes import criar_notificacao

# Reaproveita os helpers ja existentes de scripts/coletar_siconv_legado.py
# (download com retry/cache, parse do zip, filtro por NR_CONVENIO) em vez
# de duplicar -- ver docstring do modulo pra descricao de cada tabela.
from scripts.coletar_siconv_legado import (
    _filtrar_por_numero_convenio,
)

NOME_TABELA = "siconv_convenio"


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
            situacao_por_convenio = {r["NR_CONVENIO"]: r.get("SIT_CONVENIO") for r in registros}

            for numero, nova_situacao in situacao_por_convenio.items():
                instrumento = instrumentos_por_numero.get(numero)
                convenio = convenios_por_numero.get(numero)
                antiga_situacao = convenio.situacao if convenio is not None else None
                fonte_mudou, instrumento_mudou = reconciliar_situacao(convenio, instrumento, nova_situacao)
                if not instrumento_mudou or instrumento is None:
                    continue
                if fonte_mudou and antiga_situacao:
                    criar_notificacao(
                        db,
                        Notificacao(
                            tipo=NotificacaoTipo.atualizacao_api,
                            titulo=f"Convênio {numero} mudou de situação no SICONV",
                            corpo=f"{antiga_situacao} → {nova_situacao}",
                            entidade_id=instrumento.id,
                        ),
                    )
                atualizados += 1
        db.commit()
    finally:
        db.close()

    print(f"Concluído: {atualizados} convênio(s) com situação atualizada.")


if __name__ == "__main__":
    run(forcar="--forcar" in sys.argv)
