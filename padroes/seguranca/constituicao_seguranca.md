
# Constituição de Segurança IA v1.0

## 1. Filosofia do Documento

Este documento define a política de segurança obrigatória, compartilhada entre frontend,
backend, database e devops/infra. As constituições de [frontend](../frontend/constiuicao_frontend.md),
[backend](../backend/constituicao_backend.md), [database](../database/constituicao_database.md) e
[devops](../devops/constituicao_devops.md) trazem apenas um checklist local de aplicação — o
"porquê" e o detalhe de cada regra vivem aqui, em um único lugar, para nenhuma dessas pontas
ficar dessincronizada.

### Objetivos

- Nenhum dado sensível exposto por descuido (log, resposta de erro, URL, repositório).
- Autenticação e autorização tratadas como contrato único entre front e back, não reinventadas por tela/rota.
- Postura de segurança auditável: toda decisão relevante (o que loga, o que expõe, o que expira) é rastreável a uma regra deste documento.

---

## 2. PLAN MODE (Obrigatório para funcionalidade sensível)

Antes de implementar autenticação, autorização, upload de arquivo, exportação de dado, ou
qualquer fluxo que toque dado sensível/financeiro, a IA apresenta um plano contendo:

- **Dado envolvido**: é sensível (CPF, dado financeiro, credencial) ou público?
- **Superfície exposta**: novo endpoint, novo campo de resposta, novo header, novo escopo de CORS.
- **Autenticação/autorização**: quem pode chamar, com qual role/permissão.
- **O que nunca deve vazar**: campos a excluir de log/resposta de erro.
- **Riscos**: novo vetor de injeção, novo ponto de rate limit necessário, dado sensível em cache/URL.

A implementação só começa após aprovação do plano.

---

## 3. Autenticação e Sessão

### Obrigatório

- Autenticação via token (JWT/OAuth2) ou sessão de servidor — nunca autenticação "caseira" com lógica própria de hash/verificação sem biblioteca auditada.
- Senha: hash com algoritmo lento (bcrypt/argon2), nunca MD5/SHA puro, nunca em texto plano em nenhum lugar (log, banco, resposta).
- Token de acesso de curta duração + refresh token; expiração sempre configurada, nunca token eterno.
- Logout invalida o token/sessão no servidor, não só remove do client.

### Proibido

- Guardar token/senha em `localStorage` sem avaliação de XSS (preferir cookie `httpOnly`, `secure`, `SameSite`).
- Enviar token/senha via querystring/URL — sempre header (`Authorization`) ou body.

---

## 4. Autorização

- Toda checagem de permissão/role acontece no **backend**, na camada de Service — nunca confiar em esconder botão/rota no frontend como controle de acesso.
- Frontend pode ocultar UI por role (UX), mas isso é conveniência, não segurança — o backend rejeita a chamada mesmo que a UI "deixasse passar".
- IDOR (Insecure Direct Object Reference): toda busca por ID (`/pedidos/:id`) valida que o recurso pertence/é acessível ao usuário autenticado, não só que o ID existe.

---

## 5. Comunicação Frontend ↔ Backend

### CORS

- Lista explícita de origens permitidas (`Access-Control-Allow-Origin`) — nunca `*` em API que aceita credencial/cookie.
- Métodos e headers permitidos explícitos, não wildcard.

### CSRF

- Se autenticação usa cookie, aplicar proteção CSRF (token CSRF ou `SameSite=Strict/Lax`).

### Headers de Segurança (backend)

Obrigatório configurar:

- `Content-Security-Policy`
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (ou CSP `frame-ancestors`)

### HTTPS

- Toda comunicação em produção via HTTPS — sem exceção, inclusive chamada servidor-a-servidor.

---

## 6. Dados Sensíveis e Privacidade (LGPD)

- Classificar todo dado antes de expor: **público** (dado aberto de convênio/programa) vs. **sensível** (CPF, dado financeiro pessoal, credencial, dado de saúde).
- Dado sensível **nunca** aparece em: log, mensagem de erro, URL/querystring, resposta de API além do estritamente necessário ao consumidor.
- Mascarar dado sensível quando exibido parcialmente é necessário (ex.: CPF `***.***.**9-00`).
- Exportação de dado (CSV/relatório) exige o mesmo controle de autorização da consulta original — nunca um endpoint de export "esquecido" sem checagem.
- Retenção: dado sensível tem prazo definido; não acumular indefinidamente sem justificativa.

---

## 7. Sanitização e Validação de Entrada

- Toda entrada de usuário (frontend) e todo payload recebido (backend) é validado por schema estrito antes de uso — ver seção de Contratos de cada constituição.
- SQL/Query Injection: consultas sempre parametrizadas (prepared statements), 100% dos casos — nunca concatenação de string de usuário em query.
- XSS: nunca `dangerouslySetInnerHTML`/`innerHTML` com dado não sanitizado; output sempre escapado por padrão (comportamento default de React/templates).
- Upload de arquivo: validar tipo real (magic bytes, não só extensão), tamanho máximo, e nunca executar/servir o arquivo enviado a partir do mesmo domínio sem sandboxing.

---

## 8. Segredos e Configuração

- Credencial, chave de API, string de conexão: **nunca hardcoded**, sempre via `.env` (backend) ou variável de build server-side (frontend nunca embute segredo no bundle — tudo que vai pro client é público).
- Validação de variáveis obrigatórias na inicialização da aplicação — falha ao subir se faltar.
- `.env`/segredo nunca versionado em git — `.gitignore` obrigatório, e rotação imediata de qualquer segredo commitado por engano.
- Segredo de produção diferente de staging/dev, sempre.

---

## 9. Rate Limiting e Abuso

- Endpoint de autenticação (login, reset de senha) tem rate limit dedicado, mais restritivo que o resto da API.
- Endpoint público de escrita/exportação tem rate limit para evitar abuso/scraping.
- Resposta de rate limit excedido (`429`) não vaza detalhe interno.

---

## 10. Dependências e Supply Chain

- Auditoria de dependência antes de adicionar (`npm audit`, `pip-audit`) — nunca instalar pacote com vulnerabilidade crítica conhecida sem mitigação.
- Lockfile (`package-lock.json`, `poetry.lock`) sempre commitado — build reprodutível.
- Atualização de dependência com CVE crítica é prioridade, não backlog.

---

## 11. Erros e Logs (sem vazamento)

- Resposta de erro ao cliente nunca inclui stack trace, query SQL, caminho de arquivo do servidor ou detalhe de infraestrutura.
- Log estruturado nunca grava: senha, token, CPF/dado sensível em claro — mascarar ou omitir o campo antes de logar.
- Mensagem de erro de autenticação é genérica ("credenciais inválidas"), nunca diferencia "usuário não existe" de "senha errada" (evita enumeração de usuário).

---

## 12. Checklist de Entrega (Segurança)

- [ ] Autenticação usa biblioteca auditada, senha com hash lento, token com expiração.
- [ ] Autorização checada no backend (Service), não só ocultação de UI.
- [ ] IDOR verificado em toda rota com ID de recurso.
- [ ] CORS com lista explícita de origem, sem `*` com credencial.
- [ ] Headers de segurança configurados (CSP, HSTS, nosniff, frame-options).
- [ ] Dado sensível nunca em log, erro, URL ou resposta além do necessário.
- [ ] Query parametrizada — zero concatenação de string de usuário.
- [ ] Nenhum `dangerouslySetInnerHTML`/`innerHTML` com dado não sanitizado.
- [ ] Segredo só via `.env`/variável de ambiente, nunca hardcoded ou versionado.
- [ ] Rate limit em endpoint de autenticação e endpoint público sensível.
- [ ] Dependência auditada, sem CVE crítica sem mitigação.
- [ ] Erro ao cliente sem stack trace/detalhe interno.

---

## Prompt de Referência

Atue como Security Engineer revisando este código. Siga rigorosamente a Constituição de Segurança:

1. Autorização sempre no backend — nunca confie em controle de UI como segurança.
2. Nenhum dado sensível (senha, token, CPF, dado financeiro) em log, erro, URL ou resposta desnecessária.
3. Toda query parametrizada; toda entrada validada por schema estrito.
4. Segredo só via variável de ambiente, nunca hardcoded ou commitado.
5. CORS com origem explícita, headers de segurança configurados, rate limit em autenticação.
6. Mensagem de erro ao cliente nunca revela detalhe interno de infraestrutura.
