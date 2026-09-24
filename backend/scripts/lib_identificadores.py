"""Helper compartilhado pra origem sem número oficial (FAF/TED sem
TransfereGov, PERSUS I/II e PRONON) -- correção 2026-09-18 do Plan Mode
monitoramento-ingestao: o identificador visível (nr_convenio/numero) não
pode mais ser derivado direto da fonte (NUP SEI só com dígitos colados
ficou "muito ruim" pra leitura, pedido do usuário), mas o script ainda
precisa de uma chave ESTÁVEL pra upsert entre execuções -- ver
`chave_origem` em app/db/models.py (Convenio e InstrumentoEquipamento).

Uso: gerar 1x na criação (checando colisão contra os identificadores já
usados nas duas tabelas), nunca mais regenerar pro mesmo `chave_origem`.
"""

from __future__ import annotations

import random


def gerar_identificador_aleatorio(prefixo: str, existentes: set[str]) -> str:
    """6 dígitos aleatórios com prefixo do tipo (ex. "FAF-284917") -- só
    pra registro sem número oficial. `existentes` deve conter TODO
    identificador já em uso (numero de Convenio + nr_convenio de
    InstrumentoEquipamento), pra nunca colidir entre as duas tabelas."""
    while True:
        candidato = f"{prefixo}-{random.randint(100000, 999999)}"
        if candidato not in existentes:
            existentes.add(candidato)
            return candidato
