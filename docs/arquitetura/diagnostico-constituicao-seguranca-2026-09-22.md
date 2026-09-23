# Diagnóstico sênior — Constituição de Segurança (rodada 2, 2026-09-22)

## Objetivo, escopo e método

Esta rodada sucede o diagnóstico de 2026-09-16 e segue o fluxo acordado da
Constituição: revisão estática, validação controlada, inventário de itens
mortos/contexto defasado e registro de evidência antes de qualquer correção.
Foram confrontados `padroes/seguranca/constituicao_seguranca.md`, o diagnóstico
anterior, backend, frontend, workflows e lockfiles. Nenhuma credencial foi
aberta, impressa ou alterada.

Configurações externas de Render, Vercel, Neon e GitHub permanecem **não
comprovadas** quando não estão versionadas. O banco isolado
`sigeo_constitution_test`, no OrbStack, foi usado somente para testes.

## Resultado executivo

Os bloqueadores que motivaram a nota inicial de 3,4/10 permanecem fechados:
todas as leituras de negócio exigem sessão, a sessão usa cookies `HttpOnly`
com refresh opaco rotativo e revogável, mutações exigem CSRF double-submit,
validações não refletem o payload e a única atribuição a `innerHTML` no
frontend apenas limpa um elemento criado localmente.

Esta rodada encontrou uma regressão crítica no módulo administrativo: senha
temporária retornada em claro e token de uso único em querystring. Ambos foram
removidos durante a execução do plan-mode. O código versionado agora também
declara hardening para o frontend, auditoria de dependências e configuração de
storage para o rate limit. Restam comprovações operacionais em produção e a
provisão do storage compartilhado.

**Conformidade atual: 8,4/10** (nota de abertura da rodada: 7,2/10; anterior
pós-remediação: 8,0/10). A nota considera resolvidos os P0/P1 versionados, mas
não presume como existentes controles que ainda dependem de deploy, credencial
externa ou política operacional formal.

### Atualização de execução — 2026-09-22

O contrato de senha temporária foi removido. O administrador agora apenas
dispara envio de link de redefinição por e-mail; a API e a UI não retornam,
exibem ou copiam senha. Convite e recuperação usam fragmento, não querystring,
e o handler de exceção passou a registrar somente método e path. O frontend
ganhou headers versionados, incluindo CSP em enforcement, e o backend aplica
`Cache-Control: no-store` fora de `/health`. O override de `uuid` eliminou o advisory do npm;
o CI de frontend audita dependências e o novo CI de backend executa
`pip-audit`.

Essas mudanças foram validadas localmente e no PostgreSQL isolado do OrbStack.
A CSP foi promovida para enforcement na configuração versionada do frontend;
a confirmação do header no domínio publicado ainda depende do próximo deploy.
O rate limit efetivamente distribuído aguarda URI/credencial do storage
compartilhado e não é considerado comprovado sem essa infraestrutura.

## Evidências positivas confirmadas

- `JWT_SECRET` é validado no boot; access token expira em 20 minutos e refresh
  token é opaco, armazenado somente como hash e rotacionado atomicamente.
- Cookies de acesso e refresh são `HttpOnly`; autenticação bearer e token em
  `localStorage` foram removidos. O `localStorage` restante guarda somente
  preferência de família de equipamento.
- `POST`, `PATCH` e `DELETE` exigem o cookie/header CSRF, exceto login e health;
  CORS tem origens, métodos e headers explícitos.
- Leitura de cobertura, convênios, monitoramento e propostas exige sessão;
  usuários exigem `admin`; mutações de monitoramento têm checagem também no
  Service.
- Senhas usam PBKDF2-HMAC-SHA256 com salt, 260 mil iterações e comparação
  constante. É aceitável como KDF lento, embora `argon2id` continue melhoria
  de médio prazo frente à redação literal da Constituição.
- `pip-audit` não encontrou vulnerabilidades conhecidas no backend.
- Validação mais recente no PostgreSQL isolado do OrbStack:
  `test_auth_session.py`, `test_csrf.py` e `test_usuarios.py` — **20
  aprovados**. A suíte de monitoramento havia sido validada na rodada anterior
  e não foi alterada por esta remediação.
- Varredura de segredos não encontrou material secreto versionado; `.env` não
  está rastreado e lockfiles de backend/frontend estão presentes.

## Achados prioritários

### P0 — senha temporária era retornada, exibida e copiada em claro — resolvido

Na abertura da rodada, `backend/app/services/usuarios.py::resetar_senha`
gerava uma senha, a rota `POST /usuarios/{user_id}/resetar-senha` a devolvia
no schema `UserResetPasswordResponse`, e o frontend a mostrava em um diálogo
com ação de cópia. A rota era de administrador e usava sessão/CSRF, mas isso
não atende à regra da Constituição: senha nunca aparece em resposta, log, URL
ou banco em texto claro.

**Encaminhamento obrigatório:** remover o contrato de senha temporária
(`UserResetPasswordResponse`, service, endpoint, client, diálogo e teste) e
reutilizar o fluxo de redefinição por token de uso único enviado por e-mail.
O novo fluxo deve invalidar sessões, auditar a ação sem registrar o segredo e
ter testes de que nenhuma senha retorna na API.

### P1 — token de ativação/redefinição estava na querystring — resolvido

`app/email.py` monta links com `?token=...`, e `account-action-page.tsx` lê o
valor de `location.search`. Mesmo expirando em 30 minutos e sendo invalidado
após uso, o token fica em histórico, logs de borda/servidor e potencialmente
em referer. A Constituição exige token em header ou body, nunca em URL.

**Encaminhamento obrigatório:** usar fragmento (`/ativar#token=...`), que não
é enviado em requests HTTP, e movê-lo para o body apenas no POST de ativação ou
redefinição; limpar o fragmento imediatamente após a leitura. Incluir teste
de que o gerador de e-mail não produz querystring com token.

### P1 — CSP e headers do frontend — resolvido no código, pendente de validação publicada

`frontend/vercel.json` agora declara `Content-Security-Policy` efetiva,
`X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy` para o
documento React, enquanto o backend adiciona `Cache-Control: no-store` fora do
healthcheck. A CSP da API continua report-only, corretamente limitada à API,
pois não protege o documento servido pela Vercel.

**Pendência operacional:** realizar o deploy e validar no domínio publicado
login, refresh/CSRF, mapas, fontes, exportações e rotas SPA. A política não é
considerada aceita em produção apenas pelo build local.

### P1 — controles de abuso e supply chain — parcialmente resolvido

O limitador passou a aceitar `RATE_LIMIT_STORAGE_URI`; sem essa variável, o
fallback intencional é `memory://`, ainda local por processo. Há bloqueio de
conta, mas telemetria/alerta de abuso e limitação explícita da recuperação por
e-mail continuam sem contrato operacional.

O CI de frontend recebeu `permissions: read-all` e `npm audit` de dependências
de produção; foi criado CI de backend com `ruff`, testes e `pip-audit`, também
com permissões mínimas. O advisory transitivo de `uuid` foi removido por
override compatível e `npm audit --omit=dev --audit-level=high` não reporta
vulnerabilidades.

**Pendências:** provisionar e configurar uma URI/credencial compatível para o
storage compartilhado; fixar as actions ainda referenciadas por tags nos
workflows legados; adicionar SAST, secret scan, CodeQL/SBOM e a política de
telemetria de abuso. Não há alegação de que esses controles externos existam.

### P2 — logs, cache, host e LGPD continuam sem contrato operacional completo

- O handler de exceção deixou de registrar `request.url` e agora registra
  método e path. Ainda falta uma política central de redaction/retenção para
  todos os logs e para `AuditLog.details`.
- Não há `TrustedHostMiddleware` nem política `Cache-Control: no-store` para
  respostas autenticadas.
- Não há inventário formal de classificação, finalidade, retenção, expurgo e
  acesso dos dados internos; `AuditLog.details` não possui redaction/retenção
  central.
- `docs/monitoramento-equipamentos/transferegov.html` é uma captura bruta rica
  de API, sem referência nominal encontrada. Não foi removida: requer decisão
  de proveniência, necessidade de auditoria e retenção antes de ser tratada
  como arquivo morto.

## Contexto e comentários desatualizados identificados

O diagnóstico de 2026-09-16 preserva valor histórico, mas não deve ser lido
como estado atual sem esta rodada:

- ainda contém, em seções históricas, a afirmação de CSRF pendente e bearer
  temporário; ambos estão resolvidos/removidos;
- afirma que não há serviço de e-mail em pontos que hoje possuem gateway HTTP
  para convite/redefinição; essa premissa é usada indevidamente para manter o
  retorno de senha temporária;
- chama o CSP report-only de etapa transitória, sem evidência de coleta ou
  promoção a enforcement após cinco dias de evolução.

Nenhum comentário foi removido nesta fase: alguns preservam a cronologia de
incidentes. O plan-mode deve atualizar os que descrevem comportamento atual e
apagar apenas contratos mortos comprovados junto da remoção da senha temporária.

## Critério de fechamento da rodada de Segurança

- [x] Autenticação, cookies, rotação, logout e CSRF exercitados em banco
      dedicado.
- [x] Leitura interna e rotas administrativas protegidas por autenticação/role.
- [x] Sem segredo rastreado na varredura estática e sem CVE Python conhecida.
- [x] Senha removida de respostas, UI e contratos.
- [x] Token removido de querystring/URL.
- [x] CSP efetiva e headers do frontend declarados na configuração versionada.
- [ ] CSP e fluxos protegidos validados no domínio publicado após deploy.
- [ ] Rate limit distribuído, logs com redaction, cache/host policy e matriz
      formal de dados/retenção.
- [x] Gate de CI para auditoria de dependências; advisory `uuid` tratado.
- [ ] SAST, secret scan, CodeQL/SBOM e fixação por SHA dos workflows legados.

## Próximo passo

Executar a validação publicada após o próximo deploy e provisionar o storage
compartilhado do rate limit antes de declarar o P1 operacionalmente fechado.
Os controles de SAST, secret scan, CodeQL/SBOM, retenção/LGPD e política de
abuso ficam como escopo da rodada de DevOps e governança, com evidência própria.
