# Diagnóstico da Constituição de Testes & Qualidade — 2026-09-24

## Escopo e método

Este diagnóstico reavalia a aderência a
`padroes/qualidade/constituicao_qualidade.md`, usando como linha de base o
diagnóstico de 2026-09-16. Abrange backend, frontend, banco de teste, E2E e
gates versionados no GitHub Actions.

Foram executados os gates locais no estado do repositório em 24/09 e
consultadas as últimas execuções de CI. A suíte backend usou exclusivamente o
PostgreSQL local dedicado de testes no OrbStack; não houve leitura nem escrita
no Neon ou em produção. A rodada remota final do PR 13 aprovou Backend CI,
Frontend CI, E2E autenticado, SBOM/imagem, Semgrep, Gitleaks, actionlint e
preview Vercel.

## Resumo executivo

O SIGEO saiu de uma linha de base de **3,8/10** para **9,0/10** em aderência à
Constituição de Qualidade. Os critérios críticos do plano são agora
reproduzíveis e bloqueantes: cobertura por camada no backend e frontend,
fixture determinística para as regras SUS/em uso, matriz de 42 contratos HTTP
e E2E autenticado em stack efêmera.

A nota não é 10 porque três melhorias de higiene foram separadas para evitar
uma baseline que escondesse problemas: extração das 10 funções acima do limite
C901. Elas permanecem visíveis no CI/documentação e não reduzem os gates
atuais.

## Evidências atuais

| Verificação | Resultado em 24/09 |
|---|---|
| Backend: Ruff e tipos | `ruff check .` e `mypy .` aprovados, sem warnings acumulados |
| Backend: dados e cobertura | fixture sintética elimina os 8 skips centrais; services 93,4%/82,5%, repositories 94,7%/77,6%, routes 90,1%/63,0% (linhas/branches) |
| Frontend: lint | `npm run lint` aprovado |
| Frontend: tipos e build | `npm run typecheck` e `npm run build` aprovados |
| Frontend: testes | 29 arquivos, 108 testes aprovados |
| Frontend: cobertura | `@vitest/coverage-v8`, JSON/LCOV e gate: hooks 83,3%, componentes de domínio 92,1% (linhas; piso 70%) |
| E2E | smoke anônimo e fluxo autenticado isolados; CI cria banco/usuário efêmeros e executa Chromium serialmente |
| CI GitHub | rodada final do PR 13 aprovada em 24/09: backend, frontend, E2E, imagem/SBOM, Semgrep, Gitleaks, actionlint e Vercel |

Os relatórios de cobertura são publicados como artifacts do CI por 14 dias;
nenhum resultado de coverage, Playwright ou credencial é versionado.

## Aderência por eixo

### Cobertura, integração e regra de domínio

- `pytest-cov` mede linhas e branches por camada; o verificador bloqueia os
  pisos constitucionais sem usar percentual global como substituto.
- A fixture de TOMOGRAFO é sintética, pequena e idempotente. Ela testa
  execução mais recente por família e `sus_flag` + equipamento em uso sem
  depender de carga externa.
- Services, repositories e routes de oferta, marcadores, usuários, evidências
  TransfereGov e convênios receberam testes de sucesso, vazio, validação,
  autorização e falhas externas aplicáveis.
- O frontend mede hooks e componentes de domínio; `components/ui` puramente
  apresentacional não infla nem reduz o piso e é coberto no smoke quando
  compõe rota crítica.

### Contratos e E2E

- `docs/arquitetura/contratos-http-sigeo.md` registra a evidência das 42
  operações públicas. Entradas inválidas, 401/403, 422 e erros de domínio são
  cobertos quando aplicáveis; ativação/redefinição não ecoam token.
- O workflow E2E aplica migrations, semeia dados e provisiona colaborador de
  menor privilégio somente com `E2E_ISOLATED_DATABASE=true`, recusando outro
  ambiente. Secrets ficam apenas no GitHub.
- A execução aprovada cobre redirecionamento sem sessão, login, leitura de
  instrumentos e responsividade em seis larguras. Trace fica desabilitado;
  somente screenshot/logs de falha são publicados.

### Governança e contexto

- A constituição passou a refletir npm/package-lock e Oxlint; o template de PR
  exige plano de teste, risco, fixture/mock e revisão de código/comentário
  morto.
- A política de flakiness estabelece bloqueio, responsável, issue e prazo
  máximo de sete dias para qualquer quarentena.
- Não há `test.only`, `xfail`, assert vazio ou skip dos cenários centrais.
  Migrations históricas e compatibilidades documentadas não são código morto,
  pois removê-las alteraria contratos já aplicados.

## Pendências deliberadas para 9–10

1. **Complexidade.** Há 10 funções C901 acima de 10 ramos. O Backend CI alerta
   sem bloquear e aponta este diagnóstico; prioridades são
   `registrar_evento_monitorado` (19), `obter_resumo` (11) e importadores/
   pipelines. A extração precisa preservar regra de domínio e não deve ser
   feita como refatoração cosmética.
2. **Evoluções futuras, fora do aceite atual.** Teste de carga, acessibilidade
   automatizada abrangente e mutation testing agregam confiança, mas não são
   substitutos dos gates implementados.

## Itens mortos e limpeza

Não foi identificado código produtivo morto comprovado nesta execução.
Artefatos transitórios de coverage e Playwright foram removidos; documentação
de contexto foi atualizada (constituição, matriz HTTP, política de flakiness,
diagnóstico e plan-mode). Compatibilidades de SICONV/TransfereGov e migrations
permanecem por decisão técnica documentada, até que haja migration de contrato
segura.

## Nota e decisão

**Nota atual: 9,0/10.** A entrega atingiu todos os critérios executáveis de
cobertura, integração, contrato, E2E, segurança e CI previstos no plan-mode.
O fechamento administrativo do plano permanece **parcial**, e não “100%”,
até que a pendência de higiene acima seja resolvida sem maquiar a
base. Esse é o caminho para alcançar 9–10 com qualidade mensurável.
