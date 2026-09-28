# Plan Mode — Normalização determinística de dados (Onda 1)

## Objetivo

Padronizar CNPJ persistido e eliminar vazio textual sem alterar casos
ambíguos; reparar somente vínculo de responsável cuja identidade seja provada.

## Modelagem e regra

- Campos: `convenio.convenente_cnpj`,
  `instrumento_equipamento.cnpj_convenente`,
  `pagamento_obra_persus.fornecedor_cnpj`, `proposta_candidata.cnpj_ente_recebedor`
  e `cnes_estabelecimento.cnpj`.
- Regra: remover caracteres não numéricos somente quando o resultado tiver 14
  dígitos; `trim(valor)=''` vira `NULL`; qualquer outro caso fica intacto.
- Cada mudança recebe `AuditLog` sem CNPJ em claro (campo, motivo e hash do
  valor anterior). Uma única transação faz dado e auditoria juntos.

## Migração e rollout

- Criar normalizador idempotente com dry-run padrão; `--apply` exige uma
  referência explícita ao snapshot/PITR confirmado.
- Testar no PostgreSQL isolado com dry-run, apply e reexecução sem mudança.
- Só após o backfill comprovado, adicionar CHECK de CNPJ `NOT VALID`, validar
  e registrar a constraint no ORM — em migration posterior à cadeia local
  atualmente em estabilização.

## Fora desta onda

- Município: depende de política canônica de persistência/chave normalizada.
- IBGE 6/7 dígitos: depende de contrato de domínio expand-contract.
- Eventos futuros e titular sem identidade inequívoca: revisão humana.

## Aceite

- Dry-run e apply reportam as mesmas contagens esperadas; segunda execução é
  idempotente.
- Nenhum CNPJ fora de 14 dígitos ou string vazia permanece nos campos
  elegíveis; nenhum valor ambíguo é sobrescrito.
- `AuditLog` não contém CNPJ em claro e `auditar_integridade_database` segue
  verde.

## Execução e evidências — 2026-09-28

- Implementado: `backend/scripts/normalizar_cnpj_database.py`, com
  simulação padrão, aplicação condicionada a `--backup-reference`, transação
  única e auditoria por hash.
- Simulação no banco operacional: **616** alterações elegíveis, todas
  determinísticas — 612 remoções de pontuação (416 Convênio, 86 Instrumento
  e 110 Pagamento PERSUS) e quatro strings vazias para `NULL` (duas em cada
  uma das duas primeiras tabelas). Não houve valor ambíguo elegível e o
  rollback preservou integralmente o banco.
- Lint, formato e mypy do novo script passaram. O teste de integração foi
  criado, mas sua execução está bloqueada pela divergência pré-existente entre
  o ORM local (`valor_obra`/`valor_equipamento`) e o PostgreSQL dedicado de
  teste, ainda na revisão `9c2e4f7a1d38`. Não aplicar DDL manual: estabilizar
  e aplicar a cadeia Alembic local antes de liberar o teste e as CHECKs.
