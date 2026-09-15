"""Job de verificacao -- Radar de Convenios (fluxo em
docs/arquitetura/fluxo_requisicao.md). Roda DIARIO, mas em 2 estagios pra
nao pagar o custo de rebaixar ~300MB de dump todo dia:

  Estagio 1 (leve, todo dia): HEAD no siconv_convenio.csv.zip, compara o
  header Last-Modified contra o que foi salvo na ultima rodada -- ver
  achado 2026-09-15 na investigacao do repositorio.dados.gov.br/seges/detru/
  (61 arquivos com timestamp identico, ~2 meses parado no momento da
  checagem; nenhuma periodicidade oficial documentada, so o historico de
  *schema*, nao de dado -- por isso HEAD-check em vez de reprocessar cego
  todo dia).

  Estagio 2 (pesado, so quando o estagio 1 acusa mudanca real): rebaixa e
  filtra siconv_convenio.csv.zip pelos NR_CONVENIO conhecidos, diffa
  SIT_CONVENIO contra InstrumentoEquipamento.situacao_prestacao_contas,
  atualiza so o que mudou de verdade e notifica (camada 1 -- mesmo padrao
  de job_descoberta_transferegov.py).

Escopo: so instrumento com tipo_contratacao == "Convenio" (nr_convenio
aqui e o NR_CONVENIO real do SICONV). FAF/TED ficam de fora -- nr_convenio
deles e o NUP SEI (so digitos), nunca existiu no SICONV legado (achado
2026-09-10, ver docstring de InstrumentoEquipamento.nr_convenio).

Uso: python -m scripts.job_verificacao_siconv (de dentro de backend/, venv
ativo). `--forcar` pula o HEAD-check e reprocessa direto (util pra testar
ou depois de um `git rm` do cache local).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento, Notificacao, NotificacaoTipo

# Reaproveita os helpers ja existentes de scripts/coletar_siconv_legado.py
# (download com retry/cache, parse do zip, filtro por NR_CONVENIO) em vez
# de duplicar -- ver docstring do modulo pra descricao de cada tabela.
from scripts.coletar_siconv_legado import (
    BASE_URL,
    TIMEOUT,
    _filtrar_por_numero_convenio,
    _sessao_com_retry,
)

ESTADO_JSON = Path(__file__).parent / "output" / "siconv_verificacao_estado.json"
NOME_TABELA = "siconv_convenio"


def _last_modified_remoto(sessao) -> str | None:
    resp = sessao.head(
        f"{BASE_URL}/{NOME_TABELA}.csv.zip",
        timeout=TIMEOUT,
        headers={"User-Agent": "Mozilla/5.0"},
        allow_redirects=True,
    )
    resp.raise_for_status()
    return resp.headers.get("Last-Modified")


def _last_modified_salvo() -> str | None:
    if not ESTADO_JSON.exists():
        return None
    return json.loads(ESTADO_JSON.read_text(encoding="utf-8")).get("last_modified")


def _salvar_last_modified(valor: str | None) -> None:
    ESTADO_JSON.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_JSON.write_text(json.dumps({"last_modified": valor}, ensure_ascii=False, indent=2), encoding="utf-8")


def run(forcar: bool = False) -> None:
    sessao = _sessao_com_retry()

    if not forcar:
        atual = _last_modified_remoto(sessao)
        salvo = _last_modified_salvo()
        if atual is not None and atual == salvo:
            print(f"SICONV legado sem mudanca (Last-Modified={atual!r} igual ao ultimo check). Nada a fazer.")
            return
        print(f"SICONV legado mudou (Last-Modified {salvo!r} -> {atual!r}) ou primeiro check -- reprocessando.")
    else:
        atual = _last_modified_remoto(sessao)
        print("--forcar: pulando o HEAD-check, reprocessando direto.")

    db = SessionLocal()
    atualizados = 0
    try:
        instrumentos = (
            db.query(InstrumentoEquipamento)
            .filter(InstrumentoEquipamento.tipo_contratacao == "Convênio")
            .all()
        )
        numeros = {i.nr_convenio for i in instrumentos}
        if not numeros:
            print("Nenhum InstrumentoEquipamento com tipo_contratacao='Convênio' cadastrado -- nada pra diffar.")
        else:
            registros = _filtrar_por_numero_convenio(NOME_TABELA, numeros)
            situacao_por_convenio = {r["NR_CONVENIO"]: r.get("SIT_CONVENIO") for r in registros}

            for instrumento in instrumentos:
                nova_situacao = situacao_por_convenio.get(instrumento.nr_convenio)
                if nova_situacao is None:
                    continue  # convenio nosso nao apareceu no dump desta rodada -- nao apaga o que ja sabemos
                antiga_situacao = instrumento.situacao_prestacao_contas
                if nova_situacao == antiga_situacao:
                    continue
                instrumento.situacao_prestacao_contas = nova_situacao
                db.add(Notificacao(
                    tipo=NotificacaoTipo.atualizacao_api,
                    titulo=f"Convênio {instrumento.nr_convenio} mudou de situação no SICONV",
                    corpo=f"{antiga_situacao or '(vazio)'} → {nova_situacao}",
                    entidade_id=instrumento.id,
                ))
                atualizados += 1
        db.commit()
    finally:
        db.close()

    _salvar_last_modified(atual)
    print(f"Concluído: {atualizados} convênio(s) com situação atualizada.")


if __name__ == "__main__":
    run(forcar="--forcar" in sys.argv)
