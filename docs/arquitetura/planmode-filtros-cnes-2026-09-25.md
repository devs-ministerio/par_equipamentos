# Plan Mode — filtros por CNES (2026-09-25)

## Objetivo

Permitir localizar registros pelo CNES nas três superfícies que já possuem
busca textual e não exibir mensagem de ausência para Programa vazio.

## Escopo

- Dados oficiais: incluir `ConvenioUnificado.cnes` na busca client-side.
- Linhas de financiamento: incluir `PropostaCandidata.cnes` na busca.
- Monitoramento interno: incluir `InstrumentoEquipamento.cnes` na busca.
- Card de convênio: deixar o valor de Programa vazio quando não houver fonte.

## Estratégia e UX

- Reutilizar os campos de busca e filtros existentes, sem novo endpoint,
  estado global, seletor ou alteração de contrato Zod.
- Atualizar os placeholders para comunicar CNES como critério válido.
- Preservar normalização de texto, paginação, filtros em cascata, estados
  vazio/erro e responsividade existentes.
- Não mostrar aviso de sucesso: a alteração é um refinamento de pesquisa,
  não uma mutação.

## Riscos e testes

- CNES nulo permanece pesquisável como texto vazio, sem falso positivo.
- Testes de regressão cobrem os três domínios e o programa vazio.
- Executar lint, typecheck, testes e build; atualizar diagnósticos somente se
  houver evidência nova ou divergência do estado documentado.
