"""situacao_programa_em_operacao

Padroniza a situação do programa (PERSUS I): "Inaugurada/Inaugurado" passam a "Em operação" e "Não inaugurada/o"
a "Em execução", em `instrumento_equipamento` e no espelho `convenio`. Idempotente. O downgrade não restaura a
grafia anterior (a variante original não é recuperável).

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-11-19 20:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EM_OPERACAO = ("Inaugurada", "INAUGURADA", "Inaugurado", "INAUGURADO")
EM_EXECUCAO = ("NÃO INAUGURADA", "NÃO INAUGURADO", "Não inaugurada", "Não inaugurado")


def upgrade() -> None:
    for tabela, coluna in (("instrumento_equipamento", "situacao_programa"), ("convenio", "situacao")):
        for novo, antigos in (("Em operação", EM_OPERACAO), ("Em execução", EM_EXECUCAO)):
            op.execute(
                sa.text(f"UPDATE {tabela} SET {coluna} = :novo WHERE {coluna} = ANY(:antigos)").bindparams(
                    novo=novo, antigos=list(antigos)
                )
            )


def downgrade() -> None:
    pass
