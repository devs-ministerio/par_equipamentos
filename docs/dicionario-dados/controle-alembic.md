# Dicionário de dados: Controle de migrations

Tabela do Alembic, fora dos domínios de negócio. Gerado do schema real no head `d9e0f1a2b3c4` e dos modelos em `backend/app/db/`. Legenda e convenções em [README](README.md).

## `alembic_version`

Controle de versão das migrations do Alembic (fora dos domínios).

Chave primária: `version_num`. Colunas: 1.

Em produção: `e9f0a1b2c3d4`. No head: `d9e0f1a2b3c4`.

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `version_num` | varchar(32) | não | Revisão atual do Alembic (head: `d9e0f1a2b3c4`). | PK |
