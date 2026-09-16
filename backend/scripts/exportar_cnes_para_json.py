"""Propaga `cnes`/`cnes_nome_estabelecimento` da tabela `Convenio` (banco)
pro `convenios.json` estático -- achado 2026-09-16, pedido do usuário:
"coloca o cnes em destaque nos convênios... nome do estabelecimento
também abaixo do nome do convenente". A página `MonitoramentoEquipamentosPage.tsx`
ainda lê o JSON estático (migração pra `GET /convenios` é fase separada,
ver docstring de app/routers/convenios.py) -- até lá, esse script é o elo
entre o CNES já resolvido no banco (`scripts/importar_convenios_banco.py`)
e o que o card de convênio (`convenio-card-header.tsx`) exibe.

Uso: rodar DEPOIS de `importar_convenios_banco.py` (precisa do CNES já
resolvido no banco), de dentro de backend/, venv ativo:
    uv run python -m scripts.exportar_cnes_para_json
Sempre reescreve `frontend/public/monitoramento-equipamentos/convenios.json`
inteiro (idempotente) -- roda de novo sempre que `convenios.json` for
regenerado do zero (ver README.md desse diretório, passo adicional listado
lá) ou o CNES no banco mudar (ex. edição manual via PATCH)."""
from __future__ import annotations

import json
from pathlib import Path

from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento, Convenio

CONVENIOS_JSON = Path(__file__).parent.parent.parent / "frontend" / "public" / "monitoramento-equipamentos" / "convenios.json"


def run() -> None:
    db = SessionLocal()
    try:
        convenios_db = {c.numero: c for c in db.query(Convenio).all()}
        cnes_nomes = {c.cnes: c.nome_estabelecimento for c in db.query(CnesEstabelecimento).all()}
    finally:
        db.close()

    data = json.loads(CONVENIOS_JSON.read_text(encoding="utf-8"))
    atualizados = 0
    for item in data:
        conv = convenios_db.get(item["numero"])
        if conv and conv.cnes:
            item["cnes"] = conv.cnes
            item["cnes_nome_estabelecimento"] = cnes_nomes.get(conv.cnes)
            atualizados += 1
        else:
            item["cnes"] = None
            item["cnes_nome_estabelecimento"] = None
    CONVENIOS_JSON.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"Concluído: {atualizados} de {len(data)} convênio(s) com CNES gravado(s) em {CONVENIOS_JSON}.")


if __name__ == "__main__":
    run()
