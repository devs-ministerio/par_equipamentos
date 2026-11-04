"""Parceria confirmada do TransfereGov novo passa a ser FAF.

O tipo de contratação "Parceria TransfereGov" deixa de existir: toda parceria do TransfereGov
novo é Fundo a Fundo (decisão do usuário, 04/11/2026). Só `instrumento_equipamento` guarda esse
valor. O downgrade restaura o valor antigo apenas nos instrumentos cujo número é o código da
parceria ou o id de uma proposta (os FAF de carga manual usam o NUP e não são tocados).

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-11-04 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE instrumento_equipamento SET tipo_contratacao = 'FAF' WHERE tipo_contratacao = 'Parceria TransfereGov'"
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE instrumento_equipamento i SET tipo_contratacao = 'Parceria TransfereGov'
        WHERE i.tipo_contratacao = 'FAF'
          AND EXISTS (
            SELECT 1 FROM proposta_candidata p
            WHERE i.nr_convenio = p.cd_parceria OR i.nr_convenio = p.id_proposta::text
          )
        """
    )
