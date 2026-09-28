# Diagnóstico da Constituição Database — 2026-09-28

## Escopo e método

Esta revalidação consolida a auditoria somente leitura do Neon em
`auditoria-completa-database-2026-09-28.md` e a árvore Alembic local. Não foi
executado DDL nem DML.

## Evidências

- Auditoria operacional: 29 tabelas com PK, 40 FKs, 44 CHECKs e oito
  verificações de integridade sem órfãos, CNES inválidos, coordenadas inválidas
  ou quantidade negativa.
- A auditoria encontrou CNPJ formatável em 612 registros, quatro strings
  vazias, 69 grupos de variação de município e um titular ainda só no campo
  textual legado.
- O Neon estava em `7fd36a4d65a5`; o head local é agora `f7a8b9c0d1e2`,
  portanto a defasagem cresceu desde a coleta operacional.

## Avaliação

**Conformidade: 8,2/10.** Integridade relacional é forte; os riscos ativos são
drift de schema e contratos de normalização, não corrupção massiva.

### P1 — produção está atrás do código de schema

Aplicar migrations somente pelo workflow dedicado, em janela com PITR/snapshot
confirmado e smoke test posterior. Não apontar Alembic local ao Neon, nem usar
role runtime para DDL.

### P1 — normalização de CNPJ e município requer execução controlada

Converter somente CNPJ determinístico para 14 dígitos e vazio para `NULL`;
município exige primeiro política de persistência e chave normalizada. Gerar
dry-run por PK e validar antes/depois.

### P2 — IBGE e proveniência são contratos, não limpeza textual

O código IBGE de seis e sete dígitos e a origem de dado textual precisam de
expand-contract e relação auditável. Eventos futuros requerem revisão humana e
preservação append-only.

## Próximo Plan Mode

Executar a onda já proposta em `planmode-normalizacao-database-2026-09-28.md`,
começando pela migration pendente e normalizações determinísticas reversíveis.
