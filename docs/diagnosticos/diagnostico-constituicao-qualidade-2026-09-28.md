# Diagnóstico da Constituição de Qualidade — 2026-09-28

## Escopo e método

Revisão de testes, pisos de cobertura, linter/typecheck, E2E, CI e política de
skips. A análise diferencia a base versionada do worktree local em progresso.

## Evidências

- Frontend: lint passou; 121 testes passaram; cobertura por camada passou;
  `HEAD` isolado passou typecheck e build.
- Backend: Ruff e 155 testes locais passaram. Os 208 skips são testes marcados
  como dependentes de Postgres, ausente nesta sessão; CI cria Postgres efêmero.
- Os workflows executam lint, formato, tipos, cobertura, auditoria de
  dependência e E2E; PR template exige plano, edge cases e evidência.
- O worktree atual falha typecheck/build frontend e mypy backend por alterações
  locais ainda não integradas (sete erros em dois scripts não rastreados).

## Avaliação

**Conformidade: 8,6/10.** O portão está bem modelado e detectou as regressões
locais corretamente; não há evidência desta sessão de execução remota ou de
proteção de branch efetiva.

### P1 — nenhum merge deve ocorrer com o worktree atual

Os três erros TypeScript e os sete erros mypy devem ser resolvidos ou os arquivos
locais removidos do conjunto da mudança. Adicionar testes de intervalo de anos
e tipar os scripts/testes novos antes de enviar ao CI.

### P2 — cobertura global não substitui a crítica

O frontend cumpre seus pisos por camada, mas há módulos com baixa prova, como
serviço/tabela de auditoria. Cobrir falha, retry e fluxo administrativo antes
de expandir o módulo.

### P2 — E2E administrativo falta

O E2E autenticado deve ganhar um usuário admin efêmero e assertivas para gestão
de usuários e auditoria, incluindo permissões negativas.

## Próximo Plan Mode

Concluir os gates locais da mudança atual; depois ampliar E2E e cobertura em
fluxos administrativos, preservando fixtures sintéticas e banco isolado.
