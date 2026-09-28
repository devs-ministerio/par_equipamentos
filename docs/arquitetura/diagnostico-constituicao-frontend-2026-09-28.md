# Diagnóstico da Constituição Frontend — 2026-09-28

## Escopo e método

Revisão de `frontend/src`, do gate local e da Constituição Frontend v2.0. Para
não confundir uma entrega publicada com trabalho em curso, o `HEAD` foi
validado em cópia isolada e o worktree atual foi avaliado separadamente.

## Evidências

- `HEAD`: `npm run typecheck` e `npm run build` passaram.
- Worktree: lint, 121 testes Vitest e cobertura passaram; hooks (79,2%) e
  componentes de domínio (84,8%) superam o piso de 70%.
- Worktree: typecheck e build falham em três erros. O hook de relatório passou
  a expor `anoInicio`/`anoFim`, mas a página ainda consome `ano`/`setAno` e
  envia `ano` para `FiltroRelatorio`.

## Avaliação

**Conformidade do `HEAD`: 8,5/10.** A arquitetura de services/Zod, TanStack
Query, RHF, componentes reutilizáveis e code splitting continua aderente. A
falha é da alteração local não concluída, não do release versionado.

### P1 — mudança local de intervalo de anos não está integrada

O contrato de `use-relatorio-instrumentos-filtros.ts` mudou, enquanto
`monitoramento-relatorios-page.tsx` permaneceu no contrato anterior. Não
concluir ou enviar esta mudança sem adaptar a página, o payload e os testes de
intervalo; o gate já impede o merge corretamente.

### P1 — jornada administrativa não está na matriz E2E atual

A matriz autenticada cobre sessão e rotas de produto, mas não uma jornada com
credencial administrativa que percorra gestão de usuários e auditoria. Criar
usuário efêmero admin no banco E2E e cobrir o fluxo crítico.

### P2 — recuperação assíncrona ainda é desigual

Há hooks de consulta cujas telas não expõem retry uniforme; a tela de auditoria
exibe falha sem reconectar `refetch` ao alerta. Padronizar o tratamento ao tocar
esses módulos, sem reescrever todos os hooks.

## Próximo Plan Mode

Fechar primeiro o intervalo de anos com typecheck, build e caso de limite
inicial/final; depois adicionar a jornada E2E admin e a recuperação de erro da
auditoria.
