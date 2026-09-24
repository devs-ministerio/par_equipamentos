# Política de flakiness dos testes

Atualizada em 2026-09-24. Um teste é flaky quando pode alternar entre sucesso
e falha sem mudança relevante de código ou contrato. Flakiness não é motivo
para reduzir assert, ampliar timeout de forma cega ou criar `skip`.

## Regra de bloqueio

- Teste novo entra no gate normal; `skip`, `xfail`, `only` e retries usados
  para esconder instabilidade são proibidos.
- Uma falha intermitente em CI bloqueia a mudança até ser reproduzida e
  corrigida. A exceção temporária exige issue, responsável, prazo de no
  máximo sete dias e justificativa no próprio teste e no PR.
- A quarentena, se aprovada, fica fora do job bloqueante em arquivo/suíte
  explicitamente nomeado. Ela não pode executar contra produção, mascarar
  regressão de segurança nem permanecer silenciosa.

## Responsabilidade e evidência

1. Quem detecta abre issue com URL do run, teste, ambiente, frequência e
   artefatos sanitizados.
2. A pessoa que alterou a área afetada é dona inicial; sem resposta em um
   dia útil, a responsabilidade passa ao mantenedor do módulo.
3. A correção deve tornar a causa determinística: fixture sintética,
   relógio/rede controlados, espera por estado observável em vez de `sleep`,
   ou correção de concorrência/contrato.
4. O PR de correção remove a quarentena e anexa a execução verde. Se o prazo
   vencer, o teste volta ao gate bloqueante mesmo que ainda falhe.

## Particularidades do SIGEO

- Backend usa apenas `TEST_DATABASE_URL` com PostgreSQL dedicado; dados
  externos são mockados na borda. Nunca repetir para Neon/produção para
  “confirmar” uma falha.
- E2E usa stack efêmera, usuário descartável e Playwright serial. Esperar
  resposta/URL/elemento observável é permitido; `waitForTimeout` só serve à
  verificação visual de overflow já documentada e deve ser substituído se
  surgir instabilidade.
- Logs, traces e screenshots não podem conter senha, token ou dados de
  produção. O E2E desliga trace para impedir retenção da digitação de senha.
