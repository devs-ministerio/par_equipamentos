# Plan Mode — execução: fechar o plano avançado, publicar, depois os planos novos — 22/10/2026

## Decisões registradas (22/10)

- Plano e ordem das fases **aprovados** pelo usuário.
- **PR #26 absorvido** no #28: `ce5eeef` (recortes e exportações DOCX/XLSX) e `65cb970` (CORS `Content-Disposition` e nome de arquivo de fallback) foram integrados por cherry-pick com resolução manual; os cinco commits restantes do #26 (ajuste de sessão nos E2E e três reexecuções de CI) não foram absorvidos por serem redundantes com `frontend/e2e/sessao-autenticada.ts`. Onde o #26 e a base divergiam, prevaleceu a implementação mais nova da base (`listar_sem_truncar`/`LimiteConsultaExcedido`, carregamento em lote `DadosMonitoramentoRelatorio`, gravador DOCX progressivo) e foram mantidos do #26 a aba Leitura, as legendas por fonte, o estado vazio explícito, o separador de milhar no Word, o bloqueio de município/CNES ambíguo e o desempate por `id`. Encerrar o #26 no GitHub depende de confirmação.
- **Janela de observação pós-deploy (Fase 3):** quem acompanha e recebe os relatos da equipe é o usuário; duração a confirmar antes da publicação.


- **Estado:** proposta para aprovação; nada executado além do que já está em homologação. Nenhuma etapa que toque produção, cron, secret, Render, Neon ou Vercel começa sem autorização específica por etapa.
- **Decisão do usuário:** primeiro fechar o que falta do [plano de espelho/notificações](planmode-espelho-notificacoes-2026-10-06.md) e deixá-lo disponível em produção; só depois iniciar [identidade SISGEO](planmode-identidade-sisgeo-2026-10-20.md) e [monitoramento por item](planmode-monitoramento-itens-equipamentos-2026-10-20.md), que hoje existem só em papel.
- **Constituições:** [Backend](../../padroes/backend/constituicao_backend.md), [Database](../../padroes/database/constituicao_database.md), [DevOps](../../padroes/devops/constituicao_devops.md), [Segurança](../../padroes/seguranca/constituicao_seguranca.md), [Qualidade](../../padroes/qualidade/constituicao_qualidade.md) e [Frontend](../../padroes/frontend/constiuicao_frontend.md).
- **Regra de fechamento:** cada fase só termina com evidência verificável (comando, teste, medição, captura), nunca por memória ou por contagem de testes. Pendência que depende de dado real ou de terceiros fica explícita, não é contornada.

## Ponto de partida (verificado em 22/10)

- PR #28 (rascunho, base `homologacao`, que hoje é igual à `master`): 578 arquivos, +59 mil/−2,5 mil linhas, 34 commits à frente da `master` e 4 atrás. `MERGEABLE`. `build_e_testes`, `imagem`, Semgrep, gitleaks e actionlint passaram no SHA `a866f60`; `validar` e `e2e` estavam em execução.
- Backend local: 1.812 testes, Ruff e mypy aprovados em PostgreSQL vazio no head. Frontend: 892 testes, lint e tsc aprovados.
- 12 migrations novas além da `master` (Radar, recaptura, aprovação, avisos, decisões, captura de fonte, arquivo de notificação, identidade legada). Há uma migration de merge (`a4b5c6d7e8f9`): confirmar head único antes de qualquer aplicação.
- PR #26 (`relatorios-producao-2026-10-05`, 18 arquivos) segue aberto e toca relatórios DOCX/XLSX; o #29 já foi integrado. É preciso reconciliar #26 × #28 antes do release.
- Produção: Neon no plano Build com só 6 h de recuperação; backup diário em R2 preparado (bucket, credencial restrita, restauração sintética), **agendamento não ativo**. RPO de 24 h e RTO de 1 h aprovados, não atendidos.

## Fase 0 — Congelar a linha de base (sem risco)

1. Aguardar `validar` e `e2e` do #28; registrar o resultado. Falha nova é corrigida antes de qualquer outra coisa.
2. Comparar #26 × #28 (arquivos em comum em `relatorios`, `docx_builder`, `xlsx_builder`, páginas de relatório). **Feito em 22/10:** absorvido; backend 1.818 testes, Ruff, formatação e mypy aprovados; frontend 892 testes, lint, tsc e prettier aprovados.
3. Confirmar head único do Alembic na árvore final e listar as 12 migrations com classificação: apenas aditiva (expand) ou destrutiva. Qualquer item não aditivo vira bloco próprio, com plano de reversão.
4. Inventariar variáveis e secrets exigidos pelo código novo contra `render.yaml`, Vercel e GitHub (`MAIL_*`, `PORTAL_TRANSPARENCIA_API_KEY`, `DATABASE_URL_MIGRATION`, credenciais R2, `REFRESH_COOKIE_PATH`). Só nomes e presença, nunca valores.
5. **Saída:** lista congelada do que entra no release e o que fica de fora.

### Resultado da Fase 0 (22/10)

- **Alembic:** head da `master` `a3f1c9e7b204`; head da branch `b7f35c806e4a`; head único (a migration `a4b5c6d7e8f9` une sessão e Radar). A branch acrescenta 12 revisões em cadeia linear.
- **Revisões antigas modificadas:** 4 arquivos (`06e73a1db53b`, `92fe48aa5b7b`, `9c2e4f7a1d38`, `c214b6dc6a4a`) mudaram apenas `downgrade()` e um import; os `upgrade()`, que são o que roda em produção, estão intactos.
- **Classificação das 12 novas, por `upgrade()`:**
  - Tabelas novas, sem dado preexistente: `42d8a91c6f03`, `73b91e4c2a06`, `84c02f5d3b17`, `b5c6d7e8f9a0`, `d7e8f9a0b1c2`, `f9a0b1c2d3e4`, `e8f9a0b1c2d3` (coluna com default).
  - `ALTER TYPE notificacao_tipo ADD VALUE IF NOT EXISTS` em `autocommit_block`: `95d13a6e4c28`, `c6e7f8091a2b`, `d7e8f9a0b1c2`. Aditivas, mas exigem que a role de migração seja dona do tipo; já houve `InsufficientPrivilege` na homologação.
  - `a6e24b7f5d39`: `LOCK TABLE` exclusivo e estreitamento de `varchar` apenas nas tabelas novas do Radar (vazias em produção), com verificação prévia que aborta em vez de truncar; mais `convenio.fora_escopo_equipamentos BOOLEAN NOT NULL DEFAULT false`, sem reescrita de tabela no PostgreSQL moderno, porém com `ACCESS EXCLUSIVE` breve em `convenio`.
  - `b7f35c806e4a`: troca de constraint em tabela nova do Radar.
  - Merge `a4b5c6d7e8f9`: sem operação de schema.
  - **Nenhuma remove ou reescreve dado de tabela existente em produção.** Reversão por `downgrade()` existe, mas a reversão de produção é restaurar o backup pré-deploy.
- **Pré-requisitos a conferir em produção antes de migrar (somente leitura):** `alembic_version` atual; dono do tipo `notificacao_tipo` e privilégio da role `sigeo_migration`; versão do PostgreSQL; inexistência de tabelas `candidato_legado_*` preexistentes.
- **Variáveis e secrets:** nenhum campo novo em `Settings`, nenhuma alteração em `render.yaml`, nenhum secret novo nos workflows; `radar_convenios.yml` inalterado (não agenda nada novo). Workflows novos: `espelho_homologacao.yml` (somente `workflow_dispatch` na ref `homologacao`, sem secrets) e `.github/scripts/iniciar-postgres-ci.sh`. O Render continua dependendo das variáveis já configuradas manualmente no painel (`JWT_SECRET`, `MAIL_*`, `APP_PUBLIC_URL`, `PORTAL_TRANSPARENCIA_API_KEY`, `ALLOWED_HOSTS`, `COOKIE_*`), a conferir na Fase 2.
- **Pendente da Fase 0:** CI remoto do SHA final do #28 verde; depois encerrar o #26 com comentário apontando a absorção.

## Fase 1 — Fechar pendências do plano avançado (homologação, sem produção)

Ordem pensada para que o que bloqueia produção venha primeiro.

1. **Backup e recuperação (bloqueia o release).** Workflow agendado no GitHub Actions: `pg_dump` com role somente leitura, cifra com `age`, envio ao bucket R2 privado, retenção de 7 dias, alerta em falha. Chave de decifragem fora do GitHub. Restauração completa ensaiada em banco descartável a partir do artefato real, com contagens por tabela. Meta: RPO ≤ 24 h, RTO ≤ 1 h medido, não declarado. Agendar só após o ensaio e com autorização.
2. **Decisão de plano do Neon.** Medir o consumo em CU-h por um período representativo antes de decidir entre Free e Build; o Free (100 CU-h/mês, 1 GB) comporta o armazenamento atual (≈226 MB), mas a computação precisa de medição. O backup em R2 é pré-requisito para qualquer troca de plano.
3. **Etapas 3 a 6 do plano.** (a) validar contratos de recaptura contra as fontes reais; (b) tratar coleções sem ID estável; (c) UI de frescor das fontes; (d) nova UX de notificações (busca, filtros, arquivar, ler tudo) mantendo a autorização por destinatário; (e) workflow diário de recaptura só depois de confirmar secret, runner, migrations e branch, com simulação, replay idempotente, alerta e rollback.
4. **Ciclo nacional oficial com candidato elegível.** Executar a descoberta somente leitura; se não houver candidato real, registrar a ausência e fechar por evidência negativa e por aceite pontual já feito. Não fabricar novidade nem afrouxar a confirmação do Portal.
5. **Aceite nativo Word/Excel.** Usuário abre o lote reduzido já gerado nos aplicativos de destino e registra o resultado (formatação, tabelas, acentuação, tamanho).
6. **Capacidade e concorrência no provedor.** Já houve exportações pequenas no provedor; falta carga representativa. Medir em ambiente de homologação do provedor ou aceitar formalmente o limite atual (admissão DOCX por processo, 512 MiB) como restrição documentada.
7. **Observabilidade.** Classificar os 401 esperados no New Relic, depois de confirmar que não escondem falha real de sessão.
8. **Higiene documental.** Arquivar o histórico cronológico do plano principal (hoje 5.500 linhas) e manter só contrato, checklist e pendências. Fechar o plano de homologação local como concluído, remetendo o que sobrar ao plano principal. Atualizar `AGENTS.md`/`CLAUDE.md` com o que mudou de regra (fila do Radar, filtro de encerrados, novos jobs).
9. **Saída:** checklist consolidado do plano principal sem item aberto sem justificativa, e backup diário comprovado.

## Fase 2 — Preparar o release (sem tocar produção)

1. **Estratégia de integração.** O #28 é grande demais para revisão linha a linha. Revisar por blocos temáticos (Radar/recaptura, notificações, relatórios, painel/monitoramento, CI/DevOps) com checklist por bloco; manter um único PR de integração para preservar a ordem das migrations, mas com descrição estruturada e commits por assunto. Se a revisão apontar acoplamento fraco entre blocos, fatiar.
2. **Ensaio de migração com dado real.** Restaurar o backup mais recente de produção (leitura, snapshot consistente) em banco descartável local, aplicar as 12 migrations com a role de migração, conferir contagens por tabela, constraints e somas financeiras, e rodar a suíte de regressão sobre esse banco. Ensaiar a reversão pelo restore.
3. **Compatibilidade de versões.** Backend novo com schema antigo e frontend antigo com backend novo, durante a janela de deploy. Contrato HTTP só aditivo.
4. **Pré-voo de deploy.** Variáveis presentes, `/health` sem consulta ao banco, jobs e schedules **desativados** no primeiro deploy, CSP/CORS/cookies inalterados.
5. **Plano de rollback escrito.** Backend: redeploy do commit anterior. Banco: restaurar do backup pré-deploy; migrations são aditivas, então o código antigo continua funcionando com o schema novo. Frontend: promover o deploy anterior na Vercel.
6. **Revisão de segurança final** contra a Constituição: autorização no Service, RBAC/IDOR, CSRF, ausência de segredo em log, dependências auditadas, dados pessoais nas exportações.
7. **Saída:** relatório de prontidão com evidências e a lista exata de ações de produção a autorizar.

## Fase 3 — Publicação em produção (cada passo exige autorização)

Executar nesta ordem, parando a cada falha.

1. Confirmar backup do dia e fazer um `pg_dump` de pré-deploy para o R2.
2. Verificar `alembic_version` de produção antes de aplicar nada (o histórico mostra bancos atrasados e restrição de permissão em `ALTER TYPE`).
3. Aplicar as migrations pelo workflow `migrar_banco.yml` (`DATABASE_URL_MIGRATION`), isoladas do deploy, antes do código novo.
4. Merge na `master` e deploy do backend. Conferir se o Render realmente sobe sozinho: o `render.yaml` declara `autoDeployTrigger: checksPass`, mas já houve caso de deploy manual necessário. Verificar e, se preciso, disparar o Manual Deploy.
5. Verificações pós-backend: `/health`, login, refresh, `/auth/me`, leituras de monitoramento e relatórios com sessão real.
6. Deploy do frontend (Vercel) e smoke ponta a ponta: login, painel, monitoramento, relatório DOCX/XLSX pequeno, notificações, filtro de encerrados.
7. **Jobs e schedules continuam desligados** neste dia. Registrar tempo, erros e uso de CPU/RAM.
8. **Saída:** produção estável por uma janela de observação definida (sugestão: 48 h) sem erro novo.

## Fase 4 — Ativação gradual e estabilização

1. Ativar o backup diário (se ainda não ativo), depois a recaptura, a descoberta e os alertas, um de cada vez, observando alertas de falha e duplicidade de aviso.
2. Rodada manual supervisionada de cada job antes de habilitar o agendamento.
3. Revisão após uma semana: consumo do Neon, custo, fila do Radar, notificações recebidas por papel, falhas de fonte.
4. Registrar o aceite final do plano principal e atualizar `CLAUDE.md`/`AGENTS.md`.

## Fase 5 — Planos que hoje estão só no papel (somente após a Fase 4)

Ordem recomendada e decisões necessárias:

1. **Identidade SISGEO** (rápido, isolado, reversível). Decisão pendente do usuário: nome por extenso e eventual novo logo/monograma. Preservar cookies `sigeo_*` e demais identificadores técnicos; manifesto de ocorrências; aceite visual em desktop e celular, e-mails e arquivos gerados.
2. **Monitoramento por item e equipamento físico.**
   - Bloco 0: inventário e validação da origem do ID do item (`ID_ITEM_PAD` e equivalente da nova API) e do que o usuário chama de `itens_dl`.
   - Bloco 1: modelo de dados (instrumento → item → unidade → evento), expand-contract, backfill só com vínculo único.
   - Blocos 2 e 3: entrega por item/unidade e tabela substituindo o card físico.
   - Bloco 5: prazos e notificações, com cadência a confirmar.
   - **Bloco 4 (fotografias) por último e isolado**: depende de decisões suas (armazenamento privado e orçamento, formatos incluindo HEIC, limites, retenção) e de requisitos de privacidade e remoção de EXIF.
3. Cada um repete o ciclo: planejamento aprovado → homologação → ensaio com dado real → publicação com autorização.

## Gates comuns a todas as fases

- Backend: `ruff check`, `ruff format --check`, `mypy`, suíte completa em PostgreSQL vazio no head, pisos de cobertura por camada sem exclusões.
- Frontend: lint, tsc, vitest, build, E2E.
- CI remoto verde no SHA exato que será publicado.
- Nenhuma migration destrutiva sem expand-contract, aceite e plano de preservação.
- Commits por assunto, sem coautoria e sem menção a ferramenta; push só quando solicitado.
- Dado de produção nunca em fixture, log, documento ou captura de tela.

## Riscos principais

| Risco | Mitigação |
|---|---|
| RPO/RTO não atendidos hoje | Backup agendado e restauração medida são o primeiro item da Fase 1 e bloqueiam o release |
| PR #28 muito grande | Revisão por blocos, ensaio de migração com dado real, deploy com jobs desligados |
| Conflito com o PR #26 | Reconciliar na Fase 0 |
| Schema de produção atrasado ou permissão de DDL | Conferir `alembic_version` e a role antes de migrar; migração em passo isolado |
| Consumo de CPU/RAM do DOCX no Render | Admissão por processo já implementada; medir após o deploy |
| Custo do Neon | Medir CU-h antes de decidir plano; backup externo antes de qualquer troca |
| Falso "espelho sempre atualizado" | Só declarar após contratos, integração, E2E e agendamento operando |

## Decisões que preciso de você

1. Aprovar este plano e a ordem das fases.
2. ~~Absorver ou encerrar o PR #26~~ — absorvido (ver decisões).
3. Duração da janela de observação após o deploy (sugestão 48 h); o usuário acompanha.
4. Free ou Build no Neon, depois da medição.
5. Para a Fase 5, quando chegar: nome por extenso do SISGEO e armazenamento das fotos.
