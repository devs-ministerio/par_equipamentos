# Plan Mode — pendências consolidadas (2026-10-28)

Registro único das frentes abertas, para nada ficar inacabado ou esquecido. Nenhuma implementação nova começa por este documento; ele só organiza o que já foi pedido, decidido ou deixado em aberto. Para complementar com outro plano, acrescentar frentes na seção 4 e linhas na seção 5.

## 1. Como usar
- Cada pendência tem **ID**, **estado**, **dono** e **critério de pronto**. Estados: `aberta`, `em andamento`, `bloqueada`, `feita`, `descartada`.
- Pendência sem dono é do usuário até alguém assumir. Nunca apagar linha: mudar o estado e anotar a data.
- Revisar este arquivo ao fechar cada PR e ao iniciar uma sessão nova.

## 2. Regras permanentes (valem para todas as frentes)
- Sem merge na `master` nem gravação em produção sem autorização específica. O usuário faz merge e roda scripts de produção.
- Script de dados roda em simulação por padrão e só grava com `--aplicar --confirmo-host HOST`.
- Nunca acessar produção, R2 ou segredos por conta própria.
- Sem script descartável em `backend/scripts/` (usar o scratchpad).
- Rótulos curtos na UI, sem subtítulos explicativos.
- Commits e PRs **sem** `Co-Authored-By: Claude` e sem "Generated with Claude Code".
- Sem push ao remoto sem autorização.
- Teste `*_db.py` novo só entra após ser registrado em `backend/tests/conftest.py::_DB_TEST_MODULES`.
- Fluxo de entrega: PR para `homologacao`, CI verde, merge do usuário, depois PR para `master`. Migration sempre antes do deploy.

## 3. Estado do código
- Worktree: `.codex-work/recuperacao-homologacao-20261013`, branch `feat/itens-equipamento`.
- Último commit: `bbfbe39` (frente A, commitada só no local, 29/10/2026); o anterior, `4d9ea3c` (filtro de município por CNES), foi enviado e está no PR #50 para `homologacao`.
- Nada do trabalho de 28 e 29/10 foi enviado ao remoto. A pilha de branches locais está na seção O.

## 4. Frentes

### A. Relatórios: Situação única e "Equipamento entregue"
Pedidos do usuário: unir as situações em um filtro; opção "Equipamento entregue" no filtro Conclusão; **todos os filtros devem filtrar todos os dados**.

Decisões já tomadas:
- Situação em lista agrupada por origem (Instrumento, Monitoramento, Proposta). Escolher um valor filtra a seção da origem e esconde as demais.
- "Equipamento entregue" é um relatório por item e unidade (série, marca, modelo, vida útil, data de entrega), não por instrumento.
- Programa, tipo, equipamento e busca valem também para propostas e monitoramento. Proposta conta como tipo "Parceria TransfereGov".

| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| A1 | Backend: relatório de entregues (repositório, serviço, Excel, Word, `GET /relatorios/entregues`) | feita (commit `bbfbe39`) | testes `test_relatorios_entregues_db.py` passando |
| A2 | Backend: `situacao_origem` e filtros nas três seções | feita (commit `bbfbe39`) | bateria `-k relatorio` sem falhas |
| A3 | Registrar `test_relatorios_entregues_db.py` em `_DB_TEST_MODULES` | feita (commit `bbfbe39`) | arquivo na lista; suíte pula sem `TEST_DATABASE_URL` |
| A4 | Conferir o que o `ruff format` mexeu em `services/relatorios.py` | feita: `ruff format --check` sem diferença nos arquivos de relatórios | `git diff` só com linhas intencionais |
| A5 | Teste da origem "monitoramento" (convênios restritos à fase escolhida) | feita: teste `test_situacao_de_monitoramento_restringe_convenios_a_fase_e_esconde_propostas` | teste novo verde |
| A6 | Frontend: ligar a página de Relatórios (Conclusão com "Equipamento entregue", Situação agrupada, seções escondidas por origem, filtros nas propostas da prévia) | feita (commit `bbfbe39`); prévia de propostas ainda não filtra por programa/equipamento (só o arquivo) | prévia e arquivo mostram o mesmo recorte |
| A7 | Frontend: testes (página, hook de entregues, `single-select-filter` com grupos), lint, typecheck, build | parcial: lint, `tsc` e 931 testes verdes; `build` e testes de página/hook ainda não | `npm run lint`, `tsc`, `test` e `build` verdes |
| A8 | Rótulos da aba "Leitura" já seguem a origem; conferir Word e Excel gerados | aberta | arquivos abertos e conferidos |
| A9 | Decidir se Situação vale no relatório de entregues (hoje ignorada) | aberta | decisão do usuário registrada |
| A10 | Levar a organização da visão "Concluídos" para a visão "Todos" (pedido antigo, ver `CLAUDE.md`) | aberta | visão "Todos" organizada igual |

### B. Filtro de município por CNES (PR #50)
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| B1 | CI do PR #50 | aberta (aguardando) | CI verde e merge do usuário |
| B2 | Incluir `cnes_municipio` também nas propostas candidatas | aberta (decisão do usuário) | decisão registrada; se sim, API e prévia |
| B3 | Propostas na prévia ainda filtram pelo município da proposta | aberta | alinhado a B2 |

### C. Conferência em produção (com login do usuário)
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| C1 | Totais 542 firmados e 288 monitorados | aberta | números batem |
| C2 | Instrumentos 985680 e 730663 (marcadores e nome RENEM) | aberta | marcadores corretos |
| C3 | Fila de revisão de itens (12 + 6) | aberta | fila coerente |
| C4 | Relatórios Excel e Word de produção | aberta | arquivos abertos e conferidos |
| C5 | Filtro Prioritários em Dados oficiais e Equipamentos | aberta | padrão visual igual nas duas páginas |
| C6 | Convite com logotipo (Gmail e Outlook) | aberta | e-mail renderizado e conferido |
| C7 | Word e Excel no Office (não verificados fora do ambiente de teste) | aberta | abertura sem erro |

### D. Operação e infraestrutura
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| D1 | Confirmar `APP_PUBLIC_URL=https://par-equipamentos.vercel.app` no Render (o conector não lê variáveis) | aberta (usuário) | valor confirmado no painel |
| D2 | Deploy automático do Render desligado; religar só depois da janela de observação, mantendo "migrar antes" | aberta | decisão e passo a passo registrados |
| D3 | Job de prazos sem agendamento (08:00 São Paulo) | aberta | rodada supervisionada, depois agendar |
| D4 | `pipelines.yml` e `radar_convenios.yml` com cron desligado de propósito | aberta | ativar um de cada vez, com rodada manual antes |
| D5 | Rotacionar a credencial do R2 antes de **20/11/2026** | aberta (usuário) | credencial trocada |
| D6 | RTO de 1 h não certificado (falta trocar `DATABASE_URL` e testar o funcional) | aberta | ensaio completo registrado |

### E. Dados
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| E1 | FAFs `25000083818202628` e `25000083829202616` | aberta (usuário) | resolvido pelo usuário |
| E2 | Dois instrumentos com entrega a vincular, sem aviso nem notificação | aberta (usuário) | resolvido internamente |
| E3 | Sem inserção de item pelo colaborador por ora | descartada por ora | rever só se o usuário pedir |

### F. Qualidade e higiene
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| F1 | 2 testes de `test_candidatos_legados_db` falham só no ambiente local (também sem as mudanças) | feita: causa entendida. O guard de `scripts/descoberta_local_guardas.py` exige `DATABASE_URL` e `DATABASE_URL_MIGRATION` explícitos e iguais; com os dois e `TEST_DATABASE_URL` os 23 testes passam | causa entendida ou teste ajustado |
| F2 | Limpeza local: banco `sigeo_homologacao_base_20261026`, servidores locais, bancos e worktrees antigos | aberta (só se o usuário pedir) | limpeza autorizada e feita |
| F3 | Commit de segurança do trabalho da frente A | feita (commits locais sem atribuição) | commit sem atribuição do Claude |

### G. Documentação
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| G1 | Nota no `CLAUDE.md`: Situação por origem, relatório de entregues, filtros valendo para todas as seções | feita (`CLAUDE.md`, commit `bbfbe39`) | seção curta publicada |
| G2 | Nota de projeto na memória com estado e pendências | aberta | arquivo e linha no índice |
| G3 | Este documento revisado ao fechar cada PR | contínua | estados atualizados |

### H. Observabilidade, triagem diária e métricas de uso (sessão de 26 a 28/10/2026)
Origem: conversa em que se montou a triagem diária de alertas e se investigou a banda do Render. Contexto de base: [monitoramento Render/Neon](monitoramento-render-neon-2026-10-18.md), [incidente de 23/10](incidente-api-neondb-owner-2026-10-23.md) e a seção Observabilidade do [runbook](runbook-devops.md). Nada abaixo foi alterado em produção, no código ou nos monitores; só houve leitura (Gmail, Render, Neon, banco em transação somente leitura).

| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| H1 | Autenticar o conector do New Relic (OAuth dá `unexpected_error`; tentar janela anônima e o mesmo e-mail do New Relic) | aberta (usuário) | conector conectado; a triagem lê issues ativos e a taxa de sucesso dos monitores |
| H2 | Decidir o que fazer com a banda do Render (ver "Evidências de H2" abaixo): aceitar e monitorar, reduzir o volume do agente, deixar o serviço dormir fora do horário ou migrar de plano | aberta (decisão do usuário) | decisão registrada neste arquivo e no runbook |
| H3 | Confirmar a causa do piso de banda: ingestão do New Relic por fonte (APM, logs, Synthetics) e gráfico de Bandwidth do Render | aberta (depende de H1 ou de print do usuário) | causa marcada como confirmada ou descartada |
| H4 | Conferir a configuração real dos dois monitores (frequência, regiões, timeout, URL) | aberta (usuário envia print) | valores registrados; divergência com o runbook corrigida |
| H5 | Se H2 for "dormir à noite": evitar falso alerta do monitor de prontidão horário (cold start de até 60 s) e parar o monitor de 5 minutos fora do horário | bloqueada por H2 | desenho validado com um issue sintético, sem derrubar produção |
| H6 | Registrar a geração de relatórios no `AuditLog` (`log_action` em `gerar_relatorio`, com formato, tipo, escopo e nível; vale também para `/relatorios/encerrados` e `/relatorios/entregues` da frente A). Hoje nada é registrado, então não há contagem de XLSX e DOCX | aberta (precisa de autorização de código) | teste novo; sem migration; contagem passa a existir a partir da publicação |
| H7 | Atualizar o prompt da triagem para consultar Render (deploy contra a `master`, banda) e Neon (CU-h) quando os conectores estiverem na sessão, com alerta de banda acima de 80% | aberta (decisão do usuário) | execução manual mostra as verificações com evidência; sem conector, continua "não verificado" |
| H8 | Franquia do plano Build do Neon (CU-h) e armazenamento: a API devolveu armazenamento 0, tratado como não verificado | aberta (usuário) | percentual calculado e regra de 80% da triagem aplicável |
| H9 | Alerta de ausência de backup bem-sucedido (sem sucesso em mais de 24 h), além do e-mail de falha do GitHub | aberta (sugestão) | alerta criado e testado por envio, sem derrubar produção |
| H10 | Segundo canal e segundo destinatário para alerta crítico (hoje só e-mail); desenho já existe no documento de monitoramento Render/Neon | aberta (desenho existente) | issue sintético chega ao segundo canal |
| H11 | Conferir o alerta de segurança do Google de 22/10 (chave de acesso nova na conta `devgustavodecan`) | aberta (usuário) | confirmação de que foi do usuário |
| H12 | Refazer as métricas da planilha de uso (usuários, acessos, cobertura, monitoramento, radar): os números são de 24/10 e o universo mudou em 26/10 (288 monitorados, 542 firmados). Custeio não existe no banco de produção | aberta | consulta repetida na data da entrega, com a ressalva de contas de teste |
| H13 | Documentar: seção da triagem no `runbook-devops.md` (o que verifica, o que não alcança, como atualizar) e cópia versionada do prompt, que hoje vive só em `~/.claude/scheduled-tasks/triagem-alertas-sigeo/SKILL.md` | aberta | texto publicado, sem commit até autorização |

Evidências de H2 (medidas em 26/10/2026; o que é hipótese está marcado):
- Render, plano gratuito, 1 instância, health check do Render em `/health/live`. Último deploy no ar: commit `472467b` (merge do PR #38), todos com gatilho manual.
- O consumo de banda do serviço tem piso de 5,5 a 6 MB por hora, inclusive de madrugada e no fim de semana (picos de 8 a 18 MB nos horários de uso). Em 26 dias isso soma cerca de 3,7 GB, perto de 74% dos 5 GB e coerente com o aviso de 70% do Render. A conta assume que a série é MB por hora.
- A CPU fica constante em torno de 0,011 em todas as horas, o que indica instância sempre acordada, e quem a mantém acordada é o monitor "SIGEO API — health externo" (5 minutos).
- As respostas de `/health` (38 bytes) e `/health/live` (15 bytes) são pequenas demais para explicar o piso: o ping em si pesa menos de 1 MB por dia. **Hipótese, não confirmada:** o piso vem da telemetria do agente do New Relic (envio a cada minuto, com rastreamento distribuído e encaminhamento de logs ligados no `render.yaml`), que só roda enquanto a instância está acordada.
- Os logs de requisição do Render e a métrica de requisições HTTP voltaram vazios; logo, os logs do Render não servem para contar acessos por mês (usar o `AuditLog`).
- Neon: o compute **suspende** (o início de hoje coincidiu com um acesso ao `/health`); o monitor de prontidão horário é quem o acorda, o de 5 minutos não consulta o banco. Computação do período de 18/10 a 01/11: cerca de 24,4 CU-h, transferência de ~1,8 GB, PITR de 6 h.
- Opções de H2: (1) aceitar e monitorar a 80%; (2) intervalo do ping de 10 minutos, ganho pequeno; (3) desligar o encaminhamento de logs ou o rastreamento distribuído, com perda de correlação no New Relic; (4) deixar dormir fora do horário, com o risco de H5 e perda de cobertura noturna; (5) plano pago ou sempre ativo, que o runbook já prevê para a migração de infraestrutura.
- Relação com D2: o serviço do Render aponta para o nome antigo do repositório (`gustavoleitte/par_equipamentos`) e o deploy automático segue desligado de propósito; religar só depois da janela de observação, mantendo "migrar antes".

### I. PRs abertos e branches (levantamento de 28/10/2026, `gh pr list` e `git branch -vv`)
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| I1 | PR #55 (radar, base `master`) | feita (mesclado em 28/10 pelo usuário) | `master` em `f53f8be` |
| I2 | PR #50 (base `homologacao`): checagens passando, estado `CLEAN`; falta só o merge (substitui o "aguardando CI" de B1) | aberta (merge do usuário) | mesclado |
| I3 | PR #45 (`docs/plano-unificado-homologacao`) aberto desde 23/10 com estado `DIRTY` (conflito) | aberta | rebase ou fechar |
| I4 | PRs #44 (`feat/sisgeo-bloco0`) e #43 (`docs/triagem-diaria-estado`, base `master`) abertos desde 23/10, checagens passando | aberta | mesclar ou fechar |
| I5 | Três branches locais com commit a mais que o remoto: `codex/ajustes-pendentes-2026-09-30`, `codex/relatorios-producao-2026-10-05` e `docs/itens-detalhamento` | aberta | enviar, mesclar ou descartar |
| I6 | Branches locais sem remoto (`ci/testes-backend-frontend`, `codex/health-sem-banco-20261018`, `codex/hotfix-auth-timeout-20261018`, `docs/context-files-e-subagentes`, entre outras) | aberta | triagem: manter, enviar ou apagar |
| I7 | Worktrees extras em `~/.codex/worktrees/` (4) e `par_equipamentos-fix-radar` | aberta (só se o usuário pedir limpeza) | removidos |

### J. Fora do pacote de itens (listado no roteiro de release de 23/10)
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| J1 | Fotografias (etapa 9 do plano de itens) | aberta (sem data) | decisão de entrar ou não |
| J2 | `equivalente_renem` dos códigos extintos | aberta (sem data) | decisão |
| J3 | Valor pago ao fornecedor por item (seção 10 do plano de classificação) | aberta (sem data) | decisão |
| J4 | Rateio de rendimento entre bens (itens `multiplo`) | aberta (sem data) | decisão |

### K. Contratações PNCP (checkout principal, fora desta worktree)
O checkout em `/Users/gustavoleite/dev/par_equipamentos` está na branch `contratacoes-vinculadas-pncp`, com 2 commits à frente da `master`, alterações não commitadas (`AGENTS.md`, `CLAUDE.md`, `backend/app/pipeline/pncp.py`, `schemas_contratacoes.py`, `services/contratacoes_pncp.py` e outros) e um stash ("preserva arquivos locais antes de alinhar base PNCP"). Há também arquivos sem versionamento (dados, PDFs, `poc_investsus_qlik`). Não é desta frente de relatórios.
| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| K1 | Definir dono, PR e destino da branch `contratacoes-vinculadas-pncp` e do stash | aberta (usuário) | commitada ou descartada, stash resolvido |
| K2 | Triagem dos arquivos sem versionamento do checkout principal (`data/`, `docs/*.pdf`, `docs/extracoes/`, `outputs/`) | aberta (usuário) | versionados, ignorados ou apagados |

### L. Banco de dados: integridade de `evento_marco` e `tipo_contratacao` (em andamento, usuário)
Estado verificado: o índice atual é o parcial **não único** `idx_evento_marco_ativo` em `(instrumento_id, marco_id)` onde `substituido_por_id IS NULL AND deletado_em IS NULL` (`backend/app/db/models.py`).

| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| L1 | Script de correção dos 158 grupos (instrumento, marco) com mais de um evento ativo, em simulação por padrão (`--aplicar --confirmo-host`), sem DELETE físico: vincular por `substituido_por_id` e gravar `AuditLog`, como na limpeza de 19/09 | em andamento (usuário) | simulação lista os 158 com a decisão de cada um; execução deixa **zero** grupos duplicados |
| L2 | Migration que troca o índice por `UNIQUE` parcial | feita na branch local `fix/versiona-indice-unico-evento-marco` (commit `0f45e9f`, suíte backend 2027 passaram; 2 falhas de `candidatos_legados` são de ambiente); a migration `c7d8e9f0a1b2` foi reescrita e nunca chegou à produção) | só roda depois de L1 aplicado e L3 respondido; teste de violação |
| L3 | **Risco a decidir antes de L2:** o `CLAUDE.md` documenta convênio com mais de um equipamento (947527, 2 aceleradores) e 16 grupos deixados de propósito (matrícula CNEN e SCRA em equipamentos diferentes). Um `UNIQUE` em `(instrumento_id, marco_id)` impede esses casos legítimos, e o fluxo novo de entrega por item também pode lançar mais de um evento do mesmo marco | aberta (decisão do usuário) | consulta em produção, só leitura, mostra quantos grupos são legítimos; decidir entre excluir esses marcos, acrescentar um discriminador (item ou unidade) ao índice, ou aceitar um evento por marco |
| L4 | Os serviços de evento passam a traduzir a violação do índice em `ConflictError` (409), não em erro 500, com teste | aberta | teste novo; sem 500 na API |
| L5 | Corrigir os 22 `tipo_contratacao` incorretos, com script em simulação, auditoria e reversão | em andamento (usuário) | os 22 listados com valor atual e novo; nenhum fica fora do vocabulário (Convênio, FAF, TED, PERSUS I, PERSUS II) |
| L6 | Refatorar o N+1 do script do usuário (consultas em lote, como em `listar_numeros_fora_escopo`) | em andamento (usuário) | mesmo resultado em simulação, com número de consultas medido antes e depois |
| L7 | Ordem de execução em produção: backup manual, script L1, conferir zero duplicados, migration L2, deploy da API, depois L5. Nunca a migration antes de L1 | aberta | roteiro seguido e registrado; usuário executa e autoriza cada passo |
| L8 | O teste de integração novo entra em `_DB_TEST_MODULES` antes da primeira execução | aberta | arquivo na lista |
| L9 | **CRÍTICO (achado em 28/10, depois do índice único aplicado em produção):** `registrar_entrega` (`backend/app/services/entregas_equipamento.py`) cria um `EventoMarco` `cronograma_entrega` novo a cada entrega. Com o `UNIQUE`, a **segunda entrega do mesmo instrumento** (entrega parcial, 2 aceleradores) viola o índice, cai no `except IntegrityError` e responde 409 "Conflito ao registrar a entrega". Isso quebra o fluxo do release de 26/10 para qualquer instrumento com mais de uma entrega | **corrigida no código local** (índice único só para marcos de fase geral; entregas em datas diferentes têm teste). Produção **não** tem o índice: `alembic_version` em `b6c7d8e9f0a1` e índice comum, conferido por leitura em 28/10 | ou a migration é desfeita (`alembic downgrade -1`) até o código ser corrigido, ou o código reaproveita o evento ativo existente (vincula a nova entrega a ele, sem criar outro) e é publicado; teste com duas entregas no mesmo instrumento |
| L10 | **Deriva entre produção e repositório:** produção já está na revisão `c7d8e9f0a1b2`, mas o arquivo da migration existe só como não versionado no checkout principal (`backend/alembic/versions/`), sem commit em nenhuma branch. Um `migrar_banco.yml` a partir da `master` falharia com revisão desconhecida | **resolvida no commit local** (branch `fix/versiona-indice-unico-evento-marco`: migration, modelo `unique=True`, scripts e testes); falta o PR para a `homologacao` | migration, `consolidar_eventos_marco_duplicados.py` e o ajuste do modelo (`unique=True`) commitados em PR; `alembic heads` do repositório igual à produção |
| L11 | Gravações em produção feitas na sessão do banco (backfill de CNES, ano e descrição; correção de 524 vínculos de `item_plano`; consolidação dos 158 grupos) sem registro neste plano | aberta | cada gravação anotada aqui com data, script, quantidade e `AuditLog` correspondente |
| L12 | **Consolidação de 28/10 escondeu entregas reais:** as entregas 58 (961305), 61 (979588) e 62 (748683) apontam para eventos marcados como substituídos. Reabrir com `scripts/reabrir_eventos_consolidados.py --instrumentos 730663 947527 948692 949415 961305 979588 748683` (simulação primeiro). Confirmados pelo usuário com 2 equipamentos: 947527, 949415 (itens 000595 e 010547); a leitura da produção confirmou itens múltiplos em 730663, 948692, 961305 | aberta (usuário executa) | simulação conferida, depois `--aplicar`; consulta de entregas ligadas a evento escondido volta vazia |
| L13 | 31 dos 98 registros de cronograma/regulatório consolidados são duplicata de fonte (PERSUS I, 1 acelerador por instrumento) e ficam como estão; 4 instrumentos PERSUS I têm datas com anos de diferença entre planilhas (`PS1-147918`, `PS1-291170`, `PS1-406893`, `PS1-657689`) para a equipe validar. `948692` tem "30/02/2027" na observação (data inexistente) | aberta (equipe) | datas validadas e corrigidas pela equipe |
| L14 | O índice único de fase geral exige que `registrar_evento_monitorado` recuse (409) a segunda fase igual e que a correção passe por `substituir_evento` (feito na branch); scripts de carga que criem fase geral duplicada agora falham em vez de duplicar | feita na branch local | testes de edição e de conflito de fase |

### M. Fluxo de branches (levantamento de 28/10/2026)
Estado: a `master` (`f53f8be`) está 6 commits à frente da `homologacao` (`d3cede1`), porque os PRs #51 a #55 foram direto para a `master`. Toda a `homologacao` já está dentro da `master`. A branch `feat/itens-equipamento` (PR #50, base `homologacao`) está 7 commits atrás da `master`.

| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| M1 | **Decidido pelo usuário (28/10):** todo trabalho vai primeiro para a `homologacao`; só o usuário aprova a subida para a `master`. Nada de PR direto na `master`. Falta escrever a regra no `CLAUDE.md` e no modelo de PR | decidida; registro aberto | regra publicada; proteção de branch conferida pelo usuário |
| M2 | Com a regra de M1, realinhar a `homologacao` com a `master` (6 commits que entraram direto: #51 a #55) antes de qualquer PR novo; o #50 e a frente A seguem sobre a `homologacao` realinhada | aberta (o merge é do usuário) | `homologacao` contém a `master` |
| M3 | Merge do #50 e dos trabalhos da frente A, depois da conferência | aberta (usuário) | mesclado |
| M4 | Branches cujo conteúdo **não** está na `master`: `codex/relatorios-producao-2026-10-05` (8 commits, PR #26 fechado), `ci/testes-backend-frontend`, `feat/pet-ct-corte-macro-pequena`, `fix/health-region-coverage-produtividade-familia` (1 commit cada, de agosto) | aberta | para cada uma: reaproveitar, abrir PR ou descartar, com o motivo anotado |
| M5 | Branches com PR já mesclado (cerca de 25, de `codex/*`, `docs/*`, `feat/*` e `fix/*`) e `fix/titularidade-instrumento-sem-responsavel`, cujo conteúdo já está na `master` | aberta (precisa de autorização para apagar) | lista conferida e apagada local e remotamente, só com o seu ok |
| M6 | `codex/hotfix-auth-timeout-20261018` e `docs/context-files-e-subagentes`: sem PR e sem conteúdo novo em relação à `master` | aberta | apagadas com autorização |
| M7 | PRs #43, #44 e #45 (documentos de 23/10): #44 só acrescenta `inventario-sisgeo-2026-10-23.md`; #45 altera 4 documentos de plano e tem conflito | aberta | #44 e #43 mesclados ou fechados; #45 refeito sobre a `master` ou fechado |
| M8 | Branch `contratacoes-vinculadas-pncp` (checkout principal): 2 commits à frente da `master`, sem PR, alterações sem commit e 1 stash | aberta (usuário) | PR aberto ou trabalho arquivado (ver K1) |

### N. Diagnósticos da Constituição (09/2026) a implementar
Base: os diagnósticos de 28 e 29/09 (`diagnostico-constituicao-*`), reverificados contra o código em 28/10. A regra é a de M1: cada bloco é um PR para a `homologacao`.

| ID | Pendência | Estado verificado em 28/10 | Critério de pronto |
|----|-----------|---------------------------|--------------------|
| N1 | Sanitizar fórmula em célula do Excel (segurança, P1) | **feita** (`xlsx_builder.py` força texto) | só registrar |
| N2 | N+1 da timeline do relatório completo (banco, P1) | **feita** (`carregar_monitoramento_relatorio` em lote) | só registrar |
| N3 | Limite de requisições em `GET /relatorios` e `POST /usuarios/{id}/enviar-redefinicao` (segurança, P1) | **feita no commit local** (branch `fix/constituicao-bloco1-seguranca-banco`, a partir de `origin/homologacao`); 481 testes passando | teste de 429 |
| N4 | Validar `https` em `mail_api_url` (segurança, P2) | **feita no commit local** (mesma branch) | teste de configuração |
| N5 | `comment=` nas colunas sensíveis (e-mail, CNPJ, CEP, `siconv_raw`, `transferegov_raw`) (banco, P1) | **feita no commit local** `6620d9f` (branch `fix/constituicao-n5-comentarios-colunas`, migration `d8e9f0a1b2c3`, 9 colunas) | migration só com comentários; teste do catálogo |
| N6 | Drift de migration e migrations aplicadas fora do repositório (banco/devops, P1) | **agravada** por L10 | `alembic heads` igual à produção; checklist pós-deploy |
| N7 | Oito rotas sem `response_model` (backend, P1) | **feita no commit local** `ac6f0f8` (eram 9: 7 de `/auth`, `/health` e o relatório em arquivo, que declara `response_model=None`; teste `test_contrato_rotas.py` impede regressão) | cada rota classificada e tipada |
| N8 | Router sem Service e Repository: `auth`, `convenios`, `equipment_offer`, `macro_coverage`, `monitoramento`, `municipality_coverage`, `propostas_candidatas` (backend, P1) | **parcial, 3 commits locais**: `convenios` e `propostas_candidatas` (`89f2a49`), `equipment_offer` (`fc6e606`), `macro_coverage` e `municipality_coverage` (`51af8d2`). Faltam `auth` (10 commits no router, PR próprio) e `monitoramento` | um router por PR, contrato HTTP intacto |
| N9 | Arquivos grandes: `services/relatorios.py` (1.521 linhas, cresceu), `routers/monitoramento.py` (817), `services/monitoramento_eventos.py` (741) (backend, P2) | **feita nas 3 peças, commits locais** (branch `fix/constituicao-n9-relatorios`): `services/relatorios.py` 1.521 para 179 linhas + 6 módulos (`2143fba`); `routers/monitoramento.py` 817 para 415 + `schemas_monitoramento_api.py` e `serializers_monitoramento.py` (`dbba9f3`); `services/monitoramento_eventos.py` 744 para 54 (fachada) + 4 módulos (`1805915`). Lógica só movida, sem ciclos, fachadas reexportam os nomes antigos | extração por caso de uso, com testes de contrato |
| N10 | Rate limit distribuído (`RATE_LIMIT_STORAGE_URI`) e CSP em modo de relatório (segurança, P1 operacional) | **aberta** (decisão de custo/infra) | decisão registrada |
| N11 | E2E de jornada administrativa e recuperação de erro da auditoria (frontend/qualidade, P1/P2) | **a verificar** | teste E2E com usuário admin efêmero |
| N12 | Evidência operacional datada: proteção de branch, checagens obrigatórias, rollback, backup restaurável (devops, P1) | **aberta** (só o usuário comprova) | evidência anexada sem credenciais |
| N13 | `apt-get upgrade` no Dockerfile (build não reproduzível) e script versionado de `GRANT`/`REVOKE` (devops/banco, P2) | **aberta** | decisão e plano-mode próprio |
| N14 | Diagnósticos têm um mês e não cobrem outubro (itens por unidade, entregas, identidade SISGEO, relatórios de concluídos e entregues) | **aberta** | rodada nova de diagnóstico por área antes de fechar o N8 e o N9 |

### O. Pilha de branches locais (29/10/2026) e ordem de subida
Todas locais, nada enviado. Cada uma parte da anterior; sobem para a `homologacao` nesta ordem, só com o seu ok, e a suíte completa roda na ponta antes.

| # | Branch | Commit | Conteúdo | Pendências que fecha |
|---|--------|--------|----------|----------------------|
| 1 | `fix/versiona-indice-unico-evento-marco` | `0f45e9f` | índice único só para marcos de fase geral, migration `c7d8e9f0a1b2`, scripts de consolidação e reabertura | L2, L4, L9, L10, L14 |
| 2 | `fix/constituicao-n5-comentarios-colunas` | `6620d9f` | migration `d8e9f0a1b2c3` (comentários) | N5 |
| 3 | `fix/constituicao-response-model` | `ac6f0f8` | `response_model` + teste de contrato | N7 |
| 4 | `fix/constituicao-camadas-routers` | `89f2a49` | `convenios`, `propostas_candidatas` | N8 (parte) |
| 5 | `fix/constituicao-camadas-equipment-offer` | `fc6e606` | `equipment_offer` | N8 (parte) |
| 6 | `fix/constituicao-camadas-cobertura` | `51af8d2` | `macro_coverage`, `municipality_coverage` | N8 (parte) |
| fora | `fix/constituicao-bloco1-seguranca-banco` | `4be1e84` | rate limit, `https` em `mail_api_url` | N3, N4 |
| fora | `feat/itens-equipamento` | `bbfbe39` | frente A (PR #50 já aberto) | A1 a A3, A6 |

Ordem de produção (você executa): backup, migration `c7d8e9f0a1b2` e `d8e9f0a1b2c3`, deploy manual no Render, depois `reabrir_eventos_consolidados.py` em simulação e com `--aplicar --confirmo-host`. Antes, rodar a consulta de entregas ligadas a eventos ocultos (L12).

Como rodar a suíte completa localmente: `JWT_SECRET` com 32+ caracteres, `COOKIE_SECURE=false`, `DATABASE_URL`, `DATABASE_URL_MIGRATION` e `TEST_DATABASE_URL` iguais, em `127.0.0.1` e num banco `sigeo_test_clone_*`. Com isso a suíte fica toda verde. (Sem `DATABASE_URL_MIGRATION` falham 2 testes de `candidatos_legados`.)

Falhas conhecidas só de ambiente: `COOKIE_SECURE=false` e host `127.0.0.1` nos testes locais; os dois testes de `test_candidatos_legados_db` recusam variáveis herdadas do shell; o clone local `sigeo_test_clone_20000101` tem tabelas `candidato_legado*` de outra branch (17 diferenças no teste de drift).

Resultado da suíte completa na ponta da pilha (`fix/constituicao-camadas-cobertura`, 29/10/2026): **2029 passaram, 2 falharam**; as duas falhas são `test_candidatos_legados_db` (recusam variáveis PG e `.env` herdados do shell, ambiente, não código). `ruff` limpo e `mypy` limpo nos arquivos tocados.

**Conflito conhecido com o PR #50:** a branch `fix/constituicao-camadas-routers` (`89f2a49`) refatora `routers/convenios.py`, que o #50 também alterou (`cnes_municipio`). Resolvido na branch local `local/teste-integrado` levando o campo para `schemas_convenios.py`, `repositories/cnes_estabelecimento.py` (`municipios_por_cnes`) e `services/convenios.py`. Quando o #50 for mesclado, rebasear a pilha e aplicar a mesma resolução.

**Ambiente de teste local (29/10/2026):** API `localhost:8010`, web `localhost:5180` (as portas 8000 e 5173 são do projeto `painel-investimentos`), banco `sigeo_local_integrado` (cópia do `sigeo_local_itens`, revisão `d8e9f0a1b2c3`), branch `local/teste-integrado`. Usuário admin local em `.codex-work/teste-integrado/.credenciais-local.txt` (fora do git).

**Avisos de atualização do SICONV (03/11/2026):** campos traduzidos para português (`app/rotulos_siconv.py`, commit `adca14f`) e zeros à esquerda deixam de gerar aviso (`mesmo_valor` em `espelho_diff.py`, commit `028410e`); cerca de 91% das ocorrências de campo eram só isso. Branch do Bloco 1 (N3 e N4) integrada à linha na branch `fix/constituicao-n9-relatorios`.

### P. Ajustes identificados no uso do SISGEO (29/10/2026)
Registrar aqui cada ajuste que o usuário for apontando, no formato ID, pendência, estado, critério de pronto.

| ID | Pendência | Estado | Critério de pronto |
|----|-----------|--------|--------------------|
| P1 | Integridade e confiança dos dados (D24 a D27, D32, D33, D40) | **parcial, 5 commits locais** (branch `fix/p1-integridade-dados`): **D24** Situação do programa só em PERSUS I (`79237b1`); **D25** correção de ação concluída preserva a conclusão (`79237b1`); **D27** correção de conclusão exige a data (`79237b1`); **D32** script `recalcular_cobertura_macro.py` pronto e testado, **aplicado só no banco local** (`87c95c9`); **D33** metodologia própria do PET-CT, sem troca silenciosa (`4a738c3`); **D40** composição e mapa pelos marcadores canônicos (`c009cae`). **Abertos:** D26 (decisão de domínio: quais estados contam como licença emitida); D27 parte 2 (corrigir ou excluir a conclusão sincroniza a inauguração vinculada: desenho a decidir); **D32 em produção**: 87 de 121 macros do PET-CT (execução 11) gravadas com piso, todas conferem com a hipótese; reparo só com seu "pode gravar" | cada caso reproduzido e conferido em produção |
| P2 | Conclusão e referência temporal (D01 a D07, D15, D17, D41, D42) | **parcial** (branch `fix/p1-integridade-dados`): **D15** indicador Concluídos reconhece a fase interna e passa a bater com cartão e filtro (`9cec466`); **D41** filtro de ano chama-se "Ano do instrumento" / "Ano da proposta" (`9cec466`); **D42** resumo e Painel listam concluído sem data, concluído sem inauguração real e em andamento sem previsão (`9cec466`); **D07** fim da vigência sai da coluna de conclusão, com campo próprio no Excel, Word e prévia (`4592fee`). **D06** conclusão física e situação administrativa separadas em Concluídos, com precedência editorial da conclusão datada (`2da4296`); **D02** "Período por" data da conclusão ou da entrega, com datas completas, em Concluídos e Equipamento entregue (`7adb3ec`; fora dessas duas visões segue o ano de origem). **D05** síntese de conclusões e próximas previsões abrem Excel (abas "Síntese de conclusão" e "Conclusão e agenda") e Word (seção antes do resumo executivo; data de inauguração/previsão logo após a situação) (`440f01f`). **Abertos, pedem desenho de produto:** D01 (separar visões Conclusão e previsões / Carteira / Entregas), D03, D04, D17 (inauguração no cartão de Dados Oficiais), D41 (referência temporal no Painel por evento), D02 para a visão geral e o Painel (sem evento único a datar) | cenários de aceite da seção 7 do diagnóstico |
| P3 | Operação sem efeito inesperado (D16, D23, D31, D38, D46, D53, D57): Cancelar nas edições, filtro ativo sempre visível, leitura em lote com alcance explícito, contexto preservado | aberta | cada caso reproduzido e corrigido |
| P4 | Carteira e financiamento (D03, D20, D21): FAF manual e API e TED em Linhas de financiamento, conciliação sem fusão por CNES | aberta (decisão do usuário sobre nome e grupo) | contagem única, vínculos preservados |
| P5 | Leitura executiva e rastreabilidade (D08 a D14, D18, D43 a D49, D54 a D56) | aberta | itens do diagnóstico, seção 16, ordem 5 |
| P6 | Radar e coleta (D50 a D52) | aberta | validação com candidatos oficiais elegíveis |
| P7 | **[DECIDIDO E FEITO em 03/11/2026, commit `83e4daa`: instrumento sem responsável avisa só gestor/admin; alerta de vigência sem monitoramento e proposta candidata seguem para todos, aguardando decisão]** **Notificações chegam a mais pessoas do que deveriam.** Verificado em 29/10 na produção (só leitura): a leitura filtra certo por destinatário e os 8 colaboradores ativos recebem em média 1,4 aviso de instrumento (não todos); quem recebe tudo são os 7 gestores/admins (regra do plano de 25/09). O espalhamento vem do **fallback**: instrumento sem titular/suplente envia para todo colaborador. Dos 928 avisos entregues a colaboradores (`edicao_manual` e `atualizacao_api`), 154 (17%) saíram desse fallback (49 com o instrumento ainda sem responsável, 105 com responsável designado depois do aviso, 7 usuários e 16 instrumentos). Hoje 44 dos 385 instrumentos não têm responsável. `proposta_candidata` e `alerta_vigencia` sem instrumento também vão a todos por decisão anterior | aberta (decisão do usuário) | decidir a regra do fallback (por exemplo, só gestores/admins quando não há responsável) e, se mudar, atualizar `CLAUDE.md`, `resolver_destinatarios` e os testes; aviso já enviado não é retroativo. **Conta da Bruna (colaboradora, 64 instrumentos designados, 128 avisos; conferida em 29/10, só leitura):** 90 de 103 avisos de instrumento são de instrumentos dela; os outros 13 e 9 dos 13 alertas de vigência vieram do fallback, mais 12 `proposta_candidata` (broadcast por regra). **Em todos os 154 casos de colaborador fora do responsável não havia responsável na hora do aviso (0 casos com responsável existente): o escopo não vaza, o fallback é que espalha.** Em 29/10 o fallback entregou 96 avisos `atualizacao_api` de 16 instrumentos sem responsável. Limite: a checagem usa `instrumento_responsavel.created_at`, então designação gravada com data posterior à real contaria como "sem responsável" |

Origem de P1 a P6: `diagnostico-relatorios-financiamento-2026-10-29.md` (57 registros: 16 P1 e 27 P2). Nenhum item foi implementado.

## 5. Espaço para complementar
Acrescentar aqui frentes de outros planos, no mesmo formato (ID, pendência, estado, critério de pronto).

## 6. Ordem sugerida
1. A3, A4, A5 e A6/A7 (fecha a frente A).
2. F3 e G1/G2 (commit e documentação).
3. B1 e C (conferências que dependem do usuário).
4. D e E (operação e dados, com decisão do usuário).
5. H: primeiro H1, H4 e H11 (dependem só do usuário), depois H3 e H2 (decidem a banda), depois H6 a H8 e H12/H13. H5 só se H2 escolher dormir fora do horário.

## 6b. Fluxo recomendado (visão sênior, 28/10/2026)
Uma coisa de cada vez, na ordem em que uma etapa libera a seguinte. Nenhum passo grava em produção sem o seu ok.

1. **Estancar o histórico (hoje):** mesclar o #50 depois de M2; decidir M1 e escrever a regra. Sem isso cada frente nova repete a divergência entre `master` e `homologacao`.
2. **Fechar a frente A:** A3, A4, A5, A6, A7 e F3. Um PR só, sem a linha de atribuição do Claude.
3. **Banco (frente L), com janela própria:** L3 primeiro (só leitura), depois L1, L2, L4 e L7. É a mudança de maior risco: tem migration, depende de ordem e não volta atrás sem restauração. Não misturar com o PR da frente A.
4. **Faxina de branches (M4 a M7):** uma passada só, com a lista conferida por você; nada é apagado antes.
5. **Conferências em produção (C) e operação (D, H):** em lote, no dia em que você tiver o login e as consoles abertos.
6. **Decisões sem prazo (J, G2, A9, B2):** reunir em uma conversa só e registrar o resultado aqui.

Regras para não voltar a acumular pendência:
- Todo PR novo cita o ID da pendência que fecha.
- Toda sessão começa lendo este arquivo e termina atualizando os estados.
- Branch sem PR há mais de 7 dias entra em M.

## 7. Aceite deste plano
- Toda pendência tem estado e critério de pronto.
- Nada marcado `feita` sem evidência (teste, saída de comando ou conferência do usuário).
- Este arquivo versionado junto do PR que fechar a frente A.
