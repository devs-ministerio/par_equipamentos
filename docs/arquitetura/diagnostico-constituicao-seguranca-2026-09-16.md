# Diagnóstico da Constituição de Segurança — 2026-09-16

> **Fechamento do bloco (2026-09-17)**: os 4 P0 e a maior parte dos P1 deste diagnóstico foram
> resolvidos via `docs/arquitetura/planmode-seguranca-2026-09-16.md`, Blocos 1, 2, 4 e 5 (completos)
> e Bloco 3 (parcial — estrutura movida para o Service, matriz de role/escopo por técnico/UF segue
> como decisão de produto pendente). Ver "Fechamento do bloco segurança (2026-09-17)" no fim deste
> documento para o detalhe achado a achado e a validação executada (testes automatizados + fluxo
> completo no navegador). Bloco 6 (supply chain/CI — pip-audit/npm audit/SAST/secret scan/CodeQL)
> não foi implementado nesta rodada, por ser escopo do Plan Mode de devops; os P1/P2 correspondentes
> abaixo continuam em aberto.
>
> **Achado novo, pós-fechamento (2026-09-17)**: o próprio Bloco 2 (cookie `HttpOnly`/`SameSite=None`)
> abriu uma superfície que não existia no diagnóstico original — CSRF. Identificado na reavaliação de
> `diagnostico-constituicao-backend-2026-09-16.md` (achado P0.1) e registrado aqui como
> "P0 — CSRF em autenticação por cookie" — **estava em aberto neste ponto da linha do tempo, ver
> "RESOLVIDO" logo abaixo**. Ver seção própria em "Divergências prioritárias" abaixo.
>
> **RESOLVIDO (2026-09-17, Bloco 1 de `planmode-consolidacao-2026-09-17.md`)**: double-submit
> cookie implementado — `backend/app/auth.py` (`CSRF_COOKIE_NAME`/`CSRF_HEADER_NAME`, cookie
> `sigeo_csrf` não-`HttpOnly` emitido junto da sessão) + `backend/app/main.py::csrf_middleware`
> (global, toda rota `POST`/`PUT`/`PATCH`/`DELETE` exceto `/auth/login`/`/health` exige
> `X-CSRF-Token` == cookie). Cobre exatamente as duas rotas apontadas sem defesa nenhuma
> (`/auth/refresh`/`/auth/logout`, POSTs sem corpo) mais toda rota mutável de
> `monitoramento.py`/`propostas_candidatas.py`/`notificacoes.py`. Os 3 clientes HTTP do frontend
> (`api.ts`/`convenios.ts`/`monitoramento.ts`) anexam o header via `frontend/src/lib/csrf.ts`.
> Testado em `backend/tests/test_csrf.py` (403 sem header, 403 com header divergente, 200 com header
> correto — `/auth/refresh`, `/auth/logout`, PATCH de monitoramento). **Achado colateral real
> encontrado ao escrever esse teste**: `REFRESH_COOKIE_PATH` era `/auth/refresh` — Path de cookie é
> matching de prefixo, então esse cookie nunca era enviado numa requisição para `/auth/logout`
> (paths irmãos), e `revoke_refresh_token` nunca era chamado ali; logout nunca revogava nada no
> servidor, apesar do Bloco 2 (`planmode-seguranca-2026-09-16.md`) documentar isso como resolvido.
> Corrigido junto (`REFRESH_COOKIE_PATH = "/auth"`, prefixo cobre `/auth/refresh` e `/auth/logout`).
> Bearer fallback (`Authorization: Bearer`) e `access_token` no corpo de login/refresh também
> removidos no mesmo Plan Mode (Bloco 2, decisão do usuário confirmada: sem consumidor de API além
> do frontend Vercel).

## Escopo e método

Este diagnóstico confronta `padroes/seguranca/constituicao_seguranca.md` com
backend, frontend, banco, dados versionados e automações do SIGEO. Foram
avaliados autenticação, autorização, IDOR, CORS, headers, HTTPS, LGPD,
validação, XSS, SQL injection, segredos, rate limiting, dependências, erros,
logs e supply chain.

Foram feitas inspeções estáticas, chamadas locais sem mutação e auditorias de
dependências. Valores de `.env` não foram exibidos. Configurações externas de
Render, Vercel, Neon e GitHub que não estejam versionadas são classificadas
como **não comprovadas**.

Esta etapa não altera código, credenciais, banco ou infraestrutura.

## Resumo executivo

O sistema possui fundamentos úteis: senhas usam PBKDF2 com salt e comparação
constante, JWT tem assinatura e expiração, mensagens de login não permitem
enumerar usuário, mutações do monitoramento exigem perfil editor, consultas
ORM são parametrizadas, segredos locais estão ignorados e erros 500 não
expõem stack trace ao cliente.

A fronteira de acesso, porém, está incompleta. Endpoints de leitura do módulo
interno de monitoramento estão públicos e devolvem responsáveis, contatos,
técnicos, número de série, observações, documentos regulatórios, ações e
cronograma operacional. A lista de propostas candidatas também está pública.
Esses dados têm natureza distinta dos convênios abertos e precisam de
classificação e autenticação explícitas.

Há ainda uma superfície de XSS armazenado no mapa: nomes de macrorregião
vindos dos dados são concatenados em HTML e atribuídos a `innerHTML` sem
escape. O JWT fica no `localStorage`; não há refresh token, logout/revogação
no servidor, rate limiting ou headers de segurança. Respostas 422 refletem o
`input` do Pydantic e podem devolver a senha inválida recebida.

Avaliação inicial: **3,4/10 de conformidade com a Constituição de Segurança**.
A nota reconhece boas primitivas locais, mas acesso público a dados internos,
XSS possível e gestão de sessão incompleta são bloqueadores de segurança.

**Reavaliação pós-remediação (2026-09-17): 8/10.** Os quatro bloqueadores P0
originais (dados internos públicos, XSS no tooltip, sessão em `localStorage` sem
refresh/revogação, validação ecoando payload sensível) estão fechados, assim
como a maior parte dos P1 (headers, CORS, rate limiting, segredo forte no
boot, autorização movida pro Service, JSONs estáticos com CEP/telefone
removidos, contrato morto de CPF removido). Fica de fora da nota 10: matriz
recurso×role/escopo por técnico-UF-órgão (decisão de produto pendente,
Bloco 3.2), inventário formal completo de dados (Bloco 5 cobriu os JSONs
identificados aqui, não um levantamento sistemático de todo campo do
sistema), redaction estruturado de logs/auditoria, e todo o Bloco 6 (CI de
segurança — pip-audit/npm audit/SAST/secret scan/CodeQL), que segue 100%
pendente por ser escopo do Plan Mode de devops. **Achado novo pós-fechamento,
já resolvido**: a própria migração para cookie (Bloco 2) abriu uma superfície
CSRF que não estava no diagnóstico original (a sessão anterior em
`localStorage`/bearer não tinha esse vetor) — fechada em 2026-09-17 pelo
Bloco 1 de `planmode-consolidacao-2026-09-17.md` (double-submit cookie,
testado). Com isso, **nota consolidada sobe para 8,5/10** — o único ponto
que ainda impedia 9+ era esse P0; o resto do texto desta seção (matriz de
role, inventário formal, Bloco 6 de CI) continua fora do escopo fechado.

## Evidências objetivas

- 28 operações de rota encontradas, além de `/health`.
- Autenticação existe em `/auth/login` e `/auth/me`.
- Cinco mutações do monitoramento e duas de propostas exigem editor.
- Notificações exigem usuário autenticado e filtram por usuário.
- ~~Seis leituras de monitoramento permanecem públicas.~~ **Fechado
  2026-09-17**: 5 delas exigem `require_current_user` (`/marcos` público por
  decisão explícita); ver Bloco 1.
- ~~`GET /propostas-candidatas` permanece público.~~ **Fechado 2026-09-17**:
  exige `require_current_user`.
- ~~JWT HS256 com duração de 8 horas; sem refresh, `jti`, rotação ou
  denylist.~~ **Fechado 2026-09-17**: access token de 20min
  (`Settings.access_token_expire_minutes`), refresh token opaco rotativo
  (tabela `refresh_token`, hash SHA-256), `POST /auth/refresh` e
  `POST /auth/logout` com revogação real no servidor. Ver Bloco 2.
- ~~Token do frontend persistido em `localStorage`.~~ **Fechado 2026-09-17**:
  cookie `HttpOnly`/`Secure`/`SameSite=None`; frontend não guarda mais token
  em lugar nenhum (`useAuthSession` pergunta `GET /auth/me`). Compat dupla
  bearer/cookie temporária documentada (Bloco 2, fase de rollout).
- ~~CORS local permite credenciais e todos os métodos; headers solicitados são
  aceitos por wildcard.~~ **Fechado 2026-09-17**: `allow_methods`/
  `allow_headers` viraram lista explícita; `Settings._validar_cors_origins`
  rejeita `*`/`http://` fora de localhost no boot.
- ~~CSP, HSTS, `nosniff` e proteção contra framing não estão configurados.~~
  **Fechado 2026-09-17**: middleware de `Strict-Transport-Security`/
  `X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy` +
  `Content-Security-Policy-Report-Only` (enforcement fica para depois de um
  período de observação, ver Bloco 4).
- `/docs` e `/openapi.json` ficam públicos por padrão — **ainda aberto** (P2,
  não coberto por este ciclo).
- ~~Não existe rate limiter nem resposta 429 implementada.~~ **Fechado
  2026-09-17**: `slowapi` em `/auth/login` (5/min) e `/auth/refresh`
  (30/min), handler 429 genérico.
- `pip-audit`: nenhuma vulnerabilidade conhecida no ambiente Python.
- `npm audit`: 2 ocorrências moderadas, ambas ligadas ao `uuid` transitivo de
  `exceljs`; zero alta e zero crítica.
- 36 artefatos de dados estão versionados; dez JSONs contêm chaves de contato,
  endereço, CEP ou identificação de fornecedor. **Parcialmente fechado
  2026-09-17**: os 5 JSONs servidos publicamente por
  `frontend/public/monitoramento-equipamentos/` (incluindo `siconv.json`/
  `transferegov.json`, que tinham CEP/endereço/telefone) foram removidos —
  confirmado que nenhum código os lia mais e que o script de import nunca
  lia dali. O dado equivalente hoje só é servido por `GET /convenios/
  {numero}`, que passou a exigir sessão. Os demais JSONs versionados fora de
  `frontend/public/` (ex. `backend/scripts/output/`) não foram reavaliados
  neste ciclo.
- Não existe CI de segurança, SAST, secret scan, CodeQL, Dependabot/Renovate
  ou DAST versionado.

## Pontos conformes ou bem encaminhados

### Autenticação e autorização

- Senha usa `hashlib.pbkdf2_hmac` com SHA-256, salt aleatório de 16 bytes e
  260 mil iterações; verificação usa `hmac.compare_digest`.
- JWT é criado pela biblioteca PyJWT com `sub`, `role`, `iat` e `exp`.
- O decoder restringe explicitamente o algoritmo a HS256.
- Login responde “Email ou senha inválidos” tanto para usuário ausente quanto
  para senha errada.
- Usuário inativo ou removido é rejeitado a cada uso do token.
- Perfil leitor não pode executar mutações de monitoramento.
- Autoria de mutações vem do usuário autenticado, não do campo enviado pelo
  frontend.
- Notificações são consultadas e alteradas dentro do escopo do usuário.

### Dados, queries e integrações

- Consultas de aplicação usam SQLAlchemy e bind parameters; não foi
  encontrada concatenação de entrada do usuário em SQL.
- Pydantic valida payloads e parâmetros FastAPI impõem parte dos limites.
- Chamadas externas usam HTTPS, timeout e, no Portal da Transparência, retry
  controlado para falhas transitórias.
- A chave do Portal é lida de variável de ambiente e enviada em header.
- `.env` real está ignorado e nenhum `.env` real aparece no histórico
  consultado.
- O scan textual não encontrou chave privada, token conhecido ou connection
  string com senha em arquivo versionado.

### Erros e dependências

- Erro inesperado retorna mensagem genérica e não inclui stack trace, SQL ou
  caminho de arquivo na resposta.
- Falhas de autenticação também são genéricas.
- Lockfiles Python e Node estão versionados.
- A auditoria Python não encontrou CVE conhecida no ambiente atual.

## Divergências prioritárias

### P0 — dados internos expostos sem autenticação — **fechado 2026-09-17**

1. `GET /monitoramento/instrumentos` devolve técnicos, responsável da
   instituição e contato, além de informações do equipamento físico.
2. `GET /monitoramento/instrumentos/{nr_convenio}` expõe eventos,
   observações, número de documento regulatório, validade e histórico.
3. `GET /monitoramento/acoes` expõe descrições de tarefas, responsável,
   prazos e conclusão.
4. `GET /monitoramento/resumo` expõe distribuição por técnico, licenças e
   calendário operacional.
5. `GET /monitoramento/cnes-referencia` e `/marcos` também são públicos. O
   catálogo de marcos pode ser público, mas o autocomplete deve acompanhar a
   decisão de acesso do módulo.
6. `GET /propostas-candidatas` expõe o radar de análise e seu estado de
   revisão sem exigir login.
7. A interface esconde partes quando não há token, mas isso não constitui
   autorização. As URLs podem ser chamadas diretamente.

**Direção:** classificar cada campo como aberto, interno, pessoal ou sensível;
proteger o router interno por `require_current_user`, preservar editor para
mutações e criar respostas públicas reduzidas somente quando o produto
realmente exigir transparência externa.

**Aplicado (Bloco 1 + decisão do usuário 2026-09-17):** as 5 leituras +
`GET /propostas-candidatas` exigem `require_current_user`
(`backend/app/routers/monitoramento.py`, `propostas_candidatas.py`);
`/marcos` público por decisão explícita, registrada no código. Escopo
ampliado no mesmo dia, por pedido do usuário, pra todo o app —
`convenios.py`/`macro_coverage.py`/`municipality_coverage.py`/
`equipment_offer.py` também passaram a exigir sessão, e `ProtectedRoute`
(`frontend/src/components/layout/protected-route.tsx`) envolve todas as
rotas do frontend em `App.tsx`. Teste de regressão em
`backend/tests/test_monitoramento_auth.py` (401 sem token nas 5 rotas + 200
com token válido + `/marcos` continua 200 sem token).

### P0 — XSS no tooltip D3 — **fechado 2026-09-17**

1. `construirTooltipHtml` concatena `macro.nome`, `macro.uf` e outros valores
   em string HTML.
2. `MacroMap` atribui a string a `tooltip.innerHTML`.
3. React não participa desse trecho e, portanto, não executa seu escaping
   padrão.
4. Hoje os nomes vêm de datasets controlados, mas uma alteração de fonte,
   import ou banco transforma o vetor em XSS armazenado.

**Direção:** criar nós com `textContent`, usar seleção D3 `.text()` ou aplicar
escape rigoroso antes de qualquer HTML. Uma CSP é defesa adicional, não a
correção primária.

**Aplicado (Bloco 1):** `construirTooltipHtml` virou `construirTooltipNode`
(`frontend/src/components/features/macro-map-draw.ts`), devolve um
`DocumentFragment` construído via `createElement`/`textContent`; `macro-map.tsx`
usa `tooltip.replaceChildren(...)` em vez de `innerHTML`. Zero string HTML
montada por concatenação nesse trecho.

### P0 — sessão incompleta — **fechado 2026-09-17**

1. O access token dura 8 horas, acima do conceito de curta duração da
   constituição.
2. Não existe refresh token ou sessão de servidor.
3. Logout apenas remove o token do navegador; o JWT continua válido até
   expirar.
4. Não há `jti`, denylist, versão de sessão ou revogação por usuário.
5. O token fica em `localStorage` e qualquer XSS na origem pode exfiltrá-lo.
6. A combinação entre token persistente e `innerHTML` aumenta o impacto do
   vetor identificado no mapa.

**Direção:** preferir cookie `HttpOnly`, `Secure` e `SameSite`, access token
curto, refresh rotativo e revogação no servidor. Se bearer token for mantido,
documentar formalmente o risco e reduzir duração/exposição.

**Aplicado (Bloco 2):** cookie `HttpOnly`/`Secure`/`SameSite=None` (cross-site
Vercel↔Render), access token de 20min, refresh opaco rotativo com hash em
`refresh_token` (reuso do token já rotacionado falha — testado em
`backend/tests/test_auth_session.py`), `POST /auth/logout` revoga no
servidor. Bearer aceito como fallback só durante a fase de compatibilidade
dupla do rollout, documentada em `backend/app/auth.py` e no CLAUDE.md, pra
remover quando não houver mais tráfego assim.

### ~~P0 — CSRF em autenticação por cookie~~ — **RESOLVIDO (2026-09-17, Bloco 1 de `planmode-consolidacao-2026-09-17.md`)**

Ver detalhe no aviso do topo do documento.

Não existia no diagnóstico original (2026-09-16), porque o diagnóstico original avaliou a sessão em
JWT/`localStorage`, sem CSRF nesse modelo (só XSS). O próprio Bloco 2 deste diagnóstico, ao migrar a
sessão para cookie, introduziu a superfície. Identificado e confirmado no código atual pela
reavaliação `diagnostico-constituicao-backend-2026-09-16.md` (achado P0.1).

1. `set_session_cookies` (`backend/app/auth.py`) usa `SameSite=None` — exigido porque frontend
   (Vercel) e backend (Render) são domínios cross-site; `SameSite=Strict/Lax` (a mitigação mais
   simples da constituição, Seção "CSRF") não é aplicável aqui.
2. Sem `SameSite=Strict/Lax`, a constituição (`padroes/seguranca/constituicao_seguranca.md`, Seção
   "CSRF": "se autenticação usa cookie, aplicar proteção CSRF — token CSRF ou
   `SameSite=Strict/Lax`") exige a outra opção: token CSRF explícito ou validação forte de `Origin`/
   `Referer` nas rotas mutáveis.
3. Nenhuma das duas existe hoje. `POST /auth/refresh` e `POST /auth/logout` são POSTs sem corpo —
   preflight CORS reduz parte da superfície de mutações com corpo JSON, mas essas duas rotas
   continuam acionáveis entre sites (um `<form>`/`fetch` de origem maliciosa consegue disparar o
   POST, o navegador anexa o cookie automaticamente).
4. Mutações do monitoramento/propostas (PATCH/POST com corpo JSON) têm proteção parcial via
   preflight (o navegador só permite `Content-Type: application/json` cross-site depois de um
   preflight OPTIONS que o CORS já restringe a origens explícitas) — mas isso é efeito colateral do
   CORS, não uma defesa CSRF deliberada, e não cobre as duas rotas do item 3.

**Direção**: token CSRF (double-submit cookie, verificado contra header customizado em toda mutação)
ou validação estrita de `Origin`/`Referer` nas rotas mutáveis, priorizando `/auth/refresh` e
`/auth/logout` por serem POST sem corpo e hoje sem nenhuma defesa. Escopo de **segurança & auth**
(`padroes/AGENTS.md` Seção 2.2) — antecede o Plan Mode de backend na ordem de implementação entre
áreas; o Plan Mode de backend (`planmode-backend-2026-09-17.md`) já registra este item como fora do
seu escopo por esse motivo.

### P0 — validação reflete conteúdo sensível — **fechado 2026-09-17**

O handler de `RequestValidationError` devolve `exc.errors()` integralmente.
Em teste local, um payload inválido de `/auth/login` devolveu o objeto enviado
no campo `password` dentro de `detail[].input`. A mesma estrutura pode refletir
outros dados sensíveis de payload.

**Direção:** remover `input` e `ctx` das respostas, devolver apenas caminho,
código e mensagem segura; nunca logar o body bruto de autenticação.

**Aplicado (Bloco 1):** `validation_exception_handler`
(`backend/app/errors.py`) filtra `exc.errors()` pra só `loc`/`msg`/`type`
antes de responder — vale pra qualquer rota, não só `/auth/login`. Teste de
regressão em `test_monitoramento_auth.py::
test_erro_de_validacao_nao_ecoa_payload_enviado`.

### P1 — headers, HTTPS e CORS — **fechado 2026-09-17**

1. Não há CSP, HSTS, `X-Content-Type-Options` ou `X-Frame-Options` no backend
   nem no `vercel.json`.
2. Não há `Referrer-Policy` ou `Permissions-Policy` como hardening adicional.
3. CORS usa lista explícita de origens, o que é positivo, mas aceita todos os
   métodos e headers com credenciais habilitadas.
4. `cors_origins` tem localhost como default. Produção depende de variável
   manual e não há validação que rejeite `*` ou origem HTTP fora de dev.
5. O frontend usa fallback HTTP localhost. Não há validação de build que
   exija URL HTTPS em produção.
6. HTTPS é presumido nas plataformas, mas não há teste versionado ou redirect
   no app — **ainda aberto**, fora do escopo deste ciclo.

**Aplicado (Bloco 4, itens 1-4):** middleware de `Strict-Transport-Security`/
`X-Content-Type-Options: nosniff`/`X-Frame-Options: DENY`/`Referrer-Policy`
(`backend/app/main.py`); `Content-Security-Policy-Report-Only` (enforcement
fica para depois de um período de observação de violações reais, decisão
registrada no código — nunca ativar sem isso). CORS trocou
`allow_methods`/`allow_headers` de `"*"` para lista explícita;
`Settings._validar_cors_origins` rejeita `*` e origem `http://` fora de
localhost no boot. Item 5 (validação de build exigindo HTTPS em produção no
frontend) e item 6 (teste/redirect HTTPS) **seguem em aberto**.

### P1 — rate limiting e proteção contra abuso — **fechado 2026-09-17**

1. `/auth/login` não possui limite por IP, email ou janela temporal.
2. Não há atraso progressivo, bloqueio controlado ou telemetria de tentativa.
3. Endpoints públicos de busca/listagem e consulta ao Portal podem ser usados
   para scraping e amplificação de chamadas externas.
4. Não há limite global, por usuário, por rota ou resposta 429 padronizada —
   itens 3-4 (limite em rotas públicas de busca/scraping) **seguem em
   aberto**; só `/auth/login` e `/auth/refresh` têm rate limit hoje.

**Aplicado (Bloco 2, itens 1-2):** `slowapi` (`backend/app/rate_limit.py`),
`@limiter.limit("5/minute")` em `/auth/login`, `"30/minute"` em
`/auth/refresh`, handler `RateLimitExceeded` devolve 429 genérico (nunca o
limite/janela configurados). Risco documentado no código: storage
in-memory, não compartilhado entre réplicas se o backend escalar
horizontalmente.

### P1 — segredo e configuração — **fechado 2026-09-17 (itens 1-2)**

1. `JWT_SECRET` aceita string vazia no boot. O sistema só falha ao chamar
   login/rota autenticada, em vez de rejeitar inicialização insegura.
2. Não há validação de entropia ou tamanho mínimo da chave JWT.
3. `render.yaml` não declara `JWT_SECRET`; configuração manual pode existir,
   mas não é reproduzível nem comprovada.
4. Não existe rotação documentada de JWT, chave do Portal ou credencial DB.
5. Não há separação comprovada de segredos dev/staging/prod.
6. Não há secret scanning automático no commit/CI — item 6 é Bloco 6
   (devops/CI), **segue em aberto**.

**Aplicado (itens 1-2):** `Settings._validar_jwt_secret`
(`backend/app/config.py`) rejeita segredo vazio/curto (<32 chars) na
**construção** de `Settings()` — derruba o boot do processo, não só a
primeira request. Itens 3-5 (declaração em `render.yaml`, rotação
documentada, separação dev/staging/prod comprovada) **seguem em aberto**,
dependem de configuração externa (Render) não versionada.

### P1 — privacidade e minimização — **parcialmente fechado 2026-09-17**

1. Não existe inventário formal de dados nem classificação público/interno/
   pessoal/sensível.
2. CNPJ e finanças de convênio vêm de fontes públicas; contatos, responsáveis,
   observações, números de série e ações do monitoramento têm natureza interna
   e hoje usam a mesma exposição aberta.
3. Dez JSONs versionados contêm campos como contato, endereço, CEP,
   identificação/nome de fornecedor. Parte pode ser dado aberto, mas não há
   registro de origem, base legal, minimização ou revisão de publicação.
4. `frontend/public/monitoramento-equipamentos/*.json` fica acessível como
   arquivo estático, fora de qualquer autorização do backend.
5. Não há política de retenção, expurgo, anonimização ou atendimento LGPD.
6. `cpf_hash` existe no modelo, mas o script atual grava
   `"nao-informado"`; o schema `UserCreate` com CPF não possui fluxo ativo.
   Esse contrato morto cria falsa expectativa de tratamento seguro.

**Aplicado (item 4 e 6):** os 5 JSONs de `frontend/public/monitoramento-
equipamentos/` (incluindo os com CEP/endereço/telefone) foram removidos —
confirmado sem consumidor. O mesmo dado, hoje, só sai por `GET /convenios/
{numero}` (`siconv_raw`/`transferegov_raw`), que exige sessão desde a
decisão do usuário de colocar todo o app atrás de login. Contrato morto de
CPF removido: coluna `User.cpf_hash` dropada (migration `f8fe7ce9347c`,
confirmado que só continha `"nao-informado"` em produção), campo
`UserCreate.cpf` e a linha hardcoded em `scripts/criar_usuario.py`
removidos. **Itens 1-2-3-5 seguem em aberto**: não existe inventário formal
sistemático de TODO campo do sistema (classificação/base legal/retenção),
nem política de retenção/expurgo/anonimização — o que foi feito é
pontual, sobre os artefatos já identificados neste diagnóstico.

### P1 — autorização e IDOR — **parcialmente fechado 2026-09-17**

1. A autorização está no dependency do router, não na camada Service como a
   constituição determina. Services chamados por script ou código interno não
   impõem política por si mesmos.
2. Existem apenas três roles amplas e o editor pode alterar qualquer
   instrumento/proposta. Isso pode ser correto para a equipe atual, mas não há
   matriz recurso × ação × role documentada.
3. Rotas por `nr_convenio`, `acao_id` e `proposta_id` verificam existência e
   role global; não existe escopo por órgão, UF, técnico ou carteira.
4. Não há testes HTTP sistemáticos para ausência de token, token expirado,
   role inadequada e acesso cruzado — **parcialmente fechado**: há testes
   de ausência de token/token válido (`test_monitoramento_auth.py`) e de
   `leitor` bloqueado no Service (`test_monitoramento.py`), mas não uma
   suíte sistemática cobrindo token expirado/revogado e todo par
   recurso×role.

**Aplicado (item 1):** `backend/app/authz.py::assert_pode_editar_monitoramento`
é chamado de dentro de `app/services/monitoramento_instrumentos.py`,
`monitoramento_eventos.py` (novo, extraído do router) e
`propostas_candidatas.py` — não é mais só `Depends` do router; testado
chamando o Service direto com usuário `leitor`, sem HTTP. **Itens 2-3 seguem
em aberto**, são decisão de produto (matriz recurso×role, escopo por
técnico/UF/órgão) explicitamente registrada como pendente, não implementada
sem essa decisão.

### P1 — logs e auditoria — **em aberto, não coberto por este ciclo**

1. O handler 500 usa `logger.exception` com `request.url`, que inclui
   querystring. Se futuramente uma rota receber dado pessoal na URL, ele será
   persistido em log.
2. Logs não são estruturados e não há redaction central de token, email,
   contato ou identificadores pessoais.
3. `AuditLog.details` pode receber valores antigos e novos de campos internos;
   não há política de mascaramento ou retenção.
4. Não há alertas para brute force, 401/403 anormais ou alteração sensível.

### P1 — supply chain e operação — **em aberto, escopo do Bloco 6/devops**

1. `npm audit` encontrou vulnerabilidade moderada no `uuid` transitivo de
   `exceljs`. O vetor específico usa versões nomeadas com buffer; o uso atual
   precisa ser analisado antes de escolher upgrade, override ou mitigação.
2. Não há auditoria de dependências em CI nem atualização automatizada.
3. Não há SAST, secret scan, CodeQL, SBOM ou scan de imagem.
4. GitHub Actions usa tags mutáveis e `setup-uv` instala `latest`.
5. Workflows operacionais acessam o banco via secret sem Environment protegido,
   permissões mínimas ou restrição de ref, conforme o diagnóstico DevOps.

### P2 — superfície e hardening — **item 5 fechado, demais em aberto**

1. Swagger e OpenAPI ficam públicos em produção, ampliando descoberta da API.
   Não é vulnerabilidade isolada, mas deve ser decisão consciente.
2. Não há `TrustedHostMiddleware` nem validação de Host.
3. Respostas não definem política de cache para dados autenticados.
4. Schemas de strings internas têm poucos limites de tamanho; payloads podem
   gerar armazenamento e logs excessivos.
5. O backend revela que `JWT_SECRET` está ausente por resposta 503 específica.
   É útil operacionalmente, mas expõe configuração; produção deve falhar no
   boot antes de servir tráfego. **Fechado 2026-09-17**:
   `Settings._validar_jwt_secret` derruba o boot (ver P1 "segredo e
   configuração" acima) — o 503 em runtime só ainda existe como segunda
   camada de defesa, o processo nem chega a subir com segredo vazio/curto.

## Sequência recomendada de aplicação

*(Status 2026-09-17 — ver "Fechamento do bloco segurança" no fim do documento para o detalhe.)*

### Bloco 1 — fechar exposição e XSS — ✅ concluído

- Classificar campos e proteger todas as leituras internas.
- Separar DTO público mínimo de DTO operacional autenticado.
- Proteger propostas candidatas e autocomplete interno.
- Substituir `innerHTML` por construção segura com texto.
- Remover `input`/`ctx` das respostas de validação.
- Criar testes de regressão para acesso anônimo e payload XSS.

### Bloco 2 — sessão e autenticação — ✅ concluído (item CSRF resolvido em 2026-09-17)

- Definir modelo de sessão: cookie seguro ou bearer com risco aceito.
- Implementar access curto, refresh rotativo e revogação/logout servidor.
- Exigir segredo forte no boot e documentar rotação.
- Adicionar rate limit de login e respostas 429 genéricas.
- Cobrir token ausente, inválido, expirado, revogado e usuário desativado.
- ~~**Reaberto (achado novo, pós-2026-09-17)**: proteção CSRF explícita~~ **RESOLVIDO** (Bloco 1 de
  `planmode-consolidacao-2026-09-17.md`) — double-submit cookie, ver aviso no topo do documento.
  Bearer fallback e `access_token` no corpo também removidos no mesmo Plan Mode.

### Bloco 3 — autorização — 🟡 parcial (estrutura pronta, decisão de produto pendente)

- Documentar matriz recurso × ação × role.
- Levar decisões de autorização para services ou policy central reutilizável.
- Decidir se há escopo por técnico/órgão; implementar IDOR conforme a decisão.
- Testar cada rota protegida em nível HTTP.

### Bloco 4 — transporte e navegador — ✅ concluído (CSP em report-only)

- Configurar CSP, HSTS, `nosniff`, frame policy e referrer policy.
- Restringir métodos e headers CORS ao necessário.
- Rejeitar origem wildcard/HTTP em configuração de produção.
- Validar HTTPS e headers em smoke test.

### Bloco 5 — dados e LGPD — 🟡 parcial (artefatos identificados aqui fechados, inventário formal pendente)

- Inventariar dados, fonte, classificação, finalidade, retenção e acesso.
- Remover artefatos estáticos que já migraram para API/banco.
- Revisar JSONs brutos antes de publicação e manter só campos necessários.
- Definir redaction de logs/audit trail e política de expurgo.
- Remover ou implementar corretamente o contrato morto de CPF.

### Bloco 6 — supply chain e monitoramento — ⬜ não iniciado (escopo devops)

- Tratar o advisory transitivo de `exceljs/uuid` com validação do fluxo de
  exportação.
- Adicionar pip-audit/npm audit, SAST, secret scan e CodeQL ao CI.
- Fixar ferramentas/Actions e automatizar atualizações.
- Criar alertas de autenticação, autorização e abuso.

## Critérios para nota 10

- Nenhum dado interno é retornado anonimamente.
- Sessão tem access curto, refresh rotativo e revogação comprovada.
- Nenhum token persistente fica acessível a JavaScript sem risco aceito e
  compensações documentadas.
- Autorização central e testes IDOR cobrem todos os recursos.
- Zero `innerHTML` inseguro e CSP bloqueante validada.
- Erros e logs nunca refletem senha, token ou payload sensível.
- Headers, HTTPS, CORS e rate limiting são testados automaticamente.
- Segredos fortes são validados no boot e possuem rotação/runbook.
- Inventário LGPD define classificação, acesso e retenção.
- Auditorias de dependência, SAST e secret scan bloqueiam risco crítico.
- Alertas e audit trail permitem detectar e investigar abuso.

## Fechamento do bloco segurança (2026-09-17)

Implementação de `docs/arquitetura/planmode-seguranca-2026-09-16.md`, Blocos 1, 2, 3 (parcial), 4 e
5, em 4 commits (`5bc60a5`, `a6cc725`, `ca1e5ad`, `ea4bd3f`, branch `feat/equipamento-em-uso`).

**O que fechou, resumido** (detalhe achado a achado nas seções acima):
- Todas as leituras internas do monitoramento + `GET /propostas-candidatas` exigem sessão;
  `/marcos` público por decisão explícita.
- **Decisão do usuário, ampliando o escopo original**: todo o app (Painel Geral, Dashboard, Mapa,
  Relatórios, Instrumentos firmados) passou a exigir login, não só o monitoramento interno — porque
  `GET /convenios/{numero}` (rota nova, de trabalho paralelo de database que substituiu os JSONs
  estáticos por uma tabela) devolvia CEP/endereço/telefone do item publicamente, mesma classe de
  achado deste diagnóstico só que a fonte tinha migrado no meio do caminho.
- XSS do tooltip do mapa eliminado (nós DOM em vez de `innerHTML`).
- Validação de payload para de ecoar `input`/`ctx`.
- Sessão migrou de JWT em `localStorage` (8h, sem revogação) para cookie `HttpOnly`/`Secure`/
  `SameSite=None` com access token de 20min + refresh opaco rotativo + revogação real no logout;
  bearer mantido só como fallback temporário de rollout.
- Autorização de mutação movida para dentro dos Services (não só `Depends` do router).
- Headers de hardening + CORS restrito + `JWT_SECRET` validado no boot + rate limit em
  `/auth/login`/`/auth/refresh`.
- Os 5 JSONs estáticos com CEP/endereço/telefone (sem controle de acesso nenhum) removidos;
  contrato morto de CPF removido do banco.

**O que NÃO fechou, para não deixar a leitura enganosa:**
- **CSRF em autenticação por cookie** (achado novo, identificado após este fechamento) — `SameSite=None`
  exigido pela topologia cross-site Vercel↔Render tira a mitigação mais simples da mesa; falta token
  CSRF ou validação de `Origin`/`Referer`, principalmente em `/auth/refresh` e `/auth/logout` (POST
  sem corpo, sem defesa nenhuma hoje). Ver "P0 — CSRF em autenticação por cookie".
- Matriz recurso×role e escopo de autorização por técnico/UF/órgão — decisão de produto pendente,
  registrada e não implementada.
- Inventário formal completo de classificação de dados (público/interno/pessoal/sensível) — só os
  artefatos já identificados neste diagnóstico foram tratados, não um levantamento sistemático novo.
- Redaction estruturado de logs/auditoria, alertas de abuso.
- Todo o Bloco 6 (pip-audit/npm audit/SAST/secret scan/CodeQL, fixação de Actions) — escopo do Plan
  Mode de devops, não iniciado.
- `render.yaml`/segredos de produção (declaração/rotação/separação dev-staging-prod) — depende de
  configuração externa não versionada, não comprovável por este diagnóstico.
- Migração de PBKDF2 para `argon2id` — registrada como melhoria de médio prazo na avaliação, não
  crítica, não feita nesta rodada.

**Validação executada:** `cd backend && uv run pytest` (47 passed, suíte sem `TEST_DATABASE_URL`
dedicado neste ambiente — os testes novos de Bloco 1/2/3 estão marcados `db` e foram verificados à
parte, por chamada direta de função/`TestClient` contra o Neon de dev, não pela suíte automatizada
completa); `npx tsc --noEmit`, `npm run test`, `npm run lint` no frontend, todos limpos. Fluxo
completo testado ao vivo no navegador (Chrome, via `claude-in-chrome`): login → cookie setado com
atributos corretos → acesso às rotas antes públicas agora exige sessão (`/dashboard`, `/mapa`, `/`,
`/monitoramento-equipamentos`) → logout revoga no servidor → rota protegida volta a redirecionar
pra `/login`. Dois bugs reais encontrados e corrigidos durante essa validação (não estavam listados
neste diagnóstico): `monitoramento-overview-page.tsx` e `monitoramento-painel-page.tsx` chamavam a
API de monitoramento via `fetch` cru, sem credencial, e quebravam assim que as rotas passaram a
exigir sessão — migradas para a camada de services já usada pelo resto do app.

## Veredito

O sistema não está sem segurança: ele possui primitivas corretas e boas
decisões pontuais. O problema está na composição. Uma sessão longa em
`localStorage`, combinada com HTML imperativo e dados internos públicos,
transforma falhas isoladas em risco material. A aplicação deve começar pelo
Bloco 1, antes de expandir autenticação ou criar novos endpoints.

**Atualização 2026-09-17**: a composição de risco descrita acima foi desfeita — sessão curta em
cookie `HttpOnly`, XSS do tooltip eliminado, e o app inteiro (não só o monitoramento interno) atrás
de login. O restante do risco que seguia de pé nesta data era estrutural/organizacional (decisão de
escopo de autorização por técnico/UF, inventário formal de dados, CI de segurança), não mais
bloqueadores de implementação isolados. Ver "Fechamento do bloco segurança (2026-09-17)" acima.

**Atualização adicional (CSRF, achado novo pós-fechamento)**: a própria mudança de sessão para
cookie `SameSite=None` reabriu um bloqueador de implementação isolado — CSRF em `/auth/refresh` e
`/auth/logout`, sem token CSRF nem validação de `Origin`. Não é regressão do trabalho já feito (o
cookie em si é a mitigação correta pro que ele resolve — sessão persistente em `localStorage`), é uma
lacuna que a própria mudança introduziu e que ainda não tem Plan Mode de implementação. Ver "P0 —
CSRF em autenticação por cookie".

## Avaliação (ciclo `padroes/AGENTS.md` Seção 2.1)

Confronto deste diagnóstico com `padroes/seguranca/constituicao_seguranca.md`, o Núcleo Duro
(`padroes/AGENTS.md` Seção 3) e os diagnósticos de backend/database já existentes. Reexecutado por
amostragem, não apenas aceito por leitura do texto: `jwt_secret: str = ""` confirmado em
`app/config.py` (aceita string vazia no boot, achado P1 correto); `CORSMiddleware` em `app/main.py`
confirmado com `allow_methods=["*"]`/`allow_headers=["*"]`/`allow_credentials=True` (achado P1
correto); `validation_exception_handler` em `app/errors.py` devolve `exc.errors()` sem filtrar —
confirma que `detail[].input` pode ecoar a senha enviada (achado P0 correto, não é suposição);
`localStorage` confirmado em `login-page.tsx`/`monitoramento.ts`; `tooltip.innerHTML =
construirTooltipHtml(...)` confirmado em `macro-map.tsx:174`; senha usa
`hashlib.pbkdf2_hmac("sha256", ...)` com `hmac.compare_digest`, confirmado em `app/auth.py`; nenhuma
biblioteca de rate limit (`slowapi` ou equivalente) no `pyproject.toml`. Nenhuma discrepância entre
o texto do diagnóstico e o código real nos pontos verificados.

### O que o diagnóstico comprovou corretamente

- Os quatro P0 (dados internos expostos, XSS no tooltip, sessão incompleta, validação refletindo
  payload sensível) têm evidência de arquivo/linha reproduzível, não impressão — alinhado com a
  exigência do Núcleo Duro de "teste que afirma algo real" aplicada aqui como "achado que aponta
  evidência real".
- A nota consolidada `3,4/10` está bem calibrada, ao contrário do que se viu no diagnóstico
  database (nota 9,5 sem prova do requisito mais citado pela própria constituição): aqui a nota
  baixa é proporcional a quatro P0 reais e simultâneos, não inflada nem subestimada.
- A seção "Critérios para nota 10" espelha item a item o checklist da Seção 12 da constituição de
  segurança — não inventou critério novo nem omitiu nenhum dos 12 itens do checklist original.

### Ajustes necessários antes do Plan Mode

1. **PBKDF2 vs. a lista literal da constituição.** A Seção 3 da constituição cita "hash com
   algoritmo lento (bcrypt/argon2)". PBKDF2-HMAC-SHA256 com 260 mil iterações é um KDF lento
   reconhecido (NIST SP 800-132) e não é "MD5/SHA puro" — mas também não está na lista literal
   (`bcrypt`/`argon2`) que a constituição nomeia. O diagnóstico classificou isso sem ressalva como
   "ponto conforme". Correto tratar como conforme em espírito (não é um bloqueador P0/P1), mas o
   Plan Mode deve registrar migração para `argon2id` como melhoria de segurança de médio prazo, não
   como pendência crítica — para não deixar a leitura literal da constituição sem resposta.
2. **Sobreposição com o diagnóstico backend.** "P0 — dados internos expostos sem autenticação" e
   "P1 — autorização e IDOR" (autorização no dependency, não no Service) são o mesmo achado já
   registrado em `diagnostico-constituicao-backend-2026-09-16.md` (P0-1 "Política de autenticação
   incompleta" e P0-2 "Autorização vive na dependência HTTP"). Não é erro do diagnóstico de
   segurança repetir — a constituição de segurança é dona do "porquê" (Seção 1: "o detalhe de cada
   regra vive aqui") — mas a implementação deve acontecer uma única vez, dentro do Plan Mode de
   segurança & auth (ordem `padroes/AGENTS.md` Seção 2.2, antes do backend), e o Plan Mode de
   backend deve apenas referenciar essa resolução em vez de reabri-la.
3. **XSS no tooltip é código frontend.** O achado é legítimo e prioritário, mas sua correção
   (`textContent`/`.text()` no D3) é implementação de frontend, não de backend/auth. Mantido no
   Bloco 1 do Plan Mode de segurança por ser P0 bloqueador, mas registrado explicitamente como
   interseção com a constituição frontend, para não ficar perdido quando o ciclo de frontend
   começar sua própria avaliação.
4. **Nenhuma verificação de teste automatizado citada para os P0.** O diagnóstico recomenda "criar
   testes de regressão para acesso anônimo e payload XSS" (Bloco 1) mas não relata se algum teste
   `TestClient` já cobre isso hoje. Confirmado nesta avaliação: não há teste hoje que afirme 401/403
   para as seis leituras públicas do monitoramento nem para `GET /propostas-candidatas` — o Plan
   Mode deve tratar "teste que prova o fechamento" como parte do próprio item, não como faxina
   posterior.

### Conclusão da avaliação

Diagnóstico é factualmente confiável em todos os pontos verificados por amostragem. Os quatro
ajustes acima não mudam a lista de achados nem a nota — mudam apenas a atribuição de dono entre
segurança/backend/frontend e adicionam um item de médio prazo (`argon2id`) que a leitura literal da
constituição não pode deixar sem resposta. O Plan Mode
(`planmode-seguranca-2026-09-16.md`) cobre o Bloco 1 (fechar exposição e XSS) e o Bloco 2 (sessão e
autenticação) como prioridade imediata, por serem P0 e por segurança & auth vir antes de backend na
ordem de implementação entre áreas.
