# Plan Mode — Fechamento Final do SIGEO (2026-09-25)

## Contexto

A auditoria sênior de 2026-09-25 cruzou os diagnósticos mais recentes de cada
domínio (`diagnostico-constituicao-{backend,frontend,database,seguranca,
qualidade,devops}-*.md`) contra o código/infra atuais. Nenhum domínio tem
nota abaixo de 8,8/10 e não há item **Crítico** aberto. O que resta é uma
lista finita de dívidas conhecidas, várias delas já adiadas em rodadas
anteriores (o próprio backend cita duas vezes "envelope HTTP adiado por ser
breaking change, sem Plan Mode coordenado"). Este plano fecha essa lista de
uma vez, no mesmo formato dos `planmode-fechamento-*` anteriores (qualidade
2026-09-24, devops 2026-09-23): blocos com Implementação/Aceite, ordem
obrigatória, e uma seção final separando o que é executável pela engenharia
do que é decisão de custo/produto externa (documentado, não implementado).

**Decisão do usuário (2026-09-25):** escopo é cobertura completa (inclui os
itens de custo/produto, documentados como pendência formal) e o envelope
HTTP `{success, data, meta}` entra como bloco prioritário — é a dívida mais
citada cruzando backend e frontend, e desbloqueia paginação/virtualização
real.

**Achado ao vivo durante o planejamento:** os commits `eb66273`/`bcf3a1b`
(deploy de 25/09, papel `gestor` no RBAC — `backend/app/db/models.py:40`,
`authz.py`, `useAuthSession.ts`, `services/usuarios.ts`) chegaram depois do
snapshot da auditoria. Isso avança parcialmente o item de diferenciação de
papéis (Bloco 10) — reduz o escopo desse bloco para "avaliar se `gestor`
cobre a necessidade de escopo por técnico/UF/órgão", não mais "papel
inexistente".

## Regras transversais

- Mesmas regras já vigentes no repo: testes só com fixture sintética/
  Postgres de teste, nunca Neon/produção; correção de bug ganha teste de
  regressão no mesmo bloco; sem `skip`/baseline genérica para maquiar gate;
  Repository função solta com `db` posicional (nunca commita), Service
  `*, db: Session` keyword-only (único que commita, levanta `DomainError`).
- Migration de schema é sempre passo manual/isolado (`DATABASE_URL_MIGRATION`,
  `.github/workflows/migrar_banco.yml`), nunca acoplada a boot/deploy/CI.
- Nenhuma mudança de contrato HTTP quebra consumidor sem migrar o
  consumidor no mesmo bloco (backend e frontend andam juntos no Bloco 1).
- Ao final de cada bloco: rodar os gates afetados (`ruff`/`mypy`/`pytest`
  backend, `lint`/`typecheck`/`test`/`build` frontend) e atualizar o
  diagnóstico do domínio correspondente com a evidência.
- Decisão de custo/infra externa (Render/Neon/GitHub plano pago) nunca é
  tomada implicitamente por este plano — fica registrada como pendência
  formal na seção final, aguardando aprovação explícita do usuário.

## Ordem obrigatória

```text
0. Higiene imediata (trabalho não commitado)
1. Contrato HTTP unificado (envelope + migração evidencia_transferegov)
2. Decomposição de monitoramento.py (Router→Service→Repository completo)
3. Paginação/virtualização real no frontend (depende do bloco 1)
4. E2E autenticado como gate de CI do frontend
5. Rate limit distribuído (backend + infra)
6. Hardening de segurança (CSP, TrustedHostMiddleware, KDF, SAST/SBOM)
7. Database: tabelas mortas, ensaio de migração de servidor, dataset sintético
8. Saneamento de dados do monitoramento (PERSUS/fase/marcos)
9. Limpeza de código morto e comentários desnecessários (todo o repo)
10. Governança de acesso (reavaliar papel gestor vs. escopo técnico/UF/órgão)
11. Fechamento (diagnósticos, CLAUDE.md e demais arquivos de contexto)
```

Blocos 0–9 são executáveis pela engenharia. Bloco 10 é parcialmente produto
(reavaliação, não implementação cega). A seção **"Pendências externas / de
custo"** ao final lista o que fica fora de qualquer bloco por depender de
aprovação financeira ou decisão de negócio não tomada ainda.

## 0. Higiene imediata

### Implementação
1. Revisar e commitar o trabalho em andamento de filtros por CNES
   (`planmode-filtros-cnes-2026-09-25.md`): `convenio-card-header.tsx`,
   `monitoramento-overview-lista.tsx`, `secao-propostas-candidatas.tsx`,
   `filtrar-dados-oficiais.ts`, `monitoramento-equipamentos-page.tsx` + os
   3 arquivos de teste novos.
2. Confirmar `npm run lint && npm run typecheck && npm run test && npm run
   build` verdes antes do commit (já reportado verde pela auditoria, apenas
   revalidar).

### Aceite
- `git status` limpo nesses arquivos; commit único e coerente com o
  plan-mode de filtros CNES já existente.

### Andamento — concluído em 2026-09-25

Commitado (`d624afa`, `c9f9f7d`). Sem alteração de escopo.

## 1. Contrato HTTP unificado — envelope `{data, meta}`

### Andamento — concluído em 2026-09-25, escopo reduzido

Duas correções de curso feitas ao vivo durante a execução (registradas com
detalhe em `diagnostico-constituicao-backend-2026-09-22.md`, seção "Envelope
HTTP — escopo reduzido e pendência de ingestão"):

- **`monitoramento/{marcos,instrumentos,acoes}`, `macro-coverage`,
  `municipality-coverage`, `health-region-coverage` ficaram FORA do
  escopo** — são teto de segurança deliberado (Bloco 4 do Plan Mode
  consolidação 2026-09-17), com volume muito abaixo do teto (23 marcos,
  86-91 instrumentos, ~121 macrorregiões). Envelopá-las agora seria
  paginação fictícia. Continuam `list[X]` puro.
- **Migração `metas_resumo` → `evidencia_transferegov` removida do
  bloco** — a tabela não tem nenhum escritor (só o schema da migration
  `b7e3d9f4a621`); migrar o router leria dado vazio. Vira pendência
  registrada no diagnóstico de backend, não implementação: falta um
  plan-mode dedicado pro job de ingestão antes de qualquer migração de
  leitura.

O que foi feito: `EquipmentOfferRowPage`/`EstablishmentPage`
(`backend/app/schemas.py`) migraram para `{data: list[T], meta: PageMeta}`
— as únicas duas rotas com paginação real (offset/limit de verdade).
`backend/app/routers/equipment_offer.py` (4 pontos de construção),
`backend/tests/test_equipment_offer_contracts.py` (asserts) e
`frontend/src/services/api.ts` (`establishmentPageApiSchema`,
`fetchEstabelecimentosPage`) atualizados. `EstabelecimentosResult` (tipo de
domínio do frontend, `{items, total}`) não mudou — só o schema de fio
(`establishmentPageApiSchema`) foi migrado, isolando o resto da UI da
mudança de contrato.

Achado extra: `GET /equipment-offer-rows` (rota base, sem `/establishments`)
não tem nenhum consumidor no frontend hoje — `fetchEquipmentOfferRows`
citado na matriz de contratos nunca existiu em `services/api.ts`. Marcado
como candidato de revisão no Bloco 9 (limpeza), não removido agora.

Gates: `ruff check .` e `mypy .` limpos; `pytest tests/test_equipment_offer_
contracts.py` tem 5 falhas pré-existentes (confirmado via `git stash` que
já falhavam antes desta mudança — dependem de fixture de Postgres isolado
não disponível neste ambiente local, mesmo padrão dos 116 skips da suíte
completa); os 2 asserts que a mudança de fato afeta (`total`→`meta.total`,
`items`→`data`) passam. Frontend: lint, typecheck, 113/113 testes e build
verdes.

### Aceite
- Toda rota migrada documentada em `contratos-http-sigeo.md` com o novo
  shape.
- Backend e frontend fazem deploy coordenado (mesmo PR ou PRs sequenciais
  na mesma janela) — nunca back cortado sem front atualizado.
- Testes de contrato HTTP (já existentes, ver matriz) atualizados para o
  novo shape; nenhum consumidor quebrado (`npm run build` + smoke E2E).

## 2. Decomposição de `monitoramento.py`

### Implementação
1. Completar a migração Router→Service→Repository que já cobre a fatia de
   leitura (`listar_instrumentos`, `obter_timeline_instrumento`) para a
   fatia de escrita: eventos, ações, `atualizar_cadastro`, `obter_resumo`.
2. Seguir o padrão de referência já estabelecido em
   `repositories/propostas_candidatas.py` +
   `services/propostas_candidatas.py` (Repository função solta,
   `db: Session` posicional, nunca commita; Service `*, db: Session`
   keyword-only, único que commita, levanta `DomainError`).
3. Mover os 5 `commit()` hoje no router (achado explícito do diagnóstico de
   backend) para dentro dos Services correspondentes.
4. Não reescrever regra de negócio — só mover código de lugar, com testes
   de regressão cobrindo o comportamento atual antes de mover.

### Aceite
- `routers/monitoramento.py` fica fino (só `Depends`, chama Service,
  `response_model`) — mesmo critério usado para `notificacoes.py`.
- `pytest` cobre os Services novos com os mesmos casos já testados no
  router antigo, sem perda de cobertura.

### Andamento — concluído em 2026-09-25, escopo menor que o previsto

Achado ao vivo (detalhado em `diagnostico-constituicao-backend-2026-09-22.md`,
seção "Bloco 2 do fechamento"): a fatia de escrita (eventos, ações,
`atualizar_cadastro`) **já estava decomposta** — os 8 endpoints de mutação
já delegavam pra `services/monitoramento_eventos.py`/
`monitoramento_instrumentos.py`, zero `db.commit()` no router. O achado
"5 commits no router" do diagnóstico original estava desatualizado.

O que restava de verdade: `obter_resumo` (~135 linhas de cálculo inline).
Extraído para `services/monitoramento_resumo.py::montar_resumo_monitoramento`;
os 5 schemas de resposta migraram para `schemas_monitoramento.py` (evita
import circular). Router ficou fino. Validado contra Postgres de teste
real (container `sigeo-db-constitution-test`): 229/232 (3 falhas
pré-existentes, container atrasado em migration, confirmado via
`git stash`). `ruff`/`mypy` limpos.

## 3. Paginação/virtualização real no frontend

### Implementação
1. Depende do Bloco 1 (precisa de `meta.total`/`meta.cursor` real).
2. Introduzir paginação real (offset ou cursor, a decidir pela forma que o
   backend expôs no Bloco 1) nas listas que hoje só têm teto de segurança
   sem UI de paginação: instrumentos monitorados, oferta de equipamentos,
   cobertura municipal.
3. Virtualização client-side (`@tanstack/virtual` ou equivalente) só onde
   o volume real já se aproxima do teto — não adicionar biblioteca nova
   para listas pequenas (seguir a preferência de "opção mais leve" já
   registrada nas convenções do projeto).

### Aceite
- Lista renderiza mais páginas sem carregar teto inteiro de uma vez.
- Nenhuma regressão visual (validar nas 3 telas migradas via dev server).

### Andamento — já satisfeito, sem trabalho necessário (2026-09-25)

Achado ao vivo: `estabelecimento-table.tsx` já consome
`useEstabelecimentosPage` (`page`/`pageSize=50` reais, offset/limit de
verdade no backend) e já renderiza `<Pagination>` — a ÚNICA rota com
paginação real de backend (establishments, ver Bloco 1) já tem paginação
real de frontend ponta a ponta, de antes deste plan-mode. As demais listas
cogitadas (instrumentos monitorados, macro-coverage, cobertura municipal)
foram excluídas do escopo no Bloco 1 — teto de segurança deliberado, não
paginação de UI, sem necessidade real. Nenhum código alterado neste bloco.

## 4. E2E autenticado como gate de CI (frontend)

### Implementação
1. O E2E já existe e passa localmente (`e2e/login.spec.ts`, cenários de
   redirecionamento, login, responsividade). Falta só cabear no CI.
2. Seguir o mesmo padrão que o backend já implementou em `e2e_ci.yml`
   (citado no diagnóstico de qualidade como já existente e verde) — este
   bloco é sobre garantir que o `frontend_ci.yml` também dispara/depende
   dele, não recriar infraestrutura.
3. Confirmar `E2E_EMAIL`/`E2E_SENHA` como secrets de repositório, nunca
   hardcoded; `E2E_ISOLATED_DATABASE=true` obrigatório.

### Aceite
- PR com regressão em login/sessão/responsividade falha o gate.
- Nenhum secret aparece em log/trace/artifact.

### Andamento — já satisfeito, sem trabalho necessário (2026-09-25)

Achado ao vivo: `.github/workflows/e2e_ci.yml` já existe (commits
`fc4e7d8`/`2b8ed1a`/`bcc8647`, anteriores a este plan-mode) e já dispara em
push/PR tocando `backend/**` **e** `frontend/**` — não só `backend/**`.
Sobe Postgres efêmero, aplica migration, semeia dado sintético, provisiona
conta E2E, instala Chromium, sobe API+frontend isolados e roda
`npm run test:e2e`. É um workflow separado de `frontend_ci.yml` (por isso
a auditoria original, que só verificou `frontend_ci.yml`, concluiu
erroneamente que o E2E não rodava em CI). Nenhuma mudança necessária.

## 5. Rate limit distribuído

### Implementação
1. Trocar `Settings.rate_limit_storage_uri` default de `memory://` para
   um backend compartilhado (Redis gerenciado, ou storage já disponível na
   infra atual) em produção — manter `memory://` como default só para
   dev/teste local (`app/config.py:71`).
2. Validar que múltiplos workers/instâncias do Render respeitam o mesmo
   limite de `/auth/login` (5/min) e `/auth/refresh` (30/min).
3. Isso tem componente de infra (provisionar Redis) — coordenar com o
   Bloco de DevOps antes de mudar o default em produção.

### Aceite
- Teste de integração simulando 2 processos concorrentes contra o mesmo
  storage confirma limite compartilhado.
- `runbook-devops.md` documenta a nova dependência.

### Andamento — movido para pendência externa (2026-09-25)

Decisão do usuário: não há Redis/storage compartilhado provisionado pra
esta conta ainda. Mesmo critério dos itens de custo — fica documentado na
seção "Pendências externas / de custo" ao final deste plano, não
implementado agora. Implementar quando houver um storage real pra apontar.

## 6. Hardening de segurança

### Implementação
1. Promover `Content-Security-Policy-Report-Only` da API para enforcement
   — só depois de confirmar (via logs/relatório de violação já coletado)
   que não há falso positivo real bloqueando fluxo legítimo.
2. Adicionar `TrustedHostMiddleware` (`backend/app/main.py`) com a lista
   de hosts esperados (Render + domínio próprio).
3. Migrar KDF de PBKDF2-HMAC-SHA256 para `argon2id` — path de migração
   gradual (verificar hash antigo no login, re-hash com argon2id na
   primeira autenticação bem-sucedida, sem forçar reset em massa).
4. Consolidar SAST/secret scan/SBOM num único relatório de gate (os
   workflows já existem — `secret_scan.yml`, `static_security.yml`,
   `supply_chain.yml` — este bloco é sobre garantir cobertura completa e
   fixar por SHA os que ainda não estão).

### Aceite
- CSP enforcement ativo sem quebrar nenhum fluxo real (validado em staging
  ou janela de observação antes do enforcement).
- Login com hash antigo continua funcionando durante a transição
  argon2id; novo hash é argon2id após primeiro login pós-deploy.

### Andamento — 3 de 4 concluídos em 2026-09-25; CSP fica pendente

- **argon2id**: `hash_password`/`verify_password` (`app/auth.py`) migrados
  — `hash_password` só produz argon2id (`argon2-cffi`, dependência nova);
  `verify_password` detecta formato pelo prefixo (`pbkdf2_sha256$` vs
  argon2) e valida com o algoritmo certo. `precisa_rehash` (novo) decide
  se um hash existente precisa migrar (todo PBKDF2 legado, ou argon2id
  cujos parâmetros do hasher mudaram). `routers/auth.py::login` re-hasheia
  silenciosamente no primeiro login bem-sucedido pós-deploy — sem reset em
  massa, sem exigir troca de senha do usuário.
- **TrustedHostMiddleware**: adicionado em `app/main.py`, depois do CORS
  no código (Starlette empilha em ordem reversa, então roda ANTES do
  CORS). `Settings.allowed_hosts`/`allowed_hosts_lista` (`app/config.py`)
  — default `localhost,127.0.0.1,*.onrender.com` (nome do serviço Render,
  `render.yaml::name = sieo-backend`, sem domínio customizado hoje).
  `tests/conftest.py` adiciona `testserver` só no ambiente de teste
  (`os.environ.setdefault`, nunca no default de produção) — `TestClient`
  sem `base_url` explícito manda `Host: testserver` por convenção do
  Starlette.
- **SAST/secret scan/SBOM**: já cobertos e já fixados por SHA em todos os
  10 workflows (`secret_scan.yml`, `static_security.yml`,
  `supply_chain.yml` + os demais) — confirmado por grep, zero `uses:` sem
  pin de SHA. Nenhuma mudança necessária (achado do diagnóstico de devops
  já estava resolvido).
- **CSP enforcement — não promovido**: fica em
  `Content-Security-Policy-Report-Only`. Promover exige confirmar contra
  relatório real de violação em produção (dado que esta sessão não tem
  acesso a logs/observabilidade ao vivo) — registrado na seção
  "Pendências externas" ao final, não uma decisão de custo mas de
  observação operacional que só quem tem acesso ao New Relic/logs de
  produção pode fechar com segurança.

Validado: `ruff check .`/`mypy .` limpos; suíte completa contra Postgres
de teste real 229/232 (mesmas 3 falhas pré-existentes do container
atrasado em migration); `test_auth_session.py`/`test_usuarios.py`/
`test_csrf.py` rodados isoladamente (fresh process) — 100% verdes,
incluindo os fluxos de login/senha que o argon2id toca diretamente.
Frontend inalterado (`lint`/`typecheck` confirmados limpos, bloco é só
backend).

## 7. Database — tabelas mortas e migração de servidor

### Implementação
1. Decisão formal (usuário) sobre `equipamento_alias` e `execution_alert`
   — se confirmado sem uso, `DROP TABLE` via migration Alembic dedicada,
   com backup prévio.
2. Ensaiar `pg_dump`/`pg_restore` ponta a ponta num ambiente descartável:
   dump do Neon atual → restore em instância nova → `alembic current` →
   smoke test da API contra o restore. Documentar o runbook resultante.
3. Definir e criar o dataset sintético/anonimizado de desenvolvimento
   (pendente desde 16/09) — escopo mínimo: volume pequeno, sem PII real,
   cobrindo os cenários de teste que hoje dependem de fixture ad hoc.

### Aceite
- Runbook de migração de servidor testado e documentado, não só
  especificado.
- `equipamento_alias`/`execution_alert` removidas ou justificadas com
  data de reavaliação.

## 8. Saneamento de dados do monitoramento (PERSUS)

### Implementação
1. Tratar os furos já mapeados pela auditoria de qualidade como
   saneamento de dado, não bug de schema: 85 instrumentos sem fase direta,
   141 marcos sem vínculo de fase, 6 ocorrências com data futura, 16
   inaugurações sem conclusão direta, 33 ocorrências PERSUS não
   mapeáveis.
2. Script de reconciliação one-shot (seguindo o mesmo padrão já usado na
   limpeza de 33 grupos duplicados de 2026-09-19 — `substituido_por_id`,
   nunca `UPDATE`/`DELETE` físico), revisado caso a caso com a equipe
   antes de aplicar em produção.
3. Casos que não batem em heurística simples ficam de fora, documentados,
   igual aos 16 grupos deixados de fora na limpeza anterior.

### Aceite
- Contagem de furos cai para o que for efetivamente irreconciliável sem
  decisão manual da equipe (registrado, não escondido).
- `AuditLog` registra cada correção em lote.

## 9. Limpeza de código morto e comentários desnecessários

Bloco transversal — roda por último entre os blocos de engenharia, depois
que 1–8 já moveram/removeram código, para não limpar algo que um bloco
anterior ainda ia tocar (evita retrabalho e diffs cruzados confusos).

### Implementação
1. **Arquivo sem consumidor real** — varredura por grep/import graph em
   `backend/app/` e `frontend/src/`, mesma heurística já usada no Bloco 12
   do Plan Mode frontend de 17/09 (achou `data-surface.tsx`/
   `metric-strip.tsx`). Candidatos já registrados e nunca fechados:
   `frontend/src/hooks/useJson.ts` (candidato desde 17/09, nunca
   confirmado); revalidar `equipamento_alias`/`execution_alert` do Bloco 7
   entram aqui se a decisão for manter o schema e só remover consumo morto
   em vez de `DROP TABLE`.
2. **Comentários datados/históricos remanescentes** — mesma poda já feita
   em `services/{api,convenios,monitoramento}.ts` e páginas de
   monitoramento (Plan Mode frontend 17/09): achados do tipo "achado
   2026-09-XX, pedido do usuário: '...'" ainda existentes em arquivos que
   NÃO foram cobertos naquela rodada — checar especificamente
   `secao-propostas-candidatas.tsx` (explicitamente deixado de fora na
   época porque seria dividido depois — já foi dividido no Bloco 5 do
   mesmo Plan Mode, então a poda de comentário agora não tem mais motivo
   pra ficar pendente) e os componentes tocados pelos Blocos 1–3 deste
   plano (novos arquivos de service/schema do envelope HTTP não devem
   nascer com comentário histórico).
3. **Backend**: reconfirmar por grep que os 3 schemas mortos já removidos
   (`ErrorResponse`, `UserCreate`, `TokenPayload`) não voltaram; aplicar o
   mesmo crivo (zero consumidor real, confirmado por grep antes de
   remover) a qualquer função/endpoint que os Blocos 1–2 tenham deixado
   sem chamador depois da migração de contrato (ex. serialização antiga
   do `metas_resumo` se `evidencia_transferegov` assumir 100% do
   consumo).
4. **CSS/estilo morto**: reaplicar a mesma varredura que já removeu
   `.card-group`/`.table-editorial`/`.kpi-row`/`.table-scroll`/`.kpi`
   de `index.css` — checar se sobrou algo introduzido depois de 17/09
   sem consumidor (ex. classes ad hoc dos filtros CNES do Bloco 0).
5. **Regra do que NÃO remover** (herdada das rodadas anteriores, não
   reabrir por engano): migrations históricas do Alembic, adaptadores
   TransfereGov/SICONV documentados como compatibilidade proposital,
   comentários que carregam o *why* de uma decisão não óbvia (constraint
   escondida, workaround de bug específico) — só remover o comentário
   *narrativo* datado ("fulano pediu X em tal dia"), nunca o *raciocínio*
   técnico que ajuda a entender uma decisão não óbvia.

### Aceite
- `ruff check .`/`oxlint` sem novo achado de import não usado após a
  limpeza (a remoção não pode introduzir regressão de lint).
- Nenhum arquivo removido sem confirmação por grep de zero
  importador/consumidor real — mesmo padrão de cautela já usado nas
  rodadas anteriores (`DataSurface` removido só depois de não achar
  ponto de encaixe; `useJson.ts` registrado como candidato, não removido
  sem busca adicional — esse bloco é a busca adicional pendente).
- Diff de limpeza fica isolado do diff funcional de cada bloco (commit
  próprio de limpeza por área, não misturado com o commit que implementa
  o bloco 1–8 correspondente).

## 10. Governança de acesso

### Implementação
1. Com o papel `gestor` já em produção (commits `eb66273`/`bcf3a1b`),
   avaliar com o usuário se ele cobre a necessidade de "escopo por
   técnico/UF/órgão" apontada nos diagnósticos de segurança, ou se ainda
   falta um nível de granularidade (ex. gestor vinculado a uma UF
   específica vs. gestor global).
2. Só desenhar/implementar granularidade adicional após essa decisão —
   não implícito neste plano.

### Aceite
- Decisão registrada (mantém 4 papéis globais, ou avança para escopo por
  UF/técnico) — vira novo plan-mode dedicado se a resposta for "avançar".

## 11. Fechamento

### Implementação
1. Atualizar os 6 diagnósticos (`diagnostico-constituicao-*`) com o
   resultado final de cada bloco, incluindo o que a limpeza do Bloco 9
   efetivamente removeu (arquivo/CSS/comentário — não só "foi feito").
2. Atualizar `CLAUDE.md` (par_equipamentos) com as decisões de arquitetura
   tomadas neste fechamento (envelope HTTP, papel gestor, dataset
   sintético) e remover deste próprio arquivo qualquer menção a pendência
   que este plano tiver fechado, para não deixar o contexto desatualizado
   logo depois de escrito.
3. Revisar `AGENTS.md`/READMEs de `backend/`/`frontend/` quanto a comandos,
   estrutura ou convenção que os blocos 1–9 tenham mudado (ex. novo helper
   de envelope HTTP, novo Service de monitoramento).
4. Registrar nota final por domínio e lista do que ficou formalmente fora
   de escopo (seção abaixo).

## Validação final

```bash
cd backend
uv run ruff check .
uv run mypy .
uv run pytest --cov --cov-branch

cd ../frontend
npm run lint
npm run typecheck
npm run test -- --coverage
npm run build
npm run test:e2e
```

## Pendências externas / de custo (fora de execução de engenharia)

Documentadas, não implementadas por este plano — exigem aprovação
financeira ou decisão de produto explícita antes de qualquer trabalho:

- Rate limit distribuído do Bloco 5 (`Settings.rate_limit_storage_uri`
  `memory://` → storage compartilhado) — sem Redis/serviço gerenciado
  provisionado ainda (decisão do usuário, 2026-09-25).
- Promoção de `Content-Security-Policy-Report-Only` para enforcement
  (Bloco 6) — precisa de relatório real de violação em produção antes de
  promover; esta sessão não tem acesso a logs/New Relic ao vivo pra
  confirmar ausência de falso positivo.
- Staging/registry de imagem promovível no Render (decisão de custo).
- Backup externo / PITR acima de 6h no Neon (decisão de custo).
- Instância sempre ativa no Render ou migração para outro provedor, para
  eliminar cold start (decisão de custo).
- CodeQL nativo e proteção de branch nativa do GitHub (exigem plano pago).
- Matriz formal de classificação/retenção/expurgo LGPD (decisão de
  produto/jurídico, não só engenharia).
- Granularidade de autorização por técnico/UF/órgão além do papel
  `gestor` atual (depende da decisão do Bloco 10).

## Estado de execução

Nenhum bloco executado ainda — este documento registra o plano aprovado em
2026-09-25, pronto para início pelo Bloco 0.
