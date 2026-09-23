# Diagnóstico sênior — Constituição DevOps (2026-09-23)

## Escopo e método

Esta rodada compara a infraestrutura versionada com
`padroes/devops/constituicao_devops.md` e sucede o diagnóstico de 16/09.
Foram revisados workflows, configuração Render/Vercel, health, logs, lockfiles,
segredos declarados, artefatos e comandos que a CI promete executar. A
revalidação de execução acessou GitHub, Render, Neon e Vercel em 23/09.
Configuração externa sem evidência continua **não
comprovada**, não presumidamente inexistente.

## Resultado executivo

**Conformidade atual: 8,9/10** (ante 3,5/10 em 16/09). O projeto tem CI de
backend e frontend verde, ambiente `Production` no GitHub, jobs produtivos
serializados e protegidos, deploy Render condicionado a CI, boot sem DDL e
health check real em `/health`. O compose foi validado integralmente no
OrbStack, incluindo Postgres isolado, health e encerramento limpo. O backend
publicado também reporta transações, latência e erro ao New Relic como
`SIGEO API`.

Ainda faltam backup externo/retenção ampliada, política explícita de retenção
de logs, métricas de recurso e tracing fim a fim, artefato promovível/staging e proteção nativa
de branch no GitHub. O Neon tem PITR de somente seis horas; RPO/RTO foram
formalizados e a recuperação isolada foi exercitada, mas a janela continua o
principal risco operacional.

| Eixo | Nota | Evidência versionada |
|---|---:|---|
| Reprodutibilidade e containerização | 9,0 | Dockerfile multi-stage, `.dockerignore`, compose e exemplo OrbStack existem; smoke completo executou como usuário não-root, com Postgres local isolado, health e shutdown limpo. |
| CI e supply chain | 9,0 | CI frontend e backend concluídas com sucesso no commit publicado; backend usa Postgres efêmero, Alembic, testes e audit; `actionlint`, Gitleaks, SBOM SPDX e scan rígido de CVE crítico são gates versionados. CodeQL analisou o código, mas o GitHub bloqueou a publicação por code scanning desativado no repositório privado. |
| Migration e jobs de dados | 8,0 | Workflows usam `Production`, timeout, concurrency compartilhada, checkout de `master` e falham sem segredo. Migration está fora do boot do Render. |
| Deploy e rollback | 8,3 | Render faz deploy após CI, tem build fixado, health check `/health`, boot sem DDL e runbook. A CI publica imagem e SBOM por SHA; Vercel recebeu smoke E2E autenticado com sucesso. Faltam registry/staging, promoção do artefato e rollback ensaiado. |
| Observabilidade | 9,0 | Health faz `SELECT 1`; middleware gera log JSON HTTP com duração e `trace_id`; o New Relic confirmou a entidade APM `SIGEO API`, transação HTTP, latência e taxa de erro. A política `SIGEO — Produção` tem condições de erro, latência p95, perda de sinal e duas falhas do Ping em 10 min; o workflow de e-mail teve envio e recebimento de teste confirmados. Logs são encaminhados pelo agente, com limite e sem contexto adicional; o access log cru do Uvicorn foi desativado para não transmitir IP ou querystring, com teste de regressão. O monitor externo Ping consulta `/health` a cada 5 min com TLS validado. Faltam política explícita de retenção, métricas de recurso, tracing fim a fim e redundância de localização. |
| Segurança de infraestrutura | 8,0 | Ambiente GitHub `Production` restringe jobs a `master`, sem bypass administrativo, com segredos separados; Render tem `JWT_SECRET`, `DATABASE_URL` e `CORS_ORIGINS`. Branch protection nativa do GitHub continua indisponível no plano atual. |
| Recuperação e custo operacional | 7,5 | RPO ≤ 6 h e RTO ≤ 4 h estão formalizados; restore isolado PITR foi validado. Ainda faltam backup externo e retenção maior que seis horas. |

## Evidências executadas

```text
YAML dos workflows e render.yaml                     → sintaxe válida
GitHub Actions (commit c92bf11)                     → Frontend CI e Backend CI e segurança: sucesso
Render (commit c92bf11)                             → deploy live; GET /health: 200
Render                                               → uv 0.12.17 fixado; Uvicorn sem Alembic no boot
Render                                               → notificações de falha do serviço ativadas por e-mail
Neon                                                 → PITR disponível; janela de 6 horas
Neon (restore drill)                                 → branch isolada de 13:37 BRT; revisão `b7e3d9f4a621` e 27 tabelas funcionais validadas antes de 16:42 BRT
OrbStack                                             → imagem `sigeo-backend:dev` construída; usuário `sigeo` e health check presentes
OrbStack (compose `sigeo-devops-smoke`)               → Postgres saudável, `/health` 200 com banco conectado, UID 10001; containers/rede/volume removidos ao final
Vercel                                               → produção pronta, `master`/`c92bf11`, domínio padrão ativo; 0% de erro em 6 h
Vercel                                               → redeploy `26RKeA7N` pronto com `VITE_API_BASE_URL` em Production/Preview
Vercel                                               → deploy `85bAN8ZzHMhA9oHfncmRnoKuVG18` pronto a partir de `master`/`1b4f9af`
E2E publicado                                        → login aprovado; rota protegida carregou 560 instrumentos
Preflight CORS                                       → origem Vercel autorizada, credenciais e métodos esperados
GitHub Actions monitor (run 35904108197)             → `/health` concluído com sucesso
actionlint 1.7.10                                    → nove workflows validados localmente; gate usa digest imutável
GitHub Actions supply chain (run 35907832991)         → Dockerfile Trixie, SBOM SPDX e scan de CVE crítico: sucesso
GitHub Actions supply chain (run 35911555849)         → imagem `946ac4c`, artefato OCI (259,6 MB), SBOM e scan crítico: sucesso
OrbStack (artefato `946ac4c`)                          → imagem baixada/carregada do GitHub, Postgres descartável e `/health` 200; processo UID 10001; recursos locais removidos
GitHub Actions Gitleaks (run 35907833023)             → histórico e conteúdo rastreado: sucesso
GitHub Actions backend (run 35907833242)              → lint, tipos, Alembic, testes e audit: sucesso
CodeQL (runs 35908489235 e 35909097669)               → análise concluída; upload bloqueado porque code scanning está desativado no repositório
GitHub Actions (commit 3306bfa)                       → Varredura de segredos, Backend CI e segurança, SBOM e segurança da imagem: sucesso
Render (deploy `dep-daq3aanlk1mc73bjl1jg`)            → `uv run sh ./start-server.sh`, health 200 e serviço live
New Relic                                             → APM `SIGEO API`: transação HTTP, 235 ms, 0% de erro no momento da validação
New Relic e Gmail                                      → política com quatro condições; teste de e-mail enviado e recebido
New Relic                                              → dashboard `SIGEO — Operação de Produção`: p95 e taxa de erro da API
New Relic Logs                                         → 172 logs recentes recebidos após o deploy, incluindo `GET /health` 200
New Relic Synthetics                                   → Ping externo habilitado: 1/1 check bem-sucedido em São Paulo, 1,04 s, TLS validado
New Relic Alerts                                       → condição crítica ativa após duas falhas do Ping em 10 min, policy `SIGEO — Produção`
Render (deploy `dep-daq62tegekts73bnulqg`)             → deploy live com encaminhamento de logs habilitado
```

Os YAMLs são parseáveis e passaram no `actionlint` 1.7.10. O Render CLI
continua ausente; a execução real no Render confirmou o Blueprint aplicado no
serviço e o health check HTTP.

## Avanços desde 16/09

- `.github/workflows/backend_ci.yml` executa `uv sync --frozen`, Ruff, mypy,
  pytest e `pip-audit`; `frontend_ci.yml` executa `npm ci`, audit, lint,
  typecheck, testes e build em push/PR. Ambos usam permissões mínimas,
  concorrência por ref e actions fixadas por SHA.
- `workflow_lint.yml` valida sintaxe e semântica dos workflows em push/PR que
  os alterem, com `actionlint` fixado por digest OCI.
- `secret_scan.yml` executa Gitleaks em todo push/PR; `supply_chain.yml`
  constrói a imagem do backend, publica SBOM SPDX por 30 dias e bloqueia CVE
  crítico conhecido. Anchore e Trivy também estão fixados por SHA.
- `render.yaml` não executa mais Alembic no `startCommand`; os workflows de
  pipelines e Radar também não executam DDL. `migrar_banco.yml` é o único
  fluxo versionado que chama `alembic upgrade head`.
- O backend tem `/health` com conectividade real ao Postgres, cabeçalhos de
  segurança e middleware que devolve/propaga `X-Trace-Id` e emite eventos JSON
  de request e chamadas externas, sem querystring ou corpo sensível. O access
  log cru do Uvicorn está desativado no boot para que IP e request line não
  alcancem o encaminhamento centralizado; os testes de observabilidade
  bloqueiam regressão de querystring no evento HTTP e da flag de boot.
- `backend_ci.yml` fixa `actions/checkout` e `setup-uv` por SHA; o frontend
  também fixa `checkout` e `setup-node` e ambos restringem permissões.

## Evidência externa confirmada em 23/09

- GitHub: environment `Production` com deploy exclusivo de `master`, sem
  bypass administrativo; segredos `DATABASE_URL` e `DATABASE_URL_MIGRATION`
  cadastrados. A proteção nativa de branch não pôde ser habilitada no plano
  atual do repositório privado.
- Render: `JWT_SECRET` foi cadastrado como segredo; build fixado em
  `uv==0.12.17`; deploy ocorre após CI; `startCommand` inicia somente o
  servidor via wrapper, sem DDL; `healthCheckPath=/health` foi validado com
  respostas 200. Em 23/09, o serviço publicou com `uv run sh
  ./start-server.sh` e a licença do New Relic permaneceu exclusivamente como
  segredo no provedor.
- New Relic: a entidade APM `SIGEO API` foi descoberta após o deploy
  instrumentado e a chamada pública de `/health`; o painel confirmou uma
  transação HTTP, 235 ms de resposta e 0% de erro no instante da conferência.
  A entidade transitória `Python Application`, criada antes de definir o nome
  estável, não é usada pela configuração atual.
- New Relic Alerts: a política `SIGEO — Produção` está ativa com condições
  críticas de taxa de erro acima de 5% por 5 minutos, latência p95 acima de
  2 s por 10 minutos e ausência de transações por 10 minutos (inclusive perda
  de sinal). O workflow `SIGEO — Notificações de Produção` está habilitado,
  filtrado por essa política e entrega eventos de ciclo de vida ao destino de
  e-mail operacional. Um teste direto do canal foi enviado com sucesso e
  recebido na caixa de entrada operacional, validando a entrega ponta a ponta
  sem provocar incidente real na API.
- New Relic Dashboard: `SIGEO — Operação de Produção` foi criado para a
  conta do projeto. Ele consulta `Transaction` filtrado por
  `appName = 'SIGEO API'` e exibe latência p95 em série temporal e taxa de
  erro em painel numérico. As duas consultas executaram com dados da aplicação
  antes de serem salvas no dashboard.
- Neon: branch `production` é a padrão e oferece PITR, com histórico de seis
  horas. O exercício autorizado de 23/09 criou a branch isolada
  `sigeo-restore-drill-2026-09-23` a partir de 13:37 BRT, com expiração de um
  dia; a revisão Alembic `b7e3d9f4a621` e 27 tabelas funcionais coincidiram
  com produção. Nenhuma escrita ocorreu em `production` e não houve alteração
  de plano. A tabela extra `playing_with_neon` foi um artefato do exemplo do
  editor SQL na branch temporária, já coberto pela expiração automática.
- Vercel: projeto `par-equipamentos` publicou `master` no commit `c92bf11`,
  está pronto no domínio padrão e reportou 17 requisições de borda e 0% de
  erro nas últimas seis horas. A variável pública `VITE_API_BASE_URL` foi
  corrigida (antes registrada indevidamente como segredo), passou a apontar
  para a API Render em Production/Preview, e o redeploy `26RKeA7N` ficou
  pronto. O deploy posterior `85bAN8ZzHMhA9oHfncmRnoKuVG18`, originado em
  `master`/`1b4f9af`, também ficou pronto. Analytics ainda não está ativado;
  alertas de anomalia exigem plano pago.
- Smoke E2E: o login no domínio publicado foi aprovado e a rota protegida
  carregou a listagem de 560 instrumentos. O preflight da API retornou origem
  Vercel, credenciais, métodos e cabeçalhos esperados. O `CORS_ORIGINS` já
  continha a origem de produção e foi preservado, sem sobrescrever o preview.

## Achados prioritários

### P1 — recuperação ainda limitada à janela PITR

O Neon confirma apenas seis horas de PITR. O RPO de até seis horas e o RTO de
até quatro horas foram aprovados e o restore isolado foi exercitado com
sucesso, mas não existe backup externo nem retenção ampliada. Ampliar a janela
exige mudança de plano/custo e deve ser decidido antes de alterar o serviço.

### P1 — entrega ainda sem artefato promovível

O Render espera os checks de CI, executa health check e mantém DDL fora do
boot, mas ainda recompila o código no provedor. A CI agora publica imagem e
SBOM por SHA, com retenção de 30 dias, porém o artefato não é a unidade de
deploy do Render. O smoke autenticado publicado foi aprovado; ainda faltam
registry/staging, promoção desse artefato e rollback ensaiado. A mudança de
aplicação deve continuar separada de qualquer rollback de schema.

### P1 — primeiro acesso pode exceder o timeout do cliente

O serviço Free do Render precisou acordar e excedeu os 15 segundos definidos
no cliente HTTP; o frontend exibiu a ação de tentar novamente. Após a API ficar
disponível, o mesmo smoke E2E passou. Para não depender da intervenção do
usuário no primeiro acesso, é preciso adotar instância sem cold start ou
implementar retentativa/estado de aquecimento apropriado.

O cliente agora repete uma única vez apenas leituras `GET`/`HEAD` que tenham
atingido o timeout interno; mutações nunca são repetidas, evitando duplicidade
de escrita. A medida reduz a fricção do cold start, mas não remove o risco de
disponibilidade da instância Free.

O workflow temporário do GitHub foi removido porque suas execuções agendadas
não mantiveram a cadência necessária. Em seu lugar, o Ping externo `SIGEO API
— health externo`, do New Relic, consulta `/health` a cada cinco minutos a
partir de São Paulo, com TLS validado. Além de reduzir cold starts, ele produz evidência
independente da disponibilidade externa. A cobertura inicial tem uma região;
não protege contra falha exclusiva daquela localidade e deve ser ampliada após
revisão de franquia/custo. A migração para Railway ou instância sempre ativa
continua sendo a correção definitiva.

### Resolvido — container local validado com Postgres isolado

Dockerfile multi-stage, usuário não-root, `.dockerignore`, compose e exemplo
de ambiente OrbStack foram criados. Em 23/09, o compose temporário
`sigeo-devops-smoke` subiu com Postgres saudável; a API respondeu
`{"status":"ok","database":"connected"}` em `/health` e seu processo
rodou como UID `10001`/usuário `sigeo`. Ao final, containers, rede e volume
desse projeto foram removidos, confirmando também o shutdown limpo. O arquivo
de ambiente usado tinha valores sintéticos locais e foi apagado.

### P1 — observabilidade ainda não cobre métricas de recurso e tracing fim a fim

O New Relic APM está efetivamente recebendo a aplicação `SIGEO API`: transação
HTTP, tempo de resposta e taxa de erro estão confirmados. A política
`SIGEO — Produção` já formaliza quatro condições críticas (erro, p95, ausência
de sinal e duas falhas do Ping em 10 minutos) e o workflow ativo encaminha seus
eventos por e-mail operacional.
Os eventos estruturados continuam no stdout e o agente do New Relic os
encaminha sem atributos de contexto, limitado a 1.000 amostras por minuto. O
Render também envia alertas de falha por e-mail. O monitor Ping externo `SIGEO
API — health externo` consulta o endpoint público a cada cinco minutos, a
partir de São Paulo e valida TLS. Ainda faltam uma política explícita de
retenção de logs, métricas de recurso, tracing ponta a ponta envolvendo
frontend e jobs e redundância de localização. O dashboard operacional agora expõe p95 e taxa
de erro da API. Logs no painel do Render não são
suficientes como política operacional versionada. O teste controlado de
entrega foi concluído, sem gerar erro ou indisponibilidade real na API.

### P1 — CI não testa o caminho de banco nem toda a supply chain

Backend CI agora provisiona PostgreSQL e executa Alembic/testes nesse caminho.
`Varredura de segredos` executa Gitleaks no histórico completo, fixado no
commit `e0c47f4`, e passou novamente no run `35907833023`. O workflow de
supply chain gera SBOM SPDX retido por 30 dias e passou no scan de CVE crítico
no run `35907832991`. A primeira imagem em Debian 12 revelou cinco CVEs
críticos; a troca para Debian 13 (Trixie) reduziu-os a três de `perl-base`, e
`apt-get upgrade` no runtime aplicou a versão corrigida, mantendo o gate
estrito verde. Falta CodeQL; os pins por SHA devem ser completados nos fluxos
restantes.

O CodeQL foi configurado e executou a análise de Python, TypeScript,
workflows e HTML, mas o GitHub recusou o upload do SARIF nos runs
`35908489235` e `35909097669`: code scanning está desativado no repositório
privado. O workflow foi removido para não manter um gate permanentemente
vermelho. Retomar somente após habilitar esse recurso no GitHub e confirmar
eventual impacto de plano/custo.

### P2 — contexto e artefatos de entrega

A reinspeção do Blueprint confirmou que não há campos raiz `release:` ou
`web:` em `render.yaml`; a suspeita inicial resultava de uma leitura
concatenada com arquivos auxiliares e foi descartada. O mapa de consumidores
identificou os insumos ainda necessários: população e planilha CNES alimentam
importadores, `siconv_legado.json` e `transferegov_relacional.json` alimentam
o importador de convênios, e `macroregiao.geojson` alimenta o mapa. A captura
`transferegov.html` permanece como evidência documental. O único artefato sem
leitor, `levantamento_componente_por_programa.json` (14,36 MB), foi removido
do Git e deixou de ser emitido; ele era apenas resultado auxiliar de consulta
manual e pode ser recuperado pelo histórico se necessário.

## Itens não comprovados externamente

- Staging e segredos próprios desse ambiente; proteção nativa de branch e MFA
  dos administradores GitHub/Render/Neon.
- Política explícita de retenção de logs, métricas de recurso, tracing ponta a
  ponta e mais localizações para o monitor externo no New Relic; domínio
  customizado/TLS e política de preview no Vercel.
- Backup externo e retenção PITR maior que seis horas.
- Permissões de consoles cloud, MFA e trilha de auditoria de deploy.

## Limpeza e contexto

Não foram removidos arquivos de infraestrutura: nenhum Docker/compose morto
existe para apagar e os artefatos grandes ainda requerem mapa de consumidores.
`.env`, caches de banco local e logs de processo estão corretamente ignorados.
O diagnóstico de 16/09 permanece como fotografia histórica; este arquivo é a
referência operacional atual para DevOps.

## Próximo passo recomendado

Criar um plan-mode DevOps em seis blocos: (1) proteger workflows e banco;
(2) Dockerfile backend + `.dockerignore` + compose testados via OrbStack;
(3) CI com PostgreSQL efêmero, scan e actions fixadas; (4) CD/deploy, health,
smoke e rollback; (5) observabilidade e alertas; (6) backup/RPO/RTO e redução
segura de artefatos. Cada bloco deve declarar ambiente, segredos, custo,
estratégia de rollout e rollback antes de qualquer alteração.

## Critério de fechamento desta rodada

- [x] Constituição e diagnóstico anterior confrontados com o repositório.
- [x] Workflows, deploy declarativo, health, logs, segredos e artefatos
  revisados.
- [x] Gates locais disponíveis executados e resultado registrado.
- [x] Arquivos/comentários potencialmente mortos identificados sem remoção
  insegura.
- [x] GitHub, Render e Neon auditados com acesso apropriado.
- [x] Blocos de CI, jobs produtivos, containerização declarativa e deploy
  seguro executados; pendências de custo e observabilidade registradas.
