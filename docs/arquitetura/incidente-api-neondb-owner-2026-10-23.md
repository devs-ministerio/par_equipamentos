# Incidente: API de produção sem acesso ao banco após troca de senha (23/10/2026)

## Resumo

Depois do release de 22/10 foi trocada a senha do role `neondb_owner` no Neon, por ter sido exposta durante a execução do release. A API de produção (`sieo-backend`, Render) **ainda usava o `neondb_owner` na sua `DATABASE_URL`**, ao contrário do que a documentação afirmava, e passou a falhar em toda consulta ao banco. Login e qualquer tela com dados ficaram indisponíveis até a variável ser trocada para o role `sigeo_runtime` na manhã de 23/10.

- **Impacto:** login e leituras da API indisponíveis desde a troca da senha (noite de 22/10) até o fim da correção (manhã de 23/10). O site estático da Vercel, o `/health/live` e o backup agendado (`sigeo_backup`) não foram afetados. Nenhum dado foi perdido nem alterado.
- **Detecção:** o monitor de prontidão do banco (New Relic, `/health` de hora em hora) falhou e a condição "SIGEO — falha de prontidão do banco" abriu um issue que enviou e-mail às **00:38 de 23/10** (horário da conta New Relic, a confirmar se é Brasília), menos de uma hora depois da troca da senha. O e-mail não foi lido durante a noite; o problema só foi percebido quando o usuário tentou entrar, de manhã.
- **Causa raiz:** divergência entre a documentação (que dizia que nenhuma credencial de aplicação usava `neondb_owner`) e o painel do Render, mais a troca de credencial sem inventariar antes onde ela era usada.
- **Resolução:** `DATABASE_URL` do Render trocada para a string do `sigeo_runtime`, conexão direta (host sem `-pooler`). `/health` voltou a 200 com `database: connected` e o usuário confirmou o login.

## Linha do tempo (horário de Brasília, aproximado)

1. 22/10, noite: release no ar; verificações do `/health`, login por rotas e relatórios passaram.
2. 22/10, depois do release: senha do `neondb_owner` trocada no Neon. A conclusão "não afeta o site, a API usa `sigeo_runtime`" foi tirada da documentação e não confirmada no painel do Render.
3. 23/10, 00:38: alerta de prontidão do banco enviado por e-mail. Manhã: o usuário não consegue entrar. `/health` devolve 500 enquanto `/health/live` devolve 200.
4. Os logs do Render mostram `password authentication failed for user 'neondb_owner'` contra todos os endereços do Neon (as linhas `Network is unreachable` para endereços IPv6 são ruído: o Render não sai por IPv6).
5. Primeira correção do usuário: `DATABASE_URL` do `neondb_owner` com o host do pooler. Orientado a usar o `sigeo_runtime` e a conexão direta.
6. `DATABASE_URL` com `sigeo_runtime` salva; dois deploys concluídos; `/health` verde em quatro checagens seguidas; login confirmado pelo usuário.

## O que deu certo e o que não

- `/health/live` (sem banco) separado de `/health` (com banco) permitiu ver na hora que o processo estava de pé e o banco não.
- Os logs do Render apontavam o usuário exato da falha.
- **Falhou:** o alerta chegou só por e-mail, sem escalonamento nem segundo canal, e ninguém o leu de madrugada; a premissa "a API usa `sigeo_runtime`" nunca foi conferida contra o Render; a troca de credencial não passou por um inventário de usos.

## Ações

| Ação | Estado |
|---|---|
| `DATABASE_URL` do Render passa a usar `sigeo_runtime`, conexão direta | Feito em 23/10 |
| Corrigir `CLAUDE.md` e `AGENTS.md` (afirmavam que `neondb_owner` não era usado) | Neste PR e no #37 |
| Regra no runbook: inventariar os usos de uma credencial antes de trocá-la | Neste PR |
| **Conferir se o secret `DATABASE_URL` do environment `Production` do GitHub (jobs de pipeline e Radar, hoje só manuais) também usa `neondb_owner`**; se usar, regravar com a string do `sigeo_runtime` antes de ativar qualquer job | Aberto, ação do usuário (só ele vê o valor) |
| Conferir a `DATABASE_URL` do secret de repositório (CI/E2E) e as variáveis da Vercel | Aberto |
| Entrega do alerta de prontidão (único canal hoje é e-mail; sem push nem segundo destinatário) | Aberto, desenho em `monitoramento-render-neon-2026-10-18.md` |
| Confirmar permissões do `sigeo_runtime` com uso real (login, refresh, notificações, relatórios) durante a janela de 48 h | Em andamento |

## Secrets que existem hoje (só nomes)

Repositório: `DATABASE_URL`, `E2E_EMAIL`, `E2E_SENHA`, `GITLEAKS_LICENSE`. Environment `Production`: `DATABASE_URL`, `DATABASE_URL_MIGRATION`, `BACKUP_DATABASE_URL` (mais as chaves do R2 e do `age`). O role de cada um precisa ser conferido pelo usuário no painel do GitHub; o conteúdo não é legível por aqui.
