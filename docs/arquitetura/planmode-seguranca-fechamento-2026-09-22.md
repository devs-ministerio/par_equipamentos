# Plan Mode — fechamento de Segurança (2026-09-22)

## Objetivo

Fechar os achados ativos de
`diagnostico-constituicao-seguranca-2026-09-22.md` conforme
`padroes/seguranca/constituicao_seguranca.md`: nenhuma senha ou token em URL
ou resposta indevida, headers efetivos no frontend publicado, controles de
abuso e supply chain auditáveis. O plano também remove contratos e comentários
mortos comprovados e atualiza o contexto afetado na mesma entrega.

Esta é a segunda área da rodada 2, na sequência `Database → Segurança →
Backend → Frontend → DevOps → Qualidade`. Não altera regras de cobertura,
déficit, distância, marcadores ou ingestão.

## Execução em 2026-09-22

- **Blocos 1 e 2 concluídos:** contrato de senha temporária removido;
  administrador envia redefinição por e-mail; tokens usam fragmento e body,
  nunca querystring; logs de exceção não registram querystring.
- **Bloco 3 parcialmente concluído:** headers de hardening e CSP em enforcement
  foram declarados no frontend; cache da API é `no-store`. A confirmação no
  domínio publicado ainda depende do próximo deploy e da observação dos fluxos
  de mapa e exportação.
- **Bloco 4 parcialmente concluído:** override de `uuid` removeu o advisory;
  CI frontend passou a auditar npm e CI backend executa `pip-audit`. O limiter
  aceita URI de storage compartilhado, mas sua ativação depende de secret e
  serviço operacional ainda não configurados.

## Escopo de segurança e decisões já fechadas

| Fluxo | Dado sensível | Regra obrigatória |
|---|---|---|
| Reset administrativo | Senha temporária | Nunca retornar, exibir, copiar ou registrar senha em claro. |
| Convite/redefinição | Token opaco de uso único | Nunca enviar em querystring; somente fragmento no link e body no POST. |
| Sessão | Access/refresh/CSRF | Manter cookies atuais, rotação, revogação e CSRF; não reintroduzir bearer/localStorage. |
| Frontend publicado | Documento HTML, assets e API | CSP e headers devem ser configurados no host que serve o React, não apenas na API. |

Decisões que **não** serão inventadas neste plan-mode:

- provedor/credencial de rate limit distribuído e domínios definitivos para
  `TrustedHostMiddleware` dependem de definição operacional;
- retenção, base legal e descarte de artefatos ricos exigem o inventário LGPD;
- nenhuma captura bruta será apagada só porque não tem consumidor de código.

## Bloco 1 — substituir senha temporária por reset seguro (P0)

### Alteração

1. Remover o caso de uso que gera e devolve senha temporária:
   `resetar_senha`, `UserResetPasswordResponse`,
   `POST /usuarios/{id}/resetar-senha`, o client/hook e o diálogo de cópia.
2. Criar ação administrativa autenticada somente para `admin`, por exemplo
   `POST /usuarios/{id}/enviar-redefinicao`, que reutiliza o token opaco,
   hash e expiração já existentes no fluxo `esqueci-senha`.
3. A ação gera token com `secrets.token_urlsafe(32)`, persiste apenas
   SHA-256, expira em 30 minutos, envia e-mail e registra em `AuditLog` só
   a ação/usuário-alvo — nunca token, senha ou URL.
4. A redefinição bem-sucedida mantém a revogação de todos os refresh tokens
   do usuário e a emissão da nova sessão atual.
5. Sem gateway de e-mail configurado, a ação administrativa falha de forma explícita e
   sem criar/retornar senha alternativa.

### Arquivos prováveis

- `backend/app/services/usuarios.py`, `backend/app/routers/usuarios.py`,
  `backend/app/schemas.py`, `backend/app/email.py`;
- `backend/tests/test_usuarios.py` e testes de autenticação;
- `frontend/src/services/usuarios.ts`, `frontend/src/hooks/useUsuarios.ts`,
  `frontend/src/pages/usuarios-page.tsx` e
  `frontend/src/components/features/usuario-dialog-resetar-senha.tsx`.

### Contratos e riscos

- A resposta passa a ser somente `{"status":"ok"}` ou DTO de usuário; não
  pode conter campo cujo nome ou conteúdo seja senha.
- Remover o diálogo/serviço é limpeza de contrato morto, não ocultação de UI.
- O endpoint atual é um contrato breaking interno; não manter rota de
  compatibilidade que continue devolvendo senha.

### Aceite

- Teste HTTP prova que apenas admin pode solicitar o reset, que a resposta não
  contém senha e que `AuditLog.details` não contém segredo.
- Teste de redefinição confirma login com a nova senha escolhida pelo usuário,
  e refresh antigo revogado.
- `rg` não encontra `senha_temporaria`, `UserResetPasswordResponse` nem
  componente de cópia de senha em código ativo.

## Bloco 2 — tirar token de URL e preservar convite/reset (P1)

### Alteração

1. Alterar `enviar_link` para formar `/ativar#token=<valor>` ou
   `/redefinir-senha#token=<valor>`; fragmentos não chegam ao servidor nem
   aos logs HTTP.
2. Alterar `AccountActionPage` para ler `location.hash`, normalizar o token,
   limpar o fragmento com `history.replaceState` antes de qualquer navegação
   externa e enviar o valor somente no body HTTPS do POST já existente.
3. Não aceitar token por querystring como compatibilidade. Antes do deploy,
   aguardar a janela máxima de 30 minutos dos links já enviados ou revogar os
   tokens pendentes e reenviar convite/reset por ação explícita.
4. Trocar o log de exceção para registrar método e `request.url.path`, nunca
   querystring; preparar helper central de redaction para campos sensíveis.

### Aceite

- Testes unitários de e-mail e frontend provam que o link não contém
  `?token=` e que o fragmento não permanece na barra após a página ler o
  valor.
- Testes HTTP provam que token ainda é de uso único, expira e não aparece em
  erros/auditoria.
- Busca estática não encontra geração/leitura de `?token=` em fluxos de conta.

## Bloco 3 — headers efetivos e cache seguro no frontend (P1)

### Fase 3.1: inventário e report-only

1. Listar as origens realmente necessárias: API, Vercel, fontes, tiles e
   GeoJSON/serviços de mapa, imagens e exportação.
2. Declarar em `frontend/vercel.json` headers de report-only para o documento
   React, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e proteção de
   frame. Configurar `Cache-Control: no-store` no backend para respostas de
   API autenticadas que possam conter dado interno; não aplicar essa diretiva
   cegamente aos assets estáticos versionados da Vercel.
3. Preservar HSTS no backend, aplicando-o somente em tráfego HTTPS de
   produção; não induzir política HSTS em desenvolvimento HTTP local.

### Fase 3.2: enforcement

1. Coletar violações em ambiente publicado por período acordado e registrar
   cada origem legítima antes de alterar a política.
2. Promover para `Content-Security-Policy` efetiva com `default-src 'self'`,
   `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` e somente
   as origens inventariadas por diretiva.
3. Validar login, refresh/CSRF, mapa, fontes, exportações e rotas SPA em
   navegador real. Não liberar uma CSP que apenas funcione no build local.

### Aceite

- Cabeçalhos são verificados na URL publicada do frontend e na API, não só por
  teste unitário.
- Nenhuma violação CSP legítima permanece sem decisão documentada.
- Respostas autenticadas não ficam em cache compartilhado.

## Bloco 4 — abuso, CI e dependências (P1; interface com DevOps)

### Dependência `exceljs → uuid`

1. Reproduzir a exportação XLSX/PDF em fixture representativa e identificar se
   o uso passa buffer às APIs v3/v5/v6 de `uuid`.
2. Selecionar upgrade/override compatível que elimine GHSA-w5hq-g745-h8pq;
   atualizar lockfile somente após os testes de exportação.
3. Falha de auditoria alta/crítica deve bloquear CI; moderada conhecida só
   pode permanecer com exceção versionada, prazo, responsável e mitigação.

### Pipeline

1. Criar job backend de lint/testes e `pip-audit`; acrescentar `npm audit` ao
   CI frontend; configurar secret scan e SAST/CodeQL.
2. Declarar `permissions: read-all` como base e elevar permissões só no job
   que prove necessidade; fixar actions por SHA revisada, não tags mutáveis
   nem `setup-uv@latest`.
3. Registrar relatórios de auditoria sem imprimir valores de secrets.

### Rate limit distribuído

1. Antes de implementação, decidir provedor compartilhado e custo/operador
   (por exemplo Redis gerenciado) e onde guardar a URL/credencial.
2. Depois da decisão, usar storage compartilhado para login, refresh,
   ativação, esqueci-senha e redefinição; preservar respostas 429 genéricas e
   aplicar chave por IP e identidade normalizada sem registrar senha/token.
3. Adicionar métricas/alertas para picos de 401, 403, 429 e reset.

## Bloco 5 — hardening operacional e LGPD (P2; plan-mode separado se não houver decisão)

- Criar inventário de dados: campo, fonte, classificação, finalidade,
  controlador de acesso, retenção e descarte.
- Definir redaction/allowlist de `AuditLog.details` e política de retenção.
- Configurar `TrustedHostMiddleware` somente quando domínios de produção e
  preview estiverem definidos; não usar whitelist hipotética.
- Revisar `docs/monitoramento-equipamentos/transferegov.html`: confirmar
  origem, necessidade de auditoria e prazo. Se for morto, remover somente
  após `rg`, atualização de links e registro de checksum/decisão.

## Atualização obrigatória de contexto e limpeza

Na mesma entrega de cada bloco:

- atualizar `AGENTS.md`, README e o diagnóstico de 2026-09-22 com estado e
  evidências reais;
- corrigir no diagnóstico de 2026-09-16 as afirmações que descrevem CSRF ou
  bearer como pendentes, mantendo o relato histórico identificado por data;
- remover comentários que ainda justifiquem senha temporária por ausência de
  gateway de e-mail, junto com o código morto correspondente;
- não apagar capturas/documentos históricos sem decisão de retenção.

## Sequência de validação e entrega

1. Rodar testes backend de auth, usuários, CSRF e validação com
   `TEST_DATABASE_URL` no PostgreSQL isolado do OrbStack.
2. Rodar testes frontend do fluxo de ativação/redefinição e do diálogo
   administrativo removido/substituído, além de typecheck, lint e build.
3. Executar `pip-audit` e `npm audit`; validar exportações se o lockfile mudar.
4. Verificar por busca estática: sem senha temporária em API/UI, sem token em
   querystring, sem segredo versionado.
5. Testar em navegador publicado: headers, CSP, login, convite, reset,
   logout, mapa e exportação.
6. Atualizar o diagnóstico com resultados, itens externos não comprovados e a
   nova nota; só então considerar a etapa Segurança encerrada.

## Fora de escopo desta execução

- Troca de PBKDF2 para Argon2id, que exige plano de migração de hashes;
- decisão de escopo por técnico/UF/órgão para autorização;
- implantação de Redis, monitoramento externo, domínios/hosts e políticas de
  retenção sem autorização operacional explícita;
- exclusão de arquivos históricos não comprovadamente mortos.
