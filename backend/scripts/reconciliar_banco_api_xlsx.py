"""Reconcilia `InstrumentoEquipamento.{nome_convenente,cnpj_convenente}`
com a API do Portal da Transparência (identidade jurídica do convenente) --
pedido do usuário 2026-09-11: "coerência entre os dados de acordo com a
hierarquia: API, B8131710".

Escopo FOI REDUZIDO em relação ao pedido original depois de reler
CLAUDE.md a pedido do usuário ("leia o contexto do projeto pra não fazer
bobagem") e de validar `municipio`/`uf` contra uma 3ª fonte (ElastiCNES):

- **`equipamento_descricao` NÃO é tocado aqui.** CLAUDE.md, seção
  "Monitoramento interno de equipamento": esse campo é protegido de
  edição *de propósito* mesmo pelo endpoint oficial do app
  (`InstrumentoEquipamentoUpdate` não inclui esse campo, com teste
  dedicado `test_patch_cadastro_nunca_toca_equipamento_descricao`) --
  sobrescrever via script bypassaria uma decisão de produto deliberada.
  Os 7 casos onde o banco aponta pro item de menor valor (não o de
  maior) dentro do rol, achados na validação de 2026-09-11, ficam
  registrados pra decisão manual da equipe, não corrigidos automaticamente.
- **`municipio`/`uf` NÃO vêm da API aqui.** Testado ao vivo 2026-09-11
  (convênio 973049, Fundo Estadual de Saúde da Bahia): a API aponta
  Salvador (sede administrativa/endereço de cadastro do CONVENENTE), mas
  o CNES do instrumento (4026896) resolve pro Hospital Regional de Irecê
  -- o estabelecimento REAL onde o equipamento vai. Validado contra TODOS
  os 71 registros via `equipment_offer_row` (nosso ElastiCNES, join por
  `cnes_code`): banco bate 100% com o CNES (0 divergência em 68/71 com
  CNES presente no ElastiCNES) -- ou seja, pra "Fundo Estadual/Municipal
  de Saúde" como convenente, a API do Portal da Transparência erra
  sistematicamente o município (usa a sede do fundo, não o hospital
  destino). CLAUDE.md também já documenta essa fragilidade ("não propor
  cruzamento por nome de município"). CNES > API pra esse campo
  especificamente -- e o banco já bate com o CNES, nada a reconciliar.

O que SOBRA nesta reconciliação -- seguro, sem proteção documentada,
identidade jurídica sem ambiguidade:
  - `nome_convenente` <- `convenente.nome` da API.
  - `cnpj_convenente` <- `convenente.cnpjFormatado` da API (inclui casos
    reais de FILIAL diferente da cadastrada no banco, não só formatação).

Dry-run por padrão (`--aplicar` grava de verdade).

Uso:
  python -m scripts.reconciliar_banco_api_xlsx              # só mostra o diff
  python -m scripts.reconciliar_banco_api_xlsx --aplicar    # aplica no banco
"""

from __future__ import annotations

import sys
import time
from typing import Any

import requests

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento
from app.pipeline.portal_transparencia import ChaveApiAusenteError, _sessao_com_retry, buscar_convenio_por_numero


def _mudancas_de_identidade(
    instrumento: InstrumentoEquipamento, dado_api: dict[str, Any]
) -> dict[str, tuple[str | None, str]]:
    """Compara somente identidade jurídica, nunca município ou equipamento."""
    convenente: dict[str, Any] = dado_api.get("convenente") or {}
    candidatos = {
        "nome_convenente": convenente.get("nome"),
        "cnpj_convenente": convenente.get("cnpjFormatado"),
    }
    return {
        campo: (getattr(instrumento, campo), valor)
        for campo, valor in candidatos.items()
        if isinstance(valor, str) and valor != getattr(instrumento, campo)
    }


def _buscar_identidade_na_api(sessao: requests.Session, nr_convenio: str) -> dict[str, Any] | None:
    try:
        dado_api = buscar_convenio_por_numero(nr_convenio, session=sessao)
    except ChaveApiAusenteError:
        raise
    except requests.RequestException as erro:
        print(f"   [ERRO REDE] {nr_convenio}: {erro} -- pulado, nada alterado.")
        return None
    time.sleep(0.05)
    if dado_api is None:
        print(f"   [AVISO] {nr_convenio} não encontrado na API agora -- pulado, nada alterado.")
    return dado_api


def run(aplicar: bool) -> None:
    print(
        f"=== Reconciliação nome_convenente/cnpj_convenente <- API ({'APLICANDO' if aplicar else 'DRY-RUN, nada é gravado'}) ===\n"
    )

    db = SessionLocal()
    instrumentos = db.query(InstrumentoEquipamento).filter(InstrumentoEquipamento.tipo_contratacao == "Convênio").all()
    print(f"{len(instrumentos)} instrumento(s) 'Convênio' no banco.\n")

    sessao = _sessao_com_retry()
    diffs: list[tuple[InstrumentoEquipamento, dict[str, tuple[str | None, str]]]] = []
    for i, inst in enumerate(instrumentos, 1):
        if i % 20 == 0:
            print(f"   ... {i}/{len(instrumentos)}")
        dado_api = _buscar_identidade_na_api(sessao, inst.nr_convenio)
        if dado_api is None:
            continue

        mudancas = _mudancas_de_identidade(inst, dado_api)

        if mudancas:
            diffs.append((inst, mudancas))
            print(f"[{inst.nr_convenio}]")
            for campo, (antes, depois) in mudancas.items():
                print(f"   {campo}: {antes!r} -> {depois!r}")
            if aplicar:
                for campo, (_, depois) in mudancas.items():
                    setattr(inst, campo, depois)

    print(f"\n{len(diffs)}/{len(instrumentos)} instrumento(s) com nome/CNPJ divergente da API.")
    if aplicar:
        db.commit()
        print("Gravado no banco.")
    else:
        print("Dry-run -- nada foi gravado. Rode com --aplicar pra gravar de verdade.")
    db.close()


if __name__ == "__main__":
    run(aplicar="--aplicar" in sys.argv)
