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

A nota não é 10 porque a higiene de complexidade continua registrada sem
baseline: há seis funções acima do limite C901 em scripts de carga,
validação e pipeline histórico/inicial. Elas permanecem visíveis no
CI/documentação e não reduzem os gates atuais.

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

1. **Complexidade.** Há 6 funções C901 acima de 10 ramos, todas em
   `importar_planilha_monitoramento.py`, `importar_programas_monitoramento.py`,
   `validar_dados_tres_fontes.py` ou nos pipelines de Tomógrafo, Ressonância e
   PET-CT. O Backend CI alerta sem bloquear e aponta este diagnóstico. São
   cargas/validações iniciais ou históricas; não serão reescritas apenas para
   satisfazer métrica. Uma alteração operacional futura deve trazer a extração
   por responsabilidade e testes de regressão da ingestão.
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

## Atualização de regressão — 2026-09-24 (logout)

Foi adicionada cobertura de três fronteiras do defeito reportado: o hook limpa
queries autenticadas e conserva `currentUser=null` mesmo diante de falha de
rede; a rota HTTP rejeita um access cookie reaplicado após logout; e o E2E
descreve login → Sair → tela de login. A suíte frontend completa passou nesta
sessão com 29 arquivos e 108 testes, além de lint, typecheck e build.

Ruff e mypy do backend também passaram. Os 14 testes backend selecionados
foram coletados, mas ficaram skip porque esta sessão não recebeu
`TEST_DATABASE_URL`; o novo cenário HTTP precisa rodar no PostgreSQL isolado
do workflow antes de contar como evidência de integração executada. O E2E novo
igualmente depende das credenciais e da stack efêmera do CI, que não foram
usadas localmente.

## Atualização de regressão — 2026-09-25 (PERSUS e logout cross-origin)

O reparo PERSUS ganhou um modo específico em lote (`--fases-gerais`) para não
reprocessar a carga histórica remota: sua simulação e reexecução comprovam
idempotência para os 110 eventos de fase geral materializados. Para o logout,
foi adicionado teste de cliente que reproduz o cookie CSRF em host distinto e
confirma a recuperação por `/auth/csrf` antes do `POST /auth/logout`. Os 29
testes frontend focados, lint e build passaram; os testes HTTP backend continuam
dependentes de PostgreSQL de teste no CI, pois nesta máquina foram coletados e
marcados como skip sem `TEST_DATABASE_URL`.

## Atualização de higiene — 2026-09-24 (PERSUS)

A rotina nova de complementação PERSUS foi separada em conciliação, criação de
monitoramentos, complemento de campos, eventos e ações antes de ser aceita
como parte do repositório. `ruff check`, `mypy` e `ruff format --check` estão
verdes para o backend; a função deixou de disparar C901. O teste de sessão foi
normalizado pelo Prettier sem alteração semântica e a verificação global de
formatação passou.

## Validação local final — 2026-09-24

Foi criado um PostgreSQL efêmero exclusivo no OrbStack para esta verificação,
com migrations aplicadas do zero e apenas o catálogo sintético de
monitoramento. A suíte backend terminou com **224/224 testes aprovados**, sem
skip, e **87%** de cobertura total. O container foi removido após a execução;
Neon e produção não foram acessados. Após formatar o teste de sessão sem
alterar sua semântica, `npm run format:check` também ficou verde. Os gates
locais completos de formatter, lint, tipos, cobertura, testes e build estão
verdes nesta rodada.

## Revalidação de dados de monitoramento — 2026-09-25

A rodada de qualidade por evidência de fonte identificou uma lacuna que os
testes de idempotência do reparo PERSUS não cobriam: eles provam que os 110
eventos já elegíveis não duplicam, mas não que toda linha complementar tenha
chegado a uma fase geral. Dois PERSUS com marcos reais ficaram fora por alias
de unidade; no total do monitoramento, a consulta de integridade registrou 85
instrumentos sem fase direta, 141 marcos sem vínculo de fase, seis ocorrências
futuras e 16 inaugurações sem conclusão direta.

Antes de declarar a ingestão complementar fechada, a qualidade passa a exigir
um teste de integração que cubra nomes alternativos, fallback CNES único,
rejeição de CNES ambíguo, propagação para evento direto de fase e recusa de
`data_ocorrencia` futura. A varredura não alterou dados nem invalida os gates
de código já executados; ela reduz a confiança da evidência funcional da carga
até esse teste e o saneamento controlado serem concluídos.

## Atualização de evidência de correção — 2026-09-25

O reparo geral de fases foi aplicado após simulação e reexecutado sem criar
novos registros. A suíte unitária adicionada cobre a preferência por fase já
vinculada e a recusa de marcos ambíguos; `ruff`, `mypy` e os testes focados
passaram. A cobertura ainda deve ganhar integração em PostgreSQL para a
prioridade Entregas → Controle e para a substituição append-only de evento
PERSUS importado. Até essa prova, as 33 ocorrências não mapeáveis e as seis
datas futuras permanecem pendências explícitas, não falsos positivos de
qualidade.

Foi incluído teste de regressão para o alias do CNES 2576341: ele exige que o
fallback por CNES único encontre comissionamento e NUP sem permitir o mesmo
comportamento em CNES duplicado.
