## Contexto e plano

- Plan-mode/issue/ADR:
- Objetivo e escopo:
- Fora de escopo e trade-offs:

## Estratégia de qualidade

- [ ] Unidade — regra de negócio: sucesso e erro de domínio.
- [ ] Integração — repository, banco ou integração entre camadas reais.
- [ ] Contrato HTTP — sucesso e erros aplicáveis (401/403/422/domínio).
- [ ] E2E — fluxo crítico, quando a mudança afeta jornada do usuário.
- [ ] Não aplicável: justifique abaixo a camada não usada.

### Casos e dados

- Edge cases avaliados (vazio, limite, nulo, duplicidade, permissão, falha externa):
- Fixtures/factories sintéticas e mocks exclusivamente de I/O externo:
- Teste de regressão de bug de produção (link, se aplicável):

## Validação

- [ ] Lint, tipos, testes, cobertura e build executados localmente.
- [ ] Cobertura da camada não caiu abaixo do piso constitucional.
- [ ] CI e impactos de tempo/serviço externo foram avaliados.
- [ ] Nenhum segredo, dado sensível, código morto ou comentário obsoleto foi introduzido.

## Risco e revisão

- Risco de produto/dados/deploy e mitigação:
- Evidência visual ou operacional, quando aplicável:
