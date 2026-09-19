
# Constituição DevOps/Infra IA v1.0

## 1. Filosofia do Projeto

Este documento define as regras obrigatórias para containerização, pipeline de CI/CD e
observabilidade realizadas por IA. Complementa [constituicao_backend.md](../backend/constituicao_backend.md)
(logging estruturado, variáveis de ambiente), [constituicao_database.md](../database/constituicao_database.md)
(backup, migração em produção) e [constituicao_seguranca.md](../seguranca/constituicao_seguranca.md)
(segredo/credencial, HTTPS, dependência auditada).

### Objetivos

- Build e deploy reproduzíveis, idênticos entre dev/staging/prod (mesma imagem, config diferente).
- Pipeline que barra código quebrado antes de chegar em produção, não depois.
- Padronização entre todos os projetos (Docker + GitHub Actions como stack vigente), sem
  "gambiarra de infra" ("cara de IA" em infra = `Dockerfile` que instala tudo como root e sem
  multi-stage, pipeline sem gate de teste/lint, segredo em texto plano no workflow, deploy manual
  sem rollback definido, serviço sem health check).

---

## 2. PLAN MODE (Obrigatório)

Antes de criar/alterar `Dockerfile`, workflow de CI/CD, ou configuração de observabilidade, a IA
apresenta um plano contendo:

### Objetivo

- O que muda (novo serviço containerizado, novo estágio de pipeline, novo alerta/dashboard).
- Motivo (nova dependência de runtime, gargalo de build, incidente que expôs lacuna de monitoramento).

### Escopo

- Arquivos afetados (`Dockerfile`, `docker-compose.yml`, `.github/workflows/*.yml`, config de
  observabilidade).
- Ambiente impactado (dev, staging, produção — todos ou um específico).

### Estratégia

- Estágios do pipeline envolvidos (lint → test → build → deploy) e gates de bloqueio.
- Segredos/variáveis novos necessários e onde ficam armazenados (GitHub Secrets, vault).

### Riscos

- Downtime durante deploy (estratégia de rollout: rolling, blue-green, nenhuma).
- Rollback: como reverter se o deploy falhar em produção.
- Custo (novo recurso de nuvem, aumento de uso de CI minutes).

A implementação só começa após aprovação do plano.

### Formato do Plano

- Conciso, em bullet points, **no máximo 30-40 linhas**.
- Sem YAML/Dockerfile completo no plano — apenas estrutura lógica e decisões.

---

## 3. Containerização (Docker)

### Dockerfile

- Multi-stage build obrigatório para linguagem compilada/transpilada: estágio de build separado do
  estágio de runtime — imagem final não carrega ferramenta de build, código-fonte não necessário, ou
  dependência de desenvolvimento.
- Imagem base mínima e com versão fixada (`node:20-alpine`, não `node:latest`) — nunca tag `latest`
  em produção, build deixa de ser reproduzível.
- Usuário não-root no runtime (`USER node` ou equivalente) — processo nunca roda como `root` dentro
  do container.
- `.dockerignore` obrigatório: nunca copiar `.env`, `node_modules`, `.git`, artefato de teste para
  dentro da imagem.
- Camadas ordenadas por frequência de mudança (dependências antes do código-fonte) para aproveitar
  cache de build — instalar dependência antes de copiar o restante do código.

### Health Check

- Todo serviço expõe endpoint de health check (`/health` ou equivalente) e o `Dockerfile`/orquestrador
  usa esse endpoint para decidir se o container está pronto — nunca "container rodou, então está OK".

### docker-compose (ambiente local)

- `docker-compose.yml` reproduz a topologia real (app + banco + dependências), com variável de
  ambiente via `.env` (nunca hardcoded no compose) e volume nomeado para dado persistente de
  desenvolvimento.

---

## 4. CI/CD (GitHub Actions)

### Pipeline Mínimo Obrigatório

```text
push/PR → lint → typecheck → test → build → (deploy se branch principal + aprovação)
```

| Estágio | Bloqueia merge/deploy se falhar |
|---|---|
| Lint | Sim |
| Typecheck | Sim |
| Teste (unidade/integração) | Sim |
| Build de imagem | Sim |
| Scan de vulnerabilidade de dependência/imagem | Sim (crítica), alerta (média/baixa) |
| Deploy | Só após todos os estágios acima passarem |

### Estrutura de Workflow

- Um workflow por responsabilidade (`ci.yml` para validação em PR, `deploy.yml` para publicação) —
  nunca um único workflow monolítico misturando tudo sem separação clara de trigger.
- Job de deploy protegido por `environment` do GitHub com approval manual para produção, quando o
  projeto exige esse controle.
- Cache de dependência (`actions/cache`, cache nativo de `setup-node`/`setup-python`) para acelerar
  pipeline — nunca reinstalar tudo do zero a cada run sem necessidade.

### Segredos

- Segredo de pipeline só via `GitHub Secrets`/environment secrets — nunca hardcoded em YAML, nunca
  logado (`echo $SECRET`), nunca em variável de output de step.
- Segredo de produção e de staging/dev são valores diferentes, sempre (alinhado com a Constituição
  de Segurança).

### Versionamento de Imagem

- Imagem publicada com tag rastreável (SHA do commit, `vX.Y.Z`) — nunca só `latest` como única tag em
  produção; `latest` pode coexistir como conveniência, nunca como fonte de verdade do que está no ar.

---

## 5. Deploy e Rollback

### Estratégia de Rollout

- Deploy com estratégia que evita downtime quando o serviço tem SLA de disponibilidade (rolling
  update, blue-green) — deploy destrutivo direto (`stop` + `start`) só é aceitável em ambiente sem
  requisito de disponibilidade contínua.
- Migração de banco (ver [constituicao_database.md](../database/constituicao_database.md)) roda
  antes do novo código entrar em produção, e é compatível com a versão anterior do código durante a
  janela de rollout (expand-contract).

### Rollback

- Todo deploy tem caminho de rollback definido e testado (voltar para a tag/imagem anterior) — nunca
  "se der problema, a gente resolve na hora".
- Rollback de aplicação não pressupõe rollback automático de migração de banco destrutiva —
  planejado separadamente.

---

## 6. Observabilidade

### Logs

- Log estruturado (JSON) centralizado, agregando todos os serviços/containers — alinhado ao padrão
  de `Structured Logging` da Constituição Backend (`timestamp`, `trace_id`, `user_id`, `endpoint`,
  `duration_ms`).
- Log de container nunca só em `stdout` sem coleta — sempre encaminhado a um coletor (ex.: agente de
  log da plataforma de hosting/observabilidade) para não se perder no ciclo de vida do container.

### Métricas

- Métrica básica de todo serviço: taxa de erro, latência (p50/p95/p99), throughput (requisições/min),
  uso de CPU/memória do container.
- Métrica de negócio crítica (ex.: volume de convênio processado) exposta separadamente da métrica de
  infraestrutura, para não misturar saúde técnica com indicador de negócio no mesmo painel sem
  distinção.

### Tracing

- Requisição que atravessa múltiplos serviços carrega `trace_id` propagado ponta a ponta — permite
  reconstruir o caminho completo de uma falha, não só o log isolado de um serviço.

### Alertas

- Alerta configurado para: taxa de erro acima de limiar, latência acima de limiar, serviço fora do ar
  (health check falhando), uso de recurso (CPU/memória/disco) próximo do limite.
- Alerta tem destino definido (canal de notificação) e critério de severidade — nunca alerta que
  ninguém recebe ou que dispara tanto que é ignorado (fadiga de alerta).

### Dashboards

- Dashboard mínimo por serviço: saúde (health check, uptime), performance (latência, taxa de erro),
  recurso (CPU, memória). Acessível ao time, não só ao autor da configuração.

---

## 7. Segurança de Infra

> Política completa em [constituicao_seguranca.md](../seguranca/constituicao_seguranca.md). Esta
> seção é o checklist mínimo de aplicação em containers/pipeline.

- [ ] Imagem base com versão fixada, nunca `latest` como fonte de verdade em produção.
- [ ] Processo do container roda como usuário não-root.
- [ ] `.dockerignore` impede segredo/artefato sensível de entrar na imagem.
- [ ] Segredo de pipeline só via GitHub Secrets/environment secrets, nunca hardcoded ou logado.
- [ ] Scan de vulnerabilidade de imagem/dependência no pipeline, com bloqueio em CVE crítica.
- [ ] Segredo de produção diferente de staging/dev.
- [ ] Comunicação entre serviços em produção via HTTPS/TLS, inclusive interna quando exigido pela
      política de segurança do projeto.
- [ ] Acesso a ambiente de produção (deploy, console de cloud) restrito a quem precisa, com log de
      quem executou o quê.

---

## 8. Código Limpo e Eficiência (Anti "Cara de IA")

O equivalente, em infra, a uma UI genérica é: `Dockerfile` copiando o repositório inteiro sem
`.dockerignore`, pipeline que "passa" porque não testa nada de verdade, e alerta configurado só para
"cobrir checklist" sem threshold pensado para o serviço real.

### Nunca

- `Dockerfile` de estágio único copiando ferramenta de build para a imagem de produção.
- Pipeline com etapa de teste que sempre passa (mock de tudo, sem asserção real) só para "ficar
  verde".
- Secret/token exposto em log de step do workflow (`echo`, `print` de variável sensível durante
  debug).
- Deploy manual direto em produção contornando o pipeline "porque é mais rápido".
- Alerta com threshold copiado de outro projeto sem considerar o volume/SLA real deste serviço.

### Sempre

- Multi-stage build enxuto, imagem final só com o necessário para rodar.
- Pipeline que reflete o fluxo real de validação do projeto (lint, typecheck, teste, scan) antes de
  build/deploy.
- Rollback testado pelo menos uma vez antes de depender dele em produção.
- Threshold de alerta calibrado com dado real de uso do serviço, revisado quando o volume muda.

---

## 9. Testes de Infra

> Política completa em [constituicao_qualidade.md](../qualidade/constituicao_qualidade.md). Esta
> seção é o resumo de aplicação em containers/pipeline.

### Obrigatório

- Build da imagem validado no pipeline (a imagem sobe e o health check responde) antes de deploy.
- Smoke test pós-deploy (chamada mínima confirmando que o serviço está no ar e respondendo) em
  staging/produção.

### Proibido

- Deploy considerado bem-sucedido só porque o pipeline não retornou erro, sem checar se o serviço
  está de fato respondendo depois.

---

## 10. Fluxo de Implementação

1. `Dockerfile`/`docker-compose` (containerização local).
2. Workflow de CI (lint, typecheck, teste, scan).
3. Workflow de CD (build de imagem, deploy com estratégia de rollout).
4. Observabilidade (log centralizado, métrica, alerta, dashboard).
5. Validação (smoke test pós-deploy, rollback testado).

### Validação obrigatória

```bash
docker build -t app:local .
docker run --rm app:local <health-check-command>
act -j test          # ou: rodar o workflow localmente/CI antes de merge
```

---

## 11. Checklist de Entrega

- [ ] Plano de infra aprovado.
- [ ] `Dockerfile` multi-stage, usuário não-root, imagem base com versão fixada.
- [ ] `.dockerignore` presente, sem segredo/artefato indevido na imagem.
- [ ] Health check exposto e usado pelo orquestrador/pipeline.
- [ ] Pipeline com lint, typecheck, teste e scan de vulnerabilidade bloqueando merge/deploy.
- [ ] Segredo só via GitHub Secrets/environment secrets, nunca hardcoded ou logado.
- [ ] Imagem versionada com tag rastreável (SHA/semver), não só `latest`.
- [ ] Estratégia de rollout e rollback definidas e testadas.
- [ ] Log estruturado centralizado, com `trace_id` propagado entre serviços.
- [ ] Métrica de erro/latência/recurso e alerta configurados com threshold real do serviço.
- [ ] Smoke test pós-deploy validado.

---

## Prompt de Referência

Atue como Senior DevOps/Infra Engineer. Siga rigorosamente esta Constituição de DevOps:

1. `Dockerfile` sempre multi-stage, imagem mínima, usuário não-root, versão base fixada — nunca
   `latest` como fonte de verdade em produção.
2. Pipeline de CI sempre com lint, typecheck, teste e scan de vulnerabilidade bloqueando
   merge/deploy — nunca deploy manual contornando o pipeline.
3. Segredo só via GitHub Secrets/environment secrets, nunca hardcoded, nunca logado em step de
   workflow.
4. Todo deploy tem estratégia de rollout e caminho de rollback definido e testado.
5. Log estruturado centralizado com `trace_id` propagado, métrica de erro/latência/recurso e
   alerta com threshold calibrado ao serviço real — nunca alerta copiado sem contexto.
6. Deploy só é considerado bem-sucedido após smoke test confirmando que o serviço está respondendo.
</content>
