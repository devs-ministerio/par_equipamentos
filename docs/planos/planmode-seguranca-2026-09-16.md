# Plan Mode — segurança & auth (2026-09-16)

Terceira etapa do ciclo (`padroes/AGENTS.md` Seção 2.1) para a área segurança, depois de
`diagnostico-constituicao-seguranca-2026-09-16.md` (avaliação incorporada no próprio arquivo, seção
"Avaliação"). Formato conforme `padroes/seguranca/constituicao_seguranca.md` Seção 2 (Dado
envolvido / Superfície exposta / Autenticação-autorização / O que nunca deve vazar / Riscos) — é o
formato de plano específico da constituição de segurança, diferente do formato database/backend.

Ordem de implementação entre áreas (`padroes/AGENTS.md` Seção 2.2): esta área vem depois de
database e antes de backend. Os itens abaixo que também aparecem em
`diagnostico-constituicao-backend-2026-09-16.md` (autenticação por padrão, autorização no Service)
são implementados **aqui**, uma única vez — o Plan Mode de backend deve apenas referenciar esta
resolução, não reabri-la (achado 2 da Avaliação).

Escopo de CI/scan automatizado (pip-audit/npm audit/SAST/secret scan/CodeQL) fica reservado para o
Plan Mode de devops & observabilidade, por ser infraestrutura de pipeline — Bloco 6 do diagnóstico
não é implementado por este documento.

## Bloco 1 — fechar exposição de dados internos e XSS (P0, executar primeiro)

**Dado envolvido**: interno/pessoal — técnico titular/suplente e contato, responsável da
instituição convenente, número de série e documento regulatório do equipamento, ações/observações
de monitoramento, estado de revisão de proposta candidata. Não é dado público de convênio aberto.

**Superfície exposta**: seis leituras hoje sem `Depends` de autenticação
(`/monitoramento/instrumentos`, `/instrumentos/{nr_convenio}`, `/acoes`, `/resumo`,
`/cnes-referencia`, `/marcos`) e `GET /propostas-candidatas`; mais o `tooltip.innerHTML` em
`macro-map.tsx:174` (vetor XSS armazenado se a fonte de `macro.nome`/`macro.uf` mudar).

**Autenticação/autorização**: aplicar `Depends(get_current_user)` (ou o equivalente já usado nas
mutações) em todas as leituras de `monitoramento.py` e em `GET /propostas-candidatas`. `/marcos`
(catálogo fixo) pode ficar público por decisão explícita registrada aqui — não por omissão;
`/cnes-referencia` (autocomplete) segue a mesma decisão do módulo, autenticado por padrão. Editor
continua exigido só para mutação, sem mudança de papel.

**O que nunca deve vazar**: campos de contato/técnico/documento regulatório não aparecem em
resposta anônima em nenhum ambiente, inclusive `/docs`/`/openapi.json` (avaliar tornar essas rotas
autenticadas ou ocultas em produção, P2 do diagnóstico, incluído aqui por ser barato).

**Riscos**: frontend consome essas rotas hoje sem token em telas específicas — checar
`monitoramento-overview`/`painel` antes de aplicar, para não quebrar leitura que já deveria estar
atrás de login; qualquer tela que dependia do acesso anônimo precisa de ajuste coordenado (mesma
entrega, não duas). XSS: trocar `innerHTML` por `textContent`/`.text()` do D3 é mudança de
implementação sem risco de dado, mas é código frontend — registrar aqui a decisão, implementar no
ciclo/avaliação de frontend citando este Plan Mode como origem.

## Bloco 2 — sessão e autenticação (P0)

**Dado envolvido**: token de sessão (JWT), credencial de login.

**Superfície exposta**: `/auth/login`, `/auth/me`, todo endpoint autenticado (consome o token).

**Autenticação/autorização**: reduzir duração do access token (dos atuais 480 min para algo na
ordem de 15-30 min); decidir entre (a) cookie `HttpOnly`/`Secure`/`SameSite` com refresh rotativo e
revogação no servidor, ou (b) manter bearer token com risco aceito documentado e mitigações
(duração curta, denylist por `jti`). Recomendação: opção (a), por eliminar a exposição a XSS que o
Bloco 1 também está corrigindo — duas camadas de defesa, não uma. Exigir `JWT_SECRET` não vazio e
com tamanho mínimo na inicialização (falha o boot, não a primeira chamada).

**O que nunca deve vazar**: senha nunca aparece em log ou resposta — corrige junto o handler de
`RequestValidationError` (`app/errors.py`), removendo `input`/`ctx` de `exc.errors()` antes de
serializar, mantendo só `loc`/`msg`/`type`. Resposta de `JWT_SECRET` ausente deixa de expor 503
descritivo — vira falha de boot antes de servir tráfego (achado P2 do diagnóstico, incluído aqui
por nascer da mesma correção de segredo).

**Riscos**: reduzir duração do token e mudar de `localStorage` para cookie é breaking change de
contrato para o frontend (login flow, interceptor de request) — precisa de entrega coordenada, não
apenas backend isolado. Adicionar rate limit em `/auth/login` (limite por IP/email, resposta `429`
sem detalhe interno) nesta mesma leva, por ser o mesmo endpoint e mesma superfície.

## Bloco 3 — autorização central e IDOR (P1)

**Dado envolvido**: mesmo dado do Bloco 1 (contato, técnico, documento) mais o vínculo
recurso→usuário/role.

**Superfície exposta**: toda rota que recebe `nr_convenio`/`acao_id`/`proposta_id` — hoje valida
existência e role global, sem checagem de escopo por técnico/órgão/UF.

**Autenticação/autorização**: mover a checagem de `require_monitoramento_editor` (hoje só
dependency HTTP) para dentro do Service correspondente, para que uma chamada por script/CLI/job não
contorne a regra — alinhado ao Núcleo Duro ("autorização sempre no backend/banco... nunca só
dependency"). Documentar matriz recurso × ação × role antes de decidir se há escopo por
técnico/órgão (produto define, não é decisão técnica isolada).

**O que nunca deve vazar**: nenhum recurso de outro técnico/órgão retornado quando (se) o escopo for
adotado.

**Riscos**: mover autorização para o Service é refatoração testável isoladamente (teste de unidade
chamando o Service direto, sem HTTP) — baixo risco se a suíte de contrato HTTP cobrir o
comportamento antes e depois.

## Bloco 4 — headers, CORS e transporte (P1)

**Dado envolvido**: nenhum dado sensível diretamente; superfície de ataque de navegador (clickjacking,
MIME sniffing, mixed content).

**Superfície exposta**: toda resposta HTTP do backend e o `vercel.json` do frontend.

**Autenticação/autorização**: não aplicável.

**O que nunca deve vazar**: nada novo — item de hardening.

**Ação**: middleware de headers (`CSP`, `HSTS`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy`); `allow_methods`/`allow_headers` do CORS trocam de `*`
para lista explícita (`GET,POST,PATCH`/`Content-Type,Authorization`); validação de boot que rejeita
`cors_origins` com `*` ou origem `http://` fora de ambiente de desenvolvimento.

**Riscos**: CORS restrito pode quebrar chamada que hoje depende de header não previsto — testar
contra o frontend real antes de fechar em produção. CSP mal calibrada pode bloquear asset legítimo;
começar em modo `report-only` antes de bloquear.

## Bloco 5 — inventário de dados e LGPD (P1)

**Dado envolvido**: todo campo hoje classificado implicitamente — este bloco cria a classificação
formal (público/interno/pessoal/sensível), incluindo os 10 JSONs versionados com contato/CEP/
identificação de fornecedor e o contrato morto de CPF (`cpf_hash` sempre `"nao-informado"`).

**Superfície exposta**: `frontend/public/monitoramento-equipamentos/*.json` (estático, fora de
qualquer autorização de backend) e os artefatos versionados equivalentes.

**Autenticação/autorização**: acesso a dado classificado como interno/pessoal segue o mesmo padrão
do Bloco 1 (autenticado); dado público mantém acesso aberto por decisão registrada, não por default.

**O que nunca deve vazar**: campo pessoal/sensível não fica em arquivo estático servido sem
autorização; decidir remover ou implementar de verdade o fluxo de CPF (não deixar contrato morto que
sugira tratamento seguro inexistente).

**Riscos**: remover JSON estático que o frontend ainda lê quebra a tela até migrar para a API —
coordenar com o mesmo trabalho já em andamento de migração JSON→API (ver `git log` recente do
projeto, já há precedente dessa migração noutras telas).

## Ordem de execução recomendada

1. Bloco 1 (exposição de dados internos + XSS) — dois P0 de maior impacto imediato, menor risco de
   quebra (aplicar auth em rota de leitura é aditivo do ponto de vista de schema).
2. Bloco 2 (sessão/autenticação) — P0, mas breaking change de contrato; planejar junto com frontend
   antes de trocar `localStorage`→cookie.
3. Bloco 3 (autorização central) — depende do Bloco 1 estar fechado para não duplicar trabalho de
   dependency.
4. Bloco 4 (headers/CORS) — independente dos anteriores, pode rodar em paralelo.
5. Bloco 5 (inventário/LGPD) — decisão de produto + engenharia; não bloqueia os blocos anteriores.

Implementação começa item a item, só após aprovação explícita deste Plan Mode, por
`padroes/AGENTS.md` Seção 2.1.
