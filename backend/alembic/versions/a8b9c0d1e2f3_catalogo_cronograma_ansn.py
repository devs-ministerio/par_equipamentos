"""catalogo_cronograma_ansn

Catálogo do Cronograma (rótulos, marcos novos e ordem) e CNEN -> ANSN nos rótulos.

Revision ID: a8b9c0d1e2f3
Revises: f6a7b8c9d0e2
Create Date: 2026-11-19 15:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "a8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (codigo, ordem, rotulo novo, rotulo antigo ou None se o marco é novo)
_MARCOS = [
    ("cronograma_inicio_fabricacao", 10, "Início da fabricação", "Início da fabricação"),
    ("cronograma_fabricacao_concluida", 20, "Fabricação concluída / disponível para expedição", None),
    ("cronograma_chegada_porto", 30, "Chegada ao Brasil", "Chegada no Brasil (porto)"),
    ("cronograma_desembaraco_aduaneiro", 40, "Desembaraço aduaneiro concluído", None),
    ("cronograma_obra_inicio", 50, "Início da reforma/obra", "Início da reforma/obra"),
    ("cronograma_infraestrutura_pronta", 60, "Infraestrutura pronta para receber o equipamento", None),
    ("cronograma_obra_fim", 70, "Conclusão da reforma/obra", "Fim da reforma/obra"),
    ("cronograma_entrega", 80, "Entrega no estabelecimento", "Entrega no estabelecimento"),
    ("cronograma_instalacao_inicio", 90, "Início da instalação", "Instalação — início"),
    ("cronograma_instalacao_fim", 100, "Conclusão da instalação", "Instalação — final"),
    ("cronograma_comissionamento", 110, "Testes de aceitação / comissionamento", "Comissionamento (teste de aceite)"),
    ("cronograma_treinamento", 120, "Treinamento da equipe concluído", None),
    ("cronograma_inicio_operacao", 130, "Início da operação assistencial", None),
]


def _lit(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def upgrade() -> None:
    for codigo, ordem, rotulo, antigo in _MARCOS:
        if antigo is None:
            op.execute(
                f"""
                INSERT INTO marco_catalogo (codigo, grupo, rotulo, ordem)
                SELECT {_lit(codigo)}, 'cronograma_fisico', {_lit(rotulo)}, {ordem}
                WHERE NOT EXISTS (SELECT 1 FROM marco_catalogo WHERE codigo = {_lit(codigo)})
                """
            )
        else:
            op.execute(
                f"UPDATE marco_catalogo SET rotulo = {_lit(rotulo)}, ordem = {ordem} WHERE codigo = {_lit(codigo)}"
            )
    op.execute("UPDATE marco_catalogo SET rotulo = REPLACE(rotulo, 'CNEN', 'ANSN') WHERE rotulo LIKE '%CNEN%'")


def downgrade() -> None:
    op.execute("UPDATE marco_catalogo SET rotulo = REPLACE(rotulo, 'ANSN', 'CNEN') WHERE rotulo LIKE '%ANSN%'")
    for codigo, _ordem, _rotulo, antigo in _MARCOS:
        if antigo is None:
            op.execute(
                f"""
                DELETE FROM marco_catalogo
                WHERE codigo = {_lit(codigo)}
                  AND NOT EXISTS (
                      SELECT 1 FROM evento_marco e JOIN marco_catalogo m ON m.id = e.marco_id
                      WHERE m.codigo = {_lit(codigo)}
                  )
                """
            )
        else:
            op.execute(f"UPDATE marco_catalogo SET rotulo = {_lit(antigo)}, ordem = NULL WHERE codigo = {_lit(codigo)}")
