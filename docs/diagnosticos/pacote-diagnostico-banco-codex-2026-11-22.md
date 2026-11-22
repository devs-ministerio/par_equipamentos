# Pacote para o diagnóstico do banco (Codex), 22/11/2026

Objetivo: uma segunda leitura independente do banco do SISGEO antes do dicionário de dados. Só leitura; o Codex não altera banco, migration nem código.

## Material

| Arquivo | Para que serve |
|---|---|
| [banco-de-dados.md](../mermaid/banco-de-dados.md) | 5 diagramas ER (50 tabelas, 596 colunas, 98 FKs no head `d9e0f1a2b3c4`) |
| [relatorio-limpeza-banco-2026-11-22.md](relatorio-limpeza-banco-2026-11-22.md) | O que parece sem uso, com evidência e decisões do usuário |
| [roteiro-release-radar-monitoramento-2026-11-22.md](../runbooks/roteiro-release-radar-monitoramento-2026-11-22.md) | As 12 migrations pendentes e a ordem de release |
| `backend/app/db/models.py`, `models_legado.py` | Fonte do schema |
| `backend/alembic/versions/` | Histórico de migrations |

## Onde rodar

Use um clone local, nunca produção: `sigeo_ensaio_release_20261122` (head, 12 migrations aplicadas) ou `sigeo_homologacao_clone_20261120`. Antes de qualquer consulta: `select current_database(), current_user`.

## Perguntas ao Codex

1. Integridade: FKs ausentes onde há junção por texto (`instrumento_equipamento` ↔ `convenio` junta por número e `tipo_contratacao`, sem FK). Órfãos, duplicados e chaves que deveriam ser únicas.
2. Tipos e nulidade: colunas `varchar` que guardam data, número ou booleano; colunas nulas em 100% das linhas; NOT NULL ausente onde o código assume valor.
3. Índices: duplicados, redundantes, ausentes em FK e em filtros frequentes das rotas.
4. Convenções: nomes inconsistentes (português e inglês misturados), enums contra CHECKs, timestamps com e sem fuso.
5. Append-only: confirmar que `evento_marco`, `acao_monitoramento`, `entrega_equipamento`, `decisao_classificacao_item` e `candidato_legado_decisao` não têm caminho de UPDATE ou DELETE físico.
6. Migrations: risco de cada uma das 12 (`ALTER TYPE`, UPDATE de catálogo) e reversibilidade.
7. Itens do relatório de limpeza: concordar, discordar ou acrescentar.

## Fora do escopo

Regra de negócio de cobertura (ver `docs/metodologia-parametros.md`), dados pessoais de usuários, credenciais, e qualquer escrita.

## Formato da resposta pedido

Tabela com: achado, tabela ou coluna, evidência (consulta e resultado), gravidade (alta, média, baixa) e sugestão. Marcar como "a confirmar" o que for inferência sem consulta.

## Depois

Os achados aceitos entram numa migration de limpeza separada (backup e aprovação antes) e alimentam o dicionário de dados, que sai do modelo, dos comentários e dos schemas, com campo sem fonte marcado "a confirmar".
