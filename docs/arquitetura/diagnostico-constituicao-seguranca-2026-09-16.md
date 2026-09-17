# Diagnóstico da Constituição de Segurança — 2026-09-16

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

## Evidências objetivas

- 28 operações de rota encontradas, além de `/health`.
- Autenticação existe em `/auth/login` e `/auth/me`.
- Cinco mutações do monitoramento e duas de propostas exigem editor.
- Notificações exigem usuário autenticado e filtram por usuário.
- Seis leituras de monitoramento permanecem públicas.
- `GET /propostas-candidatas` permanece público.
- JWT HS256 com duração de 8 horas; sem refresh, `jti`, rotação ou denylist.
- Token do frontend persistido em `localStorage`.
- CORS local permite credenciais e todos os métodos; headers solicitados são
  aceitos por wildcard.
- CSP, HSTS, `nosniff` e proteção contra framing não estão configurados.
- `/docs` e `/openapi.json` ficam públicos por padrão.
- Não existe rate limiter nem resposta 429 implementada.
- `pip-audit`: nenhuma vulnerabilidade conhecida no ambiente Python.
- `npm audit`: 2 ocorrências moderadas, ambas ligadas ao `uuid` transitivo de
  `exceljs`; zero alta e zero crítica.
- 36 artefatos de dados estão versionados; dez JSONs contêm chaves de contato,
  endereço, CEP ou identificação de fornecedor.
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

### P0 — dados internos expostos sem autenticação

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

### P0 — XSS no tooltip D3

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

### P0 — sessão incompleta

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

### P0 — validação reflete conteúdo sensível

O handler de `RequestValidationError` devolve `exc.errors()` integralmente.
Em teste local, um payload inválido de `/auth/login` devolveu o objeto enviado
no campo `password` dentro de `detail[].input`. A mesma estrutura pode refletir
outros dados sensíveis de payload.

**Direção:** remover `input` e `ctx` das respostas, devolver apenas caminho,
código e mensagem segura; nunca logar o body bruto de autenticação.

### P1 — headers, HTTPS e CORS

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
   no app.

### P1 — rate limiting e proteção contra abuso

1. `/auth/login` não possui limite por IP, email ou janela temporal.
2. Não há atraso progressivo, bloqueio controlado ou telemetria de tentativa.
3. Endpoints públicos de busca/listagem e consulta ao Portal podem ser usados
   para scraping e amplificação de chamadas externas.
4. Não há limite global, por usuário, por rota ou resposta 429 padronizada.

### P1 — segredo e configuração

1. `JWT_SECRET` aceita string vazia no boot. O sistema só falha ao chamar
   login/rota autenticada, em vez de rejeitar inicialização insegura.
2. Não há validação de entropia ou tamanho mínimo da chave JWT.
3. `render.yaml` não declara `JWT_SECRET`; configuração manual pode existir,
   mas não é reproduzível nem comprovada.
4. Não existe rotação documentada de JWT, chave do Portal ou credencial DB.
5. Não há separação comprovada de segredos dev/staging/prod.
6. Não há secret scanning automático no commit/CI.

### P1 — privacidade e minimização

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

### P1 — autorização e IDOR

1. A autorização está no dependency do router, não na camada Service como a
   constituição determina. Services chamados por script ou código interno não
   impõem política por si mesmos.
2. Existem apenas três roles amplas e o editor pode alterar qualquer
   instrumento/proposta. Isso pode ser correto para a equipe atual, mas não há
   matriz recurso × ação × role documentada.
3. Rotas por `nr_convenio`, `acao_id` e `proposta_id` verificam existência e
   role global; não existe escopo por órgão, UF, técnico ou carteira.
4. Não há testes HTTP sistemáticos para ausência de token, token expirado,
   role inadequada e acesso cruzado.

### P1 — logs e auditoria

1. O handler 500 usa `logger.exception` com `request.url`, que inclui
   querystring. Se futuramente uma rota receber dado pessoal na URL, ele será
   persistido em log.
2. Logs não são estruturados e não há redaction central de token, email,
   contato ou identificadores pessoais.
3. `AuditLog.details` pode receber valores antigos e novos de campos internos;
   não há política de mascaramento ou retenção.
4. Não há alertas para brute force, 401/403 anormais ou alteração sensível.

### P1 — supply chain e operação

1. `npm audit` encontrou vulnerabilidade moderada no `uuid` transitivo de
   `exceljs`. O vetor específico usa versões nomeadas com buffer; o uso atual
   precisa ser analisado antes de escolher upgrade, override ou mitigação.
2. Não há auditoria de dependências em CI nem atualização automatizada.
3. Não há SAST, secret scan, CodeQL, SBOM ou scan de imagem.
4. GitHub Actions usa tags mutáveis e `setup-uv` instala `latest`.
5. Workflows operacionais acessam o banco via secret sem Environment protegido,
   permissões mínimas ou restrição de ref, conforme o diagnóstico DevOps.

### P2 — superfície e hardening

1. Swagger e OpenAPI ficam públicos em produção, ampliando descoberta da API.
   Não é vulnerabilidade isolada, mas deve ser decisão consciente.
2. Não há `TrustedHostMiddleware` nem validação de Host.
3. Respostas não definem política de cache para dados autenticados.
4. Schemas de strings internas têm poucos limites de tamanho; payloads podem
   gerar armazenamento e logs excessivos.
5. O backend revela que `JWT_SECRET` está ausente por resposta 503 específica.
   É útil operacionalmente, mas expõe configuração; produção deve falhar no
   boot antes de servir tráfego.

## Sequência recomendada de aplicação

### Bloco 1 — fechar exposição e XSS

- Classificar campos e proteger todas as leituras internas.
- Separar DTO público mínimo de DTO operacional autenticado.
- Proteger propostas candidatas e autocomplete interno.
- Substituir `innerHTML` por construção segura com texto.
- Remover `input`/`ctx` das respostas de validação.
- Criar testes de regressão para acesso anônimo e payload XSS.

### Bloco 2 — sessão e autenticação

- Definir modelo de sessão: cookie seguro ou bearer com risco aceito.
- Implementar access curto, refresh rotativo e revogação/logout servidor.
- Exigir segredo forte no boot e documentar rotação.
- Adicionar rate limit de login e respostas 429 genéricas.
- Cobrir token ausente, inválido, expirado, revogado e usuário desativado.

### Bloco 3 — autorização

- Documentar matriz recurso × ação × role.
- Levar decisões de autorização para services ou policy central reutilizável.
- Decidir se há escopo por técnico/órgão; implementar IDOR conforme a decisão.
- Testar cada rota protegida em nível HTTP.

### Bloco 4 — transporte e navegador

- Configurar CSP, HSTS, `nosniff`, frame policy e referrer policy.
- Restringir métodos e headers CORS ao necessário.
- Rejeitar origem wildcard/HTTP em configuração de produção.
- Validar HTTPS e headers em smoke test.

### Bloco 5 — dados e LGPD

- Inventariar dados, fonte, classificação, finalidade, retenção e acesso.
- Remover artefatos estáticos que já migraram para API/banco.
- Revisar JSONs brutos antes de publicação e manter só campos necessários.
- Definir redaction de logs/audit trail e política de expurgo.
- Remover ou implementar corretamente o contrato morto de CPF.

### Bloco 6 — supply chain e monitoramento

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

## Veredito

O sistema não está sem segurança: ele possui primitivas corretas e boas
decisões pontuais. O problema está na composição. Uma sessão longa em
`localStorage`, combinada com HTML imperativo e dados internos públicos,
transforma falhas isoladas em risco material. A aplicação deve começar pelo
Bloco 1, antes de expandir autenticação ou criar novos endpoints.

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
