# Diagnóstico sênior — Constituição Backend (rodada 3, 2026-09-22)

## Objetivo, escopo e método

Esta rodada sucede o diagnóstico de Backend de 2026-09-16/17 e usa o mesmo
fluxo aplicado a Database e Segurança: leitura da Constituição e do relatório
anterior, inventário estático, validação controlada no PostgreSQL isolado do
OrbStack, verificação de qualidade e identificação de código/comentários e
contexto defasados. Não houve alteração de regra de negócio, schema ou dado de
produção durante este diagnóstico.

Foram revisados `backend/app`, `backend/scripts`, testes, configurações de
qualidade e workflows. Configurações externas de Render, Neon, Vercel e GitHub
não são consideradas comprovadas apenas porque possuem referência no código.

## Resultado executivo

**Conformidade atual: 8,8/10** (medição inicial desta rodada: 6,9/10;
última nota consolidada anterior: 7,8/10).

A segurança de fronteira e o comportamento funcional seguem sólidos: sessão
por cookie, CSRF, autorização, erros sem payload sensível e a suíte completa
passaram. Após a execução do plan-mode, `ruff check .` e `mypy .` são gates
reais no CI; monitoramento passou à fronteira Router → Service → Repository;
e as integrações externas críticas validam contratos antes da normalização.
Os itens abaixo preservam a fotografia inicial e o fechamento posterior
registra o estado vigente sem apagar o histórico do diagnóstico.

| Eixo | Nota | Evidência resumida |
|---|---:|---|
| Segurança de fronteira | 8,4 | Sessão, CSRF e autorização cobertos por testes; pendências operacionais estão no diagnóstico de Segurança. |
| Banco, transação e idempotência | 8,4 | Migrations e rotação atômica preservadas; migration nova foi testada em upgrade/downgrade no PostgreSQL isolado. |
| Arquitetura em camadas | 7,8 | Monitoramento está na fronteira Repository → Service → Router; demais domínios seguem como evolução incremental. |
| Contratos, tipagem e integrações | 8,6 | DTOs e evidência relacional auditável cobrem integrações críticas; o envelope HTTP versionado é decisão futura. |
| Resiliência, listas e volume | 7,8 | Tetos e paginação nas partes críticas; telemetria externa informa duração/falha sem expor payload. |
| Testes e gates | 9,5 | `ruff check .`, `mypy .` e 183 testes no PostgreSQL isolado passam; 8 pulados dependem de integrações opcionais. |
| Observabilidade e operação | 8,0 | Logs JSON, correlação e duração de rota/chamada externa implementados; métricas e alertas centralizados são evolução DevOps. |
| Código morto e contexto | 8,6 | Contextos corrigidos; nenhum script foi removido sem prova de que deixou de ser entrypoint operacional. |

## Evidências executadas

```text
TEST_DATABASE_URL=<PostgreSQL isolado OrbStack> uv run pytest
165 passed, 8 skipped, 2 warnings

uv run ruff check .
221 erros; 48 corrigíveis automaticamente

uv run mypy .
100 erros em 33 arquivos
```

O `ruff` encontra 221 erros enquanto `.ruff-baseline.json` contém 222 itens;
`mypy` encontra 100 erros enquanto `.mypy-baseline.json` contém 80. Mais
importante que a diferença numérica: `pyproject.toml` apenas comenta a
intenção de baseline — nem Ruff nem mypy a leem. O novo workflow de backend
executa `ruff` e testes, mas não `mypy`; logo uma mudança que mantenha essa
dívida não tem gate confiável e uma mudança nova não é comparada à baseline.

Inventário atual: 9 routers de domínio, 6 services e 5 repositories. A busca
encontrou 52 ocorrências de query ou `commit` em routers; o número é um
indicador de fronteira violada, não uma contagem de endpoints. Das 42 rotas
declaradas, 36 usam `response_model`.

## Achados prioritários

### P1 — gates de lint e typecheck não correspondem ao contrato declarado

A Constituição exige `ruff check .`, `mypy .` e testes passando. Hoje os dois
primeiros comandos falham. A baseline versionada não é aplicada por qualquer
wrapper, plugin ou job; os comentários em `pyproject.toml` descrevem uma
política que a ferramenta não executa. O CI de backend recém-criado roda Ruff
e, portanto falhará no estado atual se o workflow for acionado; não executa
mypy.

Os erros não são apenas formatação histórica: mypy inclui `None` usado como
valor numérico em `equipment_offer.py`, tipos inconsistentes nos pipelines e
possíveis nulos em `monitoramento.py`. Não devem ser simplesmente silenciados
ou adicionados a uma baseline maior.

**Encaminhamento:** escolher e implementar um mecanismo real de baseline
(comparador versionado ou escopo explícito por diretório), fazer o CI executar
Ruff e mypy por esse mecanismo, e reduzir a dívida por blocos de domínio. Dar
prioridade aos erros de `app/` antes de migrations/scripts históricos.

### P1 — separação Router → Service → Repository permanece exceção

`repositories/` avançou de 3 para 5 módulos, incluindo marcadores e usuários.
Apesar disso, todos os routers de domínio inspecionados ainda contêm sinais de
acesso ao banco; `monitoramento.py` chegou a 1.021 linhas e concentra listagem,
resumo, mapeamento de resposta, eventos, ações e mutações. `equipment_offer.py`
tem 411 linhas e `convenios.py`, 295.

`monitoramento_eventos.py` e `monitoramento_instrumentos.py` ainda importam
`fastapi.HTTPException`, executam queries e misturam regras, acesso e erro HTTP.
Isso viola a fronteira explícita da Constituição e torna difícil testar casos
de uso sem aplicação/DB.

**Encaminhamento:** migrar verticalmente por casos de uso, começando pelas
mutações de monitoramento (instrumento, evento e ação): schema → repository →
service com `DomainError` → router fino → testes unitário, integração e HTTP.
Não reescrever routers inteiros de uma vez e não alterar o payload público no
mesmo bloco.

### P1 — contratos HTTP e integrações externas ainda são parcialmente genéricos

Há respostas sem `response_model`, payloads de terceiros em
`dict[str, Any]`/JSONB bruto e helpers de integração que retornam dados sem
parse estrutural (`portal_transparencia.py`, `transferegov_parcerias.py` e
partes de `api_demas.py`). Isso impede validar mudança de fornecedor na
fronteira e transfere suposições de tipo ao controller/pipeline.

O envelope constitucional `{success, data, meta}` também ainda não foi adotado.
É uma mudança breaking; não deve ser aplicada unilateralmente antes de um
contrato de compatibilidade acordado com o frontend.

**Encaminhamento:** primeiro tipar e validar os payloads externos que alimentam
monitoramento e propostas, mantendo o JSON bruto somente como evidência. Em
bloco separado, desenhar a versão/envelope de API e migrar frontend e backend
coordenadamente.

### P2 — observabilidade não mede a operação

O handler global evita expor exceções cruas e já não registra querystring, mas
os logs ainda não são JSON nem carregam `trace_id`, usuário, endpoint ou
`duration_ms`. Não há métrica de duração de rota, query ou chamada externa,
nem alerta de falha/retry. Essa lacuna impede avaliar gargalos nas listagens e
nas integrações federais antes que virem incidente.

**Encaminhamento:** introduzir middleware de correlação/duração e logger
estruturado sem incluir tokens, CPF, payloads brutos ou dados financeiros.
Instrumentar primeiro chamadas externas e queries das rotas de maior volume.

### P2 — pendências de contrato operacional continuam fora do backend puro

Rate limit distribuído necessita `RATE_LIMIT_STORAGE_URI` com storage
compartilhado; a ausência mantém `memory://`. `/docs` e `/openapi.json` seguem
públicos por configuração padrão do FastAPI, sem decisão explícita por
ambiente. Política de retenção/redaction de `AuditLog.details`, hosts confiáveis
e telemetria de abuso também permanecem pendentes, conforme o diagnóstico de
Segurança de 2026-09-22.

## Código morto e contexto desatualizado

Nenhum arquivo Python foi removido: scripts sem import não são automaticamente
mortos, pois são entrypoints operacionais de pipeline, auditoria ou reconciliação.
Não há prova suficiente de substituição para apagá-los com segurança.

Foram identificados na fotografia inicial itens de contexto, todos corrigidos
na execução abaixo:

- `CLAUDE.md` afirmava que existia `POST /usuarios/{id}/resetar-senha` e o
  diálogo `usuario-dialog-resetar-senha.tsx`; ambos foram removidos na rodada
  de Segurança e substituídos por envio de link de redefinição.
- O diagnóstico de Backend de 2026-09-16 preserva corretamente histórico, mas
  relata `monitoramento.py` com cerca de 760 linhas, 3 repositories e baseline
  efetiva; hoje há 1.021 linhas, 5 repositories e a baseline não é aplicada.
- Comentários em `pyproject.toml` prometiam que achados legados ficavam fora
  dos gates sem mecanismo executável. Foram substituídos por exceções nominais
  de Ruff, restritas às migrations históricas afetadas.

## Critério de fechamento da rodada

- [x] Revisão estática de routers, services, repositories, contratos,
      integrações, scripts e contexto.
- [x] Suíte completa validada em banco PostgreSQL isolado.
- [x] Código morto distinguido de entrypoint operacional antes de qualquer
      exclusão.
- [x] Ruff e mypy bloqueando regressões por configuração executável; exceções
      de migrations históricas são nominais, fechadas e apenas mecânicas.
- [x] Router sem query/commit; Service sem FastAPI/SQL; Repository como única
      fronteira de dados nas features migradas de monitoramento.
- [x] Parse explícito das integrações externas críticas e evidência relacional
      TransfereGov validada, sem quebrar o contrato HTTP público.
- [x] Logs JSON, correlação e duração de rota/chamada externa implementados.
- [x] Contextos defasados corrigidos; nenhum código foi removido sem
      substituto e sem prova de desuso.

## Atualização de execução — 2026-09-22

Foi adicionado middleware de observabilidade que emite JSON com `trace_id`,
método, path, status e duração, sem corpo ou querystring; o identificador é
devolvido em `X-Trace-Id`. As integrações de Portal da Transparência,
TransfereGov, DEMAS, ElastiCNES e SIDRA também registram somente fonte,
operação, status/duração e tipo de erro. Nenhum desses eventos registra URL,
parâmetro, token, documento ou payload.

As mutações e leituras de instrumento/evento/ação, incluindo o agregado de
`/monitoramento/resumo`, passaram a resolver consultas e persistência pelo
repository. Os services retornam `DomainError` em vez de `HTTPException`,
orquestram a transação e preservam as regras append-only, de autorização e de
confirmação de inauguração. As fontes externas agora validam envelope e campos
consumidos antes da normalização, mantendo os dicionários compatíveis aos
consumidores atuais. O inventário de scripts não identificou exclusão segura:
os restantes são usados por CI, testes, pipelines ou cargas manuais documentadas.

Os gates foram fechados sem ampliar baseline: `ruff check .` passa com uma
lista explícita e fechada de exceções exclusivamente mecânicas nas migrations
já aplicadas; migrations novas continuam integralmente verificadas. O
typecheck completo `mypy .` passou nos 174 arquivos após tipar scripts, testes
e migrations sem alterar a lógica de ingestão ou cálculos. A regressão final
em PostgreSQL isolado passou com **183 testes**, 8 pulados por integrações
opcionais e 2 avisos de deprecação de dependências.

A evidência relacional TransfereGov foi formalizada em
`evidencia_transferegov`: proposta, meta, etapa, item, parceria e execução
financeira passam a ter tipo, chave externa, caminho pai/filho, hash e payload
auditável. O backfill é idempotente e deve ser executado somente no deploy com
credencial de migration; `metas_resumo` permanece como adaptador de leitura
até a migração coordenada dos consumidores HTTP, sem receber usos novos.

O CI foi alinhado aos gates completos (`ruff check .` e `mypy .`). A migration
`b7e3d9f4a621` foi aplicada, revertida e reaplicada com sucesso no PostgreSQL
isolado. Nenhuma migration ou backfill foi executado no Neon nesta rodada.

## Próximo passo recomendado

Planejar em rodada própria: (1) migrar os leitores HTTP de `metas_resumo` para
`evidencia_transferegov`, removendo o adaptador somente após reconciliação; e
(2) decidir um envelope HTTP versionado com o frontend. Cada bloco deve
preservar o contrato público, executar testes relevantes e repetir a revisão
de código morto antes de qualquer exclusão.

## Atualização de regressão — 2026-09-24 (sessão)

O diagnóstico histórico de 2026-09-16 apontava que logout revogava somente o
refresh e mantinha o access JWT aceito até o seu vencimento. Esse achado foi
fechado sem migration: a identidade já existente de `RefreshToken` passa a
compor o JWT de acesso, e `require_current_user` valida a sessão por id,
usuário, revogação e expiração antes de devolver o usuário. Login, ativação,
redefinição e refresh sempre emitem o par da mesma nova sessão; refresh
rotacionado torna o access anterior inválido pelo mesmo mecanismo.

Os cookies continuam `HttpOnly`. Login, ativação, redefinição e refresh agora
retornam também uma cópia efêmera `csrf_token`; ela é necessária porque o
cookie da API Render não é legível em `document.cookie` do Vercel. Após reload,
`GET /auth/csrf` devolve a mesma cópia exclusivamente à origem CORS permitida,
com `Cache-Control: no-store`. O double-submit continua obrigatório em toda
mutação: não houve isenção de logout nem token persistido no frontend. A prova
HTTP reinsere um access cookie capturado antes do logout e exige `401` em
`GET /auth/me`. Ruff passou nesta alteração; os testes dependentes de banco
foram coletados, mas ficaram skip nesta máquina porque `TEST_DATABASE_URL` não
estava configurada.

Os prazos efetivos confirmados em 2026-09-25 são: access JWT de **20 minutos**
e refresh opaco rotativo de **14 dias**. A revogação de refresh invalida também
o access vinculado antes do prazo natural.

## Atualização de ingestão PERSUS — 2026-09-24

Foi criada uma rotina de complementação controlada para `Controle PERSUS.xlsx`.
Ela separa conciliação, garantia de instrumento monitorado, complemento de
campos, eventos e ações; não cria `Convenio`, não altera CNES e recusa vínculo
ambíguo até validação explícita. Após a conciliação aprovada, a execução no
Neon registrou somente o escopo autorizado: 29 instrumentos criados, 5
existentes preservados, 185 eventos detalhados e 102 ações concluídas. Em
2026-09-25 foi corrigida uma lacuna de materialização: os 185 vínculos a
`fase_geral_id` não eram eventos de fase e, portanto, não atualizavam o resumo.
O reparo em lote, append-only e idempotente gravou 110 eventos diretos de fase
geral, sem alterar CNES, valores, marcos detalhados ou ações existentes.

A rotina passou `ruff check`, `mypy` e `ruff format --check`; a decomposição
também elimina o C901 que teria sido introduzido por uma nova carga manual.
Na validação final da Constituição de Qualidade, migrations do zero e a suíte
backend foram executadas em PostgreSQL efêmero do OrbStack: **224/224** testes
aprovados, sem usar Neon como banco de teste.

## Revalidação de conciliação PERSUS — 2026-09-25

A auditoria cruzada com `Controle PERSUS.xlsx` e a aba PERSUS-I de
`Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx` revelou que o
reconciliador complementar precisa explicitar seu fallback de identidade. A
conciliação por nome/localidade deixou sem `fase_geral_id` marcos de dois
PERSUS já existentes quando a fonte emprega nomes alternativos para a mesma
unidade. Isso impede a rotina de materializar a fase direta que o resumo
consome e produz falso “Não iniciado”.

O próximo ajuste deve preservar o CNES canônico do banco e implementar a
ordem: chave de origem/localidade; CNES apenas se único no conjunto de origem;
NUP/código de obra/ano ou confirmação humana se repetido; pendência explícita
se ainda ambíguo. A rotina não deve atualizar `data_conclusao` com Entregas
sem política de precedência e confirmação de conflito. O saneamento dos
eventos existentes deve continuar append-only, idempotente e separado da
correção de ocorrências futuras, que não podem ser aceitas como fato realizado.

## Correção geral de fases e precedência de Entregas — 2026-09-25

O backend passou a expor duas rotinas controladas: a complementação PERSUS lê
somente PERSUS-I e CONVÊNIO da planilha de Entregas, exclui PRONON, e resolve a
data efetiva na ordem Entregas → Controle PERSUS (este último só para PERSUS
I). A outra rotina reconstrói fases gerais para todo o monitoramento a partir
de eventos ativos, ocorridos e com mapeamento inequívoco. Ambas têm
`--dry-run`, são append-only para eventos e foram comprovadas por reexecução
sem novas inserções após a aplicação.

O mapeamento recusa deliberadamente início de fabricação, ordem de serviço,
TRP, TRD e modificação de casamata como fase automática. A recusa impede que
um marco técnico seja apresentado como execução confirmada sem regra de
negócio; as 33 ocorrências restantes e seis datas futuras ficam expostas para
tratamento manual.

Para alias entre abas do Controle PERSUS, o reconciliador agora busca Obras e
Equipamentos por CNES somente quando esse valor é único na aba. A regra é
testada com o CNES 2576341; duplicidades continuam recusadas até haver chave
adicional, preservando a decisão de não escolher fonte ambígua por heurística.

Uma duplicidade histórica em `evento_marco` revelou uma premissa incorreta no
deduplicador da carga: equivalência não implica que exista uma única linha. A
transação falhou antes de commit e foi refeita após substituir a asserção de
unicidade por teste de existência. Isso mantém a rotina idempotente diante do
legado sem apagar ou atualizar eventos, em conformidade com o histórico
append-only.

## Envelope HTTP — escopo reduzido e pendência de ingestão (2026-09-25)

O Plan Mode de fechamento final (`planmode-fechamento-final-2026-09-25.md`,
Bloco 1) migrou `EquipmentOfferRowPage`/`EstablishmentPage` para
`{data, meta.total}` — as únicas duas rotas com paginação real (offset/limit
de verdade). As demais rotas antes cogitadas para o envelope
(`monitoramento/{marcos,instrumentos,acoes}`, `macro-coverage`,
`municipality-coverage`, `health-region-coverage`) foram **excluídas do
escopo**: são teto de segurança deliberado (Bloco 4 do Plan Mode consolidação
2026-09-17), com volume muito abaixo do teto — envelopá-las agora seria
paginação fictícia sem necessidade real.

**Pendência nova, registrada e não executada nesta rodada**: a migração de
`GET /propostas-candidatas` de `metas_resumo` (JSON bruto) para
`evidencia_transferegov` foi cogitada no mesmo bloco, mas **`EvidenciaTransfereGov`
não tem nenhum escritor** — existe só o schema da migration
(`b7e3d9f4a621_cria_evidencia_relacional_transferegov.py`), sem job/service
que a popule. Migrar o router agora leria uma tabela vazia. Antes de
qualquer migração de leitura, é preciso um plan-mode dedicado para o job de
ingestão (parser do payload já capturado em `metas_resumo` como backfill +
captura contínua para propostas novas) — decisão do usuário 2026-09-25 de
não expandir o Bloco 1 para cobrir isso agora.

## Bloco 2 do fechamento — achado: escrita já estava decomposta (2026-09-25)

O Bloco 2 do plan-mode assumia que `routers/monitoramento.py` ainda tinha
lógica de negócio e `db.commit()` na fatia de escrita (eventos/ações/
`atualizar_cadastro`). Não é mais verdade: todos os 8 endpoints de mutação
já delegavam para `services/monitoramento_eventos.py` (que já existia com
`registrar_evento_monitorado`, `editar_evento_monitorado`,
`excluir_evento_monitorado`, `registrar_acao_monitorada`,
`editar_acao_monitorada`, `excluir_acao_monitorada`,
`concluir_acao_monitorada`, `atualizar_cadastro_instrumento`) e
`services/monitoramento_instrumentos.py` — zero `db.commit()` no router,
todos nos Services. Achado provavelmente desatualizado desde a mesma
rodada de 25/09 que já tinha corrigido outros itens deste router (ver
"Correção geral de fases..." acima).

O que sobrava de verdade: `GET /monitoramento/resumo` (`obter_resumo`)
tinha ~135 linhas de cálculo (fase atual por instrumento, distribuição,
divergência de conclusão) inline no endpoint, chamando só
`repositories/monitoramento.py::carregar_dados_resumo_monitoramento` pra
carga de dado. Extraído para `services/monitoramento_resumo.py::
montar_resumo_monitoramento` — os 5 schemas de resposta
(`ResumoMonitoramentoRead` e dependentes) migraram para
`schemas_monitoramento.py` (mesmo padrão já usado por
`schemas_equipamentos.py`) pra evitar import circular entre router e
service. Router ficou fino: só `Depends`/`response_model`, chama o
Service.

Validado contra o container Postgres de teste local
(`sigeo-db-constitution-test`, porta 55432): 229/232 testes passam; as 3
falhas restantes (`test_atualizar_cadastro_sincroniza_responsavel_relacional`,
`test_schema_migrations.py::*`) são o container estar atrasado em
migrations (falta a tabela `instrumento_responsavel` e o usuário seed
`bruna.machado@saude.gov.br`) — confirmado pré-existente via `git stash`,
não uma regressão deste bloco. `ruff check .`/`mypy .` limpos.
