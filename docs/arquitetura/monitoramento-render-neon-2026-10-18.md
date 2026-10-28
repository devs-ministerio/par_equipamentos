# Monitoramento Render/Neon — 18/10/2026

## Escopo e motivo

Separar vivacidade HTTP de prontidão do banco. O `/health` existente faz
`SELECT 1`; usado pelo Render e pelo Ping de cinco minutos, impede que o
Neon suspenda por inatividade. Não alterar autenticação, Radar ou schema.

## Configuração pretendida

- Render `healthCheckPath`: `/health/live`, sem dependência de sessão/DB.
- New Relic, monitor existente: GET `/health/live`, cinco minutos, São Paulo,
  validação TLS preservada. Mede processo HTTP, não disponibilidade funcional.
- Prontidão: manter GET `/health` com `SELECT 1`. Monitor separado de uma hora,
  São Paulo e TLS válido; preservar alertas APM de erro/latência e ausência de
  telemetria. A detecção sintética do banco pode levar até uma hora, além da
  janela de avaliação do alerta; erros de tráfego real continuam observáveis.
- Uma região evita acordar o banco em horários diferentes por localidade.
- Nunca apontar os monitores para a rota nova antes de seu deploy retornar 200.

## Neon Free

O banco precisa poder suspender após cinco minutos sem consultas. Não manter
um monitor SQL de cinco minutos. Ao mínimo de 0,25 CU, atividade contínua
equivale a 180–186 CU-h/mês, acima dos 100 CU-h anunciados no Free.
Uma consulta por hora seguida de cinco minutos ativos equivale a cerca de
15–15,5 CU-h/mês em isolamento. É estimativa, não garantia: inicialização,
autoscaling, usuários, polling, jobs e sobreposição alteram o consumo.

Monitor do banco é útil para detectar falhas sem usuários conectados, mas não
é necessário para manter Render ou Neon ativos. Não desativar observabilidade
da aplicação para economizar; medir consumo após o ajuste antes de voltar ao
Free. O plano Build temporário não substitui essa avaliação.

## Validação e publicação

Testes da rota proíbem abertura de conexão e resolução de `get_db`; uma falha
sintética do banco mantém `/health` com erro e `/health/live` com sucesso.
Schema e dados não são modificados. Publicar apenas a branch isolada baseada
em `45126f3`, passando CI antes de produção. Trocar os destinos externos
somente após verificar o endpoint publicado; inspecionar alertas do monitor
de prontidão separadamente, pois a janela de dez minutos anterior não serve
para acumular duas falhas de um monitor horário.

## Rollback

Antes de retirar a rota, restaurar o monitor externo e health check do Render
para `/health`, verificar a prontidão e então reverter o commit pelo fluxo
normal. Isso retorna o consumo anterior; não muda schema, cookies ou dados.
Não fazer rollback para um destino `/health/live` ausente na versão anterior.

## Atualização de 23/10/2026 — o que o incidente da `DATABASE_URL` mostrou

Contexto: [incidente de 23/10](incidente-api-neondb-owner-2026-10-23.md). A troca da senha do `neondb_owner` derrubou a API (`/health` 500, `/health/live` 200) e o problema só foi percebido de manhã.

### Estado verificado no New Relic (conta 8544864, em 23/10, só leitura)

- **Monitores** (tipo Ping, ambos habilitados): "SIGEO API — health externo" (5 min, `/health/live`, 100% de sucesso em 24 h) e "SIGEO — prontidão do banco (1 hora)" (1 h, `/health`, **54,17% de sucesso em 24 h**, o que corresponde às checagens da noite e da manhã que falharam).
- **Política** "SIGEO — Produção", 5 condições: erro elevado da API (acima de 5% por 5 min), falhas do monitor externo (acima de 1 em 10 min), indisponibilidade (sem transações por 10 min), latência p95 (acima de 2 s por 10 min) e **falha de prontidão do banco** (acima de 0 falhas em 1 min).
- **Notificação:** um único workflow, "SIGEO — Notificações de Produção", com destino **e-mail**, habilitado.
- **Log de notificações:** a condição de prontidão abriu issue e enviou e-mail às **00:38 de 23/10** (horário da conta; confirmar fuso). Outros dois envios (11:14 ativação e 11:23 encerramento) são de um alerta da API.

### Diagnóstico

A **detecção funcionou** (menos de uma hora) e a **entrega falhou**: o e-mail chegou de madrugada e ninguém o leu. Os pontos fracos são humanos e de canal, não de medição:

1. Um único canal (e-mail) e um único destinatário.
2. Sem push, sem segundo destinatário e sem escalonamento se o issue continua aberto.
3. O alerta de prontidão detecta falha de conexão, mas **não valida as permissões** do role (`SELECT 1` passa mesmo se faltar `INSERT` em `refresh_token`).
4. Nenhuma verificação manual obrigatória depois de trocar credencial ou fazer deploy.

### Desenho proposto (para aprovação do usuário)

| # | Medida | Custo | Observação |
|---|---|---|---|
| 1 | **Push no celular**: app New Relic mobile (ou destino equivalente) para os issues da política "SIGEO — Produção" | Sem custo | Cobre a madrugada; precisa de configuração do próprio usuário no aparelho |
| 2 | **Segundo destinatário** de e-mail (colega ou e-mail alternativo) no mesmo workflow | Sem custo | Evita ponto único de falha humana |
| 3 | **Escalonamento**: se o issue de prontidão continuar aberto após 30 min, repetir a notificação em outro canal | Sem custo | Depende do destino escolhido em 1 |
| 4 | **Janela de reforço**: durante releases e trocas de credencial, executar o monitor de prontidão sob demanda ("Run now") ou passá-lo a 15 min por 48 h | Cerca de 60 CU-h/mês se ficasse permanente a 15 min (0,25 CU, banco ativo ~⅓ do tempo); só em janelas, desprezível | O plano Build temporário comporta; no Free medir antes |
| 5 | **Teste de fumaça pós-mudança** (script único, sem credenciais de usuário): `/health` com banco, `/auth/me` sem sessão esperando 401, uma rota autenticada esperando 401, e checagem de que o login devolve 422 sem corpo, executado depois de todo deploy e de toda troca de credencial | Sem custo | Complementa, não substitui, o login real feito pelo usuário |
| 6 | **Verificação de privilégio do runtime**: rota ou job interno somente leitura que confirme `current_user = sigeo_runtime` e as permissões DML esperadas (`has_table_privilege`) nas tabelas de sessão, sem expor o resultado a usuários | Baixo | Só vale se o usuário quiser fechar também o risco de permissão faltante |
| 7 | **Runtime dos monitores**: o painel avisa que o runtime Node.js 16 de monitores sintéticos acaba em 18/11/2026; os dois monitores são do tipo Ping, que provavelmente não dependem dele. Confirmar antes da data | Sem custo | Evita surpresa |

Não alterar o intervalo de 1 hora como padrão permanente sem medir o consumo de CU-h no Neon (ver "Neon Free"): a frequência alta resolve a detecção, não a entrega, e o incidente foi um problema de entrega.

### Validação e rollback

- Cada medida de 1 a 4 se valida por **teste de envio** do destino e, para o escalonamento, por um issue sintético (monitor temporário apontando para uma URL que falha) com o usuário presente; nunca derrubando a produção para testar.
- Rollback: desabilitar o workflow ou o destino novo; as condições e os monitores existentes continuam intactos.
- As medidas 5 e 6 entram por PR normal, com testes; nenhuma exige alterar schema nem credenciais.

### Decisões do usuário

1. Qual canal adicional de entrega usar (push do app New Relic, Slack, Telegram, outro) e quem recebe como segundo destinatário.
2. Se a janela de reforço (medida 4) vale para releases futuros e por quanto tempo.
3. Se a verificação de privilégio do runtime (medida 6) entra.

## Triagem diária de e-mail (configurada pelo usuário em 23/10/2026)

O usuário passou a rodar uma triagem diária, somente leitura, sobre a caixa de e-mail do SIGEO, que resume alertas do New Relic, falhas do GitHub Actions, avisos do Render e da Vercel e alertas de segurança do Google. Na primeira execução (janela de 2 dias, 22 threads) ela classificou três itens como "ação necessária".

### O que a triagem acertou e o que errou (conferido contra o estado real no mesmo dia)

| Item da triagem | Estado real |
|---|---|
| Backup agendado falhou em 23/10 07:38 UTC | **Real e grave.** `pg_dump: permission denied for table fonte_captura`: tabelas novas ficaram com dono e permissões errados. Sem backup válido por cerca de 12 horas. Corrigido no mesmo dia; ver [incidente](incidente-api-neondb-owner-2026-10-23.md). **Foi a triagem que expôs isso.** |
| Alerta "falha de prontidão do banco" aberto | **Já fechado.** O New Relic não tinha issue ativo; a triagem viu só o e-mail de ativação e nenhum de fechamento. |
| Backend CI falhou no commit 118499a | **Obsoleto.** O run foi substituído; os commits seguintes do PR passaram em todos os workflows. |

Conclusão: o valor da triagem é achar o que ninguém olhou; o erro dela é tratar **evento de e-mail como estado**. O mesmo e-mail pode estar velho, e a ausência de e-mail não prova que algo deu certo (o GitHub só avisa falha; o Neon não manda e-mail). Registrado pela própria triagem em "Lacunas".

### O que ela resolve do desenho e o que não

- **Resolve em parte a medida 2** (segundo leitor): é um leitor diário e consolidado.
- **Não resolve** a medida 1 (push na madrugada), a 3 (escalonamento), a 5 (teste de fumaça) nem a 6 (privilégio do runtime). Latência de até 24 h, só e-mail, nenhum teste funcional.
- O push do aplicativo do New Relic continua sendo a medida de maior efeito para incidente em andamento.

### Evolução proposta: da leitura de e-mail para a verificação de estado

A triagem passa a **verificar o estado atual**, usando o e-mail só como pista, e cada verificação tem um limite explícito. Ordem de importância:

| # | Verificação | Fonte (não e-mail) | Alerta quando |
|---|---|---|---|
| 1 | **Último backup bem-sucedido** | API do GitHub Actions (`backup_banco.yml`) e idade do objeto mais novo no R2 | passou de 14 h sem execução com sucesso (a agenda é de 12 h) |
| 2 | **Saúde da API** | `GET /health` (espera `database: connected`) e `/health/live`, com tempo de resposta | resposta diferente de 200, ou lenta |
| 3 | **Alertas do New Relic agora** | consulta de issues ativos e taxa de sucesso do monitor de prontidão em 24 h | issue ativo, ou sucesso abaixo de 95% |
| 4 | **Deploy contra a `master`** | commit publicado no Render e na Vercel contra o `HEAD` da `master` | `master` à frente do Render por mais que o combinado (o deploy do Render é manual) |
| 5 | **CI na `master`** | último resultado de cada workflow na `master`, e checks dos PRs abertos | falha na `master` (ruído de PR não conta) |
| 6 | **Neon** | consumo de CU-h e armazenamento contra o plano | acima de 80% do plano |
| 7 | **Segurança da conta** | manter a leitura dos alertas do Google | qualquer alerta novo, para confirmação humana |

O texto pronto para colar na rotina está em [triagem-diaria-instrucoes.md](triagem-diaria-instrucoes.md).

Regras de severidade:
- O que o **estado confirma** como falha (itens 1 a 5) é prioridade máxima e vai para o push do celular; o resto fica no resumo diário.
- Item de e-mail cujo estado atual já está saudável é **rebaixado** a informativo ("resolvido"), com a evidência.
- Todo "ação necessária" traz o comando ou o link para verificar, e o que o estado mostra, não só o que o e-mail disse.
- A triagem precisa de um **sinal de vida** próprio: se ela não rodar, alguém é avisado (o mesmo princípio do backup).

### Lacunas que o desenho não cobre ainda

- Ninguém verifica **o usuário** com que cada credencial conecta; a nova verificação do `migrar_banco.yml` cobre só a migração.
- Falta uma checagem periódica de que as **permissões dos roles** cobrem as tabelas existentes (hoje só a migração as reaplica).

## Fontes

- https://render.com/docs/health-checks
- https://neon.com/docs/introduction/compute-lifecycle
- https://neon.com/blog/neon-free-plan-1-gb-per-project

Este arquivo descreve o alvo; só evidência pós-deploy confirma aplicação
externa. Testes locais não comprovam troca de configuração nos provedores.
