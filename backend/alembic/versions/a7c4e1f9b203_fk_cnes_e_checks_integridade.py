"""fk_cnes_e_checks_integridade

Revision ID: a7c4e1f9b203
Revises: e3a9c5b7d2f1
Create Date: 2026-09-16 16:30:00.000000

Bloco 7 da constituicao database: apos auditoria limpa no clone carregado
(`par_equipamentos_pytest_loaded`), promove a relacao CNES para FK fisica e
adiciona CHECKs basicos ja medidos pelo script de auditoria.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7c4e1f9b203"
down_revision: Union[str, Sequence[str], None] = "e3a9c5b7d2f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alinha tipo com a PK de cnes_estabelecimento (varchar(7)) -- sem isso
    # o Postgres recusa a FK.
    op.alter_column(
        "instrumento_equipamento",
        "cnes",
        existing_type=sa.String(),
        type_=sa.String(length=7),
        existing_nullable=True,
    )

    op.create_index("idx_convenio_cnes", "convenio", ["cnes"])
    op.create_index("idx_instrumento_equipamento_cnes", "instrumento_equipamento", ["cnes"])
    op.create_index("idx_proposta_candidata_cnes", "proposta_candidata", ["cnes"])

    op.create_foreign_key(
        "fk_convenio_cnes_estabelecimento",
        "convenio",
        "cnes_estabelecimento",
        ["cnes"],
        ["cnes"],
        ondelete="SET NULL",
        onupdate="RESTRICT",
    )
    op.create_foreign_key(
        "fk_instrumento_equipamento_cnes_estabelecimento",
        "instrumento_equipamento",
        "cnes_estabelecimento",
        ["cnes"],
        ["cnes"],
        ondelete="SET NULL",
        onupdate="RESTRICT",
    )
    op.create_foreign_key(
        "fk_proposta_candidata_cnes_estabelecimento",
        "proposta_candidata",
        "cnes_estabelecimento",
        ["cnes"],
        ["cnes"],
        ondelete="SET NULL",
        onupdate="RESTRICT",
    )

    op.create_check_constraint(
        "ck_cnes_estabelecimento_cnes_formato",
        "cnes_estabelecimento",
        "cnes ~ '^[0-9]{7}$'",
    )
    op.create_check_constraint(
        "ck_cnes_estabelecimento_latitude",
        "cnes_estabelecimento",
        "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
    )
    op.create_check_constraint(
        "ck_cnes_estabelecimento_longitude",
        "cnes_estabelecimento",
        "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
    )
    op.create_check_constraint(
        "ck_equipment_offer_row_latitude",
        "equipment_offer_row",
        "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
    )
    op.create_check_constraint(
        "ck_equipment_offer_row_longitude",
        "equipment_offer_row",
        "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
    )
    op.create_check_constraint(
        "ck_equipment_offer_row_existing_qty",
        "equipment_offer_row",
        "existing_qty >= 0",
    )
    op.create_check_constraint(
        "ck_equipment_offer_row_in_use_qty",
        "equipment_offer_row",
        "in_use_qty >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_equipment_offer_row_in_use_qty", "equipment_offer_row", type_="check")
    op.drop_constraint("ck_equipment_offer_row_existing_qty", "equipment_offer_row", type_="check")
    op.drop_constraint("ck_equipment_offer_row_longitude", "equipment_offer_row", type_="check")
    op.drop_constraint("ck_equipment_offer_row_latitude", "equipment_offer_row", type_="check")
    op.drop_constraint("ck_cnes_estabelecimento_longitude", "cnes_estabelecimento", type_="check")
    op.drop_constraint("ck_cnes_estabelecimento_latitude", "cnes_estabelecimento", type_="check")
    op.drop_constraint("ck_cnes_estabelecimento_cnes_formato", "cnes_estabelecimento", type_="check")

    op.drop_constraint("fk_proposta_candidata_cnes_estabelecimento", "proposta_candidata", type_="foreignkey")
    op.drop_constraint("fk_instrumento_equipamento_cnes_estabelecimento", "instrumento_equipamento", type_="foreignkey")
    op.drop_constraint("fk_convenio_cnes_estabelecimento", "convenio", type_="foreignkey")

    op.drop_index("idx_proposta_candidata_cnes", table_name="proposta_candidata")
    op.drop_index("idx_instrumento_equipamento_cnes", table_name="instrumento_equipamento")
    op.drop_index("idx_convenio_cnes", table_name="convenio")

    op.alter_column(
        "instrumento_equipamento",
        "cnes",
        existing_type=sa.String(length=7),
        type_=sa.String(),
        existing_nullable=True,
    )
