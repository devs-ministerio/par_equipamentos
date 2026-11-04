"""Instrumentos firmados -- achado 2026-09-16, pedido do usuário: "vamos
parar de usar json estático, coloque tudo no banco". Substitui o merge
client-side de `convenios.json`/`siconv.json`/`transferegov.json`
(`frontend/src/lib/mesclar-convenios.ts`) por leitura direta da tabela
`convenio` (carregada por `scripts/importar_convenios_banco.py`).

Filtros espelham o que `MonitoramentoEquipamentosPage.tsx` já filtrava
client-side (busca/UF/equipamento/situação/ano/programa) -- movidos pro
banco junto com a paginação, em vez de trazer os 403 inteiros pro front
sempre.

Leitura exige sessão (`require_current_user`) desde 2026-09-17, decisão do
usuário: todo o app fica atrás de login por enquanto (Plan Mode segurança
2026-09-16, Bloco 5) -- não só por paridade com o resto do app, mas porque
`GET /convenios/{numero}` devolve `siconv_raw`/`transferegov_raw` por
inteiro, que contêm CEP/endereço do item (`CEP_ITEM`/`ENDERECO_ITEM`/
`ed_cep`), confirmado em registro real do banco. Sem mutação (`convenio`
só é escrito pelo script de import), então não há distinção editor/leitor
aqui, só sessão válida.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import User
from app.schemas_convenios import ConvenioDetalheRead, ConvenioListaRead
from app.services import convenios as servico

router = APIRouter(prefix="/convenios", tags=["convenios"])


@router.get("", response_model=ConvenioListaRead)
def listar_convenios(
    busca: str | None = None,
    uf: str | None = None,
    equipamento: str | None = None,
    situacao: str | None = None,
    ano: int | None = None,
    programa: str | None = None,
    tipo_contratacao: str | None = None,
    pagina: int = Query(1, ge=1),
    # Teto subiu de 500 pra 1000 (correção 2026-09-18): universo de
    # "Instrumentos firmados" passou de 403 pra 581 com a entrada de FAF/
    # TED/PERSUS I/PERSUS II/PRONON -- ainda rede de segurança, não
    # paginação de UI real (ver CLAUDE.md, mesmo padrão do Plan Mode
    # consolidação 2026-09-17, Bloco 4).
    tamanho_pagina: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    return servico.listar_convenios(
        db=db,
        busca=busca,
        uf=uf,
        equipamento=equipamento,
        situacao=situacao,
        ano=ano,
        programa=programa,
        tipo_contratacao=tipo_contratacao,
        pagina=pagina,
        tamanho_pagina=tamanho_pagina,
    )


@router.get("/{numero}", response_model=ConvenioDetalheRead)
def obter_convenio(numero: str, db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    return servico.obter_convenio(db=db, numero=numero)
