# Diagnóstico da Constituição de Segurança — 2026-09-29

## Escopo e método

Revisão estática (3 investigações paralelas, sem acesso a produção/credenciais) de todas as 12
seções de `padroes/seguranca/constituicao_seguranca.md`, com foco em: (1) reverificar os 2 P1 e
1 P2 abertos no diagnóstico de 2026-09-28; (2) auditar o que mudou desde então — relatórios
Excel/Word, complementação PERSUS, notificações com escopo por destinatário.

## Evidências

- Sessão: access token 20min, refresh 14d rotativo, `cookie_secure=True`/`samesite=lax`,
  `refresh_cookie_path` sincronizado com o proxy (`backend/app/config.py:47-65`,
  `render.yaml:19-24`). Hash de senha é argon2id sem fallback inseguro — PBKDF2 legado só é
  lido para rehash, nunca gravado (`backend/app/auth.py:79-117`). `_validar_jwt_secret` derruba
  boot com segredo curto.
- CORS com origem explícita via env (nunca `*`), CSRF double-submit cobre todas as rotas
  mutáveis novas (`DELETE /monitoramento/eventos|acoes/{id}`, `POST/PATCH /usuarios*`,
  `PATCH /notificacoes/{id}`) — nenhuma escapou do middleware por prefixo não coberto.
- Autorização: nenhuma rota de escrita sem `Depends` de auth; as 5 funções de evento/ação sem
  `nr_convenio` direto carregam a entidade (404) antes de checar titularidade, ordem correta.
  `usuarios.py` é 100% admin-only, com auto-proteção contra lockout confirmada.
- `PATCH /notificacoes/{id}` → `marcar_notificacao_lida` (`app/services/notificacoes.py:92-101`)
  → `obter_destinatario` (`app/repositories/notificacoes.py:159-165`) filtra por
  `notificacao_id` **e** `usuario_id` na mesma query — sem IDOR, um usuário não consegue marcar
  como lida a notificação de outro.
- SQL sempre parametrizado (inclusive o f-string de `monitoramento.py:264`, que monta só o
  *valor* do `ILIKE`, passado via `.ilike()`). Zero `dangerouslySetInnerHTML`; os 2
  `innerHTML` restantes são seguros (limpeza de nó / comentário histórico).
- Erros nunca vazam stack/SQL ao cliente; logs novos (`complementar_persus_fontes_extras.py`,
  `email.py`) não gravam PII/token/senha em claro.
- CI bloqueia em CVE: `pip-audit`, `npm audit --audit-level=high`, Trivy (CRITICAL) e Semgrep
  (regras locais) rodam sem `continue-on-error`.
- `seed_guard.py` cobre exatamente o vetor do incidente real de 2026-09-25/26 (checa
  `neon.tech` na `DATABASE_URL` antes de qualquer seed sintético rodar).

## Avaliação

**Conformidade: 8,0/10** (ligeira queda frente aos 8,4 de 09-28 — nenhum P0 novo, mas 2 P1 novos
localizados em código que a rodada anterior não cobria porque ainda não existia).

### P1 (novo) — Excel/CSV formula injection na geração de relatório

`backend/app/reports/xlsx_builder.py:38-66` (`escrever_aba_tabela`) grava valor de célula direto
(`aba.append(list(linha))`) sem neutralizar caractere líder `=`/`+`/`-`/`@`. `app/services/
relatorios.py` alimenta essa função com texto de usuário (nome de convenente/instituição,
observação livre de evento) — um valor como `=CMD(...)` vira fórmula ativa para quem abrir o
Excel gerado. Prefixar `'` (ou espaço) em qualquer string de célula iniciada por esses
caracteres antes do `append`; considerar regra Semgrep própria (as 3 regras locais atuais não
cobrem essa classe).

### P1 (novo) — Rate limit ausente em exportação e disparo de e-mail

`GET /relatorios` (`backend/app/routers/relatorios.py:31`) e `POST /usuarios/{id}/enviar-
redefinicao` (`backend/app/routers/usuarios.py:71`) não têm `@limiter.limit`, diferente de
`/auth/*`. Geração de relatório é trabalho de CPU/IO não-trivial (query + montagem de
planilha/Word) e o endpoint de redefinição dispara e-mail real — ambos hoje só dependem de
sessão válida (e CSRF quando aplicável), sem defesa contra loop/abuso mesmo autenticado.

### P1 (persistente desde 09-28) — rate limit local por processo

`RATE_LIMIT_STORAGE_URI` continua com fallback `memory://` (`rate_limit.py:20`,
`config.py:87`) e **`render.yaml` não declara essa env var** — confirmado que produção roda
hoje sem storage distribuído entre instâncias. Sem avanço desde a rodada anterior.

### P1 (persistente desde 09-28) — headers pós-deploy sem comprovação

CSP da API continua em `Report-Only`; nem esta nem a rodada anterior encontram evidência
versionada de coleta de violação real pós-deploy. Não é verificável por leitura estática —
precisa de validação operacional dedicada.

### P2 (novo) — leitura de relatório/timeline sem escopo por titularidade

`GET /relatorios` e `GET /monitoramento/instrumentos/{nr_convenio}` expõem timeline completa a
qualquer usuário autenticado (inclusive `leitor` ou colaborador não-titular) — consistente com
o modelo já existente no resto do app ("leitura ampla, escrita restrita"), não é bug isolado
desta feature, mas fica registrado como ponto de decisão de produto pendente (mesmo tema do P2
de escopo fino já citado em 09-28).

### P2 (novo) — `mail_api_url` sem validação de esquema HTTPS

Diferente de `cors_origins` (que tem `_validar_cors_origins`), `Settings.mail_api_url` não
valida que o esquema seja `https://` — nada impede configurar `http://` por engano em produção.

### P2 (persistente desde 09-28) — autorização ainda majoritariamente por papel

Escopo fino por UF/órgão continua decisão de produto pendente, sem plan-mode dedicado aberto
(decisão explícita do usuário em 2026-09-25, ver Bloco 10 do Plan Mode fechamento final).

## Próximo Plan Mode

Bloco de correção rápida (baixo risco, alto valor): sanitização de célula em `xlsx_builder.py`
+ rate limit em `/relatorios` e `/usuarios/{id}/enviar-redefinicao` + validação de esquema em
`mail_api_url`. Rate limit distribuído e comprovação de headers pós-deploy continuam bloco
operacional separado (infra/observabilidade, não código). Escopo fino de autorização por
UF/órgão só sob demanda de produto.
