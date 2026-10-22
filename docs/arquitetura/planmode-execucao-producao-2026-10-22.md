# Plan Mode — execução: fechar o plano avançado, publicar, depois os planos novos — 22/10/2026

## Decisões registradas (22/10)

- **Correção de sequência (22/10):** o workflow de backup usa o environment `Production`, restrito à `master`, e só dispara a partir da branch padrão. Esperar o merge do #28 faria o backup depender do próprio release, que exige backup de pré-deploy. Decisão do usuário: o backup vai à `master` em PR próprio ([#30](https://github.com/devs-ministerio/par_equipamentos/pull/30), rascunho, sem código da aplicação nem migration) **antes** do release. Destinatários `age` vigentes: identidade 2 (Bitwarden, titular único por ora) e identidade 3 (guarda separada); a identidade 1 foi retirada de uso por exposição acidental e não recebeu nenhum backup real. `BACKUP_AGE_RECIPIENT` atualizado com autorização em 22/10. Falta confirmar a guarda da identidade 3 antes do primeiro backup real.

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

### Achados de 22/10 que alteram o plano

- **Posse dos objetos em produção pela metade** (consulta de catálogo): 3 tabelas, 3
  sequências e os 11 enums continuam com `neondb_owner`; as migrations do release
  falham sem a normalização (ver Fase 3, passo 4; PR #35). O ensaio de migrações
  anterior, feito numa cópia com tudo da mesma role, **não** detectava isso.
- **Permissões reais conferem com o script das roles** (DML do runtime, leitura do
  backup, sequências `USAGE`/`SELECT`); única diferença corrigida: o
  `idle_in_transaction_session_timeout=1min` da `sigeo_backup`.
- **Render sem deploy automático:** a publicação do código é manual.
- **Branch de homologação sincronizada com a `master`** (48 commits à frente, 0 atrás).
  Nos arquivos de capacidade dos relatórios (DOCX progressivo, admissão, cliente HTTP)
  prevaleceu a versão da homologação, a completa, sobre a adaptação isolada do #29.
  Suítes completas após a mescla: backend 1.833 e frontend 902 testes. A mescla
  revelou e corrigiu uma regressão real: o abort do chamador deixou de cancelar o
  corpo da resposta em leitura (agora coberto por teste).
- **RTO:** restauração de dados no Neon medida em 848 s; faltam o tempo de troca da
  `DATABASE_URL` com Manual Deploy e o teste funcional da API contra o destino
  restaurado.

### Evidências do backup e do ensaio de migração (22/10)

- **Backup real de produção** (workflow `backup_banco.yml`, execução manual 39786123427 na `master`, após correção do TLS no PR #31): PostgreSQL 18 de origem, dump em ~21 s, cifrado para duas identidades `age` (2 e 4), enviado ao R2 com SHA-256 e tamanho remoto conferido; retenção sem exclusões; checagem de backup íntegro nas últimas 24 h aprovada. Primeiro disparo (39785279538) falhou antes de ler o banco por falta de `root.crt` no runner; corrigido com `PGSSLROOTCERT=system`, sem afrouxar o TLS.
- **Restauração local com cada identidade:** identidade 2 (Bitwarden) em 97 s e identidade 4 (OneDrive, cifrada com senha) em 66 s, ambas com SHA-256 ok e contagens idênticas por tabela (29 tabelas; ex.: `convenio` 560, `instrumento_equipamento` 292, `cnes_estabelecimento` 635.113, `user` 22, `alembic_version` 1 linha). Cópia de 182 MB. A identidade 3 foi perdida antes de ser guardada e a 1 foi exposta acidentalmente; nenhuma recebeu backup real.
- **RTO:** o componente de dados (download + decifra + restauração local) foi medido em 66 a 97 s. **O RTO de 1 h segue não certificado**: faltam a restauração num destino Neon separado e os passos de troca de `DATABASE_URL` e redeploy. **RPO de 24 h** só após o agendamento rodar por um ciclo completo.
- **Ensaio das 12 migrations sobre cópia real da produção** (backup restaurado em PostgreSQL local, revisão de partida `a3f1c9e7b204` = head da `master`; somente DDL e contagens, nenhuma linha lida):
  - `alembic upgrade head` até `b7f35c806e4a` em **0,41 s**; head único.
  - Nenhuma tabela existente mudou de contagem; surgiram 7 tabelas (`candidato_legado`, `_captura`, `_componente`, `_decisao`, `_evidencia`, `_recaptura`, `fonte_captura`): 29 → 36.
  - `alembic check`: nenhuma deriva entre schema e modelos.
  - `convenio.fora_escopo_equipamentos`: 560 `false`, 0 `true`, 0 nulos; `notificacao_destinatario.arquivada`: 1.627 `false`; enum `notificacao_tipo` ganhou `aprovacao_carteira`, `convenio_descoberto`, `inclusao_monitoramento`, `fonte_indisponivel`.
  - Reversão por `downgrade` até a revisão de produção deixou schema e contagens **idênticos** ao estado original (29 tabelas); nova subida reproduziu exatamente o primeiro resultado. Ressalva: valores de enum do PostgreSQL não são removidos pelo `downgrade`; a reversão de produção continua sendo restaurar o backup de pré-deploy.
  - A cópia local com dados reais foi removida ao final.

## Fase 1 — Fechar pendências do plano avançado (homologação, sem produção)

Ordem pensada para que o que bloqueia produção venha primeiro.

1. **Backup e recuperação (bloqueia o release). Implementado em 22/10, não ativado:** `.github/workflows/backup_banco.yml` (manual), `backend/scripts/backup_retencao.py` (12 testes), `backend/scripts/restaurar_backup.sh` e seção no `runbook-devops.md`. Ensaiado localmente com bucket simulado (restauração, SHA-256 adulterado, destino remoto e permissão frouxa recusados); actionlint e shellcheck limpos. **Falta:** primeira execução real após o merge, restauração medida com o dump real, segunda cópia da identidade `age` e, só então, o agendamento. Workflow agendado no GitHub Actions: `pg_dump` com role somente leitura, cifra com `age`, envio ao bucket R2 privado, retenção de 7 dias, alerta em falha. Chave de decifragem fora do GitHub. Restauração completa ensaiada em banco descartável a partir do artefato real, com contagens por tabela. Meta: RPO ≤ 24 h, RTO ≤ 1 h medido, não declarado. Agendar só após o ensaio e com autorização.
2. **Decisão de plano do Neon.** Medir o consumo em CU-h por um período representativo antes de decidir entre Free e Build; o Free (100 CU-h/mês, 1 GB) comporta o armazenamento atual (≈226 MB), mas a computação precisa de medição. O backup em R2 é pré-requisito para qualquer troca de plano.
3. **Etapas 3 a 6 do plano.** (a) validar contratos de recaptura contra as fontes reais; (b) tratar coleções sem ID estável; (c) UI de frescor das fontes; (d) nova UX de notificações (busca, filtros, arquivar, ler tudo) mantendo a autorização por destinatário; (e) workflow diário de recaptura só depois de confirmar secret, runner, migrations e branch, com simulação, replay idempotente, alerta e rollback.
4. **Ciclo nacional oficial com candidato elegível.** Executar a descoberta somente leitura; se não houver candidato real, registrar a ausência e fechar por evidência negativa e por aceite pontual já feito. Não fabricar novidade nem afrouxar a confirmação do Portal.
5. **Aceite nativo Word/Excel.** Usuário abre o lote reduzido já gerado nos aplicativos de destino e registra o resultado (formatação, tabelas, acentuação, tamanho).
6. **Capacidade e concorrência no provedor.** Já houve exportações pequenas no provedor; falta carga representativa. Medir em ambiente de homologação do provedor ou aceitar formalmente o limite atual (admissão DOCX por processo, 512 MiB) como restrição documentada.
7. **Observabilidade.** Classificar os 401 esperados no New Relic, depois de confirmar que não escondem falha real de sessão.
8. **Higiene documental. Feito em 22/10:** histórico cronológico do plano de espelho movido sem alteração para `planmode-espelho-notificacoes-historico-2026-10.md` (plano principal: 5.541 → 208 linhas; nenhuma linha perdida, conferido por comparação); etapas 4 e 5 corrigidas com evidência do código; plano de homologação local encerrado. Falta atualizar `AGENTS.md`/`CLAUDE.md` com as regras novas após a decisão de release. Texto original do item: Arquivar o histórico cronológico do plano principal (hoje 5.500 linhas) e manter só contrato, checklist e pendências. Fechar o plano de homologação local como concluído, remetendo o que sobrar ao plano principal. Atualizar `AGENTS.md`/`CLAUDE.md` com o que mudou de regra (fila do Radar, filtro de encerrados, novos jobs).
9. **Saída:** checklist consolidado do plano principal sem item aberto sem justificativa, e backup diário comprovado.

## Fase 2 — Preparar o release (sem tocar produção)

1. **Estratégia de integração.** O #28 é grande demais para revisão linha a linha. Revisar por blocos temáticos (Radar/recaptura, notificações, relatórios, painel/monitoramento, CI/DevOps) com checklist por bloco; manter um único PR de integração para preservar a ordem das migrations, mas com descrição estruturada e commits por assunto. Se a revisão apontar acoplamento fraco entre blocos, fatiar.
2. **Ensaio de migração com dado real. Feito em 22/10 (ver evidências acima).** Restaurar o backup mais recente de produção (leitura, snapshot consistente) em banco descartável local, aplicar as 12 migrations com a role de migração, conferir contagens por tabela, constraints e somas financeiras, e rodar a suíte de regressão sobre esse banco. Ensaiar a reversão pelo restore.
3. **Compatibilidade de versões.** Backend novo com schema antigo e frontend antigo com backend novo, durante a janela de deploy. Contrato HTTP só aditivo.
4. **Pré-voo de deploy.** Variáveis presentes, `/health` sem consulta ao banco, jobs e schedules **desativados** no primeiro deploy, CSP/CORS/cookies inalterados.
5. **Plano de rollback escrito.** Backend: redeploy do commit anterior. Banco: restaurar do backup pré-deploy; migrations são aditivas, então o código antigo continua funcionando com o schema novo. Frontend: promover o deploy anterior na Vercel.
6. **Revisão de segurança final** contra a Constituição: autorização no Service, RBAC/IDOR, CSRF, ausência de segredo em log, dependências auditadas, dados pessoais nas exportações.
7. **Saída:** relatório de prontidão com evidências e a lista exata de ações de produção a autorizar.

## Fase 3 — Publicação em produção (cada passo exige autorização)

Executar nesta ordem, parando a cada falha. Ordem revisada em 22/10 com o que o
backup, o ensaio no Neon e a consulta de permissões mostraram.

1. **Pré-condições:** `master` com o backup agendado funcionando (pelo menos uma
   execução agendada com sucesso); #28 sincronizado com a `master`, CI verde no SHA
   que será publicado; janela combinada e responsável pela observação (o usuário).
2. **Backup de pré-deploy:** disparar `backup_banco.yml` manualmente e conferir o
   resumo; guardar o nome do objeto como ponto de retorno.
3. **Conferir `alembic_version` de produção** (esperado `a3f1c9e7b204`), a versão do
   PostgreSQL (16+) e que a role de migração consegue conectar.
4. **Pré-voo de posse (alteração de DDL em produção, só metadado):** como `neondb_owner`,
   `psql "$ADMIN_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f backend/scripts/sql/normalizar_posse_aplicacao.sql`.
   Esperado: 17 objetos normalizados (3 tabelas, 3 sequências, 11 enums) e "depois: 0".
   **Sem este passo as migrations falham** com `must be owner of type notificacao_tipo`
   (reproduzido localmente). Repetir o script não tem efeito.
5. **Dado (PERSUS I):** o relatório lê o valor do acelerador em
   `siconv_raw.itens_plano_aplicacao[].VALOR_TOTAL_ITEM`, vazio nos 92 PERSUS I. Rodar
   primeiro a simulação e, depois, gravar, com autorização e backup recente:
   `python -m scripts.preencher_valor_item_persus_i` (simulação) e
   `python -m scripts.preencher_valor_item_persus_i --aplicar --confirmo-host HOST`.
   Idempotente, grava o valor global do instrumento em UM item por convênio (nunca em
   dobro), registra `VALOR_ITEM_ORIGEM` e uma linha de auditoria por convênio. Ensaiado
   em cópia local: 92 gravados, repetição sem efeito. Sem este passo o acelerador
   continua sem valor nos relatórios.
6. **Migrations:** workflow `migrar_banco.yml` (as 12 revisões; ~0,4 s no ensaio).
   Conferir `alembic current` = `b7f35c806e4a`.
7. **Código:** merge na `master` e **Manual Deploy no painel do Render**: o serviço
   **não tem deploy automático** (confirmado em 22/10). Anotar o horário de início e de
   fim do deploy (insumo do RTO).
8. **Verificações:** `/health`, login, refresh, `/auth/me`, leituras de monitoramento,
   um relatório pequeno em DOCX e outro em XLSX, notificações, filtro de encerrados.
9. Deploy do frontend (Vercel, automático) e smoke ponta a ponta.
10. **Jobs e schedules continuam desligados** neste dia. Registrar tempo, erros, CPU e RAM.
11. **Saída:** produção estável durante a janela de observação (a definir com o
    usuário, sugestão 48 h) sem erro novo.

**Rollback:** código, redeploy do commit anterior no Render; banco, restaurar o backup
de pré-deploy (as migrations são aditivas, e valores de enum não são removidos pelo
`downgrade`).

## Fase 4 — Ativação gradual e estabilização

1. Ativar o backup diário (se ainda não ativo), depois a recaptura, a descoberta e os alertas, um de cada vez, observando alertas de falha e duplicidade de aviso.
2. Rodada manual supervisionada de cada job antes de habilitar o agendamento.
3. Revisão após uma semana: consumo do Neon, custo, fila do Radar, notificações recebidas por papel, falhas de fonte.
4. Registrar o aceite final do plano principal e atualizar `CLAUDE.md`/`AGENTS.md`.
5. **Deploy automático do Render (achado de 22/10).** Todos os deploys do `sieo-backend` desde 28/09 foram manuais. O serviço e o Blueprint apontam para o nome antigo do repositório (`gustavoleitte/par_equipamentos`, hoje `devs-ministerio/par_equipamentos`), e o Blueprint está na branch `fix/tomografo-execucao-por-familia`, sem sincronizar há 2 meses, então o `autoDeployTrigger: checksPass` do `render.yaml` nunca valeu. Religar o serviço ao repositório novo (com o app do Render autorizado na organização do GitHub), ressincronizar o Blueprint pela `master` e só então ativar o gatilho após os checks, **mantendo a regra de rodar `migrar_banco.yml` antes de qualquer release que mude schema** (com o gatilho ligado, o merge subiria o código antes da migração). Decisão do usuário a registrar antes de ativar.

## Pendências conhecidas após o release (levantadas em 22/10)

Itens que seguem abertos depois da publicação. Cada um vira plano próprio, com decisão do usuário, antes de qualquer execução. Origem entre parênteses.

| # | Pendência | Origem |
|---|---|---|
| 1 | **RTO de 1 h não certificado.** Medidos: restauração de dados no Neon (848 s) e Manual Deploy do Render (2 min 11 s em 22/10). Faltam o tempo de troca da `DATABASE_URL` e o teste funcional da API contra o destino restaurado. | Fase 3, RTO |
| 2 | **Trocar a senha do `neondb_owner`**, exposta no chat em 22/10 (nenhuma credencial da aplicação a usa). | Execução do passo 3 |
| 3 | **Plano do Neon:** Build é temporário (US$ 10/mês, 250 CU-h); decidir manter Build ou voltar ao Free (100 CU-h, 1 GB) antes de 1/11, com consumo medido. | Fase 1, item 2 |
| 4 | **Rotacionar a credencial do R2 do backup antes de 20/11/2026.** | Backup |
| 5 | **`fast-uri` (npm audit, severidade moderada, indireta):** acompanhar correção. | Revisão de segurança |
| 6 | **CSP da API em Report-Only:** promover a enforcement só com relatório real de violação. | Segurança |
| 7 | **Classificar os 401 esperados no New Relic** para não esconder falha de sessão. | Fase 1, item 7 |
| 8 | **Carga representativa dos relatórios no provedor** ou aceite formal do limite atual (admissão DOCX por processo, 512 MiB). | Fase 1, item 6 |
| 9 | **Recaptura diária, ciclo nacional da descoberta e UX de frescor das fontes:** conferir o estado de cada etapa 3 a 6 no plano de espelho antes de ativar jobs. | Fases 1 e 4 |
| 10 | **Deploy automático do Render** (ver Fase 4, item 5). | Achado de 22/10 |
| 11 | **Apresentação dos relatórios** (ver Fase 5, item 0). | Pedido do usuário |
| 12 | **Excel: abas "Critérios" e "Leitura" ainda trazem as notas** que foram removidas do Word; decidir se saem também. | Aceite dos relatórios |
| 13 | **Login e aceite de convite não são auditados** (nem sucesso nem falha). | `CLAUDE.md`, seção Gestão de usuários |
| 14 | **Dados de teste (`pytest-*@example.com`, conta `teste_E2E`) em produção:** alcance não investigado. | `CLAUDE.md`, limitações |
| 15 | **16 grupos de eventos legados duplicados** deixados de fora da limpeza de 19/09, sem revisão da equipe. | `CLAUDE.md`, monitoramento |
| 16 | **Overflow intermitente a 320 px** em `/monitoramento-equipamentos` (suspeita: carga de fonte). | `CLAUDE.md`, sessão |
| 17 | **Seções "Habilitação" CNES e "Produção assistencial" ausentes dos relatórios**, por falta de fonte integrada. | `CLAUDE.md`, relatórios |
| 18 | **Valor dos 92 PERSUS I em produção** (Fase 3, passo 8): simulação, depois gravação com autorização. | Fase 3 |
| 19 | **Fechar a janela de 48 h** com registro de erros, CPU/RAM e aceite, e conferir o instrumento 716619 (conclusão em 19/10/2026 na produção). | Fase 3, passos 10 e 11 |
| 20 | **Suíte completa do backend não rodou limpa na máquina local** (testes de recuperação exigem o banco clone protegido); vale a CI como referência. | Gates |

## Planos que dependem do fechamento deste plano (levantados em 22/10)

Varredura de `docs/arquitetura/planmode-*.md` e dos diagnósticos por "depois", "fora de escopo", "plano próprio" e checklists abertos. O estado de cada item é o que o documento de origem registra; **confirmar contra o código e a produção antes de planejar**.

**A. Esperam a estabilização/publicação do plano de espelho (decisão já registrada)**

- [Identidade SISGEO](planmode-identidade-sisgeo-2026-10-20.md): implementação não iniciada. Pode ser antecipada como alteração isolada de apresentação; decisão pendente do nome por extenso e de nova marca.
- [Monitoramento por item e equipamento físico](planmode-monitoramento-itens-equipamentos-2026-10-20.md): implementação não iniciada; fotos por último, com decisões de armazenamento, formatos, retenção e privacidade.
- Itens ainda abertos no checklist do próprio [plano de espelho](planmode-espelho-notificacoes-2026-10-06.md): desempenho no provedor sob carga, ciclo nacional da descoberta com candidato elegível e aceite operacional de RPO/RTO (ver pendências 1, 8 e 9 acima).

**B. Estavam bloqueados pela cadeia de migrations em estabilização, agora liberados**

- [Normalização de dados, Onda 1](planmode-normalizacao-database-2026-09-28.md): CNPJ foi normalizado em produção, mas as **CHECKs de CNPJ (`NOT VALID`, depois validar)** ficaram para uma migration posterior à cadeia local; o teste de integração do script estava bloqueado pela divergência de revisão do banco de teste. Com o head `b7f35c806e4a` aplicado em produção, retomar.
- [Governança de dados](planmode-governanca-dados-2026-09-28.md): a **atribuição manual dos 182 instrumentos sem titular** (legado bloqueado para edição até regularização, sem inferir vínculo por nome) e a referência estruturada de proveniência em cargas novas; conferir o estado atual em produção.

**C. Marcados "fora de escopo" ou "plano próprio" e nunca abertos**

- **Escopo de autorização por UF/técnico/órgão** (RBAC granular): hoje há 4 papéis globais; só revisitar sob demanda real de produto.
- **Mapa de cobertura no Painel de Gestão** ("plano próprio"), mantendo a metodologia só de oferta SUS em uso.
- **Ingestão relacional de propostas** (`evidencia_transferegov` sem escritor): plano dedicado de ingestão antes de migrar a leitura de `metas_resumo`.
- **Paginação e virtualização reais, envelope de resposta unificado** além das duas rotas já migradas, e **observabilidade estruturada** (logs JSON, `trace_id`, duração).
- **Remoção física da coluna `Notificacao.lida`** (deprecated) e **saída visual do mapa em Word** (decisão separada).
- **Qualidade:** teste de carga, acessibilidade automatizada abrangente (auditoria WCAG AA completa, contraste, foco) e mutation testing.
- **Custo e infraestrutura:** rate limit distribuído (Redis), staging/registry, PITR além de 6 h e cold start do Render, sempre com decisão de orçamento.

## Fase 5 — Planos que hoje estão só no papel (somente após a Fase 4)

0. **Apresentação dos relatórios: visão "Todos" no padrão de "Concluídos"** (pedido do usuário em 22/10, após o release). Em Relatórios, o filtro Conclusão = Concluídos mostra cada instrumento em bloco legível (instituição; "Nº, CNES, tipo"; município/UF; equipamentos com quantidade; critério, valor global e data), e o usuário prefere essa organização à tabela da visão "Todos" (colunas Número, CNES, Convenente, Município/UF, Equipamento, Situação, Monitoramento, Ano, Valor global). Levar a mesma organização e os mesmos campos (equipamentos com quantidade, CNES e número em itens próprios, valor e datas formatados) para "Todos" na prévia da tela e, onde fizer sentido, nos arquivos Word/Excel, sem perder as colunas hoje exclusivas de "Todos" (situação do site, monitoramento, ano). Escopo, o que é obrigatório e o que muda nos arquivos a definir em plano próprio antes de implementar.

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
