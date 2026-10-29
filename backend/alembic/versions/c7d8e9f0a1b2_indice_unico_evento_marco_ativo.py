"""Índice único: só 1 EventoMarco ativo por (instrumento, marco) nos marcos de fase geral.

A regra "ativo = substituido_por_id IS NULL AND deletado_em IS NULL" vale como linha única só para
a fase geral (a fase atual do instrumento). Cronograma físico e regulatório repetem de verdade:
convênio com mais de um equipamento (um evento por equipamento), entrega por item e unidade
(cada entrega tem registro e data próprios) e licenças por equipamento.

Auditoria de banco (2026-10-28): 158 pares (instrumento, marco) tinham mais de 1 evento ativo,
herdados de imports que nunca marcaram o evento antigo como substituído. A consolidação
(`scripts/consolidar_eventos_marco_duplicados.py`) agora trata só a fase geral e precisa ter rodado
antes desta migration; se esta falhar por violação de unicidade, rode-a de novo.

O predicado lista os ids dos marcos de fase geral lidos do catálogo no momento da migration, porque
um índice parcial não consulta outra tabela. Marco de fase geral novo no catálogo exige recriar o
índice com `app.db.indices.garantir_indice_unico_fase_geral` (o seed já chama; há um teste que acusa a divergência).

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-10-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDICE = "uq_evento_marco_fase_geral_ativo"


def upgrade() -> None:
    conexao = op.get_bind()
    ids = [
        linha[0]
        for linha in conexao.exec_driver_sql("SELECT id FROM marco_catalogo WHERE grupo = 'fase_geral' ORDER BY id")
    ]
    if not ids:
        # Banco novo: o catálogo entra depois (seed) e `app.db.indices.garantir_indice_unico_fase_geral` cria o índice.
        return
    lista = ", ".join(str(int(i)) for i in ids)
    op.execute(
        f"CREATE UNIQUE INDEX {_INDICE} ON evento_marco (instrumento_id, marco_id) "
        f"WHERE substituido_por_id IS NULL AND deletado_em IS NULL AND marco_id IN ({lista})"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDICE}")
