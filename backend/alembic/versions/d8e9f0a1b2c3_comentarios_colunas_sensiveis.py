"""Comentários nas colunas com dado pessoal ou cadastral sensível (diagnóstico da constituição, N5).

Só `COMMENT ON COLUMN`: nenhuma estrutura muda e nenhum dado é tocado. Serve de inventário LGPD
dentro do próprio banco (`\\d+ tabela` e `pg_description` mostram onde há dado sensível).

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-10-29 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COMENTARIOS = [
    ("user", "email", "Dado pessoal (LGPD): e-mail de login do usuário."),
    ("cnes_estabelecimento", "cnpj", "Dado cadastral do estabelecimento (CNES); pessoa jurídica."),
    ("cnes_estabelecimento", "cep", "Endereço do estabelecimento (CNES)."),
    ("convenio", "convenente_cnpj", "CNPJ do convenente (pessoa jurídica); só dígitos."),
    (
        "convenio",
        "siconv_raw",
        "Payload bruto do SICONV; contém CEP, endereço e telefone do item. Nunca expor inteiro na API.",
    ),
    (
        "convenio",
        "transferegov_raw",
        "Payload bruto do TransfereGov; pode conter dados de contato. Nunca expor inteiro na API.",
    ),
    ("instrumento_equipamento", "cnpj_convenente", "CNPJ do convenente (pessoa jurídica); só dígitos."),
    ("pagamento_obra_persus", "fornecedor_cnpj", "CNPJ do fornecedor/empreiteira (pessoa jurídica); só dígitos."),
    ("proposta_candidata", "cnpj_ente_recebedor", "CNPJ do ente recebedor (pessoa jurídica); só dígitos."),
]


def _aspas(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def upgrade() -> None:
    for tabela, coluna, texto in COMENTARIOS:
        op.execute(f'COMMENT ON COLUMN "{tabela}"."{coluna}" IS {_aspas(texto)}')


def downgrade() -> None:
    for tabela, coluna, _ in COMENTARIOS:
        op.execute(f'COMMENT ON COLUMN "{tabela}"."{coluna}" IS NULL')
