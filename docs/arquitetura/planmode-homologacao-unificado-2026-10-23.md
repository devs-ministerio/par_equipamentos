# Plano unificado da homologação — 23/10/2026

Este documento **liga** os planos que estavam soltos e define a ordem de execução. Ele não repete o conteúdo de cada plano; aponta para ele e fixa dependências, decisões e critérios de saída. Em caso de conflito, o plano específico de cada trilha manda no detalhe técnico e este manda na ordem.

- **Ambiente:** tudo se desenvolve na branch `homologacao`, que em 23/10 foi alinhada à `master` (`553d18b`). PRs de trabalho saem dela e entram nela. A `master` só recebe um pacote pronto, por **release** (ver abaixo).
- **Produção:** nada entra sem o ritual de release e sem autorização explícita. A janela de observação do release de 22/10 corre até a noite de 24/10/2026.
- **Constituições:** [Backend](../../padroes/backend/constituicao_backend.md), [Database](../../padroes/database/constituicao_database.md), [Frontend](../../padroes/frontend/constiuicao_frontend.md), [Segurança](../../padroes/seguranca/constituicao_seguranca.md), [Qualidade](../../padroes/qualidade/constituicao_qualidade.md) e [DevOps](../../padroes/devops/constituicao_devops.md).

## 1. Onde estamos

**Em produção desde 22/10:** espelho oficial, Radar, notificações por destinatário, relatórios (Excel e Word, incluindo Concluídos), backup agendado de 12 em 12 horas. Em 23/10: API passou a usar `sigeo_runtime`, `migrar_banco.yml` confere role e permissões, valor dos 92 PERSUS I gravado.

**PRs abertos:** #38 (correção de quantidade e valor de obras; **aguarda a janela de 48 h**, decisão do usuário), #43 (triagem diária), #44 (inventário SISGEO, base `homologacao`).

**Decisões já tomadas (valem para todas as trilhas):**
- Obras não fazem parte do SIGEO: itens `OBRA`/`SERVICO` saem de equipamento, quantidade e valor; ficam na fonte como evidência e baseline da recaptura, sem apagar.
- Cada PERSUS, FAF e TED tem um único equipamento (quantidade 1); itens manuais de "Convênio" repetem a API e não somam.
- Inauguração é uma data real por instrumento, independente de entregas parciais.
- Nenhum preenchimento em produção sem simulação, backup recente e "pode gravar".
- **SISGEO (23/10):** o nome por extenso continua "Sistema de Gestão de Equipamentos em Oncologia"; o monograma "S" passa a ser **"GEO"**; muda **apenas o que é visual da marca** e a documentação vigente. Identificadores técnicos, nomes externos (Render, Vercel, New Relic, GitHub) e o resíduo "SIEO" ficam como estão.

## 2. Trilhas

| Trilha | Plano de origem | Estado | Precisa de decisão? |
|---|---|---|---|
| **A. Identidade SISGEO** | [identidade-sisgeo](planmode-identidade-sisgeo-2026-10-20.md), [inventário](inventario-sisgeo-2026-10-23.md) | Bloco 0 feito (PR #44); decisões tomadas | Não |
| **B. Monitoramento por item e unidade** | [itens-equipamentos](planmode-monitoramento-itens-equipamentos-2026-10-20.md), [inventário](inventario-itens-equipamento-2026-10-22.md) | Bloco 0 quase fechado | **Sim, ver seção 5** |
| **C. Relatórios e apresentação** | [execução, Fase 5 item 0](planmode-execucao-producao-2026-10-22.md), PR #38 | #38 pronto, em espera; visão "Todos" sem plano de tela | Escopo da tela "Todos" |
| **D. Qualidade e governança de dados** | [governança](planmode-governanca-dados-2026-09-28.md), [normalização](planmode-normalizacao-database-2026-09-28.md) | CHECKs de CNPJ fechadas; `fonte_dado_id` ainda não é gravado; 113 de 292 instrumentos sem titular | Atribuição de titulares é da equipe |
| **E. Espelho, Radar e notificações** | [espelho](planmode-espelho-notificacoes-2026-10-06.md) (etapas 3 a 6) | Em produção; faltam recaptura validada nas fontes reais, ciclo nacional com candidato elegível e ativação gradual dos jobs | Autorização por job |
| **F. Operação e observabilidade (produção)** | [execução, pendências](planmode-execucao-producao-2026-10-22.md), [monitoramento](monitoramento-render-neon-2026-10-18.md) | Triagem diária por estado (PR #43); push do celular vinculado | Canal extra, segundo destinatário |

A trilha F é de **produção**, não de homologação; está aqui só para aparecer no mesmo mapa e porque algumas peças dela são pré-requisito das outras (ver dependências).

### A. Identidade SISGEO — Bloco 1 (execução, visual apenas)

Escopo fechado pelo inventário: título da aba (`index.html`), cabeçalho, rodapé, login e página 404, mensagens de tela, e-mails de convite/redefinição/acesso (incluindo o nome do remetente), rodapé e aviso dos relatórios Word e Excel, título da API, mais a documentação vigente (`README`, `AGENTS`, `CLAUDE`, runbook, metodologia) e uma nota de renomeação.

- Monograma "GEO" no lugar do "S" (cabeçalho, login e `favicon.svg`); verificar legibilidade em 32 px e no celular, sem trocar paleta nem tipografia.
- Uma constante por camada (frontend e backend) para o nome; ajustar os 6 testes do backend e os 2 do frontend que assertam os textos; **não** tocar nos cookies `sigeo_*`, nos roles, no prefixo do R2, nas variáveis `SIGEO_LOCAL_*` nem nos documentos históricos.
- Aceite visual: desktop, celular, e-mail (Gmail e Outlook), Word, Excel e aba do navegador.
- **Saída:** um PR para `homologacao`, sem migração, pronto para entrar no próximo release.

### B. Monitoramento por item — blocos e dependências

0. Inventário (feito na cópia de 17/10; falta repetir na produção, em leitura, e ler `fonte_captura`).
1. Modelo de dados: instrumento → item planejado (origem, ID, versão) → unidade física → evento; expand-contract; backfill só com vínculo único.
2. Entrega por item e unidade (formulário).
3. Tabela no lugar do card físico.
4. Fotografias (isolado, por último).
5. Prazos e notificações.

Depende das decisões da seção 5. Os blocos 1 a 3 são um pacote de release; o 4 e o 5 são pacotes à parte.

### C. Relatórios

- **Já pronto:** PR #38 (obras fora de quantidade e valor, quantidade 1 nas cargas manuais). Entra no release da noite de 24/10.
- **Falta:** plano da tela "Todos" no padrão de "Concluídos" (campos obrigatórios, o que muda nos arquivos Word e Excel) e decisão sobre as notas que ainda estão nas abas do Excel.
- **Depende de B:** a coluna de quantidade e a tabela de equipamentos devem passar a usar item e unidade quando o Bloco 1 existir; até lá valem as regras do #38.

### D. Qualidade e governança de dados

- Gravar `fonte_dado_id` nos importadores, na aprovação do Radar e na criação manual (hoje só o script de backfill grava; 418 de 560 convênios e 207 de 292 instrumentos estão sem fonte). **Pode começar já, não depende de decisão.**
- Atribuição de titulares (equipe), investigar `pytest-*` em produção, auditoria de login e convite, 16 grupos de eventos duplicados.

### E. Espelho, Radar e notificações

- Validar contratos de recaptura nas fontes reais, tratar coleções sem ID estável, concluir a UX de frescor, ciclo nacional com candidato elegível.
- Ativar `pipelines.yml` e `radar_convenios.yml` um de cada vez, com rodada manual supervisionada antes (Fase 4 do plano de execução). **Depende de F**: os avisos precisam chegar a alguém antes de ligar jobs que escrevem e notificam.

## 3. Dependências

```
A (SISGEO) ───────────────────────────────┐ independente de tudo
D1 (fonte_dado_id) ───────────────────────┤ independente
C1 (#38, quantidade/valor) ─ janela 48 h ─┤ produção primeiro
B0 (leitura em produção) ─┬─> B1 modelo ─> B2 entrega ─> B3 tabela ─┬─> C2 (Todos/quantidade por unidade)
                          │                                          └─> B5 prazos ─┐
F (push, triagem, alertas) ─> E (ativar jobs) ──────────────────────────────────────┘
B4 (fotos) só depois de B3 e das decisões de armazenamento/privacidade
```

Regras que saem dele:
1. **A, D1 e C1 não dependem de ninguém**; podem andar em paralelo.
2. **B2 depende de B1**; **B3 depende de B2**; **C2 e B5 dependem de B3**.
3. **E só depois de F**: não se liga job que notifica sem o canal de alerta e a triagem por estado funcionando.
4. **B4 fica por último**, isolado, porque exige armazenamento privado, orçamento e privacidade.

## 4. Ordem de execução (ondas)

| Onda | Conteúdo | Pré-requisito | Vai à produção como |
|---|---|---|---|
| **0** (agora) | Janela de 48 h do release de 22/10; PR #43 e #44; **A** (Bloco 1, visual); **D1** (`fonte_dado_id`); plano da tela "Todos"; leitura de produção do Bloco 0 de B | nenhum | A e D1: release 2; C1 (#38): release 1 |
| **1** | **B1 a B3** (modelo, entrega, tabela) | respostas da seção 5; Bloco 0 fechado | release 3 (inclui migração aditiva) |
| **2** | **C2** (tela "Todos" e quantidade por unidade); **B5** (prazos); **E** (ativação gradual dos jobs, após F) | B3; F | release 4 |
| **3** | **B4** (fotografias) | decisões de armazenamento e privacidade | release 5 |

**Release 1** (noite de 24/10): só o #38 e o preenchimento de quantidade 1, pelo roteiro de sempre.
**Release 2** (próxima semana): A e D1. Não tem migração; o risco é visual.

## 5. Dúvidas do monitoramento por item (para fechar o Bloco 1)

Cada pergunta traz a minha recomendação; responder "de acordo" basta.

1. **Quais itens entram no controle por unidade?** Os ~1.100 itens de equipamento da base incluem camas, computadores, mesas e outros bens de baixo valor. **Recomendo só os equipamentos marcados como prioritários no catálogo** (aceleradores, mamógrafos, PET/CT, gama-câmara, ressonância, tomógrafo, braquiterapia e semelhantes), deixando os demais com a contagem atual.
2. **Como criar as unidades?** Há itens com quantidade 12 e até 31 itens com mais de 20 unidades. **Recomendo não pré-criar unidades**: a unidade nasce quando a entrega é registrada, e o formulário aceita "entregar K unidades" de uma vez, com marca e modelo comuns e séries opcionais.
3. **Número de série é obrigatório?** **Recomendo opcional**, mas único por modelo quando informado; nada de presumir série globalmente única.
4. **Cargas manuais** (183 itens sem ID oficial, quantidade 1): **recomendo representá-las como itens de origem "manual" com identificador sintético estável** (por exemplo `manual:{convênio}:{ordem}`), nunca ligado à API.
5. **Entregas e campos físicos já existentes** (74 entregas ativas na cópia; campos de marca, modelo e série no instrumento): **recomendo vincular automaticamente só quando o instrumento tem exatamente um item prioritário e uma unidade**; os demais ficam marcados como "vínculo legado a revisar", sem atribuição automática.
6. **Quem registra a entrega?** **Recomendo a regra já vigente**: titular, suplente, gestor e admin; colaborador de outro instrumento e leitor não.
7. **Prazos (Bloco 5):** quais avisos e quando. **Recomendo** ação aberta com prazo e previsão de inauguração ativa, nos dias D−1, D0 e D+1, às 08:00 de São Paulo, só para titular, suplente, gestor e admin ativos.
8. **NUP no cabeçalho:** o plano manda mostrar só com NUP SEI confirmado. Hoje o NUP é o próprio número em FAF e TED. **Recomendo exibir apenas nesses dois**, formatado `25000.198305/2024-59`.
9. **Fotografias (Bloco 4), só antes de começá-lo:** armazenamento privado e orçamento, formatos (incluindo HEIC), limite de tamanho e quantidade por entrega, retenção e remoção de EXIF.

## 6. Como um pacote vira release

Cada release segue o mesmo roteiro, validado em 22/10 e endurecido em 23/10:

1. CI verde na `homologacao`; ensaio das migrações na cópia protegida, quando houver.
2. PR da `homologacao` para a `master`, com a lista exata do que entra.
3. Backup manual (`backup_banco.yml`), conferindo o resumo.
4. Merge; `migrar_banco.yml` (confere o role `sigeo_migration`, aplica, reaplica e confere permissões).
5. Manual Deploy no Render; conferência de `/health`, login, relatório pequeno e notificações.
6. Janela de observação definida com o usuário (hoje 48 h), com a triagem por estado e o push do celular ligados.
7. Preenchimentos de dado só com simulação e "pode gravar".

## 7. Operação em paralelo (trilha F, produção)

Não bloqueia a homologação, mas tem prazo:
- **Até 24/10:** janela de 48 h; mesclar o #38 e gravar a quantidade 1 (release 1).
- **Antes de 1/11:** decidir o plano do Neon (Build temporário ou Free).
- **Antes de 20/11:** rotacionar a credencial do R2 do backup; conferir o runtime dos monitores do New Relic (18/11).
- **Aberto:** segundo destinatário e escalonamento dos alertas, teste de fumaça pós-deploy, RTO de 1 h, deploy automático do Render (religar ao repositório novo), CSP em enforcement, auditoria de login.

## 8. Critérios de aceite comuns

- Backend: `ruff check`, `ruff format --check`, `mypy`, suíte completa em PostgreSQL vazio no head, pisos de cobertura.
- Frontend: lint, tsc, vitest, build e e2e.
- Migrações só aditivas (expand-contract); reversão ensaiada em banco descartável.
- Nada de produção sem backup recente, simulação, autorização explícita e conferência pelo estado (não só por e-mail).
- Commits por assunto, sem coautoria e sem menção a ferramenta.
