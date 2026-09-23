# Plan Mode — Linhas de Financiamento: adesão ao monitoramento (2026-09-21) — executado

## Decisão e limite

- Substituir no card de proposta os controles **“Aceitar — criar instrumento monitorado”** e **“Rejeitar”** — interpreto “beijar” como o segundo controle existente — por **“+ Adicionar ao monitoramento interno”**.
- A ação deve reutilizar a mesma criação explícita de `POST /monitoramento/instrumentos` já usada pelos Instrumentos/Programas; não criar outro fluxo de revisão nem uma segunda regra de montagem de instrumento.
- `situacao_proposta` e a etapa externa do TransfereGov continuam sendo dados de consulta. Eles não devem ser confundidos com uma decisão interna, que deixará de existir.

## Bloco 0 — inventário, preservação e contrato

- Registrar a migração do fluxo atual e reconciliar propostas já `aceita`/`rejeitada`, instrumentos gerados e `AuditLog`; não apagar histórico nem colunas sem backup e aprovação explícita para uma migração destrutiva.
- Definir um único adaptador tipado de proposta para `CriarInstrumentoInput`: usar `cd_parceria` quando disponível, senão `id_proposta`; preservar CNPJ, proponente, município, UF, CNES e `tipo_contratacao="Parceria TransfereGov"`.
- Confirmar que a chave acima detecta instrumento já monitorado antes de exibir a ação e que a validação de duplicidade continua autoritativa no backend.

## Bloco 1 — frontend e experiência

- Generalizar `adicionar-monitoramento-button.tsx` para receber dados de inclusão tipados, mantendo as duas confirmações, técnico responsável, permissões de editor, invalidação React Query e tratamento de erro já aprovados no fluxo de convênio.
- Adaptar `proposta-card.tsx` e `secao-propostas-candidatas.tsx` para montar o adaptador e exibir apenas o novo botão (ou indicação/link do instrumento quando já incluído); remover props e UI de revisão.
- Simplificar `use-propostas-candidatas.ts` e `services/propostas-candidatas.ts`: manter somente leitura paginada/filtros de descoberta, sem mutation, enum/status interno ou campos de revisão no contrato Zod.

## Bloco 2 — backend, jobs e persistência

- Retirar `POST /propostas-candidatas/{id}/revisar`, `DecisaoRevisao` e `revisar_proposta_candidata`; a autorização e auditoria permanecem concentradas em `criar_instrumento_monitorado`.
- Alterar repositório/router de propostas para não filtrar/expor status de revisão. Preservar a consulta autenticada e os filtros de domínio (UF, busca, ano).
- Ajustar `job_descoberta_transferegov.py`, `importar_propostas_pronon_radar.py` e `job_verificacao_transferegov.py` para reconhecer o vínculo pela chave canônica do instrumento, não por `status=aceita`; a descoberta deve continuar atualizando dados externos mesmo após a inclusão manual.
- Não remover de imediato `PropostaCandidataStatus`, `status`, `revisado_por` e `revisado_em`: após a reconciliação, decidir em change separado se ficam como histórico legado ou recebem migration de remoção (incluindo enum, FK e rollback seguro).

## Bloco 3 — limpeza de contexto e verificação

- Remover código, testes e comentários mortos do aceite/rejeição: service/endpoint, mutation, tipos, botões, mensagens “revisado” e filtros por status; reescrever comentários próximos para explicar apenas descoberta e inclusão explícita.
- Atualizar `docs/arquitetura/fluxo_requisicao.mermaid`, `docs/database/modelo_er.{md,mermaid}` e os trechos atuais de `CLAUDE.md`/documentação que descrevem revisão humana; diagnósticos e plan-modes históricos permanecem como registro datado, sem reescrever o passado.
- Criar testes de contrato para o adaptador, permissões, duas confirmações, duplicidade, inclusão com e sem `cd_parceria` e atualização posterior pelo job; remover/substituir testes exclusivos de aceitar/rejeitar.
- Executar `npm run test`, `npm run lint`, `tsc --noEmit`, `uv run pytest tests/test_propostas_candidatas.py` e os testes dos jobs/monitoramento afetados; só então revisar `rg` final para referências mortas e atualizar este plano como executado.
