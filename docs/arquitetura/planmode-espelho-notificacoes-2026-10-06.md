# Plan Mode — espelho oficial e notificações por mudança (2026-10-06)

Plano aprovado pelo usuário. Implementação restrita à `homologacao`; nenhum
job, migration ou deploy deve ser executado em produção nesta fase.

## Planos vinculados — criados por solicitação em 20/10/2026

- Novos pedidos foram separados para não ampliar o escopo de fechamento deste
  plano: [monitoramento por item/equipamento físico](planmode-monitoramento-itens-equipamentos-2026-10-20.md)
  e [identidade SISGEO](planmode-identidade-sisgeo-2026-10-20.md).
- Ordem recomendada: estabilização funcional deste plano → monitoramento por
  item → identidade; a apresentação SISGEO pode ser antecipada em alteração
  isolada após estabilização. Iniciar os seguintes em homologação não exige
  publicar este em produção nem concluir antecipadamente tarefas de DevOps.
- Solicitação atual autoriza criar os documentos, não iniciar os novos blocos
  de implementação, ativar jobs, contratar armazenamento ou alterar produção.
  Decisões pendentes ficam explícitas em cada plano e exigem confirmação.

## Diagnóstico de retomada — 2026-10-13

### Complemento solicitado — filtro de encerrados em relatórios (21/10)

Desenho para aceite antes da implementação, sem publicação em produção:

- Filtro independente **Encerramento: Todos / Encerrados**, sem confundir
  situação oficial, fase interna e encerramento financeiro.
- Classificador único no backend, reaproveitado na prévia e DOCX/XLSX;
  uma linha por instrumento/parceria e motivo explícito, sem duplicar
  carteira, monitoramento e proposta da mesma parceria.
- Precedência: prestação de contas concluída da carteira completa → fase
  `fase_concluido` ativa → parceria confirmada com código e ordem “Paga”.
  Proposta “Aprovada” não impede “Parceria paga”; estado da proposta,
  presença de marcador ou pagamento previsto não provam ordem paga.
  Ordem “Paga” prova aquele pagamento, não quitação integral da parceria
  ou conclusão física; preservar a identificação e o status da ordem.
- Eventos substituídos/excluídos não contam. Conclusão exclusivamente
  interna sem data fica em pendências, fora da extração principal.
- Conclusão interna não encerra a prestação de contas: manter motivo
  “Concluído internamente — prestação de contas pendente” quando aberta;
  ausência de status não será inventada como situação aberta/concluída.
- Reconciliação confronta texto original, fonte, captura e identidade.
  Divergência entre projeções de prestação de contas fica explícita em
  pendências até confirmar a evidência oficial, sem overwrite silencioso.
- Contagens informadas pelo usuário (304 candidatos, 296 instrumentos,
  8 parcerias, 5 sem data, 299 após exclusão; 186 × 187 status externos)
  são prévia a reconciliar, não baseline certificada ou constante do código.
- Manter filtros geográficos/período/equipamento/tipo/programa aplicáveis,
  escopo de equipamentos e autorização de leitura da exportação. Regressões
  PostgreSQL cobrem precedência, deduplicação, evidência financeira, data
  ausente, divergência, evento inativo e paridade prévia/DOCX/XLSX.

#### Implementação e reconciliação (22/10, somente homologação)

- Implementado e aprovado em homologação: filtro, prévia dedicada, DOCX e
  XLSX pelo mesmo classificador (`app/repositories/relatorios_encerrados.py`,
  `app/services/relatorios_encerrados.py`). Backend 1.812 testes, Ruff e mypy
  aprovados em PostgreSQL vazio no head; frontend 892 testes, lint e tsc.
- Correção na validação: `InstrumentoEquipamento.tipo_contratacao` é nulo
  permitido e derrubava a extração; agora vale `coalesce(..., "Convênio")`,
  como no ramo de `convenio`, com teste de regressão.
- **186 × 187 explicado** no clone `sigeo_homologacao_clone_20261017` (leitura):
  a carteira tem 186 “Prestação de Contas Concluída”, 2 deles fora do escopo
  de equipamentos (744879, 813703) — 184 no escopo. O monitoramento acrescenta
  exatamente 1 (948696: carteira “Em operação”, monitoramento “Concluída”).
  186 + 1 = 187 sem aplicar escopo; 184 + 1 = 185 com escopo.
- A divergência não é resolvida em silêncio: 948696 sai em pendências como
  “Divergência de prestação de contas entre fontes”, com a evidência de cada
  fonte, até confirmação oficial.
- Extração nesse clone: 285 itens (184 prestação concluída, 87 concluído no
  monitoramento, 14 concluído internamente com prestação pendente) e 7
  pendências (6 conclusão sem data, 1 divergência), sem duplicidade. Esse
  clone não tem parcerias com ordem “Paga”; as 8 da prévia original vêm de
  outra base e continuam a reconciliar. Não são baseline certificada.
- Sem migration, alteração de dados oficiais, aprovação no Radar ou deploy;
  implementação isolada em homologação após aceite do complemento.

**Esta seção prevalece sobre os estados históricos abaixo para a retomada.**
Resultado de testes registrado no histórico não comprova o checkout atual.
O plano não está concluído e as pendências não são somente de DevOps.

### Checklist consolidado de fechamento — atualizado em 21/10

Este checklist resume o estado atual; a tabela de recuperação e os blocos
cronológicos seguintes são históricos, não uma lista cumulativa de pendências.
Contagens de testes não representam percentual de conclusão.

- [x] Gate frontend integral de hooks/componentes, sem exclusões para subir
  percentual; último aceite: 867 testes e download sem retry de geração.
- [x] Gate backend integral com PostgreSQL descartável migrado e pisos por
  camada; evidência final de cada rodada registrada abaixo, não por memória.
- [x] Isolamento concorrente dos builders em lotes sintéticos delimitados;
  falha de parser DOCX reproduzida/corrigida e regressão após erro.
- [x] Contraste concorrente HTTP/SQL sintético: quatro conexões simultâneas,
  quatro perfis, recortes distintos e falhas 401/422 isoladas. É ASGI local,
  não proxy/rede/navegador nem capacidade nacional.
- [x] Integridade de XLSX finais nos cinco tetos sintéticos, com todos os
  registros conferidos; custo quadrático de escrita identificado e removido.
- [x] Integridade estrutural de DOCX finais nos cinco tetos sintéticos, em
  seis cenários; paginação de tabela também coberta nos limites curto/longo.
- [x] Prazo local de exportação incluindo corpo/espera de autenticação,
  sem retry por timeout; cancelamento e duplo clique cobertos no frontend.
- [x] Leitura em lote do histórico ativo do relatório e ensaio preenchido
  de 500 instrumentos; consultas deixam de crescer por instrumento.
- [x] Transporte TCP por proxy local `/api`, sessões reais e três cenários
  de quatro exportações simultâneas; medição em processo servidor separado.
  Não equivale a aceite do provedor nem certificação de capacidade.
- [x] Admissão DOCX não bloqueante por processo, erro controlado de ocupado,
  liberação após falha e mensagem segura sem retry/download indevido; XLSX
  permanece independente. Gates locais: 1.751 backend / 867 frontend.
- [x] Paridade local dos comandos estáticos integrais do CI: Ruff completo,
  formatação de 393 arquivos e mypy de 462 fontes; oito erros de testes
  corrigidos sem exclusão/ignore, com 132 testes dos módulos alterados passando.
- [x] Portabilidade local Linux arm64/Python 3.12.13/PostgreSQL e clients 16.9:
  **1.760 testes**, pisos aprovados, sem PYTHONPATH herdado e limpeza isolada.
  Não substitui aceite nativo ou capacidade do provedor.
- [x] CI remoto do SHA `a78e521`, PR #28 em rascunho: sete workflows aprovados;
  Ubuntu x86_64/PostgreSQL e clients 16.15, **1.760 testes backend**, **867
  frontend**, **10 E2E**, pisos e auditorias aprovados. Sem merge/deploy.
- [x] Exportação sequencial no volume do clone local, transações somente
  leitura: 18 combinações, integridade das identidades/contagens preservada.
- [x] Dois lotes HTTP diretos de quatro exportações simultâneas no volume
  do clone local; XLSX independente, recusa controlada de DOCX concorrente
  e recuperação após disputa. Memória e liveness medidos abaixo; não
  substitui a prova sintética por proxy nem o aceite do provedor.
- [ ] Desempenho operacional: concorrência HTTP, RAM e latência no provedor
  sob carga representativa; medição local de Service/SQL não certifica SLA.
  Mitigação local de RAM/CPU implementada e ensaiada em Linux 512 MiB/0,1 CPU;
  publicação isolada e exportações pequenas controladas no provedor concluídas
  em 21/10; carga representativa/concorrência remota ainda não certificadas,
  conforme o caminho aprovado abaixo, sem exigir homologação remota nova.
- [ ] Aceite nativo em Word/Excel; inspeção estrutural e LibreOffice não
  substituem os aplicativos de destino. Usuário tem os aplicativos em outro
  computador; lote reduzido preparado em 21/10, aguardando seu retorno.
- [ ] Ciclo oficial nacional persistente com identidade completa e candidato
  elegível; não fabricar novidade ou enfraquecer confirmação para fechar.
- [x] Fechar a compatibilidade histórica da fila do Radar: inventário somente
  leitura de 21/10 comprovou 4.934 registros sem critério de escopo/consulta
  ao Portal ainda listados e contados como novos pelo Service. Complemento
  pontual aprovado e aplicado localmente; regressão integral de 1.782 testes
  aprovada em 21/10, sem escrita no clone ou publicação de produção.
- [ ] Aceite operacional de provedor, retenção/RPO/RTO/restore;
  RTO aprovado de 1 hora e RPO de até 24 horas (aceite em 21/10). Limites ainda não certificados no
  provedor; ativação remota/cron/produção exige autorização.

### Retomada local e complemento de integridade do Radar — 21/10

- Continuação operacional após a correção: consulta autenticada e somente
  leitura do Neon confirmou plano Build, janela de histórico de **6 horas**,
  nenhum snapshot nem agendamento de snapshots. A configuração atual limita
  recuperação tardia; não comprova o RPO/RTO aprovado, nem significa perder
  6 horas de trabalho. A UI exige upgrade para janela maior/agendamento;
  nenhum ajuste, snapshot, restore, plano ou cobrança foi acionado.
- Runbook atualizado com a evidência e decisão pendente: destino/retention
  institucional para cópia externa criptografada mantendo Build, ou avaliação
  de ampliação do plano nativo. Não criar workflow com dump em artefato
  público/temporário nem transmitir dados a destino ainda não aprovado.

- Alinhado somente o pacote `certifi` no lockfile de homologação à versão
  `2026.10.19` já aprovada/testada/publicada na PR #29. Mantida a alteração
  local preexistente de dependência direta `lxml`; nenhum outro pacote foi
  atualizado e nenhuma mudança foi enviada ao remoto nesta rodada.
- Inventário do clone servido em transação `REPEATABLE READ READ ONLY`,
  loopback/role/OID conferidos e timeout SQL de 10 s. Consultado o Service
  real `listar_candidatos(somente_oficiais=True)`, não inferido pelo banco:
  total/novos = 4.934. Todos esses registros históricos têm `criterio_escopo`
  nulo e `confirmacao_portal=nao_consultado`. Não houve coleta, escrita,
  aprovação, notificação ou exclusão. Trinta registros v1 não confirmados
  também permanecem no histórico; um registro inelegível continua preservado.
- Causa localizada em `repositories/candidatos_legados.py::_consulta_candidatos`:
  o ramo de compatibilidade `criterio_escopo IS NULL` permite a fila sem
  confirmação. O contador reutiliza essa consulta, por isso herda o problema.
  Não é prova de que esses convênios atendem ao catálogo; não os promover.
- Complemento aprovado pelo usuário em 21/10:
  exigir o critério canônico atual do MS e confirmação oficial para a fila;
  manter decisões encerradas consultáveis e todo histórico append-only.
  Alterar somente a projeção Repository e regressões PostgreSQL de fila,
  contador, decisões encerradas e revalidação. Sem novo endpoint/schema,
  migração, exclusão, blacklist, afrouxamento da fonte ou deploy.
- Risco/trade-off: candidatos antigos não validados deixam a fila de novos
  até revalidação oficial; não somem das tabelas nem recebem falsa rejeição.
  Asserções devem cobrir nulo/v1/não confirmado, confirmação válida atual,
  paginação/contador consistentes e consulta das decisões encerradas.
- Implementação local: a consulta oficial e o contador compartilham o filtro
  de v2/MS/Portal confirmado. Consultas internas de diagnóstico continuam
  disponíveis; o endpoint público usa explicitamente `somente_oficiais=True`.
  Decisões aprovadas/rejeitadas mantêm a exceção de consulta histórica.
- Quatro casos de regressão escritos antes da correção: ausência de escopo
  e escopo v1 falharam; ausência de confirmação e caso válido já passavam.
  Isso reproduz a brecha, sem atribuir ao patch uma proteção preexistente.
  Acrescentada regressão de rejeição consultável após perder confirmação.
  Fixtures de caminhos felizes de triagem/HTTP agora carregam escopo atual,
  datas e confirmação, sem remover asserções de autorização ou integridade.
- Repetida a leitura do clone com o Service corrigido: total/novos de
  **4.934 → 0**, grupos e quantidades de registros/capturas idênticos antes e
  depois. Evidência privada em `inventario-ciclo*.json`, sem escrita no clone.
- Confirmação do usuário nesta retomada: **RPO de até 24 horas** e **RTO de
  1 hora**, registrados no runbook. Aceite nativo Word/Excel continua pendente;
  estar no macOS não impede esses aplicativos, mas eles não estão instalados.
- QA intermediária: a imagem-base integral passou, mas não comprova a fonte
  atual. A primeira execução explícita do checkout encontrou 10 falhas por
  falta dos dois CSVs públicos e workflows no arquivo transportado (1.767
  testes passaram). Corrigido somente o empacotamento privado da validação;
  nenhum teste de aplicação foi relaxado para contornar arquivos ausentes.
  Rodada focal: 80 passaram, um contrato HTTP apontou fixture sem escopo,
  corrigida para a prova válida esperada. Aceite final ainda será registrado
  pelo resultado do checkout completo, não pela soma dessas rodadas.
- Resultado final do checkout congelado, com todos os arquivos públicos e
  workflows requeridos: **1.782 testes aprovados em 393,60 s**, sem falhas,
  em Linux arm64/Python 3.12.13/PostgreSQL 16.9 descartável migrado. Contêiner
  sem rede, usuário 10001, entrypoint explícito e `certifi 2026.10.19`
  confirmado. Não usa a rodada da fonte-base como aceite do checkout.
- Gates integrais: Ruff e formatação aprovados (395 fontes), mypy aprovado
  (464 fontes). Pisos linhas/branches: services **96,4%/90,6%**;
  repositories **97,3%/89,0%**; routes **95,1%/70,3%**, sem exclusões novas
  ou redução de thresholds. `git diff --check` aprovado.
- Evidência final privada:
  `/private/tmp/sigeo-fechamento-homologacao-o5mGyC/final/regressao.log`.
  Contêiner descartado automaticamente ao terminar; bancos locais existentes,
  clone servido e produção preservados. Sem commit, push ou deploy nesta rodada.

### Caminho de capacidade aprovado — retomada de 21/10

- Após esclarecer o custo/necessidade de homologação remota, o usuário
  aprovou correção isolada sobre master, seguida de CI e validação controlada
  em produção. É exceção restrita à capacidade dos relatórios: não autoriza
  publicar este plano inteiro, habilitar jobs ou promover a PR #28.
- Checkout separado: `codex/capacidade-relatorios-producao`, base `de81e98`;
  commit `6ecf4cc` contém somente builder DOCX progressivo, admissão por
  processo, adaptação mínima do Service, dependência direta e testes.
- Complemento expressamente aprovado: exportação com prazo total de 90 s
  e sem repetição por timeout; prazo de 15 s das demais chamadas preservado.
  Sem alteração de autenticação, schema, UI, workflows ou plano contratado.
- Adaptação sobre master revalidada em Linux/PostgreSQL descartáveis:
  401 testes, Ruff/formatação/mypy integrais e pisos de camada aprovados.
  Frontend: 187 testes, lint/tipos/formatação/cobertura/build aprovados.
- Três DOCX sintéticos de 16.710 linhas, sem rede, 512 MiB sem swap e 0,1 CPU:
  34,90 / 54,30 / 67,70 s; pico cgroup 169,7 MiB, nenhum OOM. Não inclui
  SQL/proxy/instrumentação no provedor; não certifica SLA remoto.
- Novo filtro Monitorado (Todos/Sim/Não) permanece apenas neste checkout de
  homologação; 884 testes frontend e gates locais aprovados. Fora da correção
  de produção. Banco, migrações e fontes oficiais não foram alterados por ele.
- Gates da publicação mínima concluídos abaixo: PR independente, CI remoto,
  conferência de SHA e publicação controlada. Word/Excel nativos, ciclo nacional
  elegível e aceite RPO/RTO/provedor continuam pendências distintas.
- PR independente #29 aberta, com o filtro Monitorado excluído. Primeiro CI:
  execução funcional, pisos e E2E aprovados, mas auditoria Python e scanner
  da imagem bloquearam certifi preexistente `2026.7.22`.
- Usuário autorizou exclusivamente a correção para `certifi 2026.10.19`;
  commit `73ecf5b` altera somente esse pacote/hashes e registra a evidência.
  Auditoria local sem vulnerabilidades conhecidas; nova regressão Linux
  completa: 401 testes em 9,30 s, gates/pisos aprovados. O CI do SHA final
  foi conferido separadamente abaixo, sem reutilizar o aceite anterior.
- CI final de `73ecf5b`: seis gates aplicáveis aprovados (backend/pisos/
  auditoria, frontend, E2E, imagem/SBOM/scanner, Semgrep e gitleaks). PR #29
  integrada em master como `799d3c6`, com árvore idêntica ao SHA testado,
  conferida por diff vazio e pais do merge. Nenhuma outra PR promovida.
- Deploy exato de `799d3c6` confirmado Live no Render (12:10:41 BRT) e Ready
  em produção na Vercel. Seis gates também aprovados no merge. Sem mudar plano,
  auto-deploy, variáveis, schema ou processos. `/health/live` e `/health`
  responderam 200 antes/depois das exportações; sessão autenticada preservada.
- Aceite controlado pelo Chrome em produção: UF BA, Simplificado, um DOCX e
  depois um XLSX. Três famílias, nove macros por família (27 registros),
  identidades e números equivalentes entre arquivos, ZIP íntegro, células
  numéricas, filtros e congelamento preservados. Originais não reexportados.
  Inspeção de quatro páginas Word e três abas Excel renderizadas concluída;
  Word mantém quebras de linhas de tabela do layout anterior de master.
  Isso não é aceite nativo nem implantação do redesign de homologação.
- New Relic, conta 8544864 / SIGEO API, janela fixa 21/10 15:10–15:40 UTC
  (12:10–12:40 BRT): `Transaction`, nome contendo `relatorio`, duas chamadas,
  média 0,947 s, máximo 1,229 s, zero `error IS true`. Duração do backend,
  não tempo total de download/navegador. Amostra pequena, sem percentil/SLA.
- Na mesma janela, `Metric`: memória física média 152 MB e máximo amostrado
  158,824 MB (`apm.service.memory.physical`). CPU user, pela expressão
  `rate(sum(apm.service.cpu.usertime.utilization), 1 second) * 100`, retornou
  0,00267 no agregado. Não converter esse valor em folga da cota Render:
  normalização do agente/host, média temporal e picos do contêiner são distintos.
  Memória em MB conforme documentação oficial de métricas APM do New Relic:
  https://docs.newrelic.com/docs/data-apis/understand-data/metric-data/query-apm-metric-timeslice-data-nrql/
  Render Free bloqueia seus gráficos de CPU/RAM; não houve upgrade contratado.
- Evidências privadas em `/private/tmp/sigeo-aceite-producao-DJPJ54/`:
  originais, conferência estrutural, renders e capturas do deploy/APM. Nenhum
  payload real incluído no repositório. Não executar estresse concorrente em
  produção para encerrar artificialmente o gate de carga representativa.

### Capacidade de hospedagem e DOCX progressivo — 21/10

Escopo confirmado pelo usuário: tratar capacidade dentro deste plano, sem
autorizar produção. Estratégia apresentada antes da implementação:

- Camadas: builder puro e orquestração de relatório de mérito no Service;
  sem alteração de Repository, query, cálculo, schema ou contrato HTTP.
- Gerar tabelas progressivamente no ZIP em memória, em vez de manter toda
  a árvore XML de municípios; preservar template, conteúdo e paginação.
- Reutilizar formatação da linha para reduzir CPU, sem truncar dados,
  mudar filtros, ampliar timeout, forçar GC ou reiniciar por requisição.
- Manter exclusão mútua de DOCX e independência de XLSX; testar paridade
  estrutural, tabela vazia/curta/longa, caracteres especiais, erro e retomada.
- Conferir visualmente pelo renderizador empacotado e repetir volume do clone,
  HTTP concorrente e carga sintética Linux limitada. Sem dados reais no CI.
- Não alterar plano contratado, processos, deploy, cron ou produção.

Implementação e evidências:

- Novo `app/reports/docx_tabelado.py`: grava as linhas em `word/document.xml`
  sem acumular a árvore, copiando estrutura já formatada por linha. Mantém
  as demais partes do pacote original e não usa arquivo temporário com dados.
  `docx_builder.py` compartilha fonte/paginação com o caminho convencional;
  apenas DOCX de mérito usa o novo caminho em `services/relatorios.py`.
- `lxml` passou a dependência direta explícita. Lock offline preservou a
  versão **6.1.3** já instalada como dependência de python-docx: nenhuma
  atualização de pacote foi necessária.
- 17 casos novos de paridade e falha em `test_reports_docx_tabelado.py`.
  XML de conteúdo, estilos, larguras e paginação comparado ao builder
  convencional; demais partes ZIP idênticas. Não é só teste de abertura.
- Clone, nacional completo: **16.710 linhas/3 famílias**, sete SELECTs,
  integridade conferida contra a seleção canônica. Pico de processo isolado
  caiu de **419,2 para 117,5 MiB**; geração de **9,54 para 2,45 s**.
  São medições macOS locais, não conversão direta para limite do provedor.
- HTTP final: dois lotes de quatro clientes; DOCX nacional **3,04–3,11 s**,
  XLSX **0,11–1,03 s**, um DOCX concorrente recusado corretamente em **503**
  e geração posterior íntegra. RSS máximo observado **295,7 MiB**, ante
  **570,1 MiB** no ensaio anterior. Contagens de domínio preservadas; há
  diferença de aquecimento/estado do processo entre rodadas, não A/B exato.
- Linux arm64 descartável, sem rede, RAM **512 MiB**, sem swap, aplicação
  importada e linhas sintéticas de igual volume. Versão só com redução de
  memória levou **101,39 s** sob **0,1 CPU**, ultrapassando o prazo de 90 s.
  Por isso a correção também reutiliza a formatação XML da linha.
- Revisão final, mesmos limites, três gerações consecutivas: **28,09 s**,
  **29,99 s**, **47,50 s**; todas com **16.710 linhas**, sem erro de ZIP.
  Pico do cgroup **150,5 MiB**, `oom=0`, `oom_kill=0` e `max=0`.
  Esse teste é de montagem/serialização: não inclui SQL, proxy, tráfego
  concorrente ou instrumentação New Relic. Não certifica prazo HTTP remoto.
- Regressão integral Linux da primeira revisão progressiva: **1.777 testes**
  em **424,58 s**, pisos de camada mantidos. Após otimização de CPU, **180
  testes focados** em Linux/PostgreSQL em **73,62 s** e **47 locais**
  aprovados; Ruff, formatação e mypy integrais sem erro. Não atribuir a
  suíte integral anterior ao SHA final ainda não publicado no CI remoto.
- Skill de documentos usada apenas na inspeção visual dos bytes exportados.
  DOCX de mérito BA manteve duas páginas; comparação dos PNGs contra o
  arquivo anterior encontrou diferença somente no horário de geração.
  Não houve redesign. Aceite nativo do usuário continua pendente.
- Evidência privada em `/private/tmp/sigeo-capacidade-oUMUoo/` e metadados
  do volume em `/private/tmp/sigeo-volume-real-aT8DKr/`. Dados do clone não
  entraram em fixture, commit, imagem QA ou serviço externo.

Hospedagem verificada em leitura no painel Render em 21/10: `sieo-backend`
está **Free, 0,1 CPU, 512 MB RAM**, vinculado a `master`, com último commit
publicado `de81e98`; auto-deploy aparecia desabilitado por publicação de SHA
específico. Nada disso foi alterado. A configuração coincide com o
`render.yaml` e com a [documentação de planos do Render](https://render.com/docs/compute-plans).
Não foram acionados Edit, Upgrade ou Manual Deploy.

Estratégia inicial (substituída pelo caminho de capacidade aprovado acima):
hospedar/validar a revisão em alvo remoto de
homologação isolado, com banco de homologação, CPU/RAM e observabilidade
comparáveis. Não há esse alvo verificado nesta rodada; criá-lo ou mudar o
serviço de produção exige decisão/autorização própria. O ganho medido reduz
o risco observado, mas não garante suporte a qualquer quantidade de usuários,
cargas simultâneas ilimitadas, novos volumes ou disponibilidade do plano Free.

### Concorrência HTTP no volume do clone — 21/10

- Continuidade do aceite de volume e concorrência já aprovado, não nova
  suíte com dados reais no CI. Script e metadados privados preservados em
  `/private/tmp/sigeo-concorrencia-clone-TWIQn4/`; nenhum payload Office
  foi salvo nesse ensaio. Preflight conferiu loopback, runtime restrito e
  OID do clone antes de qualquer autenticação. Um processo Uvicorn existente,
  com quatro clientes independentes compartilhando somente a sessão local.
- Primeiro lote: DOCX nacional completo de mérito e três XLSX nacionais
  completos (mérito e instrumentos, este repetido). **4 HTTP 200**;
  DOCX **10,91 s**, XLSX **0,96–5,25 s**, integridade ZIP aprovada.
  Um pedido repetido carregava `uf=BA` com `escopo=brasil`: pelo contrato,
  o escopo Brasil prevalece; ele não comprova filtro por Bahia.
- Segundo lote: dois DOCX nacionais completos de mérito e dois XLSX
  nacionais completos. Um DOCX terminou **200 em 10,84 s**; o concorrente
  foi recusado **503 em 0,008 s**, com mensagem de domínio esperada e sem
  Content-Disposition. Ambos XLSX terminaram **200** e íntegros.
- Após a disputa, DOCX completo do CNES `0000434` retornou **200** e
  íntegro. As contagens das nove tabelas de domínio inventariadas ficaram
  iguais antes/depois. Isso não é comparação byte a byte de toda a carteira;
  login/saída geram os registros locais de autenticação esperados.
- Health `/health`: **52 amostras HTTP 200**, maior duração **0,370 s**.
  A rota executa `SELECT 1` (conferido em `app/main.py`); comprova essa
  conexão mínima naquele instante, não consultas de negócio, todas as rotas,
  comportamento do proxy ou experiência no navegador durante a carga.
- RSS observado do servidor separado por amostragem (`ps`, intervalos com
  espera de 250 ms): primeiro lote começou em **191,4 MiB** e chegou a
  **531,2 MiB**; segundo começou/chegou a **570,1 MiB**. Não é pico exato
  nem medição isolada de alocação de uma requisição. O processo já tinha
  atendido outras exportações; retenção de memória sozinha não prova leak.
- **Risco de capacidade permanece aberto**: esta carga não cabe com folga
  num orçamento total de 512 MiB. Não extrapolar o RSS macOS para Linux,
  nem presumir o plano/limite atual do provedor. O aceite remoto deverá
  confrontar memória e concorrência disponíveis, processos/réplicas e
  outras rotas, antes de decidir otimização adicional ou limite de recorte.
  Não reduzir dados, mudar parâmetros, forçar GC/restart por requisição
  ou enfraquecer o gate para declarar aprovação.
- Nenhuma chamada a fonte oficial, ingestão, notificação de domínio,
  migration, merge, cron, deploy ou alteração em produção nesta rodada.

### Arquivos para aceite nativo e prazo de recuperação — 21/10

- Interface, API e caixa de e-mail retomadas exclusivamente em loopback
  (5181/8001/8002), usando o launcher do clone protegido; sem produção.
- Quatro arquivos originais baixados por `GET /relatorios` autenticado na
  API local: Instrumentos e repasse, completo, CNES `0000434` (DOCX/XLSX),
  e Análise de mérito, simplificado, UF BA (DOCX/XLSX). HTTP 200, MIME,
  Content-Disposition, CRC e SHA-256 conferidos. Não houve reautoria dos
  arquivos nem alteração do layout com ferramentas de prévia.
- Lote privado: `/private/tmp/sigeo-aceite-office-9fiLLU/`; manifesto e
  `qa-integridade.json` preservados fora do Git. Autenticação/saída registram
  somente a sessão local; exportação não executa ingestão ou mutação da
  carteira. Esta prova HTTP é distinta do lote anterior somente leitura SQL.
- Prévia LibreOffice dos dois DOCX: 8 e 2 páginas; todas inspecionadas.
  XLSX: 6 e 3 abas importadas/renderizadas em modo de leitura. Conferência
  do OOXML original confirma 6 instrumentos, 16 linhas de timeline,
  9 macrorregiões por família publicada na Bahia e CNES/CNPJ textuais,
  preservando zeros iniciais; sem células de erro. Os hashes dos quatro
  originais continuaram idênticos depois da inspeção.
- A prévia de planilha pode interpretar texto numérico/formato monetário
  conforme seu renderizador. Isso não autoriza mudar tipos nem reexportar
  os arquivos: o aceite no Excel deverá conferir identificadores, zeros e
  moeda pt-BR no original. Não foi declarado aceite nativo antecipado.
- Aceite solicitado ao usuário: abrir ambos DOCX no Word e ambos XLSX no
  Excel sem aviso de reparação; conferir acentos, recorte, valores/datas,
  tabelas entre páginas, filtros, cabeçalhos congelados e CNES `0000434`.
  Registrar versão dos aplicativos e eventual página/aba/célula com falha.
- Recuperação: usuário confirmou **1 hora para voltar (RTO)** e **perda
  máxima a definir (RPO)**. Decisão refletida no runbook; não configura
  backup, não comprova capacidade do provedor e não autoriza corte real.

### Fechamento do CI e continuidade do aceite — 20/10

- PR #28 permanece em rascunho para `homologacao`; commits `29153a5` e
  `a78e521` corrigiram formatação, portabilidade do E2E e isolamento do banco
  de CI. Mensagens seguem o padrão do projeto, identidade Git preservada.
- Backend remoto: **1.760 testes em 422,98 s**, PostgreSQL/server/clients
  **16.15**, x86_64, com loopback efetivo. Services **96,4%/90,6%**,
  Repositories **97,3%/88,9%**, Routes **95,1%/70,3%** (linhas/branches).
  `pip-audit` sem vulnerabilidades conhecidas; nenhum piso reduzido.
- Frontend remoto aprovado e artefato de cobertura publicado; E2E **10/10
  em 48,4 s**. Semgrep, Gitleaks, actionlint e SBOM/imagem aprovados.
  Resultados e links das execuções registrados na descrição do PR.
- Repetição Linux local limpa: **1.760 testes em 449,19 s**, mesmos pisos,
  Ruff/formatação/mypy aprovados. Dois contêineres QA encerrados/removidos;
  cluster E2E nativo sintético descartado, logs preservados. Nenhum banco
  preexistente, `master` ou `homologacao` compartilhada foi alterado.
- Próxima prova dentro do escopo aprovado: inventariar e exportar recortes
  representativos do clone local validado por OID/runtime, em transações
  somente leitura, sem autenticação/escrita, rede externa ou produção.
  Medir tempo, consultas, tamanho e pico do processo; conferir identidades
  e contagens dos arquivos finais contra a seleção canônica da aplicação.
- Essa prova é aceite local de Service/SQL e integridade OOXML, não SLA,
  benchmark de provedor, carga simultânea HTTP ou aceite nativo Word/Excel.
  Dados privados e arquivos não entram no Git/CI. Não criar fixtures com
  dados reais, instalar aplicativos pagos ou inventar candidato oficial.

### Volume do clone e reconsulta limitada das fontes — 20/10

- Inventário agregado com runtime restrito, OID validado e transação
  `READ ONLY`/`REPEATABLE READ`: 560 convênios armazenados (seis fora de
  escopo), 248 instrumentos armazenados, 28 propostas, 1.571 eventos,
  213 ações, 363 linhas macro e 16.710 municipais. Não é inventário novo
  da produção: são os dados do clone de homologação, sem copiar payloads
  privados ou cadastrar esses registros como fixtures no CI.
- **18 combinações aprovadas**: Brasil em ambos os tipos, níveis e formatos;
  instrumentos completos em XLSX/DOCX por BA, tipo Convênio, acelerador,
  município Salvador/BA e CNES. Cada caso roda em processo próprio, no
  Service real, com SQL e guardas reais; geração somente em SELECT.
- Arquivos ficaram em memória: CRC/OOXML e identidades/contagens conferidos
  contra a seleção canônica dos Services. No nacional de instrumentos, a
  aplicação selecionou **554 convênios, 28 propostas, 246 monitorados**;
  exclusões não foram removidas nem redefinidas pelo ensaio. XLSX completo
  preservou todas as ocorrências da timeline; DOCX conferiu os blocos sem
  duplicar instrumentos compartilhados entre fontes.
- Mérito usou as três famílias publicadas, sem mudar resolução de execução
  por família ou cálculo: simplificado com **363 linhas**, completo com
  **16.710**. Ambos os formatos preservaram todas as linhas selecionadas.
- Medição nacional no Mac (tempo de geração / bytes / pico do processo):
  instrumentos completo DOCX **3,145 s / 202.238 / 271.810.560**; XLSX
  **0,270 s / 164.953 / 186.613.760**. Mérito completo DOCX **9,538 s /
  342.817 / 439.549.952**; XLSX **0,509 s / 566.605 / 133.414.912**.
  RSS de Darwin pós-exec, antes da validação; não é RAM por requisição.
- Geração em 7–12 consultas por caso; nacional completo de instrumentos:
  DOCX 11, XLSX nove; mérito sete. Essas medições não provam SLA, p95,
  cold start, isolamento HTTP ou capacidade sob concorrência no provedor.
  **Atenção de capacidade:** o DOCX nacional atingiu aproximadamente 419 MiB
  neste processo; manter o aceite de RAM/provedor aberto, sem extrapolar esse
  número de Darwin para Linux ou prometer ausência de OOM.
- Evidências privadas em `/private/tmp/sigeo-volume-real-aT8DKr/`: launcher,
  inventário, 18 metadados de resultado e `aceite.log`. Zero escrita no clone;
  nenhum arquivo de relatório/dado privado foi adicionado ao repositório.
- Reconsulta pública limitada concluída às **20:00:53 UTC**: 825374 passou
  no contrato mínimo de identidade do Portal; 7AAFRI não foi encontrado;
  7AAFSX continua sem `dimConvenio.numero` e `dimConvenio.objeto`. Não criar
  candidato, aprovação ou notificação com esse payload incompleto.
- O pequeno ZIP oficial de data de carga passou em CRC e informou
  **20/10/2026 06:36:02**, SHA-256
  `470ba9dd084f5e156326d94179d1b3f59aae2617c2212e382a985f5a35aa7990`.
  Isso não certifica o frescor de todos os demais arquivos nem substitui
  uma nova coleta nacional persistente. Nenhuma publicação ou escrita SQL.
- Word/Excel nativos continuam ausentes nesta máquina. Foram solicitados ao
  usuário disponibilidade para aceite nativo e limites operacionais de perda
  de trabalho/parada; não escolher retenção/RPO/RTO em nome da equipe.
- Sem mudança de aplicação, dependência, schema ou gatilho; nenhum merge,
  deploy, migração operacional ou ativação de cron. Novos planos de itens/
  fotos e identidade SISGEO permanecem separados e não iniciados.

### Publicação isolada para revisão — 20/10

- Usuário autorizou commit e push em branch isolada, sem merge ou deploy;
  mensagem de commit segue o histórico do projeto, sem menção à ferramenta.
  Preservar a identidade Git configurada e não escrever em `master` ou na
  `homologacao` compartilhada.
- Remoto confirmado pela API do GitHub: o endereço antigo redireciona para
  `devs-ministerio/par_equipamentos`. Nenhuma troca de repositório ou force push.
- Pré-publicação: Trivy 0.70.0, scanner de segredos sem rede, não encontrou
  achados nos arquivos pendentes; actionlint 1.7.10 aprovou os workflows.
  `git diff --check`, Ruff integral e formatação dos 393 arquivos passaram.
  Não foram incluídos `.env`, dumps, logs ou artefatos operacionais privados.
- Push de branch isolada não aciona os gates existentes: os eventos atuais
  são push em `master` ou pull request. CI remoto permanece pendente de PR;
  não alterar gatilhos, ativar cron ou publicar produção para contornar isso.

### CI remoto — primeira execução e correções em 20/10

- PR **#28**, rascunho para `homologacao`, autorizado pelo usuário; nenhum
  merge/deploy/migration remota de ambiente operacional. A integração Vercel
  registrou preview automático; não é publicação de produção.
- Primeira rodada do SHA `168c799`: Semgrep, SBOM/imagem, actionlint e
  Gitleaks passaram. Frontend, backend e E2E falharam; resultado local
  anterior não será usado como substituto da validação remota.
- Frontend: cinco arquivos fora do Prettier, corrigidos em commit exclusivo
  de formatação (`29153a5`); gate integral local voltou a passar.
- E2E: screenshots tinham `/private/tmp` fixo do macOS; usar `outputPath`
  do próprio Playwright. Logs confirmaram 429 depois de cinco logins em um
  minuto: compartilhar sessão somente em memória nos testes de consulta,
  com contexto isolado por teste e login/saída ainda exercitados de verdade.
  Não ampliar/desligar rate limit, adicionar retry ou remover cenários.
- Backend: NAT do service container faz `inet_server_addr()` retornar IP
  de bridge apesar do cliente usar 127.0.0.1. Preservar todas as guardas dos
  utilitários; substituir somente o banco dos dois workflows por cluster
  PostgreSQL 16 novo, nativo, loopback/porta 5433 e diretório privado no runner
  GitHub hospedado/efêmero. Bootstrap recusa execução local/self-hosted.
- Escopo de infra: workflows backend/ensaio e helper compartilhado; gates e
  gatilhos existentes preservados. Sem novos secrets, cron, serviço pago ou
  recurso persistente. Custo limitado às execuções já autorizadas do CI;
  rollback por reversão do commit antes de merge, sem impacto em produção.
- TCP: filho Python executa fora do checkout; declarar caminho de importação
  somente do backend em vez de depender do `PYTHONPATH` da máquina de QA.
- Validar bootstrap real sem rede em Linux não-root, suíte integral sem
  `PYTHONPATH` herdado e stack E2E nova com PostgreSQL/credenciais sintéticos.
  Não versionar os bancos, senhas ou artefatos privados desses ensaios.
- Regressão local frontend após correção: **867 testes**, pisos por camada,
  lint, tipos, build e Prettier integral aprovados. E2E **10/10 em 45,8 s**,
  três logins reais 200 e nenhum 429; processos próprios encerrados.
- Bootstrap exercitado em Linux arm64/Python 3.12.13, UID 10001, PostgreSQL
  16.9 em 127.0.0.1:5433, sem rede/portas do host. Duas falhas da primeira
  repetição vieram das variáveis PG da imagem base de QA: limpar o ambiente
  desse launcher privado, não a guarda do produto. Repetição integral limpa
  em andamento; não declarar CI remoto aprovado antes do resultado do GitHub.
- Corrigido também o upload frontend para `frontend/coverage/…`, com teste de
  regressão; sete testes dos workflows e gates estáticos locais aprovados.
- Evidências privadas: `/private/tmp/sigeo-ci-evidencias-zhGTeH/` (frontend
  e stack E2E) e `/private/tmp/sigeo-ci-loopback-mlEuJM/` (Linux/cluster).

### Portabilidade Linux/PostgreSQL 16 — execução local de 20/10

- Continuação aprovada pelo usuário após autorização explícita para iniciar
  OrbStack; nenhum contêiner antigo será reutilizado, reiniciado ou removido.
- Receita QA em diretório temporário privado: Python 3.12.13 da imagem local,
  PostgreSQL/clients 16.9 Debian e `uv sync --frozen` com o lock atual.
  Não alterar Dockerfile, compose, workflow ou dependências do projeto.
- Contexto de build por lista permitida: fontes Python, template Alembic,
  manifests travados e YAMLs dos workflows usados pelos testes; sem `.env`,
  credenciais, dumps, cache, dados coletados ou `.venv` macOS. Manifesto SHA256.
- Rede Docker própria interna, sem portas publicadas; testes compartilham
  namespace do PostgreSQL para manter 127.0.0.1 e guardas locais existentes.
  Nenhum Docker socket/checkout/.env do host será montado nos contêineres.
- Banco novo apenas sintético; PostgreSQL e runner não-root, credenciais
  aleatórias exclusivas de QA, e-mail/Portal/New Relic desligados. Registrar
  versões/arquitetura e executar migrations, gates integrais, suíte e cobertura.
- Downloads de build só de imagens/pacotes para QA; testes rodam sem saída
  externa pela rede interna. Artefatos em diretório privado do host.
- Encerrar/remover somente IDs próprios com etiqueta única e a rede criada;
  sem prune, stop global, volume atual, cron, commit, push ou produção.
- Linux arm64 local não equivale a GitHub Ubuntu amd64 nem aceite do provedor.
  Registrar falhas reais sem skips, mocks de domínio ou relaxamento de pisos.
- Primeira rodada completa: **1.742 passaram / nove falharam, 239,74 s**;
  gates estáticos e migration head passaram. Evidências no diretório privado
  `/private/tmp/sigeo-linux-pg16-qFAyV9/`, `regressao-linux.log`, `resultado.json`,
  manifesto SHA256 e `evidencias/versoes.json`; **sem OOM**, recursos próprios
  removidos e três contêineres anteriores permaneceram parados.
- Sete falhas de contexto QA: CSVs de coordenadas/radiofármacos e script de
  boot ausentes, além do teste acoplado à planilha real Controle PERSUS.
  Incluir somente os dois CSVs de referência vendorizados e `start-server.sh`
  no contexto permitido; nunca a planilha operacional real ou dados coletados.
- Duas falhas de teste por SQLSTATE: PG16 retorna **23503** no DELETE RESTRICT,
  PG18 **23001**. Mudança confirmada no
  [commit oficial 086c84b23](https://github.com/postgres/postgres/commit/086c84b23).
  Não mudar FK/migration; esperar código exato pela versão e reforçar identidade
  da constraint, política RESTRICT e preservação dos registros após a recusa.
- Ajustar só `test_migration_escopo_radar_aditiva_db.py` e
  `test_reconstruir_fases_monitoramento.py`: substituir o XLSX real por fábrica
  sintética com aliases divergentes e casos de CNES único/ambíguo; parser real,
  sem mock/produção. Validar os módulos no PG18 e repetir suíte Linux PG16,
  mantendo artefatos da primeira reprovação e gates integrais.
- Os dois módulos corrigidos passaram no PG18: **18 testes / 4,03 s**,
  `/private/tmp/sigeo-concorrencia-backend-mrapd2zk/regressao.log`.
- Segunda rodada Linux: **1.752 testes / 234,74 s**, pisos aprovados, exit 0
  e sem OOM. Artefatos em `rodada-2/`; rede/contêineres próprios removidos.
  **Não usar o RSS desta rodada para capacidade:** o valor idêntico nos quatro
  processos revelou contaminação do contador `getrusage` após fork/exec Linux.
- Prova mínima isolada: pai com bytearray de 128 MiB; filho Linux executando
  apenas stdlib informou **145.825.792 bytes** em rusage, mas **11.408 kB** em
  `VmHWM` do novo processo. No Darwin, a mesma forma de lançamento retornou
  **15.597.568 bytes**, sem herdar os 128 MiB do pai.
- Corrigir somente instrumentação QA: helper `tests/recursos_servidor.py`
  lê `VmHWM` de `/proc/self/status` em Linux, mantém bytes do kernel no Darwin
  e recusa ausência/unidade não validada sem fallback silencioso. Launcher
  grava fonte da medida e contador rusage bruto como diagnóstico; fixture TCP
  verifica fonte e pico positivo após encerrar o filho.
- Cinco testes de kernel/arquivo passaram (**0,02 s**, evidência
  `/private/tmp/sigeo-concorrencia-backend-u27t1k66/regressao.log`), incluindo
  conversão kB→bytes, ausência/unidade, Darwin e plataforma desconhecida.
  Mocks só nas bordas de kernel/arquivo. Ruff e mypy de 462 fontes passaram;
  sem alteração de aplicação.
- **Gate final Linux concluído:** **1.757 testes / 240,39 s**, Ruff integral,
  formatação de **393 arquivos** e mypy de **462 fontes** passaram. Services
  **96,4% linhas / 90,6% branches**, Repositories **97,3% / 88,9%**, Routes
  **95,1% / 70,3%**; nenhum piso reduzido, skip ou erro silenciado.
  Evidências em `/private/tmp/sigeo-linux-pg16-qFAyV9/rodada-3/`:
  `regressao-linux.log`, `resultado.json`, `manifesto-fonte.sha256` e
  `evidencias/{versoes,coverage}.json`. Imagem QA rastreável:
  `sha256:75cfe3cec8d5ae2c3ead95ded6ff38556d5af19d3410892e95e18092affed210`.
- Metadados: Linux aarch64, Python 3.12.13, PostgreSQL **160009**, dump/restore
  **16.9**, runner UID **10001**; exit **0**, sem OOM. Limites do laboratório:
  runner **4 GiB/4 CPUs**, banco **1 GiB/2 CPUs**; não são limites de produção.
- Pico real pós-exec Linux (`proc_vm_hwm_pos_exec`): misto **282.136.576 bytes**;
  DOCX com admissão **269.983.744**; quatro DOCX sequenciais **378.081.280**;
  quatro XLSX **199.168.000**. DOCX concorrente: um 200/três 503; sequencial
  e XLSX: quatro 200. Estes picos descrevem o processo neste laboratório,
  não RAM por requisição, teto garantido ou ausência de retenção/vazamento.
- Conferência final Docker: somente os três contêineres antigos, ainda parados;
  redes somente bridge/host/none. Recursos QA próprios removidos, sem limpar
  recursos alheios. Imagens/cache de build e evidências privadas permanecem
  para reuso/auditoria; nenhuma imagem foi publicada em registry.
- Sem commit/push/deploy, alteração de aplicação, migration, workflow ou
  produção nesta etapa. Permanecem CI remoto/scans/aceite do provedor,
  Word/Excel nativos, carga representativa real e identidade oficial completa.

### Paridade dos gates estáticos com CI — continuação local de 20/10

- Escopo do fechamento aprovado: executar os comandos integrais do workflow,
  não equiparar `mypy app` a `mypy .`. Sem alterar workflow, pisos ou exclusões.
- Diagnóstico: Ruff integral passou; formatação passou em 391 arquivos;
  `mypy .` encontrou **oito erros em quatro arquivos**, ao conferir 460 fontes.
  Evidência `/private/tmp/sigeo-gate-ci-local-U9whpP/{lint,format,mypy}.log`.
- Corrigir somente testes: `test_reports_xlsx_builder.py` (coleção heterogênea
  explicitamente tipada), `test_reports_docx_builder.py` (propriedades XML e
  geometria obrigatórias neste cenário), `test_relatorios_matriz_db.py`
  (estilo presente) e `test_auth_session.py` (bind Engine antes de conectar).
- Manter os mesmos dados, casos e oráculos; adicionar assertivas de presença,
  sem `type: ignore`, cast/Any novo, mock de domínio ou mudança na aplicação.
- Reexecutar os quatro módulos em banco descartável e todos os três comandos
  estáticos integrais; registrar o gate atual sem apagar a falha anterior.
- **Correção e validação concluídas:** Ruff integral e formatação sem falhas;
  `mypy .` passou em **460 arquivos**. Logs finais no mesmo diretório privado,
  `{lint,format,mypy}-final.log`; os oito erros originais permanecem em
  `mypy.log`. Somente anotações/assertivas nos quatro módulos, sem aplicação,
  fixtures, dados de teste, regras de layout, auth ou transporte modificados.
- **132 testes passaram em 4,31 s** nos quatro módulos corrigidos, em banco
  descartável migrado e removido. Evidência
  `/private/tmp/sigeo-concorrencia-backend-u1gs_heo/regressao.log`.
  Última suíte integral: 1.751 testes antes desse ajuste restrito de testes;
  não registrar o recorte como uma nova execução integral ou CI remoto verde.
- Naquela verificação inicial, o CLI Docker existia no contexto `orbstack`,
  mas o socket do daemon não existia; OrbStack ainda não havia sido iniciado.
  A execução posterior autorizada está registrada na seção Linux acima.
  Word/Excel ausentes em `/Applications`; não substituir o aceite nativo por
  Pages/Numbers. CI remoto e ambientes não executados continuam pendentes.
- Sem produção, commit, push, deploy, dependência ou novo serviço externo.

### Proteção de concorrência DOCX — aprovada e implementada localmente em 20/10

- Aprovação: usuário respondeu **“Continue”** à proposta explícita de uma
  geração DOCX por processo, mensagem de ocupado e ausência de produção.
- Objetivo: evitar múltiplos documentos XML grandes em construção no mesmo
  processo; não reduzir teto de registros, filtros ou conteúdo dos relatórios.
- Política implementada: uma geração DOCX por processo, sem fila bloqueante.
  Se ocupado, responder **503** com erro controlado, sem iniciar montagem
  pesada; usuário pode tentar novamente. XLSX e demais rotas não usam a trava.
- Trava no Service, independente do lock interno XML; liberar em `finally`
  inclusive após erro. Não guardar DB/usuário/arquivo na trava nem implementar
  lock distribuído, nova dependência ou tarefa assíncrona de longa duração.
- Arquivos: novo helper tipado de admissão em `app/services/`,
  `app/services/relatorios.py`, `app/domain_errors.py`,
  `frontend/src/services/relatorios.ts` e testes correspondentes.
- Frontend exibe mensagem local segura e específica para 503 de exportação,
  sem expor texto cru do servidor nem retry automático. Download bem-sucedido
  permanece com o mesmo MIME/nome/conteúdo e prazo atual.
- Testes: exclusão mútua real entre threads, liberação após erro, segunda
  exportação possível, XLSX não bloqueado; contrato HTTP de ocupado sem anexo;
  integração TCP com SQL/builders reais e frontend sem download/retry em 503.
- Riscos: novo estado visível de servidor ocupado; limite é por processo,
  não global entre workers/réplicas. Não certifica RAM no provedor, nem evita
  sozinho todo risco de volume de um único DOCX ou concorrência com XLSX.
  O 503 controlado pode contar nas métricas de erro do provedor/APM; distinguir
  essa recusa de capacidade de falha inesperada no aceite operacional, sem
  silenciar globalmente 503 nem alterar alertas/produção nesta implementação.
  Abort/timeout do cliente não libera antecipadamente a reserva de trabalho
  que ainda esteja executando no servidor; não é cancelamento de thread.
- Gates: Ruff/mypy, suíte backend/cobertura em banco descartável, testes do
  frontend e typecheck/lint; CI remoto e provedor permanecem pendentes.
- Sem produção, migration, mudança de worker/plano, commit ou deploy.
  Helper `relatorios_admissao.py` faz aquisição não bloqueante e libera em
  `finally`; `montar_relatorio` protege ambos os relatórios Word e mantém
  pré-condição de mérito/CNES antes da admissão. XLSX não adquire reserva.
- O frontend usa texto local seguro para 503, inclusive se vier de um proxy,
  sem presumir que todo 503 prova outra geração, sem ler corpo potencialmente
  sensível, iniciar download ou renovar/repetir a chamada automaticamente.
- **21 testes direcionados passaram em 37,96 s**: exclusão entre threads,
  liberação após exceção, contrato de ocupado para os dois relatórios,
  precedência de 401/422, XLSX durante reserva e nova geração após liberação;
  ASGI/SQL e TCP/builders reais, recortes/MIME/ZIP/IDs/domínio preservados.
  `/private/tmp/sigeo-concorrencia-backend-_n1ymyoi/regressao.log` e JSONs
  dos quatro cenários TCP no subdiretório `pytest`.
- No ensaio de quatro DOCX de 500 simultâneos: **um 200 / três 503**, pico
  servidor **313 MiB**, arquivo aceito em **4,30 s**. Quatro XLSX: todos 200.
  Controle sequencial: quatro DOCX 200, pico **345 MiB**. Comparação com
  **576 MiB** sem admissão da rodada anterior é observação local, não garantia
  de memória constante, ausência de vazamento ou capacidade em Linux/provedor.
- Frontend integral: **867 testes / 110 arquivos**, **19,86 s**; hooks
  **82,7% linhas / 74,9% branches**, componentes **78,7% / 74,7%**, pisos
  aprovados. Evidência `/private/tmp/sigeo-admissao-frontend-GZKAgc/regressao.log`
  e `coverage/coverage-final.json`; lint, typecheck, build e Prettier passaram.
  Dois casos novos usam Service/hook reais com somente `fetch` substituído:
  503 não vaza diagnóstico, não baixa/reitera e permite tentativa manual.
- **Regressão integral pós-admissão:** **1.751 testes passaram em 321,42 s**,
  banco PostgreSQL descartável migrado e removido ao final. Evidência em
  `/private/tmp/sigeo-concorrencia-backend-lkoib560/regressao.log` e
  `coverage.json`. Services **96,4% linhas / 90,6% branches**, Repositories
  **97,3% / 88,9%**, Routes **95,1% / 70,3%**; todos os pisos aprovados.
  Helper de admissão: **100% linhas/branches**. Ruff, formatação Python e
  mypy de **127 arquivos** passaram. Sem alteração de produção ou banco servido.

### Transporte TCP e memória do servidor separado — continuação local de 20/10

- Continuação do diagnóstico de capacidade: comparar os quatro DOCX de 500
  com as mesmas quatro exportações sequenciais, usando processo/banco novos
  e os mesmos quatro perfis/recorte. Reutilizar o teste TCP; confirmar ausência
  de sobreposição no controle, todos os IDs e domínio preservado. Medir pico
  por processo, sem forçar GC, mockar builders ou modificar limites da API.
  O contraste não comprova vazamento ou ausência dele, pois RSS máximo não
  mede retorno de memória após cada pedido. Gates locais após a extensão;
  nenhum recurso de produção, dependência ou contrato alterado.
- **Controle sequencial concluído:** quatro cenários TCP passaram em
  **52,87 s**; `/private/tmp/sigeo-concorrencia-backend-hze9wecl/regressao.log`
  e JSONs `tcp-resultados`/`recursos-servidor` nos quatro subdiretórios pytest.
  Quatro DOCX sequenciais: **4,29–4,33 s** cada, soma **17,26 s**, pico
  **354 MiB**, sem sobreposição. Quatro concorrentes nesta mesma rodada:
  **17,14–17,84 s** cada, pico **576 MiB**. Todos exportaram os mesmos 500
  IDs, com ZIP íntegro e sem alterar domínio; autenticação/CSRF/401/422
  continuam validados. Evidência compatível com custo maior de coexistência
  XML, não prova de vazamento ou capacidade nacional. Não calcular ganho
  como SLA nem atribuir todo RSS à árvore XML, pois inclui runtime/imports.
- Extensão restrita ao teste parametrizado: Ruff/formatação/mypy passaram;
  quatro casos TCP atuais executados. A última regressão integral permanece
  a de **1.747 testes** abaixo, anterior ao acréscimo do controle sequencial;
  não apresentar **1.748** como uma suíte integral já rodada.
- Complementar ASGI e volume com Uvicorn real em processo próprio e proxy
  HTTP local que remove `/api`, em portas dinâmicas exclusivas do loopback.
  Não é emulação do Vercel/Render, TLS, CDN ou comportamento de navegador.
- Fixture em banco filho descartável migrado e carteira sintética preenchida
  de 500 instrumentos. Nenhum override de autenticação/Service/Repository;
  só destino SQL do seed é ligado ao filho. Quatro perfis ativos sintéticos.
- Login por cookies através do proxy, refresh em `Path=/api/auth`, recusa
  de CSRF ausente, renovação válida e quatro exportações disparadas juntas
  (DOCX/XLSX, recortes 500/1/vazio); 401/422 nunca entregam anexo.
- Três cenários com servidor/banco próprios: misto, quatro DOCX de 500 e
  quatro XLSX de 500; medir recursos por processo novo, não RSS cumulativo
  do pytest. Investigar pico alto antes de propor qualquer limite de runtime.
- Conferir todos os identificadores, MIME, nome/ZIP íntegro e domínio sem
  mutação. Sessões/auditoria de autenticação são escritas esperadas no filho.
- Medir duração observada por cliente, sobreposição e pico RSS/CPU somente
  do processo Uvicorn ao encerrar, separado do cliente que relê os arquivos.
  Não impor SLA flaky, declarar limite de RAM ou cancelar trabalho do servidor
  pelo simples abort do cliente. Não logar senha, cookies ou conteúdo exportado.
- Reutilizar dependências instaladas, sem pacote/provedor novo. Fixture,
  launcher e teste ficam em `backend/tests/`; registrar guarda DB, gates
  estáticos e regressão. Sem código de aplicação, endpoint ou cookie de
  produção alterado. Encerrar apenas processos/sockets/banco criados no teste.
- Word/Excel ausentes em `/Applications`: aceite nativo continua pendente,
  sem instalar software ou substituir por leitor estrutural. Identidade
  oficial incompleta e aceites remotos permanecem separados no checklist.
- **Ensaio TCP concluído:** três testes passaram em **32,02 s**, com banco e
  servidor novos por cenário. Evidências em
  `/private/tmp/sigeo-concorrencia-backend-__g4zmev/regressao.log` e
  `pytest/test_proxy_tcp_exporta_recorte{0,1,2}/{tcp-resultados,recursos-servidor}.json`.
  Misto: DOCX 500 em **4,45 s**, XLSX 500 em **0,25 s**, DOCX 1 em
  **0,28 s**, XLSX vazio em **0,03 s**; pico servidor **330 MiB**.
  Quatro DOCX 500: **17,11–17,80 s** por cliente, pico **633 MiB**.
  Quatro XLSX 500: **0,55–0,59 s** por cliente, pico **236 MiB**.
  São observações locais de uma rodada, não percentis/SLA nem orçamento
  de memória de produção. CPU usuário/sistema registrada nos mesmos JSONs.
- **Risco de capacidade identificado, não encerrado:** a rota síncrona pode
  construir vários documentos em threads. O lock do builder protege cada
  operação XML, não o ciclo inteiro do relatório; os objetos `Document`
  permanecem em memória até serialização. Isso permite coexistência dos
  documentos; o pico observado não prova vazamento. `StreamingResponse`
  recebe bytes já prontos, portanto não evita o custo de construção XML.
  Não comparar diretamente macOS com limite do provedor Linux nem declarar
  que quatro DOCX cabem no serviço atual. Antes do aceite operacional,
  medir carga/concorrência representativas no ambiente de destino e decidir
  política de admissão/fila ou recursos, sem aplicar limites silenciosos.
- **Regressão integral após o ensaio:** **1.747 testes passaram em 318,47 s**,
  PostgreSQL descartável migrado e removido ao final; evidência em
  `/private/tmp/sigeo-concorrencia-backend-7rdh5yj2/regressao.log` e
  `coverage.json`. Pisos aprovados: Services **96,3% linhas / 90,6% branches**,
  Repositories **97,3% / 88,9%**, Routes **95,1% / 70,3%**. A suíte não
  substitui os aceites externos/operacionais pendentes do checklist.
- Ruff de aplicação/QA, formatação dos quatro arquivos de teste/guarda e
  mypy de **127 arquivos** passaram. Nenhuma mudança de aplicação foi
  necessária neste ensaio. Sem produção, commit, push ou deploy.

### Monitoramento preenchido e consultas em lote — continuação local de 20/10

- Reproduzir N+1 identificado em `services/relatorios.py`: eventos/ações e
  catálogo relidos por instrumento. Medir SELECTs reais em recortes de 1 e
  8 instrumentos antes de corrigir, sem mockar Repository/Service/builders.
- Carregar históricos ativos por IDs do recorte já limitado (máximo 500),
  catálogo uma vez e nomes dos responsáveis em lote; DTO tipado por geração,
  sem estado global/cache entre usuários. SQL continua em Repository.
- Alterar repository de monitoramento, helper de dados do relatório e service
  de geração. Sem schema/migration/índice, regra de fase, filtros ou DTO HTTP
  novos. Reutilizar critérios ativos e ordenações das consultas individuais.
- Validar equivalência lote/individual, empates, concluídas/pendentes,
  corrigidos/excluídos, responsáveis cadastrados versus texto legado,
  instrumento fora do recorte e origem sem monitoramento. Vazio sem consulta.
- Conferir arquivos finais DOCX simplificado/completo e XLSX completo com
  históricos preenchidos, datas zero/ausente e identificação sem mistura.
  Regressão deve detectar consultas que crescem com o número de instrumentos.
- Ensaio sintético preenchido até 500 instrumentos, com tempo e pico RSS do
  processo Python (inclui extensões nativas, imports e fixtures, não é RAM
  isolada da requisição nem do PostgreSQL); não certifica capacidade/SLA.
  Sem limite de tempo flaky nem exclusão de casos para passar gate.
- PostgreSQL descartável com rollback; Ruff/mypy e regressão integral após
  alteração. Sem banco servido, fonte oficial, produção, commit ou deploy.
- **N+1 reproduzido em três casos antes da correção:** 1→8 instrumentos
  aumentavam SELECTs de **12→32** no DOCX simplificado, **13→40** no DOCX
  completo e **9→16** no XLSX completo. Evidência da reprovação:
  `/private/tmp/sigeo-concorrencia-backend-0t3x9cpn/regressao.log`.
- Leitura em lote implementada no Repository; APIs individuais delegam à
  mesma query para não duplicar critério ativo/ordenação. DTO tipado de
  dados locais à geração distribui eventos, ações, catálogo e nomes para
  os blocos. Sem consulta dentro do laço narrativo nem cache entre usuários.
- Para 8 instrumentos preenchidos: DOCX **12 SELECTs**, XLSX **9**. A consulta
  de 1 instrumento por CNES inclui ainda o nome do estabelecimento no assunto
  DOCX; esse SELECT legítimo foi considerado no teste, sem relaxar a prova
  de ausência de crescimento por instrumento. Leitura vazia não faz SELECT.
- **Oito regressões novas:** três de conteúdo/consultas, duas de lote versus
  individual e histórico ativo/completo, uma de vazio, duas no teto preenchido.
  Datas com empate usam ID como desempate, concluída/pendente e nome cadastrado
  versus legado preservados; excluídos/substituídos ficam fora dos relatórios.
- Ensaio sem coverage: **40 testes em 8,68 s**, incluindo service existente.
  Em 500 instrumentos: **1.500 eventos ativos, 1.000 ações ativas e 1.000
  itens**; todos os instrumentos e registros ativos esperados conferidos.
  Geração DOCX **4,242 s / 12 SELECTs**; XLSX **0,183 s / 9 SELECTs**.
  Picos RSS observados do processo de teste: **240.713.728 bytes** no DOCX,
  **342.933.504 bytes** no XLSX, este após o caso DOCX. Não são alocações
  isoladas de cada exportação nem capacidade de servidor compartilhado.
  Evidência: `/private/tmp/sigeo-concorrencia-backend-y9fu0pe3/regressao.log`
  e `pytest/**/carga-preenchida.json` no mesmo diretório privado.
- Ruff/formatação/mypy (app + fixtures/testes, 127 fontes) aprovados.
  Bancos de ensaio removidos, servidos
  preservados; nenhuma carga oficial/produção acessada nesta etapa.
- A primeira regressão integral (1.742 passaram, dois falharam) identificou
  uma expectativa incorreta na nova fixture: duas evidências do mesmo código
  são deduplicadas por tipo pela política existente do catálogo. Preservada
  essa política; fixture final usa dois tipos distintos e exige explicitamente
  zero (`R$ 0,00`) versus ausência (`—`) nos arquivos. Não interpretar marcador
  como unidade física; distinção registrada no plano vinculado de itens DL.
- Recorte corrigido: **oito testes em 8,14 s**, geração DOCX **4,249 s / 12
  SELECTs**, XLSX **0,177 s / 9 SELECTs**. Picos RSS cumulativos do processo:
  **244.236.288 / 348.946.432 bytes**, respectivamente, com a limitação acima.
  Evidência: `/private/tmp/sigeo-concorrencia-backend-ewca1izr/regressao.log`.
- EXPLAIN ANALYZE pontual das queries reais, com parâmetros preservados, em
  outro descartável: eventos 1.500 linhas por Index Scan, ordenação em memória
  166 KB; ações 1.000 linhas por Seq Scan/ordenação em memória 110 KB. Execução
  observada **0,558/0,645 ms**, sem spill; não justifica criar índice novo neste
  cenário pequeno nem prediz plano nacional. Evidência:
  `/private/tmp/sigeo-concorrencia-backend-ij70c8_u/pytest/**/explain-lotes.json`.
  Banco desse ensaio também removido ao final.
- A conferência ampliada distinguiu as duas linhas de resumo das 1.000
  individuais: ambas usam o mesmo cabeçalho no DOCX. Corrigida a asserção,
  não o conteúdo: exige 500 ocorrências de cada item e uma agregação de cada
  tipo, preservando zero/ausência. XLSX confirma o resumo de 500 por tipo e
  a timeline de 1.500 eventos (ações narrativas pertencem ao DOCX pelo
  contrato atual, sem criar nova aba nesta rodada).
- Recorte final: **oito testes em 8,14 s**, DOCX **4,457 s / 12 SELECTs**,
  XLSX **0,203 s / 9 SELECTs**, sem coverage. RSS de processo cumulativo
  observado **246.874.112 / 341.819.392 bytes**, respectivamente. Evidência:
  `/private/tmp/sigeo-concorrencia-backend-gkbu4q2o/regressao.log` e JSONs.
- **Gate integral final aprovado: 1.744 testes em 276,19 s**, sem pulados/
  xfail. Services **96,3%/90,6%**, Repositories **97,3%/88,9%**, Routes
  **95,1%/70,3%** (linhas/branches), acima dos pisos. Migrations base→head
  e remoção do banco descartável confirmadas. Evidência:
  `/private/tmp/sigeo-concorrencia-backend-okn57t5a/regressao.log`.
- Fechado o N+1 e o aceite sintético preenchido. Não fechar capacidade real,
  concorrência sob provedor/proxy, apps nativos ou ciclo oficial por esse
  ensaio. Frontend não foi reexecutado (último aceite: 865 testes). Sem
  produção, commit, push, deploy ou ativação de jobs.

### Download com prazo e sem geração duplicada — continuação local de 20/10

- Objetivo: fechar o retry indevido do download identificado no ensaio de
  volume, sem ampliar timeout global, expiração da sessão ou escopo de dados.
- Alterar `lib/http-client.ts`, helper de prazo HTTP, `services/relatorios.ts`
  e hook de geração; reutilizar autenticação, CSRF, ApiError e feedback atual.
- Prazo finito de **90 s somente para exportação**, incluindo espera de
  autenticação/cabeçalhos e leitura do blob; é limite local, não SLA/proxy.
  Sem retry após timeout; um 401 pode renovar e repetir somente se ainda
  houver tempo. Consulta comum mantém 15 s e política de retry existente.
- Compor prazo e sinal do chamador sem um anular o outro; cancelar ao sair
  da página. Trava imediata no hook contra duplo clique; não criar fila/cache.
- Deadline deve encerrar loading mesmo com I/O que ignora abort. Rejeição
  tardia não gera download nem erro não tratado. Erro de rede/leitura/5xx
  normalizado; detalhe técnico nunca exibido como mensagem pública.
- Testar com fetch/relógio/download como únicas fronteiras mockadas: resposta
  >15 s, limite de 90 s, corpo pendurado, cancelamento, falha de leitura,
  401/refresh/sucesso/falha, duplo clique e nova tentativa manual. Gate
  frontend integral, lint/typecheck/build/formatação e cobertura por camada.
- Sem alteração visual, backend, dado real, endpoint, cookie, infraestrutura,
  dependência, produção, commit ou deploy. Abortar HTTP não prova cancelamento
  do servidor; exportação assíncrona e teste de proxy continuam pendentes.
- **Implementado:** helper HTTP compõe prazo/sinal externo e encerra a espera
  mesmo quando o I/O ignora abort. Exportação tem deadline total de 90 s,
  inclusive corpo/refresh, sem retry automático por timeout. Restante mantém
  os 15 s por tentativa e política de retry existente. Refresh/CSRF e mutex
  continuam compartilhados; não foram alterados os cookies, duração de sessão
  ou prazos internos desses fluxos de autenticação.
- Hook bloqueia duplo clique imediatamente, cancela ao desmontar e não baixa
  resposta tardia; libera tentativa manual após erro. Leitura do corpo, rede
  e 5xx viram ApiError seguro. Mantidos filtros, nome de arquivo, formatos e
  autorização do endpoint original; nenhum dado real usado nos testes.
- **23 regressões novas**, com hook, service e transporte reais; fetch,
  relógio e download são fronteiras mockadas: nove do prazo, onze do service e
  três do hook. Recorte total de **59 testes aprovado**. Primeira regressão
  integral expôs quatro consumidores que dependem de início imediato de fetch;
  helper corrigido, preservando esses testes, sem skip ou flexibilização.
- A medição padrão de coverage incluía somente arquivos exercitados. Tornado
  permanente `coverage.include: src/**/*.{ts,tsx}` em `vite.config.ts`, para
  contar também arquivos não importados pelos testes, sem mudar o piso nem
  excluir código de aplicação. Relatório parcial não usado como gate integral.
- **Gate final: 865 testes/110 arquivos em 18,75 s**. Hooks **82,7%/74,9%**,
  componentes de domínio **78,6%/74,7%** (linhas/branches), ambos acima de 70%.
  Evidência: `/private/tmp/sigeo-download-frontend-fCGT0I/coverage-final.json`.
  Lint, typecheck, build, Prettier e diff-check aprovados. Warning experimental
  do runtime Node sobre localStorage permanece no teste, não é falha de lint.
- Fechado o comportamento local de prazo/retry/cancelamento. Não comprova
  prazo do proxy/provedor, cancelamento de SQL/CPU no servidor ou capacidade
  sob carga real. Backend não foi reexecutado nesta rodada (último aceite:
  1.736 testes). Próximo aceite operacional permanece no checklist geral.

### Custo dos blocos narrativos DOCX — continuação local de 20/10

- Perfil sintético do padrão de convênio: cabeçalhos, campos e tabelas
  repetidos; separar custo XML, SQL, serialização e instrumentação antes
  de alterar código. Não usar o tempo com coverage como latência da API.
- Conferir o timeout efetivamente versionado do consumidor de relatórios;
  não aumentar prazo global nem fazer retry duplicado para esconder gargalo.
- Se houver varredura redundante comprovada, corrigir somente o builder,
  preservando estilos, seção vigente, larguras e paginação. Regressões de
  equivalência OOXML com biblioteca real, inclusive múltiplas seções.
- Repetir perfil idêntico e teste integrado nos tetos; executar gates e
  regressão integral após mudança. Medição local sem SLA ou aceite nativo.
- Não mudar contrato/limites, dados reais, proxy, infraestrutura, cron,
  dependências, produção, commit ou deploy. RAM/carga representativa e
  eventual exportação assíncrona continuam fora deste ajuste de builder.
- Diagnóstico: inserção de parágrafo/tabela procura `sectPr` desde o início
  do corpo; a largura de cada tabela também resolve todas as seções por
  XPath. No perfil de 5.000 blocos, buscas/inserções consumiam a maior parte
  do tempo. Inserir antes do último `sectPr` por referência e resolver essa
  seção diretamente evita varreduras, sem cache global ou remover a seção.
- As chamadas OOXML internas ficam encapsuladas no builder, sob o lock XML
  existente. Usam os mesmos construtores da versão instalada de python-docx;
  atualização dessa dependência precisa repetir as provas de equivalência.
- **45 testes direcionados aprovados em 2,54 s**, incluindo 17 novos casos:
  XML integral equivalente à API da biblioteca, ordem de blocos, releitura,
  seções/margens distintas, dimensões ausentes, fallback sem seção final,
  títulos de níveis 0–9 e rejeição de nível inválido sem inserir conteúdo.
  Perfil idêntico de 5.000 blocos: **68,450→27,762 s** com cProfile; não é
  tempo HTTP nem SLA. Ruff/formatação/mypy aprovados (app + teste, 124 fontes).
- Risco confirmado no consumidor: `services/relatorios.ts` chama `httpFetch`
  sem prazo próprio; `lib/http-client.ts` limita cada tentativa a **15 s**
  e repete GET/HEAD uma vez após timeout. Abort no navegador não comprova
  cancelamento do trabalho síncrono no servidor. Otimização isolada não fecha
  aceitação do download nem elimina custo duplicado após retry. Não alterar
  o timeout global ou declarar esse fluxo resolvido sem ensaio integrado.
- **Regressão integral: 1.736 testes em 244,37 s**, sem pulados/xfail;
  banco descartável migrado/removido. Services **96,1%/90,2%**, Repositories
  **97,3%/87,6%**, Routes **95,1%/70,3%**, acima dos pisos de linhas/branches.
  Evidência: `/private/tmp/sigeo-concorrencia-backend-_g6a16fc/regressao.log`.
  Convênios 5.000 gerados em **20,12 s** com coverage (antes **66,03 s**).
- Repetição integrada sem coverage: **seis testes em 30,62 s**. Geração/
  conferência: convênios 5.000 **13,00/1,91 s**; propostas 5.000 **3,44/1,55 s**;
  municípios 10.000 **5,93/0,61 s**; macros 1.000 **0,56/0,06 s**; monitorados
  500 completo **1,04/0,11 s**, simplificado **0,94/0,13 s**. Evidência:
  `/private/tmp/sigeo-concorrencia-backend-zr6adu5p/regressao.log` e JSONs
  `pytest/**/medicao-docx.json`. Também removido somente o banco do ensaio.
- **Não aceitar operacionalmente o prazo de 15 s com margem de apenas 2 s**
  neste cenário sintético vazio de equipamentos/eventos. Rede, fila concorrente,
  payloads reais e provedor podem aumentar a duração. Próximo fechamento é o
  fluxo de download sob prazo finito sem duplicar processamento por retry;
  exportação assíncrona/armazenamento exige desenho específico se necessário.
  Sem mudança frontend/infra, dado real, produção, commit ou deploy nesta rodada.

### Volume DOCX e custo de tabelas — continuação local de 20/10

- Medir primeiro o builder real em tabela de 5.000 × 6 células, com largura
  e fonte usadas no relatório de mérito. Investigar repetição de varreduras
  antes de otimizar, sem mudar conteúdo, estilos ou parâmetros de cálculo.
- Service/SQL/builders reais em banco descartável: DOCX com 5.000 convênios,
  5.000 propostas, 1.000 macros, 10.000 municípios e 500 monitorados nos
  níveis relevantes; conferir cada identificador/linha, sem duplicações.
- Reutilizar fixtures e tetos existentes; ler bytes originais e propriedades
  OOXML (cabeçalho repetido/linhas indivisíveis) sem mockar domínio. Não
  gerar documento entregável nem alegar renderização/aceite de Word/Excel.
- Registrar duração local e custo no CI, sem threshold de SLA dependente de
  máquina. Volumes são sintéticos; RAM, rede/proxy e carga real continuam
  pendentes. Se o ensaio exceder o limite técnico, registrar em vez de elevar
  teto de aplicação ou esconder o caso.
- Executar recorte, Ruff/mypy/formatação e regressão integral se houver
  correção no builder. Sem banco servido, fonte oficial, produção, novo
  pacote, alteração de cron, commit, push ou deploy.
- **Implementado e aprovado:** a contagem de linhas da tabela DOCX passa a
  ser calculada uma vez, sem repetir a construção da lista XML no laço.
  Perfil isolado idêntico de 5.000 × 6 células: **6,501→5,025 s**. Conteúdo,
  estilo, limites e serialização concorrente preservados; não é tempo da API.
- Seis arquivos finais passaram com todos os identificadores/nomes esperados,
  sem duplicação, ZIP íntegro, cabeçalhos repetidos e linhas indivisíveis.
  Teste unitário cobre tabelas de 0, 1, 3, 5, 6 e 8 linhas de dados, incluindo
  a transição de paginação e ausência de encadeamento na última linha.
- Na regressão com coverage, geração/conferência em segundos, respectivamente:
  convênios 5.000 **66,03/2,21**; propostas 5.000 **11,84/1,62**; municípios
  10.000 **8,65/0,72**; macros 1.000 **0,98/0,08**; monitorados 500 completo
  **1,75/0,12**, simplificado **1,57/0,13**. São dados sintéticos e execução
  instrumentada local, não SLA. O custo de convênios exige perfil adicional
  e confronto com timeouts reais antes de aceitar desempenho operacional.
- **Regressão integral: 1.719 testes em 307,69 s**, sem pulados/xfail;
  migrations base→head e remoção do banco descartável confirmadas. Services
  **96,1%/90,2%**, Repositories **97,3%/87,6%**, Routes **95,1%/70,3%**
  (linhas/branches), acima dos pisos. Ruff/formatação/mypy e diff-check
  aprovados. Evidência:
  `/private/tmp/sigeo-concorrencia-backend-mfy9hw4m/regressao.log`; medições
  separadas em `pytest/**/medicao-docx.json` no mesmo diretório privado.
- Fechado somente o aceite estrutural DOCX sintético. Continuam abertos RAM,
  latência representativa, Word/Excel nativos, ciclo oficial e aceite remoto
  do checklist. Sem acesso às fontes oficiais ou produção, commit ou deploy.

### Integridade dos XLSX nos tetos de exportação — continuação local de 20/10

- Service/repositories/builders reais em PostgreSQL descartável: gerar o
  XLSX final com 5.000 convênios, 5.000 propostas, 1.000 macros, 10.000
  municípios e 500 monitorados, sem reduzir os tetos de segurança.
- Conferir todos os identificadores/nomes sintéticos únicos, contagem sem
  duplicação, primeiro/último registro e valores zero/ausente preservados.
  Simplificado/completo quando aplicável; macros pertencem ao simplificado
  e municípios ao completo por contrato, sem mudar regra de cálculo.
- Fixtures independentes em transação com rollback; sem HTTP externo,
  fonte federal, clone servido ou documento entregável. Leitura dos bytes
  originais, sem reexportar prévia ou alterar esquema de produção.
- Registrar tempos observados e investigar gargalo reproduzido antes de
  corrigir; não usar duração arbitrária como teste flaky nem chamar os tetos
  sintéticos de volume nacional real. DOCX em todos os tetos, RAM, proxy e
  Word/Excel nativos não ficam certificados nesta rodada.
- Executar recorte, gates estáticos e regressão integral se houver correção
  de aplicação; sem dependência nova, commit, push, deploy ou agendamento.
- Oito arquivos nos tetos passaram em 34,55 s. Perfil isolado de 5.000 linhas
  por 24 colunas reproduziu mais de 300 milhões de iterações no cálculo de
  dimensões: `aba[aba.max_row]` varria a planilha a cada linha. Trocar essa
  localização por índices já conhecidos, mantendo `append`, sanitização e
  formatos. Cobrir também linhas vazias, curtas e maiores que o cabeçalho;
  comparar perfil e repetir os arquivos reais antes de concluir melhoria.
- **Nove regressões novas aprovadas:** oito arquivos finais com todos os
  registros dos tetos (32.000 linhas nas abas-alvo ao todo), sem repetição ou
  corte; zero versus ausência e filtros congelados preservados. Uma regressão
  de builder cobre linha vazia/curta/mais larga, posição de célula e fórmula
  literal inclusive além da largura do cabeçalho. Sem excluir casos anteriores.
- Perfil CPU isolado idêntico antes/depois (5.000 × 24 células): **21,969 s /
  301.643.958 chamadas** antes, **0,202 s / 1.263.958 chamadas** depois. A
  otimização usa índices conhecidos para localizar as células recém-inseridas,
  preservando `append` e `data_type="s"` para fórmulas da fonte. Nenhuma
  alteração de coluna, formato, valor, teto, filtro ou dependência.
- Recorte após a mudança: **29 testes em 6,77 s**, incluindo os oito de
  volume, quatro de concorrência e 17 do builder XLSX. Convênios completos
  de 5.000 linhas: 9,77→0,71 s; municípios de 10.000: 10,19→0,39 s. São
  observações locais sem coverage, não SLA ou ganho garantido do serviço.
- **Regressão integral: 1.709 testes em 212,73 s**, sem pulados/xfail;
  migrations base→head no banco criado pelo harness e remoção ao final.
  Cobertura aprovada: Services **96,1%/90,2%**, Repositories **97,3%/87,6%**,
  Routes **95,1%/70,3%**. Ruff, formatação, mypy de app + novo teste (124
  fontes) e diff-check aprovados. Evidência:
  `/private/tmp/sigeo-concorrencia-backend-0j59s6sg/regressao.log`.
- Fechado o aceite estrutural XLSX nos cinco tetos sintéticos. Próximo foco:
  DOCX em volumes altos e recursos/latência representativos; não confundir
  esse lote com dados nacionais reais, renderização visual/nativa ou RAM.
  Frontend e fontes oficiais não foram acessados; bancos servidos e produção
  intactos, sem commit/push/deploy/agendamento. Plano geral ainda aberto.

### Concorrência integrada HTTP e SQL — continuação local de 20/10

- Quatro clientes ASGI independentes, login/cookies reais e requisições de
  relatório sobrepostas por barreira. Cada requisição recebe Session própria
  em banco descartável migrado, com carteira sintética commitada e visível.
- Formatos DOCX/XLSX, níveis simplificado/completo e recortes contrastantes
  de UF, município e vazio. Comparar os IDs no arquivo final, cabeçalhos HTTP
  e ausência de vazamento entre recortes; carteira deve permanecer intacta.
- Misturar sucesso, filtro inválido e cliente sem login; 401/422 não podem
  devolver anexo nem contaminar pedidos válidos. Não mockar autenticação,
  services, repositories, builders ou middleware; só redirecionar destino SQL.
- Conferir conexões SQL distintas. Sem servidor externo, socket HTTP real,
  fonte federal ou banco servido; ASGI não prova proxy, rede, navegador ou SLA.
- Fixture dedicada e registro obrigatório no guard de testes DB; limpeza por
  nome exato do banco gerado. Rodar recorte, regressão/gates backend e Ruff/
  mypy/formatação. Não entregar documentos de teste nem certificar Word/Excel.
  Sem mudança de produção, parâmetros, cron, commit, push ou deploy.
- **Cinco testes novos aprovados em 3,24 s:** 20 pedidos de relatório em
  cinco lotes sobrepostos. Login/cookies, middleware, SQL e builders reais;
  18 arquivos com conjunto de IDs esperado e dois erros (401/422) sem anexo.
  Níveis simplificado/completo e DOCX/XLSX, quatro perfis e contrastes de UF,
  município com acento e vazio. Sem mudança de código de aplicação nesta etapa.
- Sessão própria por request, quatro PIDs de PostgreSQL distintos e barreira
  após abrir as transações comprovam que coexistem, não apenas reutilização
  sequencial de conexões. Destino SQL sempre o banco descartável migrado.
  Snapshot da tabela de convênios antes/depois permanece idêntico; auditoria
  e sessões sintéticas do login não são confundidas com mutação da carteira.
- A primeira rodada parou no schema de e-mail: `example.invalid` não é aceito
  no login. Fixture usa agora `example.com`, sem envio externo; não relaxou
  autenticação/validação. Falha de preparação aborta a barreira do cliente
  para não deixar os demais aguardando desnecessariamente.
- **Regressão integral final: 1.700 testes em 220,21 s**, sem testes pulados
  ou xfail. Cobertura aprovada: Services **96,1%/90,2%**, Repositories
  **97,3%/87,6%**, Routes **95,1%/70,3%**. Ruff/formatação, mypy de app
  (123 fontes) e dos dois novos arquivos, e diff-check aprovados.
- Banco pai do harness e cinco bancos filhos migrados foram removidos pelos
  respectivos finalizadores, sem terminar sessões alheias ou alterar clones
  servidos. Evidência: `/private/tmp/sigeo-concorrencia-backend-lrul9dz7/regressao.log`.
- O contraste concorrente funcional HTTP/SQL sintético deixa de ser pendente.
  Permanecem carga/volume real, RAM/latência representativas, proxy/rede e
  Word/Excel nativos, além de fontes persistentes e aceite operacional/remoto.
  Frontend não mudou nem foi reexecutado (último aceite: 842). Sem produção.

### Isolamento de geração concorrente — continuação local de 20/10

- Primeira camada de desempenho/concorrência: builders DOCX/XLSX reais,
  quatro solicitações simultâneas com conteúdo distinto e barreira de início.
  Conferir os bytes finais reabertos, todas as linhas, IDs textuais e zeros,
  formato de data/moeda XLSX e propriedades de paginação DOCX.
- Cenários delimitados: XLSX com 5.000 linhas por arquivo, DOCX com 500 e
  lote misto. Sem mocks de builder, escrita em banco, rede ou app servido;
  sem entregar artefatos, trocar biblioteca de produção ou redesenhar layout.
- Fixtures sintéticas próprias por solicitação; só BytesIO. Registrar tempo
  observado sem limiar arbitrário de SLA. Threads demonstram sobreposição e
  isolamento, não paralelismo CPU, capacidade HTTP/SQL ou volume nacional.
- Esta rodada não fecha renderização nativa/visual nem todos os tetos do
  service. As skills de documentos/planilhas orientam preservação e limites
  da conferência; round-trip estrutural não substitui Word/Excel.
- Rodar testes novos e regressões dos builders, Ruff/mypy/formatação; se não
  houver alteração no código de aplicação, não declarar nova suíte integral
  de banco. Sem acesso a produção, commit/push/deploy ou novo agendamento.
- **Falha inicial real:** quatro DOCX simultâneos provocaram XMLSyntaxError
  no parser global compartilhado de python-docx ao abrir o template; XLSX e
  lote misto passaram. Proteger operações XML públicas do builder com RLock
  local ao processo (reentrante porque helpers chamam outros helpers).
  Não substituir parser global, desligar validação ou alterar dependências.
  O custo é serializar operações DOCX dentro de cada processo, não consultas
  SQL nem XLSX. Repetir o ensaio e conferir liberação da trava após erro.
- **Quatro regressões novas aprovadas:** três lotes de quatro solicitações
  (5.000 linhas XLSX por arquivo, 500 DOCX e volumes/formatos mistos) e
  liberação da trava após entrada inválida. Doze arquivos reabertos a partir
  dos bytes; todas as linhas comparadas, IDs textuais/zeros/ausências, datas,
  formatos, CRC ZIP, cabeçalho repetido e linhas DOCX indivisíveis conferidos.
  Não são novos documentos entregáveis nem aceite visual/nativo; não houve
  mudança no layout ou nos dados de negócio. Nenhum mock de biblioteca.
- Recorte de builders: **40 testes em 10,47 s**; no recorte isolado, lotes
  XLSX/DOCX/misto levaram **7,04/1,02/2,09 s**. Tempo observado, não SLA.
  Na regressão com coverage, lote XLSX levou **20,88 s**; custo de CI fica
  explícito, sem threshold de tempo dependente da máquina ou garantia de RAM.
- **Regressão backend integral: 1.695 testes em 221,72 s**, sem testes
  pulados/xfail. Banco novo loopback com migrations base→head; removido pelo
  harness ao final. Guardas de preparo pararam duas tentativas antes de criar
  banco (campo obrigatório de config e representação textual do inet); a
  execução final usou comparação SQL booleana, sem relaxar a guarda loopback.
- Cobertura aprovada: Services **96,1%/90,2%**, Repositories **97,3%/87,6%**,
  Routes **95,1%/70,3%** (linhas/branches). Ruff, formatação, mypy de 123
  fontes e diff-check aprovados. Evidência local:
  `/private/tmp/sigeo-concorrencia-backend-w9tr3mus/regressao.log`.
- Próximo aceite: concorrência integrada HTTP/SQL e arquivos no volume real,
  sem chamar essa prova de benchmark nacional. Word/Excel nativos, ciclo
  oficial persistente e operação/CI remoto continuam pendentes. Frontend não
  foi alterado nem reexecutado: 842 aprovados é o último aceite, não novo.
  Sem fontes oficiais, produção, banco servido, commit/push/deploy ou cron.

### Paginação das prévias de relatórios — continuação local de 20/10

- Integração DOM de `relatorio-instrumentos-tabela` e `relatorio-propostas-
  tabela`, Pagination/formatadores reais e factories sintéticas; sem HTTP,
  banco, alteração de DOCX/XLSX ou fontes. Reproduzir página vazia após
  redução/substituição do recorte antes de corrigir.
- Reutilizar `useListaPaginada`: recorte de IDs diferente retorna à primeira
  página, atualização dos valores dos mesmos IDs preserva página válida.
  Cobrir 0/1/20/21/45 registros, próxima/anterior, recorte vazio e limpeza.
- Conferir identificadores completos, situação da fonte, fase interna,
  marcadores, município, data e valor zero/ausente nos dois layouts DOM.
  Sem reclassificar equipamento/situação ou afirmar aceite visual móvel.
- Rodar recorte e regressão integral, cobertura e gates estáticos locais.
  Sem commit/push/deploy, produção ou início dos planos vinculados.
- **Reproduzido em quatro cenários antes da correção:** as duas prévias
  preservavam página inválida ao reduzir filtros e página antiga ao sair de
  recorte vazio. Agora usam `useListaPaginada`, sem novo paginador duplicado;
  chave vem dos IDs ordenados, não dos objetos ou valores financeiros.
- **20 testes novos aprovados:** navegação 45 registros, limites 1/20/21,
  redução, troca de IDs com total igual, vazio/limpeza nos dois layouts,
  atualização efetiva de nomes dos mesmos IDs mantendo página e apresentação
  de número longo, marcadores, município, fase/situação, data e zero/ausência.
  Fixture ajustada ao contrato tipado (situação do convênio é string, não
  null); sem casts para contornar contrato ou alteração da fonte.
- Regressão final: **842 testes/107 arquivos em 18,61 s**, lint, tipos,
  build, Prettier e diff-check aprovados. Prévia de instrumentos
  **100%/95%**, propostas **100%/97,4%** (linhas/branches).
- Gate integral aprovado: hooks **82,5%/74,8%**, componentes **77,7%/74,4%**.
  Não comprova todos os filtros possíveis nem paginação nacional de backend;
  apenas esta paginação local de 20 por página sobre recorte já recebido.
  Permanecem os aceites gerais de volume/concorrência, arquivos nativos e
  operação/CI remoto. Nenhuma escrita em banco, arquivo gerado ou produção.

### Detalhes capturados das propostas — continuação local de 20/10

- Integração dos componentes bruto/parecer/origem/timeline com helpers reais;
  dados sintéticos e sem chamadas HTTP, sem banco ou produção. Verificar
  ausência/tipos inesperados, seções isoladas, metas/etapas/itens incompletos,
  zero versus valor ausente, cronograma previsto e execução pós-parceria.
- Preservar texto da fonte (inclusive HTML como texto), datas/valores e a
  distinção planejado/executado. Não inventar valores nem reinterpretar
  classificação; reproduzir qualquer seção indevidamente oculta antes da
  correção. Nenhum endpoint ou autorização novo, sem dependências novas.
- Cobrir as estruturas desktop/móvel sem alegar layout validado em jsdom.
  Regressão integral, cobertura sem exclusões e lint/tipos/build/formatação.
- **Duas falhas reproduzidas e corrigidas:** o guard de detalhe bruto
  ocultava análise, distribuição de recurso e parceria quando eram as únicas
  seções capturadas; parcela nula lançava TypeError. O guard considera essas
  seções, e o cronograma usa os helpers canônicos de leitura segura para mês,
  ano e valor (sem interpretar objeto como texto ou número). Fonte intacta.
- **21 testes novos:** seções isoladas, identificação/textos, metas/etapas/
  itens, formatos inválidos, parcelas nulas, datas ISO, zero versus ausência,
  texto HTML literal, movimentos financeiros e atualização sem dados antigos.
  Helpers e filhos reais; testes não consultam fontes externas/banco.
- Regressão final: **822 testes/106 arquivos em 18,93 s**, lint, tipos,
  build, Prettier e diff-check aprovados. Bruto e parecer **100%/100%**;
  timeline financeira **100%/93,3%** (linhas/branches).
- **Gate integral frontend aprovado (exit 0):** hooks **82,5%/74,8%** e
  componentes **76,5%/71,1%**, ambos acima de 70% nas duas métricas. Sem
  exclusão de arquivos, redução de piso ou supressão de casos. Esta evidência
  substitui a reprovação histórica de cobertura das etapas anteriores.
- O plano não está encerrado por essa métrica: permanecem os aceites gerais
  consolidados (volume/concorrência, arquivos em aplicativos nativos e provas
  operacionais/CI remoto). Próxima frente local: regressões dos fluxos de
  consulta/paginação identificados na revisão, com reprodução antes de mudar.
  Backend e produção intactos, sem commit/push/deploy ou ativação de jobs.

### Interação do mapa nacional de mérito — continuação local de 20/10

- Integração DOM com D3, geometria e helpers reais; fixtures sintéticas,
  sem API externa ou banco. Cobrir clique/teclado, foco/saída, seleção,
  atualização do recorte e dados ausentes, zoom e remontagem em StrictMode.
- Reproduzir eventual barreira de teclado antes de corrigir. Não alterar
  coeficientes, classificação, raio, projeção ou dados oficiais; manter
  texto escapado. Reutilizar tokens de foco, sem novo desenho visual.
- Testar comportamento e texto acessível, sem substituir componentes ou
  cálculos por mocks; layout real/mobile continua exigindo validação visual.
- Rodar regressão integral e gates locais sem exclusões de cobertura, sem
  commit, push, ativação de jobs ou início dos planos vinculados.
- Incluir a composição `mapa-rodoviario-secao`: filtros e limpeza, ausência
  de seleção/pontos, contorno carregando/falho/disponível e resumo municipal;
  Leaflet lazy real, apenas shims de layout. Sem alterar critérios de raio.
- **Barreira reproduzida:** os polígonos nacionais só tinham clique, sem
  foco/nome/seleção por teclado. `macro-map.tsx` agora identifica cada macro
  como botão com estado selecionado, tooltip associado por ID único e foco
  nos tokens existentes. Enter/Espaço acionam a mesma seleção; outras teclas
  não acionam. Foco/blur mostram/ocultam o mesmo texto seguro do mouse.
- **14 testes novos aprovados:** cinco no mapa nacional (mouse/teclado,
  seleção/atualização/StrictMode, nomes como texto, recorte, pontos decorativos
  e geometria sem código/vazia); nove na composição rodoviária (filtros e
  limpeza, vazio/atribuição, contorno pendente/falho/disponível, lista parcial
  e resumo recebido em diferentes famílias/distâncias). Sem mock de D3,
  Leaflet, helpers ou hooks. Cálculos e dados oficiais não foram alterados.
- Regressão final: **801 testes/104 arquivos em 18,58 s**, lint, tipos,
  build, Prettier e diff-check aprovados. Mapa nacional **100%/95,2%**;
  composição rodoviária **84,6%/96,1%** (linhas/branches).
- Integral: hooks **82,5%/74,8%**, componentes **73,7%/66,1%**. Piso de
  linhas dos componentes atingido, mas o gate ainda reprova por branches
  abaixo de 70%; não declarar plano concluído. Próximo foco: consultas e
  detalhes ainda sem provas de estados alternativos. Validação visual móvel
  e demais pendências consolidadas permanecem. Sem commit/push/deploy.

### Segurança dos tooltips do mapa de mérito — continuação local de 20/10

- Integração DOM com Leaflet/hook reais e dados públicos sintéticos: nomes
  contendo marcação devem permanecer texto, inclusive no pin municipal.
- Cobrir ausência de nomes, singular/plural, troca de pontos/contornos,
  recorte vazio e remontagem em StrictMode. Shims somente de layout/SVG;
  sem requisições a tiles, fontes oficiais ou produção, sem mock de Leaflet.
- Reproduzir interpretação indevida de HTML antes da correção; manter
  quantidades, cores, geometria e cálculos intactos. Nenhum novo endpoint,
  permissão, dado sensível ou dependência. Não certificar cartografia/layout
  visual por jsdom. Executar regressão, cobertura e gates estáticos locais.
- **Reproduzido antes da correção:** dois testes falharam porque Leaflet
  interpretava tags dos campos nome/CNES/município/UF e do pin municipal.
  `macro-map-real.tsx` passa agora nós DOM construídos com texto; preserva
  título em negrito e quebras, sem concatenar HTML da fonte. Não houve prova
  de exploração em produção nem investigação de dados reais nesta etapa.
- Quatro testes novos: texto literal nos dois tooltips, ausência/plural e
  remoção de dados antigos, atualização de contornos/pin e StrictMode.
  Leaflet e `useLeafletMap` reais; nenhum recurso remoto carregado.
- **787 testes/102 arquivos aprovados em 18,26 s**, lint, tipos, build,
  Prettier e diff-check aprovados. Mapa rodoviário de mérito: **91,5%/89,3%**
  (linhas/branches). Integral: hooks **82,3%/74,8%**, componentes
  **69,3%/62,6%**. Gate de componentes continua reprovado contra o piso de
  70% em ambas as métricas; não reduzir/excluir arquivos para passar.
- Próxima etapa: interações do mapa nacional de mérito e componentes de
  consulta restantes. Backend, fórmulas, banco servido e produção intactos;
  sem commit, push ou deploy. Novos planos vinculados ainda não iniciados.

### Navegação e atualização dos mapas do painel — continuação local de 20/10

- Componentes nacionais/rodoviários e Leaflet/D3 reais, geometria e respostas
  HTTP sintéticas: abrir macro por teclado, voltar no mesmo card, selecionar
  local agrupado, abrir popup e manter retorno ao painel nos links.
- Atualizar o recorte com mapa aberto: remover marcadores/popups obsoletos,
  refletir contagens e campos ausentes, evitar duplicação ao remontar mapa.
- Shims apenas para capacidades do navegador ausentes no jsdom (ResizeObserver,
  detecção SVG e dimensões). Tiles remotos não são carregados pelo ambiente
  jsdom; não habilitar recursos externos nem consultar OSM/IBGE/produção.
- Reproduzir falhas antes de corrigir, preservar resolução por ponto/polígono
  e autenticação. Testes DOM não certificam cartografia ou layout móvel real.
- Rodar recorte e regressão integral, cobertura sem exclusões, lint/tipos/build
  e formatação; sem escrita no banco servido ou início dos novos planos.
- **Falha reproduzida:** links dos popups Leaflet não propagavam `retorno`,
  ao contrário dos links laterais/agenda. Usam agora `urlDetalheInstrumento`
  com caminho/query/hash do Router; mudar origem atualiza também o conteúdo.
  Campos da fonte continuam inseridos com `textContent`, nunca como HTML.
- **Seis testes novos** com Leaflet/D3 reais: entrada por Enter/Espaço,
  substituição/volta e troca de macro, exclusão de marcador/popup pelo recorte,
  local agrupado e detalhe lateral, atualização de dados/ausências, texto com
  aparência de HTML e ciclo de montagem/desmontagem em StrictMode.
- Popup agrupado oferece retorno correto para todos os instrumentos; uma
  atualização não conserva itens de um grupo anterior. Remontar não duplica
  mapas/ícones nem gera erro de container já inicializado.
- Capacidades de SVG/dimensão/scroll foram fornecidas pelo ambiente de teste,
  com restauração após cada caso; propriedade readonly de detecção do Leaflet
  tratada por descriptor, sem `ts-ignore` ou cast para esconder erro de tipo.
  Sem mocks de componentes, helpers ou métodos de classificação geográfica.
- Regressão final: **783 testes em 101 arquivos aprovados em 18,82 s**;
  lint, tipos, build, Prettier e `git diff --check` aprovados. Sem avisos de
  `act`/scroll ausente nos novos casos; aviso experimental preexistente do Node
  não foi ocultado. Backend e regras de cobertura não foram alterados.
- Integral: hooks **82,3%/74,8%**; componentes **66,9%/61,5%** (linhas/branches),
  contra 61,6%/58,9% antes desta etapa. Gate de componentes ainda abaixo de 70%,
  sem exclusões/redução de piso; plano permanece aberto.
  Evidência: `/private/tmp/sigeo-mapas-integral-20261020/coverage-final.json`.
- Próxima frente local: branches restantes dos mapas e componentes de
  consulta/exportação ainda sem prova no inventário. Testes sintéticos não
  substituem aceite visual em navegador/dispositivo, nem disponibilidade OSM.

### Composição do Painel de gestão — continuação local de 20/10

- Página e filhos reais com transporte HTTP sintético: espera/falha/retry
  independentes de resumo, instrumentos, marcos e lista oficial; contrato
  inválido não vira dados parciais ou fallback por texto livre.
- Verificar indicadores, panorama, vigências e pendências após filtro e após
  atualização da query; controles de administrador seguem a sessão real
  simulada na API, inclusive enquanto o papel ainda não foi confirmado.
- Geometria e nomenclatura vêm de fixtures HTTP; testar erro/retry do mapa
  sem derrubar os demais dados, não selecionar mapa rodoviário nem buscar tiles.
- Usar shim de ResizeObserver somente para a API de layout ausente no jsdom;
  não simular componente, hook ou cálculo. DOM não prova layout/geometria real,
  RBAC no servidor, câmera, volume ou execução de job em ambiente externo.
- Reproduzir falhas antes de corrigir e validar regressão/cobertura integral,
  lint/tipos/build/formatação. Sem banco servido, produção ou novos planos.
- **17 testes novos aprovados** na página real: quatro fontes essenciais em
  espera e erro/retry, schema inválido, quatro papéis de sessão, papel pendente,
  erro/retry da geometria, sincronização filtro/atualização e finanças/vigências.
- Valores financeiros deixam de ser mostrados quando a fonte perde a base
  confiável; recorte vazio não conserva soma ou pendências de outro instrumento.
  Completude só aparece após confirmar papel admin; isso é prova da apresentação,
  não substitui RBAC backend. Nenhuma mudança funcional especulativa foi feita.
- SVG nacional, D3, componentes, hooks e Zod reais; somente HTTP/ResizeObserver
  simulados. Geometria sintética e dados sem coordenadas não certificam contorno,
  posicionamento, redimensionamento físico ou tiles do mapa rodoviário.
- Primeira regressão integral encontrou corrida em teste antigo da Central de
  notificações: esperava `fechar()` e verificava a URL antes do commit do Router.
  Caso passou isolado; código confirma fechamento anterior à navegação. Testes
  agora aguardam destino visível em avisos lidos/não lidos e verificam ausência
  de navegação na falha. Sem aumentar timeout, alterar aplicação ou excluir teste.
- Recorte combinado: **28 testes aprovados**. Nova regressão integral após o
  ajuste: **777 testes em 100 arquivos aprovados em 17,08 s**; lint, tipos,
  build, Prettier e `git diff --check` aprovados. Backend não alterado.
- Inventário integral: hooks **80,0%/74,5%**, componentes **61,6%/58,9%**
  (linhas/branches), contra 58,5%/56,6% na etapa anterior. Gate de componentes
  segue abaixo de 70%, sem exclusões ou redução de exigência; plano não fechado.
  Evidência: `/private/tmp/sigeo-painel-composicao-integral-20261020/coverage-final.json`.
- Próxima frente identificada no inventário: mapa rodoviário do painel ainda
  sem cobertura; validar seleção/volta/atualização com limites claros para rede
  externa e teste visual. Aceites oficiais, volume e DevOps continuam separados.

### Mesa de trabalho e fontes de equipamentos — continuação local de 20/10

- Compor página, métricas, filtros, lista desktop/mobile, hooks, services e
  Zod reais com HTTP sintético; nenhuma simulação de filhos/lógica de domínio.
- Validar espera/erro/retry de instrumentos, resumo e marcadores, rejeição de
  schema, vazio, seleção de qualquer marcador de instrumento misto e ausência
  de fallback para prosa; preservar URL e links ao mudar o recorte.
- Verificar texto exato da prestação de contas recebido da API em desktop e
  mobile, conforme solicitação anterior do usuário; fase interna é separada.
- Revalidar paginação quando uma atualização da mesma query reduz registros;
  reproduzir falhas antes de corrigir. Dados/fontes/relógio são sintéticos.
- Rodar regressão e cobertura integral sem exclusões, lint/tipos/build e
  formatação. Sem banco servido, API externa, produção, migration ou deploy.
- **Duas falhas reproduzidas antes da correção:** lista abreviava o texto
  oficial “Prestação de Contas Concluída” para “Concluída” nas duas versões;
  refresh de 21 para um instrumento conservava a segunda página vazia.
- Lista passa a mostrar o texto recebido integralmente em desktop/mobile,
  preservando destaque visual de conclusão e distinção da fase interna.
  Nenhuma situação foi reclassificada ou gravada no backend.
- Página efetiva é limitada à última disponível ao renderizar; links e URL
  original não são reescritos automaticamente durante um refresh. Nova seleção
  de filtro continua removendo `pagina` da URL pelo hook existente.
- **12 testes de integração novos**, com página, componentes, hooks, transporte
  e validação Zod reais; fixture HTTP sintética compartilhada, sem login real
  nem mocks de filhos. Três fontes testadas individualmente em espera e erro/
  retry; contrato de marcador inválido rejeitado sem fallback de prosa.
- Exercitados seleção de não prioritário de instrumento misto, limpeza/retorno,
  vazio, texto exato oficial nas duas apresentações, refresh de paginação e
  consistência dos seis indicadores com o mesmo recorte da lista. DOM não
  certifica pixels/breakpoints reais nem segurança da persistência SQL.
- Recorte: **12 aprovados**. Integral: **760 testes em 99 arquivos aprovados
  em 18,22 s**; lint, tipos, build, Prettier e `git diff --check` aprovados.
- Lista isolada **100% linhas/92,3% branches**. Inventário integral: hooks
  **79,9%/74,5%**, componentes **58,5%/56,6%**, sem exclusões ou redução do
  piso. Gate de componentes permanece reprovado em 70%; plano ainda aberto.
  Evidência: `/private/tmp/sigeo-mesa-fontes-integral-20261020/coverage-final.json`.
- Próxima frente: estados de erro/atualização da composição do Painel de
  gestão e componentes pendentes no inventário. Limites de listagens e aceite
  de volume permanecem registrados; não confundir sucesso DOM com fechamento
  de DevOps, captura oficial ou publicação dos novos planos vinculados.

### Fila de ações e divergências — continuação local de 20/10

- Continuação do plano atual; planos de unidades/fotos e SISGEO não iniciados.
- Testar componentes e paginação reais com dados sintéticos: troca de recorte
  com mesmo total, redução/remoção de registros, mudança de campos de um mesmo
  instrumento e preservação do retorno nos links, sem mock de filhos.
- Fila: prazo ausente/atrasado/hoje/futuro, responsável ausente, limites da
  lista truncada e distinção entre “sem pendências” e “sem itens carregados”.
- Divergências: manter situação original da fonte, mesmo quando atualizada,
  sem inventar conclusão nem reimplementar classificação externa no browser.
- Reproduzir qualquer falha antes de corrigir; rodar recorte, regressão com
  inventário integral, lint/tipos/build e formatação sem reduzir pisos.
  Sem APIs externas, banco servido, cron, commit/push/deploy ou produção.
- **Falha reproduzida antes da correção:** `acoesPendentes=3`, fila vazia e
  resposta truncada exibiam “Nenhuma ação pendente neste recorte”. A consulta
  SQL realmente limita a fila global a 500 por prazo (`repositories/monitoramento.py`),
  enquanto as contagens por instrumento são completas. Um filtro pode, portanto,
  encontrar pendências que não existem nesse lote global de linhas.
- Corrigida a mensagem vazia para distinguir lista incompleta de ausência real
  de pendências. Aviso global de truncamento só aparece quando a contagem do
  recorte excede as linhas carregadas; o texto explicita o limite na base, não
  promete que as primeiras 500 sejam do recorte selecionado.
- Limite não foi removido nem virou paginação no servidor: acesso integral à
  fila além desse lote continua uma limitação conhecida. Não inventar registros,
  alterar totais ou declarar essa capacidade concluída por causa da nova mensagem.
- **10 testes novos**, com componentes/router/hook de paginação reais: seis
  na fila e quatro nas divergências. Cobrem limites do lote, páginas após troca
  de identidade/quantidade, prazos, responsável ausente, atualização exata da
  situação externa, retorno à origem e não mutação dos registros recebidos.
- Recorte: **13 testes aprovados**. Regressão: **748 testes em 98 arquivos
  aprovados em 17,17 s**. Lint, tipos, build, Prettier e `git diff --check`
  aprovados. Backend somente inspecionado, sem alteração ou acesso ao banco.
- Componentes desta etapa: pendências **100%/97,5%**, divergências **100%/100%**
  (linhas/branches). Integral: hooks **79,6%/74,5%**, componentes **58,5%/56,3%**;
  gate de componentes ainda abaixo de 70%, sem exclusões ou redução do piso.
  Evidência: `/private/tmp/sigeo-fila-divergencias-integral-20261020/coverage-final.json`.
- Próxima frente: composição da Mesa de trabalho com fontes reais simuladas
  na fronteira HTTP, especialmente carregamento/falha dos marcadores e
  atualização do recorte; manter em separado aceite de volume e DevOps.

### Filtro de equipamentos do monitoramento — ajuste solicitado em 20/10

- Causa: opções derivadas de `equipamento_descricao` composto, com códigos,
  e classificador que escolhia somente a primeira família do texto inteiro.
- Consumir a mesma lista de marcadores de Dados Oficiais, por número do
  instrumento; um marcador por opção e correspondência por qualquer marcador.
  Não dividir prosa por vírgulas, reclassificar fonte ou editar dados oficiais.
- Hook recebe a lista unificada já validada pelo service; painel reaproveita
  query existente e mesa compartilha a mesma query/cache. Erro/loading dessa
  fonte segue os estados da página, sem fallback silencioso para descrição.
- Rótulo prioritário canônico; demais com o mesmo resumo sem código usado em
  Dados Oficiais. Preservar classes, inclusive não prioritário em instrumento
  misto, e compatibilidade de seleção antiga quando não ambígua.
- Testes reais do hook/UI: múltiplos marcadores, códigos, aliases, duplicatas,
  ausência de marcadores, classes e seleção. Sem banco/API externa ou deploy.
- Regressão reproduzida antes da correção: descrição composta com mamógrafo
  e cadeira oferecia somente Mamógrafo e não permitia filtrar pela cadeira.
  Corrigido em hook/helper puro; nenhum parser novo de texto ou regra de
  classificação. Descrição planejada continua intacta e pesquisável por texto.
- Mesa e painel agora usam os marcadores da mesma listagem validada/cache de
  Dados Oficiais, sem endpoint/migration novos. Seleção confere qualquer
  marcador do instrumento, não só a primeira família do texto planejado.
  Marcadores ausentes não geram opções inferidas da descrição.
- Nomes extensos são resumidos somente no rótulo, sem código inicial;
  identificador de seleção permanece completo. Aliases prioritários são
  deduplicados e não reaparecem em Outros. Classe continua delimitando opções,
  sem alterar implicitamente o recorte até a escolha de equipamento.
- Quatro testes novos cobrem composição, seleção de não prioritário misto,
  aliases, itens fora da carteira, ausência de marcadores, links com código,
  resumo de rótulo e não mutação. Fixtures existentes foram atualizadas para
  fornecer marcadores explícitos, não deduzi-los automaticamente da descrição.
- Aceite no Chrome local autenticado: opções individuais sem códigos; escolher
  Cadeira atualizou recorte para um instrumento. Seleção removida ao final,
  preservando a classe original. Evidência visual local:
  `/private/tmp/sigeo-filtro-equipamentos-20261020.png`.
- Resultado final da rodada: **738 testes em 97 arquivos aprovados em 17,05 s**;
  lint, tipos, build e formatação aprovados. Integral: hooks **79,6%/74,5%**;
  componentes **58,5%/56,0%**. Pequena variação do inventário de hooks pela
  remoção do parser antigo; piso de 70% mantido, gate de componentes reprovado.
  Evidência: `/private/tmp/sigeo-filtro-equipamentos-integral-20261020/coverage-final.json`.
- Sem alteração backend, produção, dados do clone, commit, push ou deploy.
  A listagem compartilhada mantém seu limite preexistente de 1000 registros;
  escalabilidade dessa consulta continua uma dívida separada, não uma garantia
  de cobertura de universos maiores que o limite.

### Vigências, detalhe e retorno ao painel — continuação local de 20/10

- Usuário confirmou login local: senha atual e host 127.0.0.1. Erro posterior
  ocorreu em localhost com API 127.0.0.1; reteste no mesmo host funcionou.
  Não houve liberação de cookies de terceiros ou alteração de segurança.
- Testar modal real com router: prazo de hoje/90 dias, recorte vazio, dados
  atualizados enquanto aberto, Escape/foco e navegação por teclado.
- Integrar card → página real de instrumento → voltar, com hooks/services/
  schemas reais e somente HTTP sintético. Preservar URL, acentos, paginação e
  hash; verificar que destinos de retorno externos não são propagados.
- Estender agenda com troca de recorte/página e links reais, sem mock de
  filhos. Não alterar regras de prazo nem substituir a seleção do backend.
- Validar recortes e regressão integral com cobertura, lint/tipos/build.
  Não testar pixels mobile, APIs reais ou escrita em banco nesta suíte.
  Sem produção, jobs, migration, commit, push ou deploy.
- **11 testes novos aprovados**: seis de vigências/retorno e cinco de agenda.
  Página real de detalhe carregada com HTTP sintético e contratos Zod reais;
  retorno conserva recorte, paginação, acentos e hash. Modal fecha ao navegar,
  Escape restaura foco e atualização da lista aberta remove dados antigos.
- Agenda reinicia ao trocar instrumentos ou prazos com o mesmo total, elimina
  paginação obsoleta quando a lista encolhe, exclui inaugurações realizadas,
  desempata prazos de forma estável e preserva o retorno em todos os links.
- Nenhuma regressão funcional nova encontrada neste recorte: componentes e
  regras mantidos, sem correção especulativa. Vigências e agenda atingiram
  **100% linhas/branches** no inventário atual, não apenas em arquivos importados.
- Regressão: **734 testes em 97 arquivos aprovados em 17,02 s**; lint, tipos,
  build, formatação e `git diff --check` aprovados. Após ajuste exclusivamente
  de formatação, o recorte foi executado novamente. Backend não alterado.
- Integral: hooks **79,9%/74,8%**; componentes **58,5%/56,0%**. O gate de
  componentes permanece abaixo de 70%; não declarar plano concluído.
  Evidência: `/private/tmp/sigeo-vigencias-agenda-integral-20261020/coverage-final.json`.
- Próxima frente local: divergências/fila de ações em mudanças de recorte e
  demais componentes pendentes no gate. Aceites de volume/nativos e operações
  externas continuam separados; esta suíte DOM não os substitui.

### Padronização de municípios — ajuste solicitado em 20/10

- Unificar opções por nome normalizado (caixa, acentos e espaços), com
  rótulo capitalizado e acentos presentes na fonte, sem editar dado oficial.
- Reutilizar helper puro em `use-dados-oficiais-opcoes` e
  `use-monitoramento-interno-filtros`; normalizar comparação e leitura de
  URLs antigas, mantendo UF, contagens e recortes em cascata.
- Estender testes existentes de hooks/filtro e interação com dados sintéticos:
  variantes Anápolis/ANÁPOLIS/anapolis, espaços, vazios, acentos, URL antiga,
  seleção agrupada, contagem e preservação da fonte. Sem fuzzy-match, consulta
  externa ou reconstrução de acentos ausentes. Não testar banco: não há escrita.
- Depois retomar análises derivadas do painel; validar regressão, lint, tipos,
  build e cobertura integral. Sem mudança de layout, produção ou deploy.
- Quatro casos de regressão falharam antes da correção: opções duplicadas e
  opção vazia em Dados Oficiais; espaços e URLs históricas no monitoramento.
  `lib/municipio-filtro.ts` agora compartilha identidade normalizada e rótulo
  capitalizado entre os módulos, preferindo a grafia acentuada quando presente.
  Dados Oficiais agrega contagens por opção; o monitoramento mantém rótulo sem
  contagem. Ordenação por frequência/alfabética original de cada tela mantida.
- Comparação e leitura da URL aceitam caixa, acentos e espaços antigos, sem
  reescrever links na leitura. Selecionar uma opção retorna todas as variantes;
  não há atualização do payload oficial nem tentativa de inferir IBGE/UF.
- Servidores religados por solicitação: frontend 5181, API 8001 e caixa
  sintética 8002, apenas 127.0.0.1 e launcher de clone protegido. `/health`
  retornou banco conectado e frontend HTTP 200. Processo de outro projeto na
  porta 8000 foi identificado e preservado. Nenhuma migration ou job iniciado.
- Login do admin sintético conferido com credencial privada sem expô-la:
  `/auth/login` e `/auth/me` HTTP 200, CORS para 127.0.0.1:5181 correto.
  Chrome mostrou credenciais inválidas; solicitado reteste com a senha local
  atual. Não redefinir senha, não registrar segredo e não declarar acesso do
  usuário resolvido antes da confirmação no navegador.

### Continuação: análises do painel ligadas aos filtros — 20/10

- Integração DOM com filtros/hook/análises reais e router em memória, sem
  mocks de filhos ou lógica: seleção municipal agrupada deve atualizar fases,
  anos, tipos e concentração; limpeza deve recompor o panorama.
- Apresentação com fixtures sintéticas: recorte vazio, campos ausentes,
  limite de oito anos/cinco tipos/sete UFs e atualização de props.
- Não certificar pixels mobile, backend ou geografia nesta suíte; sem rede,
  dados pessoais ou serviços adicionais no CI. Não modificar fórmulas.
- Cinco testes do panorama exercitam filhos/hook reais: seleção e limpeza,
  recorte vazio sem gráficos antigos, ausências e denominador de concentração,
  limites de apresentação (anos/tipos/UF), fase fora do catálogo recebido,
  atualização de props e não mutação. Sem alteração em fórmulas ou componente.
- Total da rodada: **13 testes novos**, **723 testes em 95 arquivos aprovados
  em 23,27 s** na regressão integral com cobertura. Lint, tipos, build,
  formatação dos arquivos tocados e `git diff --check` aprovados.
- Panorama isolado **100% linhas/branches**; inventário integral de hooks
  **79,9%/74,8%**, componentes **58,4%/55,8%**. Gate de componentes ainda
  reprovado, sem reduzir piso de 70% ou excluir arquivos. Próximo recorte:
  vigências/navegação do painel e componentes ainda sem prova de interação.
  Evidência: `/private/tmp/sigeo-municipios-panorama-integral-20261020/coverage-final.json`.
- Plano permanece aberto. Nenhum commit, push, deploy ou acesso à produção.

### Interações dos filtros de monitoramento — etapa local de 20/10

- Exercitar campos reais com `userEvent`, hook de URL e dados sintéticos:
  digitação de várias palavras, combinação/limpeza de recortes, período e
  preservação de parâmetros externos. Não simular setters ou componentes.
- Reproduzir falhas antes de corrigir; manter catálogo e regras de cálculo.
  Executar regressão, tipos/lint/build e cobertura integral sem exclusões.
- Escopo exclusivamente local, sem banco servido, APIs oficiais ou deploy.
- **Duas falhas reproduzidas e corrigidas**: `trim()` no setter apagava
  o espaço recém-digitado (`Hospital Sintético` virava `HospitalSintético`);
  dois setters de URL na mesma interação de período apagavam também o novo
  ano ao limpar o limite incompatível. A busca continua normalizando espaços
  na comparação; somente o valor editável passa a preservá-los.
- O período do monitoramento usa uma atualização atômica de ambos os anos,
  preservando parâmetros externos e reiniciando a paginação. O componente
  compartilhado oferece callback opcional; consumidores existentes mantêm
  seu contrato de setters individuais, sem alteração de regras ou layout.
- **13 testes novos** com componentes/hook/router reais: busca incremental,
  sete seletores, combinação vazia, limpeza, troca de classe/opções e período
  incompatível nos dois sentidos, além de limite compatível/limpeza parcial.
  Não certificam dashboards derivados, geometria mobile ou backend; essa
  integração visual/analítica permanece para a próxima etapa.
- Regressão integral: **710 testes em 94 arquivos aprovados em 15,75 s**.
  Lint, tipos, build, Prettier e `git diff --check` aprovados. Permanece o
  aviso experimental preexistente de `localStorage` do Node, não suprimido.
- Cobertura integral: hooks **79,9%/74,8%**; componentes **57,1%/54,9%**
  (linhas/branches). Gate de componentes continua reprovado no piso de 70%,
  sem exclusões ou redução de exigência. Evidência:
  `/private/tmp/sigeo-filtros-interacoes-integral-20261020/coverage-final.json`.
- Sem alteração em produção, commit, push ou deploy; plano não concluído.

### Indicadores e seleção do evento vigente — etapa local de 20/10

- Continuação aprovada: derivação pura `monitoramento-derivado` e componentes
  reais de fase/cronograma/histórico, com fixtures sintéticas e relógio fixo.
- Provar empate de criação por ID numérico, independência da ordem da
  resposta, ausência de marcos/datas/equipamento, datas reais versus previsão,
  ações pendentes/atrasadas e apresentação de um/múltiplos equipamentos.
- A regra existente no backend é `(created_at, id)` (`monitoramento.py`,
  listagem de eventos, e `monitoramento_resumo.py`); não usar data prevista
  para decidir qual registro substitui outro, nem comparar ID como texto.
- Reproduzir antes de corrigir. Se confirmado, compartilhar helper puro de
  seleção entre derivação/histórico/cronograma, mantendo catálogo, fase geral,
  regra de múltiplos equipamentos e ordenação visual do histórico por data.
- Testar sem mocks de lógica/filhos e sem rede; não recalcular cobertura,
  déficit, distância ou produtividade. Fixtures não provam persistência SQL.
- Rodar recortes, regressão integral, lint/tipos/build/Prettier e cobertura
  integral sem baixar pisos/excluir arquivos; conferir não mutação da entrada.
- Sem produção, banco servido, commit/push/deploy ou cron. Layout físico
  mobile e ingestão de API real permanecem fora desta suíte DOM/unidade.
- **Quatro regressões reproduzidas antes das correções**: desempate de
  inauguração/licença escolhia ID 9 antes de 10 na derivação; cronograma
  físico e regulatório tomavam a primeira posição, mesmo com registro
  mais recente em outra posição. Backend já usa ID numérico como desempate.
- Helper puro `lib/monitoramento-eventos.ts` passa a selecionar por criação
  e ID numérico, sem mutar a entrada; reutilizado por derivação, cronograma
  e previsão do form de eventos. Histórico continua com sua ordenação visual
  por ocorrência/previsão/criação. Múltiplos equipamentos continuam mostrando
  todos os registros ativos entregues pelo endpoint, sem redução a apenas um.
- Mantida a regra específica da licença: o contador de validade seleciona
  o evento mais recente **com validade preenchida**, como o resumo backend;
  o cronograma mostra o registro vigente de cada marco, que pode não ter
  validade. Não confundir esses dois critérios nem preencher ausência por zero.
- Adicionados **27 testes**: 16 de derivação, nove de fase/cronograma e dois
  integrados no orquestrador com HTTP simulado. Cobrem datas reais/previsão,
  ausência de dados, maior fase por ordem do catálogo, ações atrasadas,
  marca/modelo físicos versus descrição planejada, não mutação, ordem de
  entrada invertida, empate e exibição de um/múltiplos equipamentos.
- Unidade/DOM usa relógio fixo; testes integrados exercitam filhos/hooks/
  serviços reais com respostas sintéticas. Não certificam backend, banco
  ou política de eventos ativos: esta continua sendo responsabilidade da API.
- Recorte: **57 testes aprovados em 1,65 s**; regressão integral: **697
  testes em 93 arquivos aprovados em 15,15 s**. Lint, tipos, build, Prettier
  e `git diff --check` aprovados; backend somente inspecionado, não alterado.
- Cobertura integral mantida em 42 hooks/97 componentes sem exclusões:
  hooks **79,7%/74,6%**; componentes **57,0%/54,8%** (linhas/branches).
  Fase/cronograma isolado **100%/93,3%**. Gate de componentes permanece
  reprovado no piso de 70%; não se declara plano concluído.
  Evidência: `/private/tmp/sigeo-frontend-indicadores-vigentes-integral-20261020/coverage-final.json`.
- Não houve mudança de catálogo, regra de fase, cálculo financeiro ou de
  cobertura/déficit/distância/produtividade. Próxima frente: componentes
  interativos e apresentação de dados do painel ainda sem prova suficiente;
  aceitações globais de fontes/volume/DevOps continuam pendentes abaixo.

### Orquestração do monitoramento interno — etapa local de 20/10

- Continuação aprovada: testar `monitoramento-interno` montando filhos,
  hooks, serviços, Query, schemas e forms reais; somente HTTP simulado.
- Cobrir loading/404/erro/retry das consultas essenciais, ações filtradas
  por instrumento, leitura/permissões, cadastro e ações até o transporte,
  falha de escrita com recuperação e troca de identidade durante edição.
- Fixtures sintéticas mutáveis representam respostas do servidor, não
  provam persistência, append-only SQL ou RBAC do backend. Sem dados reais.
- Reproduzir antes de corrigir; limitar correções ao estado/orquestração
  e ao tratamento de falha, sem mudar cálculo, catálogo ou domínio.
- Estados temporários e erros não podem migrar entre instrumentos. Evitar
  rejeição não tratada em callbacks de mutação; falha comum não é logout.
- Rodar recortes, suíte integral, lint/tipos/build/Prettier e cobertura
  integral, mantendo pisos e inventário. Sem novos serviços no CI.
- Testes DOM não certificam layout mobile/servidor. Sem rede real,
  produção, banco servido, commit/push/deploy ou ativação de cron.
- Regressões reproduzidas: leitor podia usar permissão antiga da timeline;
  erro 503 revalidava `/auth/me` sem motivo; estado de edição/erro migrava
  para outro número; conclusão falha lançava **rejeição não tratada** porque
  o callback `onError` síncrono relançava o erro. O runner detectou essa
  rejeição, mesmo com a asserção visual do erro passando.
- Correção limitada ao orquestrador: subárvore com chave por instrumento
  reinicia estado local sem destruir cache Query; permissão visual exige
  sessão atual editora, sem erro, e permissão do instrumento; revalidação
  de sessão só em 401/403, não em erro comum; tratamento de erro não lança
  em callback `mutate`, mas preserva rejeição dos comandos `mutateAsync`
  para forms só fecharem no sucesso. Não altera autorização do servidor.
- Adicionados **19 testes integrados de frontend**: consultas essenciais
  loading/404/503/retry, filtro de ações por instrumento, permissão negada
  e cache antigo, cadastro PATCH/CSRF/opcionais, criação/conclusão/edição/
  exclusão de ação, criação/edição/exclusão de evento, falha/retry,
  revalidação 403 e troca de identidade. Filhos, hooks e serviços reais.
- Fixtures mutáveis devolvem coleções atualizadas após comando válido:
  provam requisição, apresentação e invalidação/reconsulta, não histórico
  append-only, transação, banco ou veracidade de dado de fonte externa.
  Catálogo e regras de fase/inauguração/cobertura não foram alterados.
- Recorte: **19 aprovados em 1,36 s**; regressão integral: **670 testes
  em 91 arquivos aprovados em 15,98 s**, sem erros não tratados. Lint,
  tipos, build, Prettier e `git diff --check` aprovados. Backend intacto.
- Cobertura integral (42 hooks/97 componentes, sem novas exclusões): hooks
  **79,7%/74,6%**; componentes **56,7%/53,6%** (linhas/branches), antes
  **51,6%/49,0%**. Orquestrador **100%/86,3%**; ainda 13 hooks e 42
  componentes sem execução. Gate global de componentes permanece reprovado
  no piso de 70%; não significa plano concluído nem todos os fluxos cobertos.
  Evidência: `/private/tmp/sigeo-frontend-orquestracao-integral-20261020/coverage-final.json`.
- Próxima frente: derivação/apresentação de indicadores e componentes
  interativos remanescentes; aceitações globais de fontes/volume/DevOps
  continuam abaixo. Orquestrador legado ainda excede 200 linhas recomendadas:
  decomposição por responsabilidade é dívida estrutural, não dispensada
  por atingir cobertura alta nem incorporada silenciosamente nesta correção.

### Cadastro interno e seleção CNES — etapa local de 20/10

- Continuação aprovada: `monitoramento-interno-cadastro`, form RHF/Zod e
  `CnesPicker` reais, com consulta de colaboradores/CNES via HTTP simulado.
- Provar leitura/permissão inicial e revogada, abrir/cancelar, validação,
  envio pendente/sucesso/falha/retry, manutenção dos técnicos atuais, troca
  de instrumento e IDs/rótulos únicos em mais de um formulário.
- CNES: mínimo de busca, loading/vazio/erro/retry, escolha/limpeza, teclado
  e coerência de resposta atrasada. Não mockar filhos, hooks ou schemas.
- Fixtures sintéticas e callbacks de escrita na fronteira de componente;
  esta suíte não certifica PATCH/SQL/RBAC do servidor ou layout físico mobile.
- Corrigir só defeitos reproduzidos de estado/validação/acessibilidade nos
  três componentes; preservar vocabulários, contrato API e regras de domínio.
- Estado local/RHF/Query já existentes. Sem novo store, endpoint ou lib.
  Manter edições em andamento ao receber refresh do mesmo instrumento.
- Rodar recortes, regressão integral, lint/tipos/build/Prettier e cobertura
  integral sem exclusões/pisos reduzidos. Sem novos serviços no CI.
- Sem rede real, banco servido, produção, commit/push/deploy ou cron.
- Separação por responsabilidade nesta etapa: extrair apresentação estática
  para `monitoramento-cadastro-campos`, mantendo consulta/envio no form e
  filhos reais nos testes. Evitar ampliar o form acima das 200 linhas
  recomendadas; preservar vocabulários canônicos e ordem/layout dos campos.
- **11 casos de regressão reproduzidos antes das correções** (sete cadastro,
  quatro CNES): form acessível após revogar permissão, titular obrigatório
  sem erro visível, envio habilitado durante consulta de colaboradores,
  falha de consulta silenciosa, técnicos atuais sem opção, IDs duplicados,
  valores transportados para outro instrumento, resultado CNES sem acesso
  por teclado e três falhas HTTP/schema/rede tratadas como resultado vazio.
- Correções: edição depende de `aberto && podeEditar`; form recebe chave de
  identidade do instrumento, preservando a edição no refresh da mesma
  identidade; erros RHF associados com IDs únicos; catálogo falho oferece
  retry e bloqueia envio até consulta íntegra; técnicos atuais preservados
  com seus IDs/nomes já existentes, sem inventar novos colaboradores.
  A API continua validando atribuições e autorização de toda escrita.
- CNES recebe ID opcional para label externo e nome acessível padrão;
  resultados viram botões nativos `type=button` com foco, evitando submit
  incidental. Falha não se apresenta como vazio; retry explícito, sem
  diagnóstico técnico na UI. Busca livre nunca define o CNES persistido.
- Extração mantém form em **177 linhas** e campos em **110**, sem barrel,
  store novo ou mudança de vocabulário. Tipologia sintética dos testes
  respeita enum real (`NA`), sem contornar tipagem para inventar domínio.
- Adicionados **24 testes** (16 cadastro, oito seletor CNES), com filhos,
  RHF/Zod e serviços reais para consultas. Callbacks de escrita simulam a
  fronteira do componente, não a persistência; seleção/limpeza CNES também
  atravessam form real até o comando enviado a esse callback.
- Recorte aprovado em **0,78 s**; regressão integral: **651 testes em 90
  arquivos aprovados em 15,69 s**. Lint, tipos, build, Prettier e
  `git diff --check` aprovados. Backend não alterado nem reexecutado.
- Inventário integral agora tem 42 hooks/97 componentes (um campo extraído,
  nenhum removido ou excluído). Hooks **79,2%/74,6%**; componentes
  **51,6%/49,0%** (linhas/branches). Três componentes de cadastro juntos
  **96,6%/93,4%**; permanecem 14 hooks/44 componentes sem execução.
  Gate global de componentes continua reprovado no piso de 70%.
  Evidência: `/private/tmp/sigeo-frontend-cadastro-cnes-integral-20261020/coverage-final.json`.
- Próxima frente: orquestração do monitoramento com filhos reais e seus
  estados de consulta/escrita, sem presumir cobertura dela por testes
  isolados dos filhos. Permanecem as aceitações operacionais globais.

### Detalhe oficial dos instrumentos — etapa local de 20/10

- Continuação aprovada do fechamento: `convenio-card` e filhos reais,
  `services/convenios`/Zod/Query, fixtures sintéticas e transporte HTTP simulado.
- Provar carga somente sob demanda, distinção manual/oficial, loading,
  falha HTTP/rede/schema, retry explícito, cache, resposta de outro número
  e resposta atrasada após trocar de instrumento. Não mockar filhos/services.
- Corrigir apenas defeitos reproduzidos de apresentação/transporte: não
  apresentar falha de consulta como ausência na fonte nem misturar identidade
  ou versões do resumo/detalhe. Preservar regras financeiras e classificações.
- Escopo: card, service, testes colocados e fixture compartilhada; estado
  local e cache Query existentes, sem novo store, endpoint ou biblioteca.
- Verificar feedback acessível e vínculo do erro/retry ao card correto;
  teste DOM não certifica aparência mobile, servidor/SQL nem ingestão oficial.
- Rodar recortes e regressão integral, lint/tipos/build/Prettier e cobertura
  incluindo inventário completo, sem baixar pisos ou criar exclusões.
- Sem rede real, dados/banco servido, produção, commit/push/deploy ou cron.
- **11 casos falharam antes das correções**: detalhe era montado mesmo
  fechado; quatro tipos de carga manual consultavam o endpoint ao abrir;
  falhas HTTP/rede/schema/identidade não ofereciam aviso/retry e podiam
  parecer ausência no dump; cabeçalho mantinha resumo anterior; cache do
  mesmo número ignorava atualização do resumo. Casos são provas de
  regressão, não uma contagem de 11 regras de negócio alteradas.
- Correções no card: renderizar camada técnica somente aberta; consultar
  somente fontes oficiais; distinguir sucesso sem dump de erro; mensagem
  pública segura com `role=alert` e retry explícito, sem retry automático
  do Query; usar detalhe íntegro no cabeçalho e no conteúdo; nunca aplicar
  cache oficial a carga manual. Chave inclui conteúdo do resumo porque o
  contrato atual não traz versão/data de atualização; prefixo por número
  continua válido para invalidações. Não é promessa de atualização em tempo real.
- Service rejeita número retornado diferente do solicitado com `ApiError`,
  antes de disponibilizar o detalhe. Não alterados endpoint, schema público,
  autenticação, ingestão, fórmulas financeiras ou fase interna do monitorado.
- Adicionados **28 testes** (16 card, 12 contrato do service), com Query,
  Router, filhos e Zod reais. Cobrem manual/oficial, loading/erro/ausência,
  retry, cache/revisão, resposta atrasada, consistência resumo/detalhe,
  identidade, codificação de identificador, todos os filtros expostos pelo
  service, paginação e preservação de nulos. Não equivalem a testar todas
  as combinações de filtros, ingestão ou banco real.
- Recorte com quatro testes anteriores: **32 aprovados em 1,54 s**.
  Regressão integral: **627 testes em 88 arquivos aprovados em 14,14 s**;
  lint, tipos, build, Prettier e `git diff --check` aprovados.
  Backend não alterado nem reexecutado; nenhuma chamada oficial real.
- Cobertura integral: hooks **79,2%/74,6%**; componentes **49,9%/46,8%**
  (linhas/branches). Card isolado **88,9%/100%**. Piso de componentes de 70%
  segue reprovado, sem novas exclusões ou declaração de conclusão do plano.
  Evidência: `/private/tmp/sigeo-frontend-convenio-detalhe-integral-20261020/coverage-final.json`.
- Próxima frente: componentes interativos ainda não exercitados, seguida
  das aceitações operacionais globais; não substituir essas provas por
  contagem de testes ou cobertura isolada de um card.

### Tabela por nível e detalhe municipal — etapa local de 20/10

- Continuação aprovada: testes de `nivel-cobertura-table`, linha real e
  `municipio-detalhe-modal`, com hooks/services/Zod/Query/Dialog reais.
- Cobrir ordenação, filtros/status, paginação ao trocar família/corte,
  expansão de região, abertura/fechamento e coerência do detalhe com o recorte.
- No modal, testar comparativos loading/sucesso/erro/ausência, nome acessível,
  região correta e resposta atrasada de outro recorte, sem recalcular regras.
- Fixtures territoriais sintéticas; mockar apenas HTTP e callbacks de saída.
  Preservar parâmetros normativos/cálculos e a pendência de corte por família.
- Corrigir somente defeitos reproduzidos de estado/acessibilidade nos três
  componentes. Sem mudança de contrato/backend ou automação operacional.
- Rodar recortes, regressão integral frontend, lint/tipos/build/Prettier e
  cobertura com inventário completo; não excluir módulos nem baixar pisos.
- Teste DOM não certifica layout físico mobile nem integração SQL/produção.
  Sem rede real, banco servido, commit/push/deploy ou ativação de cron.
- **Cinco regressões reproduzidas antes da correção**: paginação não
  reiniciava na troca de família/corte, detalhe antigo permanecia aberto ao
  trocar família, atualização da mesma consulta podia deixar página vazia e
  diálogo tinha apenas nome genérico, sem contexto territorial associado.
- Correções em dois componentes: incluir família/corte nas dependências de
  paginação; fechar detalhe ao mudar contexto; limitar página ao total atual
  após atualização, preservando-a quando válida; `DialogTitle` com município
  e `DialogDescription` territorial reais. Nenhuma alteração de cálculo,
  corte normativo, classificação, endpoint ou dados persistidos.
- **37 testes novos**, com filhos/hooks/services/Zod/Dialog reais: 22 da
  tabela e 15 do modal. Cobrem sete mudanças de recorte, cinco ordenações,
  cabeçalho acessível, status, erros HTTP/schema, expansão loading/vazio/erro,
  detalhe, refresh com redução de linhas e resposta atrasada entre recortes.
  Modal: comparativos independentes, seleção da região correta, ausência de
  vínculo/dado, distância somente informativa e três formas de fechar.
- Recorte aprovado em **2,63 s**. Suíte integral: **599 testes em 86 arquivos
  aprovados em 14,47 s**. Lint, tipos, build, Prettier e `git diff --check`
  aprovados. Backend não alterado nem reexecutado nesta etapa.
- Inventário integral mantido em 42 hooks/96 componentes, sem exclusões:
  hooks **79,2%/74,6%**; componentes **49,9%/45,9%** (linhas/branches), antes
  **44,2%/40,6%**. Tabela/linha/modal juntos **92,4%/91,6%**.
  Ainda 14 hooks/46 componentes sem execução; gate integral continua
  reprovando componentes no piso de 70%, não se declara plano concluído.
  Evidência: `/private/tmp/sigeo-frontend-niveis-municipio-integral-20261020/coverage-final.json`.
- Próxima frente permanece a prova dos componentes interativos restantes e
  as aceitações globais abaixo; corte populacional por família continua
  registrado para revisão de regra separada, sem correção silenciosa aqui.

### Tabelas territoriais interativas — etapa local de 19/10

- Continuação do fechamento aprovado: testes colocados de `cobertura-table`
  e `estabelecimento-table`, usando filhos/hooks/services/Zod reais.
- Cobrir paginação e troca de recorte/família, ordenação, status/vazio,
  busca com debounce, erro HTTP/schema e expansão sob demanda.
- Fixtures territoriais sintéticas; somente transporte HTTP e fronteira
  `matchMedia` simulados. Não substituir componentes ou hooks por mocks.
- Corrigir apenas regressões reproduzidas; preservar cálculos, parâmetros
  normativos, contratos HTTP, cache e autorização. Estado é local/Query.
- Verificar tamanho de página mobile via evento de mídia, sem afirmar
  certificação visual de celular ou E2E de servidor/SQL.
- Rodar recortes, suíte integral, lint/tipos/build e inventário integral de
  cobertura. Sem novos serviços no CI; sem exclusões para elevar cobertura.
- Sem produção, rede real, banco servido, commit/push/deploy ou cron.

- Regressões reproduzidas: página inválida após reduzir macros ou trocar
  família nas duas tabelas; detalhe HTTP 503 exposto pelo cliente comum.
  Estender a correção pontual a `http-client`/`api-error` e seus testes:
  somente 4xx conserva mensagem pública de domínio; 5xx mantém diagnóstico
  técnico no erro, mas usa fallback público. Sem mudar sessão/transporte.
- Quatro testes falharam antes das correções: dois de paginação de macros,
  um de família em estabelecimentos e um de mensagem pública HTTP 503.
  As tabelas agora reiniciam a página quando essas dependências mudam.
- **40 testes novos**: 14 de cobertura, 22 de estabelecimentos e quatro de
  proteção de mensagens 5xx. Cobrem os seis/sete critérios de ordenação,
  cinco filtros territoriais, debounce, paginação HTTP, mídia 10/50 itens,
  ausência de botão para não SUS e detalhe/expansão vazios ou com falha.
  O teste da expansão usa resposta HTTP postergada para observar loading.
- A proteção 5xx exigiu atualizar duas expectativas anteriores do Radar:
  mantidos diagnóstico técnico no service, chave/corpo/justificativa no
  retry manual e ausência de aprovação/retry automático; mensagem pública
  agora é genérica. Nenhuma regra de aprovação ou idempotência foi alterada.
- Regressão final: **562 testes em 84 arquivos aprovados em 13,75 s**.
  Recorte de tabelas+cliente: 57 aprovados; lint, tipos, build, Prettier e
  `git diff --check` aprovados. Backend não alterado nem reexecutado.
- Inventário integral: 42 hooks, 96 componentes; hooks **79,2%/74,6%** e
  componentes **44,2%/40,6%** (linhas/branches). O gate continua reprovando
  componentes no piso de 70%; ainda 14 hooks/49 componentes sem execução.
  As duas tabelas e a linha macro atingem juntas **81,4%/80,5%**.
  Evidência: `/private/tmp/sigeo-frontend-tabelas-territoriais-integral-final-20261019/coverage-final.json`.
- Próxima frente: outros componentes interativos e fluxos ainda sem prova,
  sem tratar o piso dos hooks como cobertura de todos os seus comportamentos.
  Permanecem as pendências globais de aceitação/volume/fontes/DevOps abaixo.

### Componentes operacionais de ações e eventos — etapa local de 19/10

- Continuação aprovada do fechamento frontend: componentes reais
  `monitoramento-interno-acoes`/`monitoramento-interno-eventos`, seus forms
  RHF/Zod e confirmação compartilhada. Fixtures de ações/eventos/catalogo
  sintéticos; callbacks de escrita são a fronteira do teste de componente.
- Cobrir vazio/ordenação/autor/datas, leitura sem permissão, abertura,
  validação/envio/sucesso/falha, edição pré-preenchida e exclusão com motivo.
  Exercitar criação+edição simultâneas e permissão revogada com form aberto.
- Verificar associação de labels a controles únicos e preservação de
  responsável legado fora do catálogo atual. Corrigir somente defeitos
  reproduzidos nos componentes/forms/shared UI; sem alterar contratos API,
  regras de fase/inauguração, autorização de backend ou dados reais.
- Mockar só callbacks da fronteira de escrita (não filhos, forms, schemas,
  hooks de formulário ou regra de domínio). O teste não certifica SQL,
  append-only persistente, RBAC do servidor ou responsividade visual.
- Rodar recortes, suíte integral frontend, lint/tipos/build e cobertura
  incluindo arquivos não importados, sem exclusões para aumentar percentual.
  Sem produção, rede real, banco servido, commit/push/deploy ou cron.
- **Dez casos de regressão falharam antes das correções**: três de ações,
  cinco de eventos e dois de confirmação/acessibilidade. Os defeitos eram:
  IDs repetidos entre criação/edição; responsável histórico sem opção no
  select; exclusão/edição/lançamento já abertos continuavam disponíveis após
  `podeEditar=false`; empate de previsões por ID textual escolhia 9 antes de
  10; motivo de exclusão sem rótulo associado; duplo clique confirmava duas
  escritas de conclusão/inauguração enquanto o primeiro envio aguardava.
- Correções limitadas a cinco componentes existentes: IDs únicos com
  `useId` e associação dos erros; `comValorAtual` canônico preserva responsável
  legado; controles abertos só renderizam com permissão atual; desempate de
  `created_at` igual usa ID numérico. A confirmação bloqueia botões durante
  o envio, só fecha no sucesso e captura rejeição para permitir retry.
  O banner de erro de escrita continua sendo responsabilidade do pai.
- Permissão visual não substitui autorização do backend nem cancela uma
  requisição já enviada. O teste de duplo clique comprova somente supressão
  do segundo envio pela UI, não idempotência persistente/distribuída.
  Nenhum campo da API ou regra de confirmação de inauguração foi removido.
- Adicionados **26 testes**: 12 de ações, 11 de timeline, dois de confirmação
  de conclusão e um de rótulo do motivo. RHF/Zod/filhos reais; callbacks
  simulam a fronteira de escrita, sem afirmar integração service/SQL nessa
  suíte. Cobrem vazio/ordem/autor/datas/regulatório, documento com zeros,
  permissão inicial/revogada, criação/edição/exclusão, validação, cancelamento,
  sucesso/erro/retry e pendência. Nenhuma fixture de produção utilizada.
- Recorte de **37 testes aprovado em 1,32 s** (inclui 11 casos preexistentes).
  Cinco módulos medidos: **94,1% linhas/90,1% branches** conjuntamente;
  ações e timeline com **100% de linhas**, respectivamente **96,7%/91,9%**
  de branches. Esses números não são cobertura de todos os componentes.
- Regressão final: **522 testes em 82 arquivos aprovados em 13,39 s**;
  lint, typecheck, build, formatação dos dez arquivos tocados e
  `git diff --check` aprovados. Permanecem os avisos experimentais de Node
  sobre localStorage já registrados; sem supressões, skips ou erro não tratado.
- Medição integral conservadora, sem novas exclusões: hooks **77,5%/70,2%**
  e componentes **36,5%/34,4%** (linhas/branches), antes **32,0%/27,9%**
  nessa última camada. Gate integral segue **exit 1 por componentes**, abaixo
  de 70%; a lacuna não foi mascarada por exclusão de arquivos não importados.
  Evidência: `/private/tmp/sigeo-frontend-interacoes-monitoramento-integral-final-20261019/coverage-final.json`.
- Backend, banco servido, API real e produção não foram alterados nem
  revalidados nesta rodada; sem commit/push/deploy/cron. Sem novo aceite de
  navegador/responsividade. Permanecem os demais componentes interativos,
  classificação dos apresentacionais e gates/aceites gerais do plano.

### Consultas do painel e expansão territorial — etapa local de 19/10

- Continuação aprovada: testes de `usePainelGeralResumos`,
  `useNivelCobertura`, `useHealthRegionByMacro` e
  `useMunicipalityByHealthRegion`, com fixtures HTTP sintéticas.
  Incluir `useDashboardTotais` para conferir a mesma fronteira de recorte
  nos cards de oferta (CNES/município/família e todas as demais dimensões).
- Hooks/QueryClient/services/cliente HTTP/Zod reais; simular somente fetch.
  Não recalcular cobertura nem inferir status do percentual: indicadores e
  status são sentinelas vindas da resposta da API.
- Casos: loading, vazio, sucesso, HTTP/schema inválido por dependência,
  famílias independentes, totais SUS vs total existente, contagens/rankings
  e distribuição regional, filtros serializados e recarga sob demanda;
  resposta antiga atrasada não pode substituir o recorte atual.
- Novos arquivos em hooks/test-fixtures; nenhuma alteração funcional prevista.
  Se surgir divergência de regra normativa, registrar separadamente antes de
  mudá-la. Sem backend, schema ou cálculo novo; sem migrations, rede real,
  banco servido, produção ou publicação remota.
- Rodar recorte, regressão frontend, medição integral, lint/tipos/build e
  registrar eventuais lacunas; não excluir lógica nem reduzir os pisos.
  Não certifica paginação SQL, atualização oficial nem navegação em browser.
- Implementados **45 testes novos**: 14 de resumo por família, 15 de
  cobertura por nível, seis de expansão sob demanda e dez de totais do
  recorte. Serviços e schemas reais verificam cinco dependências paralelas
  do resumo, cada uma com falha HTTP/schema; falha não vira resumo saudável
  de zeros, e uma família indisponível não elimina a outra.
- Ranking inferior/superior, contagens e cinco grandes regiões conferidos
  por valores esperados. Status `not_available` continua Dados indisponíveis;
  SUS em uso (3) e total existente (999) permanecem distintos. Não foi
  reimplementada fórmula de cálculo ou gerado dado real nesta rodada.
- Trocar família/nível/UF/macro/região/município/corte/CNES consulta cache
  próprio. Duas respostas antigas diferidas (cobertura e totais nacionais)
  foram liberadas depois das respostas específicas: o recorte atual não
  foi sobrescrito. Expansão desativada não consulta; ativação/erro/reconsulta
  e retorno ao cache de outro território/família foram comprovados.
- **45 direcionados aprovados em 2,60 s**; nos cinco módulos exercitados,
  **100% de linhas e 98,1% de branches** conjuntamente. O caminho sem macro
  no resumo não é produzido pelo service real: ele cria macro e cobertura
  pareadas a partir da mesma coleção validada. Não se mockou esse domínio
  nem se excluiu o ramo para atingir 100% artificialmente.
- Regressão final: **496 testes em 80 arquivos aprovados em 14,04 s**;
  lint, typecheck, build, formatação dos quatro arquivos novos e
  `git diff --check` aprovados. Mantêm-se somente os avisos experimentais
  de Node sobre localStorage já registrados, sem supressões de lint.
- Medição integral sem novas exclusões (42 hooks/96 componentes): hooks
  **77,5% linhas/70,2% branches**, acima de ambos os pisos de 70%, ainda
  com módulos sem execução; atingir o piso não certifica todos os fluxos.
  Componentes continuam **32,0%/27,9%**; o avaliador integral retorna
  **exit 1 exclusivamente por essa camada**, sem reduzir thresholds.
  Evidência: `/private/tmp/sigeo-frontend-consultas-painel-totais-integral-final-20261019/coverage-final.json`.
- Achado de inspeção para revisão separada antes da promoção: comentários
  de `useNivelCobertura`/`usePainelGeralResumos` descrevem o corte de 100 mil
  como específico do tomógrafo, mas ambos enviam `min_population=100000`
  independentemente da família quando o corte está ligado; o router aplica
  literalmente esse filtro. A metodologia documenta o corte específico no
  drill-down, não essa generalização nos hooks. Não se presume validação
  normativa da generalização nem se altera a regra para elevar cobertura.
  Revisar escopo/intenção e refletir a decisão na metodologia antes de fixar
  um comportamento para outras famílias. Não houve alteração desses hooks,
  de parâmetros, services, backend ou metodologia nesta etapa.
- Próxima frente: componentes com estado/interação (tabelas e monitoramento),
  classificação justificada dos apresentacionais e integração do inventário
  completo ao gate. Sem acesso a API real, banco servido, produção, commit,
  push, deploy ou ativação de cron. O plano não está concluído.

### Filtros territoriais da Análise de Mérito — etapa local de 19/10

- Continuação aprovada da cobertura frontend: hook `useFiltrosMacro` real,
  fixtures geográficas sintéticas e testes de seleção/estado, sem recalcular
  cobertura, déficit, distância ou coeficiente.
- Arquivos: `src/test-fixtures/filtros-territoriais.ts`,
  `src/hooks/useFiltrosMacro.test.tsx`; correção localizada no hook somente
  se uma regressão reproduzir recorte incorreto. Sem novos endpoints/schema.
- Casos: seis dimensões, cascata bidirecional e automarcação, multisseleção,
  nulos e nomes ausentes, vazio, IDs órfãos após atualização da lista,
  limpeza, resumo, filtros enviados ao backend e instâncias independentes.
- Uma seleção específica sem correspondência deve produzir recorte vazio,
  não retornar silenciosamente ao conjunto nacional. Dados de cobertura
  persistidos na fixture são sentinelas, não resultados de cálculo de teste.
- Testes direcionados e suíte frontend integral com lint/tipos/build;
  registrar cobertura sem reduzir pisos ou excluir arquivos não exercitados.
  Não cobre navegador/responsividade nem execução SQL/API oficial; não
  substitui os contratos backend. Sem produção, banco servido ou remoto.
- Reproduzidas **três regressões** antes da correção: selecionar CNES,
  município ou região de saúde sem correspondência retornava as quatro
  macros válidas da fixture, como se não houvesse filtro. O helper devolvia
  null tanto para seleção ausente quanto para seleção órfã.
- Correção localizada: null permanece somente quando o seletor está vazio;
  seleção ativa resolve para Set, inclusive vazio. Isso não muda cálculo,
  indicador ou contrato HTTP, apenas impede expansão silenciosa do recorte.
  CNES conhecido sem vínculo de macro continua sem localização inferida.
- **21 testes novos aprovados em 0,52 s**, com **100% de linhas/branches**
  de `useFiltrosMacro`. Incluem os três IDs órfãos, CNES removido durante
  atualização de facilities, unidade sem macro, seis dimensões, IDs para
  backend, resumo com rótulo/fallback, deduplicação e ordem de seleção,
  limpeza, seletor reversível, instâncias independentes página/exportação,
  dimensões incompatíveis e UF desconhecida sem região inventada.
  Os objetos de indicadores recebidos são preservados, não recalculados.
- Uma expectativa inicial dos testes ordenava CNES pelo código; o contrato
  existente ordena pelo rótulo. A asserção foi corrigida para a ordem por
  nome, sem modificar a aplicação para satisfazer o teste.
- Regressão integral frontend: **451 testes em 77 arquivos aprovados em
  11,78 s**; lint, typecheck, build, formatação dos três arquivos tocados e
  `git diff --check` aprovados. Mantêm-se os avisos experimentais de Node
  sobre localStorage da suíte anterior; não houve skips nem supressão de lint.
- Medição integral conservadora (42 hooks/96 componentes, sem exclusões):
  hooks **69,6%/61,8%** em linhas/branches, antes **48,0%/30,4%**;
  componentes **32,0%/27,9%**, sem alteração nessa camada. O gate integral
  ainda retorna **exit 1**, corretamente abaixo de 70%; o recorte de 100%
  do hook não é aprovação de todo frontend. Evidência:
  `/private/tmp/sigeo-frontend-filtros-territoriais-integral-20261019/coverage-final.json`.
- Backend e metodologia de cálculo não mudaram nem foram reexecutados.
  Produção, banco servido e remoto intactos; sem commit, push ou deploy.
  Continuam os hooks de consulta/estado e os componentes operacionais sem
  testes; classificação de apresentacionais e gate integral ainda abertos.

### Cobertura de ações, eventos e opções de filtros — etapa local de 19/10

- Continuação do plano aprovado: testar hooks de ações/timeline e opções
  em cascata de Dados Oficiais, sem alterar regra, UI, schema ou backend.
- Arquivos: novos testes junto de `useMonitoramentoAcoes`,
  `useInstrumentoTimeline`, `use-dados-oficiais-opcoes`; factories sintéticas
  em `src/test-fixtures/`. Hooks, QueryClient, services, HTTP client e Zod
  reais; simular somente a fronteira fetch, sem mockar lógica de domínio.
- Casos: loading, sucesso/vazio, erro HTTP/schema, isolamento por instrumento
  e pendentes, envio de corpos/IDs, invalidação após sucesso e preservação
  do cache em falha; opções com nulos, duplicatas, aliases prioritários e
  instrumento misto (prioritário/outro), mantendo o próprio filtro reversível.
- Rodar testes direcionados e suíte frontend, lint/tipos/build; repetir a
  medição integral incluindo arquivos não importados e registrar o déficit.
  Não reduzir piso, excluir lógica para elevar números ou certificar backend
  por mocks. Não cobre persistência, novo E2E, responsividade ou autorização
  de servidor; esses aceites não são substituídos por testes de hooks.
- Nenhuma conexão a banco/API real, produção, workflow, commit ou push.
- Implementados **47 testes novos** em três módulos: 18 de ações, 16 de
  timeline/cadastro/eventos e 13 de opções. Hook → service → transporte →
  schema Zod reais, com interceptação apenas de fetch. HTTP 404 da timeline
  permanece ausência normal; falhas 503/schema não viram ausência ou lista
  vazia. As oito mutations conferem corpo/ID/método e fronteira de cache:
  sucesso invalida dependências; falha preserva dados e não invalida.
  Uma resposta diferida comprova loading e ausência de invalidação antecipada.
- Opções usam `filtrarDadosOficiais` real: oito seletores reversíveis,
  cascata UF→município/equipamento, re-render do recorte, deduplicação de
  aliases por instrumento, ausência de CNES/programa/ano/situação, frequência
  e desempate pt-BR. Instrumento misto mantém Outros; alias prioritário não
  aparece nessa classe. Descrição longa só encurta rótulo, não valor.
- Nenhum código funcional alterado. Os testes iniciais revelaram um literal
  esperado de truncamento com dois caracteres a mais e nomes anônimos nos
  wrappers dos hooks rejeitados pelo lint; foram corrigidos nos testes,
  sem mudar a regra da aplicação nem desabilitar regras do linter.
- Recorte direcionado: **47 aprovados em 2,10 s**; os três módulos de hook
  atingem **98,9% linhas/95,7% branches** conjuntamente. O ramo não exercitado
  é a ordenação alternativa sem frequência do helper privado de opções,
  que não possui chamador atual. Esse recorte não certifica todo frontend.
- Suíte completa frontend: **430 testes em 76 arquivos aprovados em
  12,19 s**; lint, typecheck, build e formatação dos cinco arquivos novos
  aprovados, `git diff --check` limpo. A execução emite avisos experimentais
  do Node sobre localStorage; não houve falha de teste nem regra de lint
  suprimida. Backend não mudou nem foi reexecutado nesta etapa.
- Medição integral conservadora: todos os **42 hooks/96 componentes**,
  inclusive os não importados; sem novas exclusões. Hooks subiram de
  **35,9%/26,5%** para **48,0%/30,4%** (linhas/branches), agora 22 sem
  execução; componentes continuam **32,0%/27,9%**, 60 sem execução.
  O avaliador retornou **exit 1**, corretamente abaixo de 70%; não se
  alteraram a configuração seletiva vigente nem os pisos para ocultar isso.
  Evidência: `/private/tmp/sigeo-frontend-acoes-eventos-opcoes-integral-20261019/coverage-final.json`.
- Próxima frente local: `useFiltrosMacro` concentra 190 statements ainda
  sem execução, com cascata bidirecional/seleção automática/isolamento de
  recortes; depois os componentes operacionais ainda sem testes. Não se
  reimplementará cálculo de cobertura para testar apenas seleção de linhas.
  Classificação completa de apresentacionais e integração do inventário
  ao gate permanecem abertas; sem commit, push, deploy ou produção.

### Revisão de tabelas longas — etapa local de 19/10

- Continuação aprovada de layout: gerar com os builders/SQL reais uma
  amostra de mérito com 204 linhas e outra com catálogo de marcos e ações
  extensas. Word completo e Excel completo; dados exclusivamente sintéticos,
  transações revertidas em PostgreSQL descartável, sem alterar banco servido.
- Conferir cabeçalhos repetidos, linhas/páginas completas, início/meio/fim,
  dados numéricos e identidade das linhas; renderizar todas as páginas Word
  e as regiões Excel relevantes usando runtimes empacotados. Não substituir
  os arquivos da aplicação pelas importações/prévias das ferramentas de QA.
- Corrigir somente problemas reproduzidos de layout, preservando timbre,
  títulos e regras de negócio. Fixtures/testes registram a regressão.
  Não certifica Excel/Word nativos, concorrência ou SLA nacional; artefatos
  intermediários ficam temporários, não são entregáveis do usuário.
- Reprodução visual: colunas de igual largura quebravam datas/anos e
  comprimiam município e descrições de ações. O builder Word agora aceita
  pesos positivos/finitos por coluna e fonte opcional; deriva as larguras
  da área útil da seção, sem mudar tamanho da página, margens ou timbre.
  Parâmetros omitidos preservam o comportamento das outras tabelas.
- Ajustes limitados às tabelas de mérito, timeline e ações. Na timeline
  Word, Marco e Grupo são apresentados na mesma célula, em linhas distintas;
  nenhum dos campos é removido. O XLSX mantém suas colunas originais.
- Sete casos novos: quatro recusas de pesos inválidos sem mutação do
  documento, preservação de texto/fonte/largura útil após reabrir o DOCX
  e duas integrações SQL→service→arquivo com os 19 marcos/12 ações
  sintéticos. Testes de mérito existentes também guardam as amostras
  completas com 204 linhas. **101 testes direcionados aprovados em 3,92 s**.
- Renderização final e inspeção das **12 páginas Word** (7 de mérito,
  5 de monitoramento): datas inteiras, cabeçalhos repetidos, descrições
  completas e sem sobreposição/corte nas amostras. Foram preservados os
  204 resultados, os 19 marcos e as 12 ações. A paginação mais compacta
  decorre da distribuição de colunas/espaçamento, não da exclusão de linhas.
- Excel: 13 regiões renderizadas nas oito abas das duas amostras,
  incluindo início/meio/fim da tabela longa e campos regulatórios.
  Comparação de valores, tipos, formatos e estilos entre a primeira e a
  última amostra não mostrou mudança; panes/filtros da timeline preservados.
  A prévia do importador exibiu documentos longos em notação científica,
  mas a inspeção do XLSX original confirmou texto exato de 16 dígitos
  (por exemplo, `1234567890000014`), sem conversão no arquivo da aplicação.
  Não se reexportou a importação de QA nem se alegou validação no Excel nativo.
- Artefatos finais temporários:
  `/private/tmp/sigeo-tabelas-longas-20261019-v3`; as prévias Excel reutilizadas
  da primeira rodada estão em `/private/tmp/sigeo-tabelas-longas-20261019`.
  Os nomes com sufixo `Lote` são exclusivamente fixtures sintéticas para
  distinguir as linhas, não municípios adicionais nem dados de produção.
- Regressão completa da versão final: **1.691 testes backend aprovados
  em 190,00 s**, sem falhas/skips/xfail. PostgreSQL descartável migrou
  base→head e foi removido pelo harness ao final, sem alterar os clones
  servidos. Gate linha/branch aprovado: Services **96,1%/90,2%** (piso 80%),
  Repositories **97,3%/87,6%** (70%), Routes **95,1%/70,3%** (60%).
  Evidência: `/private/tmp/sigeo-tabelas-longas-backend-validado-20261019.json`.
  Ruff, formatação, mypy de app (123 fontes) e `git diff --check` aprovados.
  Nenhum frontend/router/schema/cálculo normativo alterado nesta etapa;
  sem produção, cron, commit, push ou deploy. O aceite visual destas duas
  amostras está encerrado; o checklist de fechamento do plano permanece
  aberto para volume nacional/concorrência, cobertura integral frontend,
  ciclo oficial persistente e aceites operacionais/remotos.

### Limite de Monitoramento no recorte final — etapa local de 19/10

- Continuação aprovada: leitura em lotes exclusiva para relatórios, mantendo
  a listagem de UI com assinatura/limite/comportamento atuais. Sem router,
  schema, migration ou alteração do banco servido.
- Repository: iterar candidatos em lotes de 500 e consultar fases do lote;
  Service: reaproveitar o cálculo canônico de fase/período, excluir obras e
  só então conferir o teto final de 500, sinalizando o excesso para o 422
  já implementado no service de relatórios. Cursor fechado inclusive em erro.
- SQL/serviços/builders reais em PostgreSQL descartável: teto exato/excesso,
  município, contratação, período e exclusão após o antigo corte; preservar
  exceção de acompanhamentos em aberto no ano corrente e assinatura da UI.
  Conferir arquivos finais pequenos e contrato HTTP, sem mock de domínio.
- Não certifica concorrência, SLA nacional ou renderização de Word com 500
  blocos. Não modifica a regra de fase/ano, os tetos nem o catálogo. Nenhuma
  ativação remota, commit, push ou operação em produção nesta rodada.
- Duas regressões falharam antes da correção: 501 monitorados viravam uma
  lista de 500 sem aviso; a exclusão de uma obra nesse primeiro bloco
  deixava apenas 499, omitindo um registro válido posterior ao corte.
- Implementados **25 testes novos**: excesso, teto final exato, assinatura de
  UI preservada; cinco recortes × dois formatos × dois níveis (20), mais
  dois contratos HTTP de excesso sem anexo. A carteira tem 501 monitorados
  e testa município/contratação/ano histórico/ano corrente/obras. O caso de
  ano corrente conclui 500 com inauguração real e preserva o último em aberto
  de ano anterior, sem mudar o ano da aplicação servida (só relógio de teste).
- Leitura de relatório usa generator em lotes de 500 e fechamento explícito
  via closing/finally, inclusive em excesso. Exclusões são consultadas em
  lote; fase usa os marcos/eventos ativos canônicos, agora consultados por
  IDs do lote. Regra anual foi extraída sem alteração para função compartilhada
  com a listagem existente, evitando uma segunda implementação da regra.
  O teto é aplicado ao recorte final, não à quantidade bruta de candidatos.
- Os 25 novos e 45 cruzados passaram juntos: **70 aprovados em 3,51 s**.
  DOCX/XLSX conferidos estruturalmente contêm o registro após o primeiro
  lote; não houve redesenho visual. O 501º elegível recusa a geração via
  handler 422 já existente. A lista de UI continua com limite padrão 500
  e a mesma ordenação/semântica; não foi promovida a exportação ilimitada.
- Regressão completa da versão final, após adequar a assinatura keyword-only
  do helper de service: **1.684 testes backend aprovados em 188,06 s**,
  sem falhas/skips/xfail. PostgreSQL novo migrou de base a head e foi removido
  ao final. Gate linha/branch aprovado: Services **96,1%/90,2%** (piso 80%),
  Repositories **97,3%/87,6%** (70%), Routes **95,1%/70,3%** (60%).
  Evidência: `/private/tmp/sigeo-monitoramento-limite-backend-validado-20261019.json`.
- Ruff, formatação, mypy de app (123 fontes) e `git diff --check` aprovados.
  Nenhuma alteração frontend/router/schema/cálculo normativo, nem acesso a
  produção, cron, banco servido, commit, push ou deploy. As guardas de teto
  das cinco entidades ficam implementadas; continuam abertos os aceites
  visuais/volume nacional/concorrência, a cobertura integral frontend e os
  aceites nacionais/operacionais do checklist. Não se declara o plano concluído.

### Limites de exportação sem corte silencioso — etapa local de 19/10

- Continuação do aceite aprovado de volume: reproduzir o teto exato, teto+1
  e município cuja linha aparece após o antigo corte. SQL real em banco
  descartável, sem reduzir constantes ou mockar repositories/builders.
- Escopo desta correção: repositories exclusivos de Convênios, Propostas,
  MacroCoverage e MunicipalityCoverage; helper técnico de leitura limitada;
  tradução do excesso em ValidationError no service de relatórios, usando
  o handler HTTP existente. Sem migration, dado real, cálculo ou cron.
- Manter tetos de 5.000/5.000/1.000/10.000. Município normalizado deve ser
  aplicado antes da contagem final, sem carregar coleção ilimitada na memória.
  Excesso deve interromper a geração, não retornar arquivo parcial como 200.
- Cobrir repository, service e contrato HTTP. Risco: leitura normalizada pode
  precisar varrer mais linhas do que o recorte final; não promete SLA nem
  substitui teste de carga concorrente. Lista de Monitoramento compartilhada
  com outras páginas fica pendente de tratamento específico, sem alteração
  incidental de contrato nesta rodada. CI não ganha dependência externa.
- Reproduzidas **sete regressões** antes da correção, com fixtures válidas:
  quatro consultas aceitavam teto+1 como lista parcial e três perdiam o
  município solicitado quando ele vinha após o antigo corte. O teste não
  reduziu as constantes nem substituiu SQL por mock.
- Helper técnico `repositories/limites_relatorio.py` lê em lotes de 500,
  fecha o cursor em finally e sinaliza excesso. Sem filtro Python, a query
  pede só teto+1. Com normalização municipal, percorre o resultado SQL em
  lotes e acumula apenas correspondências, interrompendo em teto+1; não
  interpreta falta de correspondência nas primeiras linhas como conjunto vazio.
  Empates de ordenação de Propostas/cobertura ganham desempate por identidade.
- O repository não escolhe HTTP: sinaliza `LimiteConsultaExcedido`; o service
  converte em `ValidationError` com instrução de refinar os filtros. Dois
  contratos HTTP reais conferem 422 JSON, mensagem padronizada e ausência de
  Content-Disposition/anexo para DOCX/XLSX. Sem mudança no router/handler.
- Os **17 testes direcionados passaram em 3,44 s**: teto exato/teto+1,
  normalização após corte, recusa da geração e contrato HTTP. Permanecem
  limite compartilhado do Monitoramento (500), revisão visual de tabelas
  longas, carga concorrente e aceites de volume dos arquivos em si. Testar
  os repositories em 10.000 não significa renderizar ou certificar Word com
  10.000 linhas nem prometer capacidade/SLA nacional.
- Regressão completa com a versão final: **1.659 testes backend aprovados
  em 188,86 s**, sem falhas/skips/xfail; migração base→head em PostgreSQL
  descartável e remoção exclusiva desse banco concluídas. Os 17 casos
  incluem também excesso após normalização, além do excesso sem filtro.
  Pisos linha/branch aprovados: Services **96,1%/90,1%** (80%),
  Repositories **97,2%/87,1%** (70%), Routes **95,1%/70,3%** (60%).
  Evidência: `/private/tmp/sigeo-limites-backend-final-20261019.json`.
- Ruff de app/arquivos tocados, formatação, mypy (123 fontes) e
  `git diff --check` aprovados. Nenhuma alteração frontend, router, schema,
  cálculo, fonte, banco servido, cron, remoto ou produção. Sem commit,
  push ou deploy. Próximo risco concreto: impedir corte silencioso no
  acompanhamento de Monitoramento sem alterar incidentalmente suas listas
  de UI ou a regra anual que depende da fase calculada.

### Matriz local de análise de mérito — 19/10

- Continuação da matriz de arquivos já aprovada: integração PostgreSQL →
  repositories/services/builders → leitura estrutural DOCX/XLSX. Comparar
  resultados persistidos, sem reimplementar cálculo ou mudar parâmetro.
- Contrastes obrigatórios: publicação por família, versão anterior e execução
  avulsa sem ponteiro, geografia, zero/nulo/saldo negativo, vazio, recusa de
  CNES e volume superior à paginação de interface. Fixtures sintéticas em
  transação com rollback, sem mocks de domínio nem dependência externa.
- Sem novo serviço para CI; medir duração local. Não certifica pipeline de
  aquisição, fonte federal, renderização nativa/visual de grandes documentos,
  concorrência de escrita ou infraestrutura. Não há escrita na aplicação
  servida nem autorização nova de produção nesta etapa.
- Implementados e aprovados **34 cenários em 1,64 s**, com duas famílias
  reais do catálogo e resultados sintéticos distintos, publicações em
  competências próprias, publicação anterior, versão avulsa com status
  published sem ponteiro e rascunho mais recente. O resultado de uma família
  não pode ser substituído pelo da outra, nem por status avulso.
- Cinco recortes × dois níveis × dois formatos (20 casos) conferem cabeçalho
  e todas as linhas das duas famílias: Brasil, Nordeste, Bahia, São Paulo e
  vazio no Acre. Município com acento no nível completo soma dois casos;
  ausência de publicação consultada de verdade e recusa de CNES somam oito.
  Preservados nulos, zero, saldo negativo e `available_qty`, com
  `existing_qty=999` deliberadamente distinto como contraste.
- Quatro exportações com **204 linhas** conferem contagem, unicidade e fim
  do lote em Word/Excel, nos dois níveis. Isso comprova ausência do limite
  de paginação 20/50 da interface, não capacidade nacional, latência máxima,
  tetos 1.000/10.000 dos repositories ou layout renderizado de tabelas longas.
- Não se alterou código da aplicação, metodologia, parâmetro ou schema;
  somente fixtures, testes, registro do módulo protegido e este plano.
- Regressão completa atual: **1.642 testes backend aprovados em 175,21 s**,
  sem falhas/skips/xfail, com migração base→head em PostgreSQL novo e
  remoção exclusiva desse banco ao final. Inclui a última apresentação do
  Word sem tabela vazia e os 34 cenários novos de mérito. Os pisos de
  linha/branch passaram: Services **96,1%/90,1%** (piso 80%),
  Repositories **97,1%/86,6%** (70%), Routes **95,1%/70,3%** (60%).
  Evidência: `/private/tmp/sigeo-merito-backend-final-20261019.json`.
- Ruff dos arquivos tocados, formatação, mypy de app (122 fontes) e
  `git diff --check` aprovados. Frontend não foi alterado/reexecutado nesta
  rodada. Sem alteração do clone servido, cron, remoto ou produção; sem
  commit/push/deploy. O plano geral permanece aberto pelos quatro grupos
  de fechamento discriminados no checklist, não por falha nesta matriz.

### Cruzamento de propostas e monitoramento nos arquivos — 19/10

- Acrescentados **45 testes PostgreSQL**: 10 recortes × 2 formatos × 2
  níveis (40), monitorado sem Convênio em dois níveis Word (2), exclusão
  em lote sem apagar dados (1), e virada do ano em Word/Excel (2).
  Recortes: Brasil, região, UF, município com acento, CNES, ano de origem,
  histórico, ano corrente, período e vazio. Services/repositories/builders
  são reais; somente o relógio externo é controlado. Transações sintéticas
  são revertidas em banco descartável, sem alterar o clone servido.
- Reproduzidos antes da correção: obra já excluída reaparecia no monitoramento
  do XLSX; Word contava monitorados no resumo, mas omitia seus detalhes se
  não houvesse bloco de Convênio no recorte. A regra vigente de ano corrente
  inclui acompanhamentos ainda abertos de anos anteriores/ano desconhecido;
  não se mudou essa regra nem se fixou 2026 no código da aplicação.
- A composição de relatórios agora consulta em lote os números excluídos,
  preservando cargas internas sem espelho. Word inclui acompanhamento
  interno sem bloco oficial no recorte, com identidade e seção canônica de
  monitoramento, sem criar Convênio ou inventar dados financeiros.
  A correção não altera a listagem/API geral de Monitoramento.
- As situações e os programas das fontes continuam com seus vocabulários
  distintos, conforme decisão do plano de relatórios de 25/09. Não se
  propagaram filtros incompatíveis para produzir conjuntos artificialmente
  vazios. Os oráculos comparam as identidades da carteira sintética nos
  arquivos finais, distinguindo-as de outros seeds válidos do banco.
- Os **45 testes direcionados passaram**. A matriz cruzada não encerra os
  aceites restantes: análise de mérito, grandes volumes, densidade/layout e
  revisão nativa de Excel/Word, além da cobertura integral frontend e dos
  aceites nacionais/operacionais listados abaixo. Sem commit, push ou deploy.
- A matriz anterior de Convênios foi adequada à separação das seções Word:
  não conta os números do acompanhamento independente como Convênios extras.
  O oráculo de Convênios permanece exato, sem trocar igualdade por subconjunto;
  a matriz cruzada verifica o acompanhamento separadamente. As duas matrizes
  passaram juntas: **111 testes**.
- Regressão completa: **1.608 testes aprovados em 175,73 s**, sem
  falhas/skips/xfail, em PostgreSQL descartável realmente migrado e removido.
  Gate de linha/branch aprovado: Services **93,6%/81,7%** (piso 80%),
  Repositories **97,1%/85,6%** (70%), Routes **95,1%/70,3%** (60%).
  Evidência: `/private/tmp/sigeo-relatorios-cruzados-backend-final-20261019.json`.
  Esses valores substituem os anteriores como última medição, sem supor
  cobertura por contagem de testes.
- Inspeção visual dos dois Word sintéticos (duas páginas cada) identificou
  tabela de timeline vazia com sete colunas e cabeçalhos partidos. O Word
  agora mostra a ausência de eventos em parágrafo, preservando a seção de
  ações e as timelines preenchidas; o XLSX mantém a linha informativa.
  Após esse último ajuste de apresentação, **193 testes de relatórios
  passaram**; não se repetiu a suíte completa depois dele. Amostras
  regeneradas/reinspecionadas em todas as quatro páginas, sem cortes ou
  sobreposição. Preservados os estilos existentes, sem redesenhar o timbre.
  Evidências: `/private/tmp/sigeo-relatorios-cruzados-qa-20261019-v2`.
- Ruff, formatação, mypy (122 fontes) e `git diff --check` aprovados.
  Frontend e os servidores locais não foram alterados/reiniciados nesta
  rodada; não se presume que a API servida sem autoreload já tenha carregado
  o código novo. Nenhuma alteração de schema, cron, fonte ou produção.

### Conteúdo exportado e paginação dos relatórios — 19/10

- Implantada matriz de 15 recortes × 2 formatos × 2 níveis = **60 casos**,
  com PostgreSQL, service, repositories e builders reais, sem mocks de
  domínio. A carteira sintética inclui contrastes de UF/região/município/CNES,
  ano isolado/período inclusivo, situação, programa, contratação, equipamento,
  combinação, vazio, ano desconhecido e registro de obra oculto. Cada caso
  exige os números exatos nos arquivos, não apenas arquivo não vazio/HTTP 200.
  Fixtures são inseridas por transação e revertidas; não usam o clone servido.
- A matriz certifica a seção **Convênios** e suas contagens no resumo.
  Não equivale à matriz integral de propostas/monitoramento, nem aos arquivos
  de análise de mérito. Esses cruzamentos e grandes volumes continuam pendentes.
- Conferidos no XLSX final: CNES/CNPJ textuais com zeros à esquerda, centavos
  numéricos, zero distinto de ausente, datas nativas com formato, filtros e
  congelamento de cabeçalho. Atualizado contrato HTTP que ainda enviava `ano`
  obsoleto: usa `ano_inicio/ano_fim` e compara a exportação com carteira
  explicitamente preenchida, evitando falso positivo por conjunto vazio.
- Regressão reproduziu promoção indevida de texto da fonte (`=1+1`) para
  fórmula executável no Excel. O builder de tabelas agora grava esse texto
  literalmente, sem apóstrofo extra e sem alterar números/datas. Seis casos
  unitários e integração sobre o arquivo final protegem contra regressão.
  Não foi implementado nem prometido suporte a fórmulas nesse builder de dados.
- Revisão visual de duas amostras DOCX (todas as três páginas de cada uma)
  com LibreOffice empacotado encontrou linha financeira partida e cabeçalho
  órfão. Builder agora impede partir linhas, repete cabeçalhos e mantém
  tabelas de até seis linhas em bloco, preservando paginação de tabelas longas.
  Duas regressões OOXML passaram; amostras regeneradas/reinspecionadas mostram
  o bloco financeiro inteiro. Não se redesenhou timbre, fonte ou títulos.
- Os 148 testes direcionados de relatórios passaram após essas correções.
  Inspecionadas as seis abas de cada XLSX amostral com Artifact Tool, somente
  leitura: a importação da prévia converteu IDs textuais em números e ocultou
  zeros. O XLSX original reaberto estruturalmente preserva os IDs; isso é uma
  limitação dessa prévia, não aceite de renderização nativa do Excel.
  Não foram sobrescritos os XLSX com o resultado da importação.
- Evidências sintéticas temporárias, não entregáveis de usuário:
  `/private/tmp/sigeo-relatorios-qa-20261019-final` (primeira inspeção) e
  `/private/tmp/sigeo-relatorios-qa-20261019-paginacao` (Word corrigido).
  Persistem revisão de densidade/legendas, composição por outras entidades,
  grandes tabelas e conferência nativa no Excel/Word. Essas amostras não
  certificam “todos os filtros possíveis” nem encerram a frente de relatórios.
- Regressão completa: **1.563 testes backend aprovados em 155,64 s**, sem
  falhas/skips/xfail, em PostgreSQL descartável migrado de base a head e
  removido ao final. Revalidação dos contratos HTTP e matriz: 75 aprovados.
  Pisos de linha/branch preservados: Services **96,0%/89,9%** (piso 80%),
  Repositories **97,1%/85,5%** (70%), Routes **95,1%/70,3%** (60%).
  Cobertura: `/private/tmp/sigeo-relatorios-backend-final-20261019.json`.
  Frontend não foi alterado/reexecutado nesta rodada; o último aceite segue
  383 testes, com a lacuna de cobertura integral registrada abaixo.
- Ruff, formatação, `git diff --check` e mypy de app (122 fontes) aprovados.
  Sem mudança de regra financeira/de cobertura,
  schema, fonte, cron, banco servido ou produção; sem commit, push ou deploy.

### Convite expirado em navegador e geração/download frontend — 19/10

- Fechada a pendência de convite expirado em Chromium real: a API local
  retornou 400, a tela mostrou “Convite inválido ou expirado.”, o botão voltou
  a ficar disponível, não houve redirecionamento nem cookie/sessão autenticada.
  O token existia no banco e estava vencido, sem mock de API ou relógio.
- O launcher, depois das guardas de loopback/role/OID/configuração 0600,
  cria exclusivamente uma identidade sintética nova com convite vencido.
  O navegador recebe só o token sintético, nunca DATABASE_URL/JWT/chave do
  Portal. Não se criou endpoint de teste na aplicação nem se alteraram contas
  anteriores. A URL privada deve estar previamente na forma canônica
  `postgresql+psycopg`; não se carrega .env de aplicação implicitamente.
- O finally inativa somente ID/email criados pelo ensaio, invalida o convite,
  revoga eventuais sessões e preserva auditoria. Três integrações PostgreSQL
  comprovam limpeza em sucesso, erro do navegador e alteração indevida,
  mantendo outra conta intacta. Os 32 testes direcionados passaram.
- O ensaio completo (expirado → convite válido → primeiro login → renovação
  → recuperação de senha) passou em 12,6 s, 13,1 s incluindo inicialização.
  Não certifica entrega SMTP externa, proxy/HTTPS ou infraestrutura de produção.
- Acrescentados 15 testes de `useGerarRelatorio` com hook/service/transporte
  reais; somente HTTP e o download do navegador são simulados. As dez
  combinações de cinco escopos × DOCX/XLSX conferem parâmetros de ano,
  situação, programa, contratação, equipamento e busca, nome do servidor,
  MIME do blob e liberação da URL temporária. Também cobrem HTTP 403/422/503,
  rede indisponível, nova tentativa, nome padrão e loading pendente.
  Esse aceite é de transporte/estado, não de conteúdo/layout dos arquivos.
- Frontend: **383 testes em 73 arquivos aprovados**, lint/typecheck e
  typecheck explícito dos auxiliares E2E aprovados. Ruff/formatação dos
  scripts/testes, build frontend e mypy de app/dois scripts (124 fontes)
  aprovados. Regressão backend completa: **1.489 testes aprovados em
  132,89 s, zero falhas/skips/xfail**, em banco novo migrado e removido ao
  final, sem tocar no clone servido. Gate frontend importado:
  hooks 97,9%/93,1%; componentes 82,9%/72,4% em linhas/branches.
  Medição integral ainda reprova o piso: hooks **35,9%/26,5%**;
  componentes **32,0%/27,9%**, sem redução do piso nem exclusões novas.
  Dos 42 hooks, 25 continuam sem execução; dos 96 componentes, 60.
  Artefato: `/private/tmp/sigeo-frontend-convite-relatorio-20261019/coverage-final.json`.
- O aceite local de autenticação registrado no checklist está fechado;
  permanecem relatórios gerados, cobertura integral frontend e aceites
  nacionais/operacionais. Sem commit, push, cron, deploy ou acesso à produção.

### Recuperação de senha real e validade dos links — 19/10

- Ampliado o ensaio opt-in de convite local, usando somente a conta nova
  sintética criada pelo próprio teste e a caixa loopback protegida. Chromium
  real aprovado em 10,3 s (10,9 s incluindo inicialização): solicitação de
  recuperação pela UI, resposta genérica, recebimento local, token somente no
  fragmento, remoção da URL, F5, redefinição, limpeza do sessionStorage,
  rejeição da senha anterior e login com a nova senha.
- Uma sessão independente anterior à troca permaneceu válida após solicitar
  o link, mas seu acesso e refresh retornaram 401 depois da redefinição.
  O link consumido retornou 400 no replay. Nenhuma senha de conta existente
  foi alterada; a conta sintética foi inativada no finally, com auditoria
  preservada. Sem SMTP externo, gravação de senha/token, screenshot ou trace.
- Acrescentadas quatro integrações HTTP/PostgreSQL: ativação e redefinição
  com token realmente cadastrado, expirado ou vigente. Expirado retorna 400,
  não emite cookies nem sessão e preserva hash da senha/token/validade;
  vigente troca a senha, consome o token, emite sessão e impede replay.
  Os 29 testes direcionados de sessão e guardas do launcher passaram em
  banco novo, migrado de base a head e removido ao final. Não se alterou o
  relógio da aplicação servida nem se simulou expiração em conta existente.
- Lint/typecheck frontend e 368 testes frontend aprovados; Ruff e formatação
  do teste backend aprovados. Não houve alteração de código de autenticação
  ou configuração de segurança: somente testes e documentação nesta rodada.
  Os dois arquivos E2E também passaram por typecheck explícito e Prettier.
  Regressão backend completa repetida: **1.486 testes aprovados em 126 s**,
  sem falhas, skips ou xfail, em PostgreSQL novo realmente migrado; o banco
  temporário foi removido ao final. API local 8001 confirmou banco conectado
  e frontend 5181 respondeu 200 após o ensaio. Sem commit, push ou deploy.
- Recuperação de senha deixou de ser pendência E2E. Ainda falta visualizar
  o erro de convite expirado em navegador real; a validade já foi comprovada
  pelo backend real, mas uma camada não substitui a outra. Permanecem os
  filtros/arquivos dos relatórios, cobertura integral frontend e os aceites
  nacionais/operacionais discriminados no checklist seguinte.

### Avanço frontend, contrato do componente e pendências atuais — 19/10

- Acrescentados 62 testes: consultas/mutações do Radar, apresentação do
  componente e estado dos filtros de Dados Oficiais/relatórios. A suíte
  passou de 306 para **368 testes em 72 arquivos**, todos aprovados.
  As consultas e mutações usam hooks, services, Zod e TanStack reais,
  substituindo somente HTTP: filtros/paginação, permissões, identidade e
  cache, prova alterada, erros 401/403/409/503, invalidação e histórico.
  Os testes de filtros verificam URL, limpeza, busca, paginação e isolamento;
  não equivalem à conferência dos arquivos DOCX/XLSX gerados.
- Reproduzido e corrigido um defeito de contrato: o schema frontend
  descartava `componentes` recebido pelo backend. Agora valida a coleção
  e mostra o componente oficial no card; payload explicitamente inválido
  gera erro, não desaparece silenciosamente. Número da proposta permanece
  em Mais detalhes, não no cabeçalho. Nenhuma regra de descoberta mudou.
- E2E Chromium do Radar aprovado em 23,2 s, com API simulada e UI real:
  larguras 320/375/400/768/1024/1440, filtros, triagem, histórico, contador,
  fechamento e ausência de overflow. Capturas de 400 e 768 foram
  inspecionadas visualmente. Este teste não certifica persistência no banco;
  os aceites locais com banco estão registrados separadamente abaixo.
- Lint, typecheck, build e `git diff --check` aprovados. Gate atual de
  cobertura: hooks **97,8%/93,1%**, componentes **82,9%/72,4%** em
  linhas/branches. Esse gate ainda considera somente arquivos importados.
  Na medição integral separada, hooks ficam em **34,5%/26,5%** (42 arquivos,
  26 sem execução), componentes em **32,0%/27,9%** (96 arquivos, 60 sem
  execução). O avaliador integral reprova corretamente o piso de 70%.
  Não se reduziu piso nem se excluíram arquivos para obter aprovação.
  Artefato: `/private/tmp/sigeo-frontend-filtros-radar-final-20261019/coverage-final.json`.
- Backend não foi alterado nem reexecutado nesta rodada frontend; os
  1.482 testes abaixo são o último aceite backend, não uma nova execução.
  Sem commit, push, deploy, alteração de cron ou acesso ao banco de produção.

**Falta para fechar o plano:**

1. Classificar arquivos frontend elegíveis, documentar eventuais exclusões
   puramente apresentacionais, testar a lógica ainda sem execução e integrar
   a medição integral ao gate, preservando os pisos constitucionais.
2. Fechar os aceites restantes de layout/volume dos relatórios DOCX/XLSX.
   As matrizes de Convênios, propostas/monitoramento e análise de mérito
   estão executadas conforme os blocos atuais no início deste documento;
   os tetos de consulta/exportação já têm regressões de excesso e recusa
   explícita nas cinco entidades, incluindo Monitoramento após o recorte.
   Tabelas longas das duas amostras foram renderizadas/revisadas e os defeitos
   reproduzidos corrigidos (etapa atual no início deste documento).
   Permanecem volume nacional dos arquivos, concorrência/desempenho e revisão
   nativa de Excel/Word. Não confundir o aceite dessas amostras ou guardas
   de teto com certificação de desempenho nacional.
3. Executar o ciclo nacional real de publicação/revalidação persistente em
   homologação, quando houver identidade oficial completa. A leitura nacional
   já executada não encontrou candidato novo com prova suficiente; não
   fabricar novidade nem aprovar os resultados incompletos para fechar aceite.
4. Fechar CI remoto Linux/PostgreSQL 16, automação agendada e aceite operacional
   de restore, RPO/RTO, retenção e provedor. Execução remota e ativação em
   produção continuam fora desta rodada local e exigem autorização própria.

### Aceite nacional somente leitura e identidade incompleta do Portal — 19/10

- Executada a descoberta canônica sobre as cinco fontes oficiais nacionais,
  integralmente baixadas/CRC conferido em diretório privado temporário,
  excluído ao final. A consulta dos 403 números conhecidos usou somente
  leitura no clone, com loopback/role/OID conferidos e conexão fechada antes
  de qualquer download. Não se baixou pagamentos para descobrir candidatos.
- Catálogo federal consultado após os downloads: os cinco arquivos têm
  atualização em 19/10/2026, aproximadamente 08h14 de Brasília; os tamanhos
  do catálogo coincidem exatamente com os ZIPs coletados. Hashes SHA-256:
  - convênios: `a204ccaa8a618e067a2d343d990ce45912a7e7304e54d47e0aa6025991245742`;
  - plano detalhado: `4f152b859c2753320790d35035d7bb8c6e2b26e7eb0e4a68319e6ff4808072e2`;
  - propostas: `4d08922994bc9b58d0bc3c7756b9bee2740080cc41d2059541394768ee42c6cd`;
  - programas: `032aa39d1dcb2f8088d0eb7982563d413afefaefd7a80161372a186a08ba86d8`;
  - vínculos: `67c932d0f8065ee4662c80e62b6801ddc08ce5665cc13b3c96a4fbe5b8be553e`.
- A classificação nacional retornou somente dois resultados fora da carteira,
  ambos por componente prioritário, sem evidência de equipamento prioritário:
  **7AAFRI**, ambulatório oncológico, não encontrado no Portal; **7AAFSX**,
  hospital de alta complexidade oncológica. Nenhum dos dois constava no
  histórico local de candidatos. Não foi feita nenhuma publicação ou aviso.
  Identidade alfanumérica foi preservada conforme o contrato canônico.
- A confirmação mínima existente marcava 7AAFSX como confirmado por código e
  data. A verificação mais completa mostrou `dimConvenio.numero` e
  `dimConvenio.objeto` vazios. Portanto o resultado inicial **não é aceite
  de novo convênio**: a aprovação já recusaria esse payload incompleto.
  Não se classificou inexistência definitiva nem se aplicou blacklist.
- Corrigida a descoberta para reutilizar `DimConvenioPortal`, o mesmo
  contrato canônico da recaptura: código exato, número formal e objeto
  preenchidos, além da publicação. Não muda o catálogo ou os critérios de
  equipamento/componente/MS. Oito regressões unitárias falharam antes da
  correção (campos nulos/vazios/omitidos) e agora recusam a falsa confirmação.
  Duas integrações PostgreSQL simulam somente HTTP e comprovam que payload
  incompleto impede publicação do ciclo e mantém a fila anterior, sem aviso
  de novidade; somente registro de erro operacional é permitido.
- Repetição somente leitura do Portal real, já com o contrato corrigido:
  7AAFRI continua não encontrado; 7AAFSX fica bloqueado pelos dois campos
  vazios. **Zero resultados novos com prova completa para publicar nesta
  rodada**. Não há erro de DNS atual nem truncamento do universo nacional.
  Pendência externa: a fonte confirmar uma identidade completa; não inventar
  dado para forçar descoberta. Aceite de leitura/classificação nacional
  executado, mas o ciclo real de publicação/revalidação persistente continua
  separado e não foi executado contra o clone servido.
- Regressão final do checkout: **1.482 testes backend aprovados, zero falhas
  e zero xfail**, em 129,71 s, com PostgreSQL 18.6 descartável realmente
  migrado e removido ao final. As quatro falhas intermediárias eram fixtures
  HTTP antigas sem número/objeto; foram atualizadas sem remover asserções
  de replay, rollback ou erro. Os 59 testes direcionados passaram antes da
  suíte completa. Ruff, formatação dos seis arquivos Python tocados, mypy
  de app/launcher (123 fontes), lint/typecheck frontend e `git diff --check`
  passaram. Pisos backend preservados em linhas/branches:
  Services 94,5%/87,7%, Repositories 96,7%/84,0%, Routes 92,8%/68,8%.
  Artefato: `/private/tmp/sigeo-aceite-nacional-convite-validado-20261019.json`.
- API 8001 confirmou banco conectado e frontend 5181 respondeu 200 após
  os testes. Produção, cron e CI remoto não foram alterados; sem commit,
  push ou deploy. A única escrita no clone foi a conta sintética do E2E,
  seu fluxo de sessão e auditoria, com inativação comprovada ao final.

### Convite, senha e primeiro login em navegador — 19/10

- Implementado E2E opt-in `convite-local.spec.ts`, sem mocks de domínio ou
  respostas HTTP. O launcher `scripts.verificar_convite_navegador_local`
  exige arquivo privado 0600 sem symlink, frontend/caixa loopback exatos,
  banco clone loopback, role restrita e OID conferidos antes do navegador.
  O processo filho recebe somente as credenciais sintéticas estritamente
  necessárias; nunca DATABASE_URL, JWT ou chave do Portal. Não habilita CI
  remoto, produção, agendamento ou envio de e-mail externo.
- Chromium real aprovado em 5,6 s: administrador local cria um convite,
  mensagem é recebida pela caixa protegida, token fica somente no fragmento
  e sai da barra de endereço; F5 preserva o token na mesma aba; senha é
  cadastrada, sessão é emitida, identidade colaborador é confirmada e token
  é removido do sessionStorage. Reutilização do convite retorna 400.
  Logout → primeiro login com a senha cadastrada → F5 → renovação 200 com
  refresh rotacionado → logout foram comprovados, com cookie HttpOnly.
- Foi criada somente uma conta sintética nova @example.com, inativada pelo
  administrador no finally, preservando auditoria. Nenhuma conta existente
  teve senha/estado alterado. Screenshots/traces desabilitados; tokens,
  senhas e mensagens não foram impressos. Não certifica entrega SMTP real,
  HTTPS/proxy de produção, convite expirado ou redefinição de senha.
- Sete testes de guarda aprovados: recusam arquivo público/symlink,
  frontend/caixa externos, banco remoto e banco fora do prefixo de clone,
  antes de conexão SQL, navegador ou criação de usuário.
- Repetição manual segura: `python -m scripts.verificar_convite_navegador_local
  --env <configuração-privada-local-0600>`, com os três servidores já ativos.
  O projeto Playwright `convite-local-chromium` só existe com a flag local
  explícita do launcher; a execução normal não cria usuários por acidente.

### Inventário ampliado da cobertura frontend — 19/10

- A suíte atual passou novamente: 67 arquivos/306 testes; lint, typecheck e
  build aprovados. O gate configurado mede hooks 95,4%/90,1% e componentes
  de domínio 82,9%/72,2% em linhas/branches, mas só arquivos importados.
- Medição diagnóstica separada com inclusão explícita de todos os arquivos
  `src/hooks/**/*.{ts,tsx}` e `src/components/features/**/*.tsx`:
  42 hooks (29 sem execução), 96 componentes (60 sem execução).
  Hooks 24,2%/20,9%; componentes 31,9%/27,8% em linhas/branches.
  O avaliador retornou corretamente cobertura abaixo de 70%.
  A medição é conservadora: ainda inclui componentes puramente
  apresentacionais, que só poderão ser excluídos com justificativa explícita.
- Não se reduziu piso nem se substituiu a configuração por exclusões para
  produzir um gate verde. A lacuna de inventário está comprovada; permanece
  pendente classificar os arquivos elegíveis, ampliar seus testes e integrar
  a medição integral ao gate. O sucesso da suíte atual não certifica esse
  universo. Artefato separado:
  `/private/tmp/sigeo-frontend-inventario-integral-20261019/coverage-final.json`.

### Correção autorizada dos downgrades históricos — 19/10

- O usuário autorizou expressamente a exceção à imutabilidade da migration
  RB-001 e, após a reprodução dos defeitos seguintes, estendeu a autorização
  aos downgrades históricos necessários para verificar a cadeia completa.
  A exceção não autoriza aplicação em banco servido, clone ou produção.
- `9c2e4f7a1d38`: desabilitada somente a criação automática duplicada do enum
  (a criação explícita permanece), restaurados nome da FK
  `fk_execution_alert_execution` e `NOT NULL` de `created_at`, conforme o
  schema imediatamente anterior. Duas passagens upgrade/downgrade comparam
  colunas/identities/defaults, PK, FK, uniques e enums contra o original.
- A reversão até base revelou dois outros defeitos reais: `06e73a1db53b`
  tentava remover UNIQUE sem nome; agora usa o nome atribuído pelo PostgreSQL
  ao UNIQUE original. `92fe48aa5b7b` e `c214b6dc6a4a` deixavam seus próprios
  enums órfãos. Cada downgrade remove somente os tipos que criou, depois
  das tabelas dependentes, sem CASCADE ou varredura de objetos alheios.
- Todos os quatro `upgrade()` foram comparados por AST com o HEAD e estão
  integralmente preservados. Não houve nova revisão, stamp ou SQL manual em
  banco existente; apenas código de reversão e testes foram alterados.
- A fixture de inspeção encerra sua transação de leitura antes de chamar
  a cadeia com DDL CONCURRENTLY/autocommit; a falha dessa fixture não foi
  atribuída à migration do índice, que permaneceu inalterada.
- Retirado o `xfail` RB-001. O teste agora exige upgrade → base → upgrade,
  tanto da revisão `b5c6d7e8f9a0` quanto de `head`, sem limpeza auxiliar:
  revisão, tabelas e enums devem retornar; base não pode deixar enums órfãos.
  Testes adicionais preservam um enum externo às revisões corrigidas.
- O sucesso estrutural em banco vazio não restaura dados removidos por
  downgrade. Recuperação de dados continua exigindo backup/restore validado;
  esse resultado não autoriza downgrade destrutivo em produção.
- **RB-001 encerrado no checkout local:** suíte completa com **1.465 testes
  aprovados, zero falhas e zero xfail**, em 125,72 s. Cluster PostgreSQL 18.6
  temporário vazio realmente migrado, encerrado/removido após o ensaio.
  As seis provas de migrations incluem os dois ciclos completos e os tipos
  externos preservados. Ruff, formatação dos cinco arquivos de código/teste,
  mypy de app e quatro migrations (126 fontes), comparação AST dos upgrades
  e `git diff --check` passaram. Pisos linhas/branches preservados:
  Services 94,5%/87,7%, Repositories 96,7%/84,0%, Routes 92,8%/68,8%.
  Artefato: `/private/tmp/sigeo-rollback-historico-corrigido-20261019.json`.
  Não houve commit, push, deploy nem execução contra banco existente.

### Resolução do bloqueio DNS e aceite real de propostas — 19/10

- A causa da falha anterior foi isolada por comparação na mesma máquina:
  dentro do sandbox, `scutil --dns` não tinha configuração disponível e o
  curl falhava na resolução; fora da restrição, o resolvedor do sistema
  resolveu o mesmo domínio e `/downloads/` respondeu HTTPS 200. Não foi
  necessário alterar DNS, `/etc/hosts`, hostname oficial, proxy ou TLS.
  Consultas públicas desta rodada foram executadas com acesso de rede
  autorizado, não com IP fixo ou fallback para dado antigo.
- O cliente operacional `_resolver_programas_alvo` leu o catálogo real:
  dez programas MS/catálogo exato elegíveis (53, 57, 63, 64, 104, 109, 151,
  155, 164, 165). As consultas paginadas dos dez programas retornaram dez
  propostas distintas: 23810, 24146, 38088, 38737, 41173, 41803, 42284,
  42913, 43829 e 44942. Componentes Rede de Atenção continuam no catálogo,
  ainda que não tenham correspondência nesse catálogo atual da nova API.
- O detalhe completo das dez propostas passou pelo cliente e por
  `reconciliar_arvore`, com hash por árvore. A comparação das identidades
  contra o clone usou transação somente leitura, runtime/loopback/OID
  conferidos, conexão fechada antes da rede: todas já existiam no clone;
  **nenhuma proposta genuinamente nova foi encontrada nessa rodada**.
  Nenhum snapshot, candidato, decisão humana, carteira ou aviso foi escrito.
  Este aceite comprova a leitura real da nova API no escopo aprovado; não
  declara concluída a descoberta nacional SICONV nem simula novidade.
- A revisão de identidade reproduziu nove falhas: o job aceitava booleanos
  e números não positivos, descartava IDs ausentes/textuais e processava
  repetições. Agora um DTO estrito exige inteiro positivo, repetição idêntica
  é deduplicada e payload divergente da mesma identidade aborta o lote.
  A integração revelou ainda coerção anterior no cliente (`true` → `1`,
  texto numérico → inteiro); `PropostaTransfereGov` também ficou estrito
  nesse campo, antes de a informação original ser perdida. O detalhe
  completo continua sendo validado pelo fluxo existente, não por esse DTO
  mínimo. Nenhuma migration ou mudança de contrato UI foi necessária.
- Novos testes unitários e PostgreSQL exercitam identidade inválida e
  impedem coleta incompleta como sucesso/novidade: permanece somente o
  registro de erro e alerta gerencial, sem descoberta parcial publicada.
- Frontend 5181 e API 8001 responderam novamente; `/health` confirmou banco
  conectado. Produção, DNS da máquina e recorrências não foram alterados.
- Regressão final após a correção das duas fronteiras: **1.460 testes
  backend aprovados, 1 xfail estrito histórico RB-001**, em 125,16 s.
  PostgreSQL 18.6 temporário, vazio e realmente migrado, encerrado e
  removido ao final. Ruff, formatação dos seis arquivos tocados,
  mypy de app/job (123 fontes) e `git diff --check` passaram.
  Cobertura: Services 94,5%/87,7%, Repositories 96,7%/84,0%, Routes
  92,8%/68,8% (linhas/branches), com pisos preservados.
  Artefato: `/private/tmp/sigeo-identidade-descoberta-final-20261019.json`.

### Descoberta integrada da nova API — 19/10

- Na revisão do fluxo de propostas novas, encontrou-se divergência em
  `_resolver_programas_alvo`: o job ainda chamava o helper histórico de
  similaridade do levantamento e não exigia `sg_ente_superior = MS`.
  O teste reproduziu a aceitação indevida de programa MCTI com nome de
  componente antes da correção. Nenhum candidato real foi alterado por esse
  diagnóstico; não se executou o job amplo contra o clone ou produção.
- Correção dentro do escopo restrito aprovado: contrato estrito
  `ProgramaDescobertaTransfereGov` para identidade/nome/sigla institucional;
  programa sem prova do MS não entra; componente usa exclusivamente
  `componente_prioritario`, catálogo canônico e aliases integrais curados.
  Não usa objeto/objetivo, nome parecido ou curso com sufixo para substituir
  o nome integral. IDs inválidos ou mesma identidade com dados divergentes
  abortam o lote; repetição idêntica não duplica o escopo. Payload extra
  permanece disponível como evidência. Nenhuma migration ou contrato UI novo.
- `test_programas_descoberta_transferegov.py` exercita todos os oito nomes
  canônicos, quatro aliases, órgãos diferentes/ausentes, nome formativo
  parecido, duplicidade e identidade inválida pela fronteira HTTP.
  `test_descoberta_nova_api_integrada_db.py` integra cliente HTTP, job,
  Services/repositories e PostgreSQL reais em schema sintético: novas
  propostas ficam pendentes em `PropostaCandidata` (destino de Em tramitação),
  sem criar Convênio ou InstrumentoEquipamento. São gravadas as evidências,
  aviso inicial agrupado e destinatários da regra atual; replay não duplica.
  Mudança posterior de valor gera um aviso agrupado sem desfazer rejeição
  humana. O teste não substitui domínio por mock: só HTTP/fábrica de conexão.
- Erro de coleção na segunda proposta reverte a primeira e o aviso de
  novidade; somente a tentativa de erro e seu alerta gestor/admin são
  registrados. A política existente de aviso de proposta nova continua
  broadcast a colaboradores/gestores/admin ativos, nunca leitores; avisos de
  convênio novo e indisponibilidade continuam restritos a gestor/admin.
  Esta rodada não mudou essa política de destinatários.
- A primeira consulta desta etapa ao catálogo federal falhou na resolução
  DNS dentro do ambiente restrito (bloqueio resolvido na seção acima).
  Isso não comprovava indisponibilidade geral do TransfereGov nem
  ausência de novos instrumentos; não se publicou sucesso vazio, não se
  alterou a fonte oficial e não se desligou validação TLS para contornar.
  A amostra preexistente do clone foi examinada somente por leitura: das
  28 propostas, dez tinham programa capturado e todas as dez mantiveram o
  enquadramento MS/catálogo exato; 18 não tinham programa capturado, portanto
  não foram reclassificadas/ocultadas nem consideradas aprovadas pelo novo
  critério. Isso não é coleta oficial nova nem prova de exclusão dessas 18.
- Permanecem pendentes o aceite nacional SICONV, descoberta de casos
  genuinamente novos e revisão operacional/CI remoto. O aceite real da nova
  API consta na seção acima; o teste sintético
  integrado não será registrado como achado real no Radar servido.
- Validação final: **1.440 testes backend aprovados e 1 xfail estrito RB-001**
  em 125,05 s, em PostgreSQL 18.6 vazio realmente migrado, encerrado/removido
  ao final. Services 94,5%/87,7%, Repositories 96,7%/84,0%, Routes 92,8%/68,8%
  em linhas/branches; pisos preservados. Ruff, formatação dos cinco arquivos
  de código/testes tocados, mypy (428 arquivos) e `git diff --check` passaram.
  Artefato: `/private/tmp/sigeo-descoberta-programas-ms-20261019.json`.
- Catálogo apresentado ao usuário a partir das fontes canônicas:
  `app/equipamentos.py` contém cinco famílias prioritárias para descoberta
  e dez outras reconhecidas para informação; estas últimas não bastam,
  isoladamente, para qualificar novo convênio. `app/catalogo_componentes.py`
  contém oito nomes integrais (três Rede de Atenção/Doenças Crônicas e cinco
  PNPCC) e quatro aliases explicitamente curados. Não se confunde esse rol de
  descoberta com as famílias/parametrização do módulo de Análise de Mérito.

### Publicação de amostras reais no clone — 19/10

- Aceite manual restrito à cópia servida: loopback, runtime sem privilégios
  de dono e OID conferidos antes de carregar a conexão. Configuração privada
  local, sem herdar chave/JWT/conexão de produção, sem envio externo de e-mail.
  O ensaio reutiliza os kernels de coleta/reconciliação já existentes; não
  habilita scheduler nem altera guardas dos launchers públicos.
- A proposta conhecida **43829** foi recapturada duas vezes na API real e
  publicada pelo kernel `_recapturar_lote`, nas capturas locais **16 e 17**.
  Já havia baseline: ambas registraram um item verificado, **zero alterações
  e zero avisos**. As **14 evidências relacionais**, o hash do detalhe e os
  campos de revisão permaneceram iguais; nenhum instrumento foi criado.
  Hash protegido persistido:
  `2a71bc6db894f00d5bdb18bc8cbdfc3a4c0eb6caa5194ed57f10a42349649c9c`.
  Isso comprova replay real sem duplicação, não simula mudança federal nem
  comprova descoberta de proposta nova. O estado da amostra era pendente,
  sem revisão humana preenchida; preservação de revisão preenchida continua
  coberta pelos testes sintéticos, não por esse caso real específico.
- A amostra financeira 825374/895596/948686 passou pelo preflight: os três
  já pertencem à carteira como Convênio. A coleta nova terminou, sem transação
  SQL aberta durante os downloads; pagamentos precisou de nova tentativa,
  sem publicação parcial ou substituição por vazio. Os sete arquivos passaram
  por leitura integral, CRC, contratos e proteção de texto antes da publicação.
  As capturas locais **18 e 19**, fonte separada `siconv_aceite_local`,
  registraram três itens verificados cada: a primeira atualizou **dois**;
  o replay atualizou **zero** e gerou **zero avisos**. Não houve inclusão
  de instrumentos. O ensaio reutilizou `reconciliar_registro`, sem executar
  o job nacional ou declarar frescor nacional pelo sucesso dessa amostra.
- A verificação posterior relê as capturas persistidas e seus sete hashes
  e consulta os três detalhes HTTP com conta sintética de leitor, seguida de
  logout. Todos responderam 200: snapshot SQL e HTTP idênticos; valores
  derivados do cabeçalho, contagem de pagamentos e total pago ao fornecedor
  conferidos contra o snapshot. As coleções ficaram nas mesmas contagens do
  aceite de leitura abaixo. Situações literais: **825374 — Prestação de
  Contas Concluída**, **895596 — Prestação de Contas em Análise**,
  **948686 — Em execução**. A prestação de contas do monitoramento também
  foi conferida quando o instrumento da amostra existe. Sem payloads,
  valores financeiros ou credenciais nos logs do ensaio.
- Checagem paralela solicitada pelo usuário: frontend **5181** e API **8001**
  responderam HTTP 200; `/health` confirmou `database: connected` por SQL.
  O módulo efetivamente servido pelo Vite apontou para
  `http://127.0.0.1:8001`, em modo development. A caixa local **8002** respondeu
  200 em `/mensagens` com a chave privada local, sem exibir mensagens/chave.
  O 404 de `/openapi.json` é intencional: essa caixa desabilita OpenAPI/docs.
  Navegador real confirmou o login renderizado e nenhum erro/warning capturado
  no console. Não se reiniciou nenhum serviço; não se realizou novo login
  nem ensaio completo de sessão neste smoke test.
- Na retomada subsequente, os processos já haviam encerrado; a coleta também
  havia terminado. O estado não foi inferido da sessão de terminal perdida:
  consultaram-se os registros 16–19 do clone para confirmar a publicação.
  Frontend 5181, API 8001 e caixa 8002 foram então restaurados com a mesma
  configuração local validada, sem processo de produção. O ensaio HTTP
  `scripts.verificar_http_recuperacao` passou: **quatro testes**, saúde SQL,
  CORS explícito, caixa exclusivamente local, gestor/colaborador/leitor,
  cookies de 60 minutos, negação sem CSRF, rotação de refresh e logout.
  Isso não certifica primeiro acesso/convite nem sessão no proxy de produção.
- Recorte de regressão repetido em PostgreSQL 18.6 vazio e realmente migrado:
  **32 testes aprovados** em 1,45 s, cobrindo publicação de proposta, filhas
  SICONV, baseline, replay, falha e notificações. Cluster encerrado/removido.
  Ruff e mypy (424 arquivos) passaram; código da aplicação não mudou nesta
  rodada. O resultado amplo anterior de 1.409 testes permanece histórico.
- Ajuste adicional da rotina recorrente, motivado pela duração real dos
  arquivos nacionais: `repositories/espelho_siconv.py` seleciona somente os
  números oficiais conhecidos em uma consulta explícita. O job encerra a
  transação antes do HTTP e relê o escopo sob bloqueio apenas na publicação.
  Exclusão/retipificação durante a coleta não é revertida pela rodada antiga;
  registros que saíram do escopo são contados em
  `fora_escopo_apos_coleta`, sem falso alerta de indisponibilidade da fonte.
  A coleta continua restrita ao universo conhecido e pagamentos não entram
  na descoberta do Radar. Nenhuma mudança de fórmula ou schema.
- O teste novo reproduziu a transação aberta antes da correção. Depois,
  **1.411 testes backend passaram e 1 xfail estrito RB-001 permaneceu**, em
  124,00 s, com PostgreSQL 18.6 vazio realmente migrado, encerrado/removido ao
  final. Services 94,5%/87,7%, Repositories 96,7%/84,0%, Routes 92,8%/68,8%
  em linhas/branches; pisos preservados. Ruff, formatação, mypy (425 arquivos)
  e `git diff --check` passaram. Artefato local:
  `/private/tmp/sigeo-aceite-publicacao-20261019.json`.

### Aceite pontual financeiro e nova API — 19/10

- Continuação do plano aprovado: validar contratos reais de leitura e falhas
  de coleta, sem alterar produção, agendamento, schema ou regras de cálculo.
  Consultas externas não são adicionadas à suíte CI: os testes usam HTTP
  sintético e banco real isolado; os aceites públicos são pontuais e separados.
- Os cinco arquivos financeiros oficiais atuais passaram por download novo,
  CRC e leitura CSV integral/estrita. Os metadados dos corpos completos
  indicaram atualização em **19/10/2026**. Foram selecionados somente os
  convênios conhecidos 825374, 895596 e 948686, sem SQL ou persistência; os
  ZIPs temporários foram removidos. `FilhasLegadoRecapturadas` confirmou as
  identidades, chaves únicas e valores de pagamento válidos, inclusive a
  política existente para estornos, sem exibir valores/pessoas em logs.
- Contagens aprovadas, na ordem empenhos/desembolsos/licitações/termos/pagamentos:
  **825374: 2/1/1/0/1**; **895596: 1/2/7/2/37**;
  **948686: 2/1/1/0/1**. Coleção explicitamente vazia foi distinguida de
  arquivo/coluna omitido. Não se inferiu equivalência entre repasse,
  desembolso e pagamento ao fornecedor.
- SHA-256 das fontes financeiras da rodada:
  empenhos `d498637e35a200dff5f096bf177adfa6bdcc312b9dfb533586e44ac4b3ffe2fd`;
  desembolsos `0a889f6ac626a3acca011d7ca4904e3daab5c640e891f90d64c7560ec8de00ad`;
  licitações `328d6f12f70866bd36fc4bcf34013dfae31168f37eb181e714042acd7cb78e04`;
  termos `b32f78de8156b80ae829b35ca9ce8c22b517013e9ce57cffed539bbf8507b730`;
  pagamentos `02123c148f2d290bbf58da96479fdd9213a326017b58df150e418f695193e382`.
- A API pública de Gestão de Parcerias foi conferida com a proposta
  **43829**, seu programa e parceria: uma meta com itens, um cronograma,
  uma análise e uma distribuição; a execução financeira retornou uma conta,
  um empenho, um documento hábil e uma ordem de pagamento. O detalhe passou
  pelo contrato `DetalheLocal` após proteção de texto, sem conexão SQL ou
  persistência. A leitura foi repetida com o cliente corrigido. Isso não
  representa descoberta de proposta nova nem alteração de decisão humana.
- Defeito reproduzido antes da correção: consumidores filhos aceitavam `{}`
  como coleção vazia quando não exigiam envelope. Agora o cliente comum
  exige `data` e `total_pages` válidos por padrão; resposta omitida, total
  alterado ou última página vazia após páginas com dados interrompem a coleta.
  Vazio explícito continua válido. O paginador auxiliar de descoberta passa
  a reutilizar esse cliente, sem encerrar por página curta quando a fonte
  declara páginas adicionais. Nenhum contrato HTTP da UI foi alterado.
- Regressões em `test_transferegov_colecoes_integras.py` exercitam os doze
  consumidores de coleções, sem mock de domínio. Em
  `test_recaptura_propostas_local_db.py`, falha em coleção da segunda
  proposta reverte a mudança da primeira, preserva baseline, valor e revisão
  humana, e não publica aviso ou captura de sucesso. Banco e Services reais;
  apenas HTTP externo substituído.
- Validação final: **1.409 testes backend aprovados e 1 xfail estrito RB-001**
  em 125,73 s, com PostgreSQL 18.6 novo, realmente migrado e removido ao final.
  Pisos de linhas/branches preservados: Services 94,5%/87,7%, Repositories
  96,6%/84,0%, Routes 92,8%/68,8%. Ruff, formatação dos quatro arquivos
  tocados, mypy (424 arquivos) e `git diff --check` passaram. Artefato local:
  `/private/tmp/sigeo-colecoes-integras-20261019.json`.
- As amostras reais foram depois publicadas e conferidas no clone (seção
  acima). Permanecem separados: descoberta nacional/propostas realmente
  novas, E2E amplos, CI remoto,
  agendamento e operação no provedor. Esses aceites pontuais não certificam
  sincronização de toda a carteira nem autorizam deploy.

### Bloqueio de aceite das fontes — endereço descontinuado (19/10)

- A investigação real identificou que o endereço antigo do SICONV continuava
  respondendo HTTP 200, mas com arquivos modificados em **17/07/2026**.
  Download realizado hoje não comprova que o conteúdo foi atualizado hoje.
  Assim, as referências históricas abaixo a “ZIP fresco” do 825374 comprovam
  leitura integral e igualdade com aquele snapshot, **não atualidade da fonte**.
- O [Comunicado oficial 23/2026](https://www.gov.br/transferegov/pt-br/comunicados/comunicados-gerais/2026/comunicado-no-23-2026-do-portal-do-transferegov.br)
  anunciou a substituição e o encerramento do endereço antigo em 31/08/2026.
  O catálogo substituto foi localizado pelo [portal oficial de downloads](https://api-publica.transferegov.gestao.gov.br/downloads):
  `/downloads/dadosgov/`, com nomes remotos `.zip`; o plano agora é
  `siconv_plano_aplicacao_detalhado.zip`.
- O pequeno arquivo oficial `data_carga_siconv.zip` informou
  **19/10/2026 06:36:20**. Os metadados dos dez arquivos utilizados pelos
  coletores também indicaram atualização em 19/10. Isso não substitui os
  contratos de identidade, leitura integral/CRC, schema e proveniência.
- Correção local implementada: catálogo permitido centralizado em
  `scripts/fontes_siconv.py`, consumidor auxiliar reutilizando o coletor
  comum e cache separado `cache/transferegov_atual`. O cache histórico é
  preservado, mas não reaproveitado; não há fallback à fonte descontinuada.
- O proxy substituto também serviu `siconv_programa_proposta.zip` de 18/10
  (6.507.443 bytes), mesmo com `Cache-Control: no-cache`; o catálogo apontava
  para 19/10 (6.507.379 bytes). Consulta com identificador opaco novo por
  transferência entregou a versão de 19/10. O coletor aplica essa proteção,
  mantendo a mesma URL durante partes/fallback, sem dados de usuário no
  identificador. Rodadas distintas não reutilizam essa chave de cache HTTP.
- O proxy novo devolveu ETag sem aspas e não confirmou `If-Range`. Portanto,
  não se inventa um validador nem se concatenam partes sem prova: nessa
  condição o transporte descarta a primeira parte e exige novo GET integral,
  com limites de tamanho/prazo e CRC antes da publicação. Perder o validador
  após parte confirmada aborta a rodada e preserva o último cache íntegro.
- A segunda conferência real completou os cinco arquivos com CRC e leitura
  CSV integral/estrita, usando a proteção contra cache, entre 12:59 e 13:00
  UTC de 19/10. Todos os cinco metadados indicaram modificação em 19/10.
  Foram selecionados três convênios/propostas, 63 itens e os vínculos e
  programas correspondentes; o Portal confirmou a identidade dos três.
  Essa prova foi somente leitura, sem engine SQL, com descarte dos ZIPs.
- Resultado: **999548** (61 itens, órgão superior `69000`) não comprovou
  equipamento prioritário e foi inelegível; **971252** (obra, um item, órgão
  `36000`) também foi inelegível; **825374** (um item, `36000`) permaneceu
  elegível, com `SIT_CONVENIO = Prestação de Contas Concluída`. O Portal
  informou `NORMAL` para esse último, campo de semântica distinta que não
  deve substituir a prestação de contas SICONV.
- Hashes SHA-256 da rodada atual, para correlação sem payload integral:
  convênios `a204ccaa8a618e067a2d343d990ce45912a7e7304e54d47e0aa6025991245742`;
  propostas `4d08922994bc9b58d0bc3c7756b9bee2740080cc41d2059541394768ee42c6cd`;
  plano `4f152b859c2753320790d35035d7bb8c6e2b26e7eb0e4a68319e6ff4808072e2`;
  vínculos `67c932d0f8065ee4662c80e62b6801ddc08ce5665cc13b3c96a4fbe5b8be553e`;
  programas `032aa39d1dcb2f8088d0eb7982563d413afefaefd7a80161372a186a08ba86d8`.
- Revalidação persistida do **999548**, somente no clone servido validado
  por loopback, role restrita e OID: o worker criou a captura inelegível
  **4991**, com os cinco hashes acima e prova protegida dos 61 itens.
  A captura anterior **4960** e suas **seis evidências** permanecem íntegras.
  A consulta real pelo Service de listagem retornou total **0** para 999548.
  Não houve decisão humana adicionada/alterada, inclusão/remoção na carteira
  ou mudança no monitoramento pós-repasse; antes/depois foram conferidos.
- Validação final desta rodada: **1.353 testes backend aprovados e 1 xfail
  estrito RB-001**, em 123,02 s, em cluster PostgreSQL 18.6 novo e migrado,
  encerrado/removido ao final. Pisos de linhas/branches: Services 94,5%/87,7%,
  Repositories 96,6%/84,0%, Routes 92,8%/68,8%. Ruff, formatação dos seis
  arquivos de transporte/catálogo/testes tocados, mypy (423 arquivos) e
  `git diff --check` passaram. Artefato local:
  `/private/tmp/sigeo-fonte-atual-final-20261019.json`.
- O aceite pontual não equivale a execução nacional completa. As tabelas
  financeiras e uma proposta da API nova foram posteriormente conferidas em
  leitura (seção acima), sem certificar recorrência ou atualização persistida
  de toda a carteira. Permanecem o aceite integrado
  amplo dessas fontes, os E2E restantes e o aceite remoto/operacional.
  Produção, agendamentos, branch remota e deploy permanecem intocados.

### Prioridade adicional — falso positivo 999548 (18/10)

- A leitura somente da cópia local encontrou seis evidências históricas com
  `relacao=aquisicao`, sem órgão superior nem critério institucional registrado.
  Os textos tratam de consultorias/capital semente e usam “acelerador” no
  contexto de empreendimento. Isso não comprova equipamento médico; não foi
  feita nova consulta oficial nem alteração do histórico nessa investigação
  inicial. A conferência posterior do cabeçalho oficial está registrada abaixo.
- O catálogo canônico deixa de aceitar “acelerador” isolado como Acelerador
  Linear; preserva LINAC e as grafias médicas explícitas já curadas. Formação,
  cursos, capacitação, consultoria e incentivos não comprovam aquisição.
  Aquisição de equipamento com treinamento acessório permanece permitida.
  A mesma regra é reutilizada na descoberta e na validação da recaptura para
  aprovação; componente prioritário não autoriza item exclusivamente formativo.
- Aprendizado aqui é curadoria verificável: cada falso positivo confirmado
  vira caso de regressão negativo e vem acompanhado de casos positivos para
  controlar exclusões indevidas. Não há autoaprendizado, fuzzy-match, blacklist
  silenciosa por número nem alteração automática da carteira.
- Antes do aceite: revalidar a entrada histórica por captura controlada e
  registrar sua inelegibilidade pelo fluxo auditável existente, sem apagar
  evidência. Corrigir o classificador não remove retroativamente a entrada já
  persistida. As seis descrições integrais locais foram reprocessadas somente
  em memória: nenhuma identificou Acelerador Linear ou aquisição prioritária.
- Validação da rodada: **752 testes aprovados e 1 xfail estrito RB-001** em
  61 módulos (98,15 s), incluindo contratos HTTP de aprovação, descoberta,
  recaptura, persistência, permissões e recuperação. Ruff, formatação, mypy
  dos quatro módulos de aplicação tocados e `git diff --check` passaram.
  Não representa suíte completa do sistema nem nova coleta oficial.
- A implementação HTTP e a UI de aprovação estão integradas e validadas em
  navegador real com PostgreSQL sintético restrito. A API local foi reiniciada
  com GET de prova e POST de aprovação. Esse aceite técnico não revalida
  retroativamente os candidatos históricos nem substitui o aceite das fontes.

Comprovado localmente: reconstrução aditiva do schema, comparação estrutural
com o clone preservado, fluxo interno de descoberta/recaptura/revisão/aprovação
e avisos com autorização; adoção atômica com proteção de identidade/auditoria e
neutralização de acesso em bancos sintéticos realmente migrados. O fluxo
Service/HTTP/UI de aprovação foi comprovado localmente; nada foi publicado.

Falta para o aceite local, nesta ordem de dependência:

1. **Adoção protegida persistente — concluída em cópia local restrita:** o adaptador
   e6→b7 passou com o clone real, sem stamp nem alteração da origem. A cópia
   `sigeo_homologacao_clone_20261017` foi promovida após os gates de schema,
   privacidade delimitada, integridade e neutralização. A quarentena inicial
   foi liberada exclusivamente para o novo runtime local, sem CONNECT público.
   Credenciais copiadas seguem neutralizadas; quatro contas sintéticas foram
   adicionadas intencionalmente. Varredura não certifica anonimização.
2. **Runtime e aprovação na aplicação concluídos localmente:** grants mínimos,
   credenciais/JWT locais, caixa local e servidores foram implantados e
   conferidos (evidências abaixo). HTTP + UI passaram pelos contratos de
   recaptura de 24 h, RBAC, CSRF, versão/hash, replay e conflito. Chromium
   confirmou quatro perfis, duas revisões concorrentes, histórico, aviso e
   navegação à carteira, sem iniciar monitoramento pós-repasse.
3. **Aceitação das fontes e automação — parcial:** o 825374 foi conferido no
   ZIP oficial baixado em 18/10, em leitura integral/estrita, e as duas visões
   do clone estão literalmente iguais àquele snapshot. Em 19/10 identificou-se
   que o endpoint antigo servia arquivos de julho; repetir o aceite na fonte
   substituta é obrigatório (bloqueio acima). A ligação coletor→prova foi
   implementada como worker pontual exclusivamente local, com fontes HTTP
   sintéticas e PostgreSQL real nos testes; isso não certifica execução
   integral das fontes federais. As dez fontes SICONV e uma proposta da API
   nova passaram pelo aceite pontual de leitura em 19/10 (seções acima).
   A proposta 43829 e três convênios conhecidos tiveram publicação real e
   replay conferidos no clone, inclusive por HTTP para os convênios (acima).
   Faltam a descoberta integrada nacional de convênio/proposta novos e as
   provas amplas de baseline/mudança por campo com fontes reais;
   preservando último dado íntegro em erro/omissão. O runner sintético foi
   comprovado em servidor PostgreSQL inteiramente novo, sem role operacional
   preexistente; gates e Chromium passaram (evidência de 19/10 abaixo).
   A execução Linux/PostgreSQL 16 no GitHub e o aceite do agendamento real
   ainda não foram realizados. Workflow recuperado é só ensaio
   sintético manual; não há recorrência habilitada ou aceite de operação real.
   A revalidação de falsos positivos históricos tem worker pontual e está
   integrada ao código do ciclo nacional, reutilizando os cinco snapshots da
   rodada e publicando descobertas/revalidações/avisos atomicamente. O aceite
   oficial integrado amplo e a habilitação do agendamento real continuam
   pendentes. O caso 999548 foi revalidado pontualmente no clone servido em
   19/10, com prova oficial atual e histórico preservado (evidência acima);
   o ciclo nacional completo ainda não foi executado no clone ou em produção.
4. **Gates e E2E — avanço comprovado, aceite amplo ainda pendente:** suíte
   completa backend em PostgreSQL vazio realmente migrado e suíte frontend
   passaram; pisos por camada do backend e os dois pisos medidos pelo script
   frontend passaram, sem reduzir percentuais. Build/lint/tipos passaram.
   O E2E real de convite/senha/primeiro login/renovação foi acrescentado em
   19/10 (seção acima); ainda não certifica SMTP/proxy de produção,
   convite expirado, redefinição nem todos os filtros/layouts dos relatórios. O frontend ainda
   mede arquivos importados pela suíte, sem inclusão explícita de todo o
   código elegível; ampliar esse inventário antes de certificar cobertura
   integral. A medição diagnóstica ampliada acima comprovou a queda abaixo
   do piso, sem reduzir thresholds. Não converter sucesso dos recortes em
   aceite de todo o sistema.
5. **Rollback — estratégia local exercitada, aceite de produção separado:**
   restore em outro banco, manifesto, runtime/grants e corte ASGI com login
   passaram no ensaio sintético; sessões/links são invalidados e a chave JWT
   é trocada antes de novas sessões. A origem e o backup são preservados.
   O defeito de downgrade RB-001 foi corrigido sob exceção expressa do usuário
   em 19/10 (seção acima), sem mascarar falhas com xfail.
   Runbook em `runbook-restore-homologacao-2026-10-18.md`. Definir e aprovar
   RPO/RTO, retenção e corte no provedor antes de qualquer operação real;
   o ensaio local não certifica deploy/proxy/orquestrador. Revisar evidências
   e pendências finais com o usuário.

Depois do aceite local, **publicação continua separada e depende de autorização
explícita**: revisão/commit/CI da branch acordada, migrations/backup/deploy e
agendamento no ambiente correto, com acompanhamento das primeiras cargas e
New Relic. Não confundir esses passos com tarefas já autorizadas em produção.

### Ciclo integrado de descoberta e revalidação — 19/10

- `job_descoberta_siconv` seleciona a fila histórica oficial aberta, fora da
  carteira/monitoramento e ainda elegível, com teto de 1.000 e recusa explícita
  de excedente. Não percorre indefinidamente os mesmos primeiros registros.
  A leitura SQL termina antes de downloads e consultas ao Portal.
- Os cinco ZIPs são baixados uma única vez por rodada em diretório privado
  exclusivo, validado e removido ao final, inclusive em erro. Não se utiliza
  o cache compartilhado nem se rebaixa fonte nacional por candidato. A
  revalidação faz uma segunda passagem de seleção nos arquivos já íntegros,
  mantendo só os alvos necessários, com limites de 10.000 linhas por chave e
  100.000 selecionadas por arquivo. Não há pagamentos no Radar.
- `revalidar_snapshot_legado` prepara a prova dos candidatos que não passaram
  na classificação atual, sempre pelos mesmos cinco hashes e horário da
  descoberta. Ausência de convênio/proposta/itens não vira prova negativa:
  candidato preservado como inconclusivo, rodada parcial e comando sinaliza
  falha após registrar o resultado. As descobertas comprovadas podem ser
  publicadas nesse ciclo parcial; não se fabrica dado para preencher omissão.
- `ciclo_descoberta_legado.publicar_ciclo` valida origem, proveniência comum
  e ausência de sobreposição entre positivos/negativos. Compõe os Services
  existentes em uma transação: descobertas, prova/captura negativa e avisos
  são confirmados juntos. Os flags internos de composição não são campos
  HTTP nem opções da coleta. Qualquer erro na publicação reverte tudo,
  inclusive uma primeira revalidação já inserida antes da falha seguinte.
- Decisão concorrente preserva a decisão humana e aborta a publicação; o
  comando falha, mas a coleta íntegra não gera falso alerta de fonte fora do
  ar. A rodada registra `publicacao=conflito_revisao`, com zero alterações
  confirmadas. Erro HTTP/CSV anterior à publicação não altera nenhum candidato.
- Repetição da rodada não duplica ocultação, novidade ou aviso. Uma captura
  inelegível já registrada sai dos alvos de revalidação; uma aquisição nova
  comprovada continua podendo retornar pela descoberta, sem blacklist.
- Não há novo endpoint, migration, dependência, workflow, cron, deploy,
  commit ou push. A integração é código local ensaiado com fontes sintéticas;
  não é aceite das fontes federais, do agendamento ou do runner remoto.
- **Validação:** suíte completa em cluster PostgreSQL 18.6 vazio e migrado,
  **1.314 aprovados e 1 xfail estrito RB-001 em 120,71 s** (13 casos novos).
  Os casos novos provam cinco downloads sem SQL aberto na rede, descoberta e
  ocultação na mesma rodada, replay, omissões preservadas como parcial,
  indisponibilidade do Portal, limite real da fila, conflito humano e rollback
  integral após falha na segunda revalidação. Contratos rejeitam mistura de
  snapshots, origem local e positivos/negativos sobrepostos. Ruff, formatação
  dos 350 arquivos, mypy dos 419 arquivos e `git diff --check` passaram.
  Cobertura por camada foi aferida pelo gate constitucional, sem reduzir pisos.

### Revalidação pontual do escopo histórico — 19/10

- Implementada a ponte interna, sem endpoint de upload, migration, cron ou
  mudança na classificação: `EscopoLegadoColetado`, `coletar_escopo_legado`,
  `revalidacao_legado` e `job_revalidacao_legado_local`. O launcher reutiliza
  as guardas estritas de destino local/clone, runtime e configuração explícita;
  não importa Settings antes das guardas. É uma operação por candidato.
- O coletor lê integralmente cinco ZIPs frescos em cache temporário exclusivo,
  seleciona identidades exatas e exige presença única de convênio/proposta,
  pelo menos um item e catálogo completo dos vínculos. O vazio de itens é
  inconclusivo, não prova negativa. Sem Portal nem pagamentos nesse fluxo:
  confirmação de publicação não torna um curso/obra equipamento prioritário.
- O Service reaplica `descobrir_prioritarios_ms` e o frescor de 24 horas.
  Só publica inelegibilidade quando a fonte completa não comprova o recorte.
  Candidato ainda elegível é preservado para atualização pela descoberta;
  não se promove nem se oculta silenciosamente. Não há blacklist por número.
- A transação usa o mesmo advisory lock da descoberta e lock do candidato.
  Revalida identidade, captura e decisão atual; não altera análise encerrada
  nem instrumento já incorporado. Grava rodada, prova protegida e nova captura
  inelegível de forma atômica, preservando a captura/evidências anteriores.
  Repetir o mesmo pacote não duplica captura; captura concorrente exige revisão.
- A fonte operacional é `siconv_revalidacao`, distinta da descoberta nacional:
  consultar um único candidato não atualiza artificialmente o frescor do Radar
  inteiro. Falha de coleta preserva a fila e registra erro/alerta gerencial com
  a deduplicação existente. Conflito de revisão não é indisponibilidade.
- Nova captura inelegível não aceita início de análise/rejeição pelo Service
  de decisões; não é uma rejeição humana automática. Uma nova descoberta
  realmente elegível pode voltar à fila, sem apagar a prova negativa anterior.
- O CSV mantém o formato obrigatório dia/mês/ano. Somente o DTO interno da
  revalidação aceita as datas ISO geradas pela sua própria serialização JSON;
  a validação estrita da fonte ocorre antes dessa conversão.
- **Validação final:** suíte completa em cluster PostgreSQL 18.6 vazio e
  migrado, **1.301 aprovados e 1 xfail estrito RB-001 em 119,76 s**; são
  32 novos casos nesta etapa. Inclui prova negativa/positiva, fonte incompleta,
  alerta deduplicado, limpeza, ausência de transação durante rede, retomada de
  elegibilidade, runtime restrito, replay concorrente, captura obsoleta e
  aprovação real em outra conexão preservada. O novo Service atingiu todas
  as suas linhas e branches. Ruff, formatação dos 347 arquivos, mypy dos
  416 arquivos e `git diff --check` passaram. Não houve teste em CI remoto,
  aceite de fonte federal nova nem nova validação visual nesta etapa.
- **Limite de aceite:** fluxo implementado para ensaio local; não aplicado
  ao 999548 real enquanto não houver coleta integral oficial bem-sucedida.
  A integração ao código do ciclo nacional foi acrescentada na etapa acima;
  agendamento e aceite das fontes continuam pendentes. Nenhuma carteira,
  decisão ou notificação da produção foi tocada.

### Continuidade do aceite oficial e resiliência de streaming — 19/10

- A auditoria pontual iniciou downloads frescos e leitura integral/estrita
  para 825374, 999548 e 971252 em diretório temporário exclusivo, sem SQL.
  O primeiro ZIP de convênios foi íntegro; a transferência de propostas foi
  interrompida com `ChunkedEncodingError`. A tentativa não foi aceita como
  coleta completa nem alterou candidatos, carteira, decisões ou notificações.
- O retry do `HTTPAdapter` não cobre o corpo consumido por `iter_content`.
  `_baixar_zip` passa a reiniciar do zero em até três tentativas para queda
  de conexão, timeout ou corpo chunked interrompido. Não concatena bytes de
  tentativas diferentes. Erros de status HTTP permanecem sob o adaptador.
  ZIP inválido não recebe retry de transporte nem vira dado confiável.
- Toda transferência nova, inclusive a primeira sem cache, usa pasta
  temporária exclusiva e só publica o arquivo após validação CRC. Erro
  mantém o último cache e remove os temporários da tentativa. Não houve
  redução de validação, aceitação de parcial ou alteração de regras do Radar.
- **41 testes direcionados aprovados**, incluindo sete novos casos de
  regressão de transporte/cache. O número não substitui a suíte completa.
- Suíte completa após a correção: **1.269 aprovados e 1 xfail estrito
  RB-001 em 114,51 s**, em cluster PostgreSQL 18.6 novo e migrado, removido
  após o teste. Pisos linha/branch: services **94,2%/87,0%**, repositories
  **96,6%/84,0%**, routes **92,8%/68,8%**. Ruff, formatação dos 342 arquivos,
  mypy dos 411 arquivos e `git diff --check` passaram. O ajuste final de
  tipagem do mock de rede foi conferido pelo mypy; não altera comportamento.
- Na repetição real, o ZIP de convênios novamente passou, com SHA-256
  `7b4d1b9ab5c822184bffae77f993b6e3c8a705f22a2f3d86f7aa4faa5c3e4a34`.
  O download de propostas voltou a falhar durante o corpo, esgotando as
  tentativas com `ChunkedEncodingError`. O processo encerrou com erro e
  limpou a pasta temporária. Retry limitado não garante disponibilidade
  federal: **aceite integrado permanece inconclusivo**, sem avançar para
  itens, programas, tabelas financeiras ou alteração da fila histórica.
- **Lacuna adicional confirmada por inspeção:** `job_descoberta_siconv.run`
  grava candidatos elegíveis, mas não gera automaticamente uma nova captura
  inelegível para uma entrada histórica que deixou de passar no classificador.
  O schema e os filtros já suportam `elegivel=false` com rodada obrigatória;
  isso não significa que exista um Service/job de revalidação implementado.
  A ponte pontual append-only e seus gates foram implementados na continuidade
  descrita acima; integração recorrente e aceite oficial continuam pendentes
  antes de considerar saneado o 999548.
  O registro histórico não foi apagado, rejeitado em nome de usuário nem
  alterado por SQL avulso. Ausência em fonte parcial nunca autoriza ocultação.

### Portal oficial — consulta pontual autenticada em 19/10

- Após autorização do usuário, foi lida exclusivamente a variável
  `PORTAL_TRANSPARENCIA_API_KEY` do `.env` privado indicado. O processo não
  carregou credenciais de banco/e-mail desse arquivo: ambiente isolado,
  URL de banco inoperante em loopback e nenhuma sessão SQL criada. A chave,
  o payload integral e os dados de pessoas não foram impressos ou persistidos.
- Às **12:03 UTC**, os convênios **825374** e **999548** foram encontrados no
  endpoint oficial por número. As duas respostas passaram pelo contrato
  `PortalLegadoCapturado`, incluindo identidade exata e publicação. Datas
  de publicação retornadas: respectivamente **06/01/2016** e **24/06/2026**.
- O campo `situacao` do Portal retornou, respectivamente, **NORMAL** e
  **EM EXECUÇÃO**. Não confundir a situação do Portal com a prestação de
  contas do SICONV: a conferência anterior do 825374 no ZIP oficial trouxe
  **Prestação de Contas Concluída**. Esta consulta não autoriza sobrescrever
  essa prestação de contas com `NORMAL` nem traduzir os rótulos da fonte.
- Nenhum dos dois objetos retornados identificou equipamento prioritário
  pelo classificador canônico. Isso é somente um diagnóstico do objeto:
  elegibilidade do Radar exige itens/programas oficiais e escopo MS, não
  é decidida pela existência no Portal ou pelo texto do objeto isoladamente.
  A descoberta não deve usar esta ausência como veto à aquisição legítima
  comprovada nos itens.
- A chave está funcional para estas consultas. Permanece pendente a coleta
  integrada das demais fontes/coleções e o registro auditável de
  inelegibilidade da entrada histórica 999548; nenhuma captura, decisão,
  aprovação, carteira ou notificação foi alterada nesta conferência.

### Runner autossuficiente e aceite em cluster limpo — 19/10

- Encontrados dois bloqueios de portabilidade: os bancos `sigeo_test` e
  `sigeo_test_espelho_homologacao` dos workflows não passavam nas guardas
  estritas; o fixture do Radar dependia da role operacional já existente
  `sigeo_homologacao_runtime_20261006`. Não enfraquecidas as guardas.
- `backend_ci.yml` e `espelho_homologacao.yml` usam agora o mesmo nome
  sentinela aceito, em service container efêmero, com URLs coerentes e
  chamadas externas desabilitadas. Os utilitários de snapshot são conferidos
  explicitamente. Artefatos de cobertura backend usam o caminho real
  `backend/coverage.*`. Triggers/permissões de publicação não foram ampliados.
- `tests/runtime_radar_fixture.py` cria uma role por UUID de schema, NOLOGIN,
  NOINHERIT e sem privilégios administrativos/memberships. Grants só no schema
  sintético; RESET ROLE confirmado antes de devolver conexão ao pool; limpeza
  remove somente a role criada. Colisão com role preexistente é recusada sem
  alterar/remover a role. O fixture e o E2E usam a identidade derivada.
- Ensaios em **servidor PostgreSQL 18.6 inteiramente novo**, em porta loopback
  própria e autenticação SCRAM, sem roles/bancos preexistentes do SIGEO:
  **52 testes direcionados aprovados em 7,52 s** e **1.261 testes completos
  aprovados / 1 xfail RB-001 em 115,26 s**. A regressão posterior do caminho
  de artefatos passou separadamente na matriz de quatro contratos YAML
  (0,02 s); três são repetição, não somar quatro ao total da suíte.
- **Chromium real aprovado em 15,93 s** em outro servidor novo: quatro
  perfis, prova, aprovação, conflito, aviso e navegação à carteira. Nenhuma
  role operacional foi necessária. Cada cluster foi encerrado e removido
  ao final; nenhum clone ou servidor da equipe foi usado por esses ensaios.
- Pisos mantidos: services **94,2% linhas / 87,0% branches**, repositories
  **96,6% / 84,0%**, routes **92,8% / 68,8%**. Ruff passou; **342 arquivos**
  de app/tests/scripts formatados; `mypy .` passou em **411 arquivos**.
  Sintaxe dos dois YAMLs e `git diff --check` passaram.
- Limite: Docker/OrbStack estava inativo; isso comprova independência de
  configuração, não equivalência Linux/PG16 nem actionlint remoto. Nenhum
  workflow GitHub foi executado, nenhum schedule habilitado e nenhuma
  credencial, role ou dado de produção foi alterado. Fontes reais e demais
  lacunas de E2E/cobertura continuam no checklist; não certificar o plano todo.

### Fechamento técnico da aprovação e gates — 18/10

- Formulário de aprovação usa schema Zod, hook de mutação e service; o resumo
  da prova foi separado para manter o componente abaixo de 200 linhas.
  Entrada inválida no service agora rejeita a Promise, em vez de lançar erro
  síncrono antes do tratamento da UI. Não foram criadas regras novas.
- **31 testes novos de frontend da aprovação** e **41 contratos HTTP**:
  autorização admin/gestor, prova/revisão, confirmação explícita, erro de
  consulta, falha temporária sem retry automático, conflito e caches.
- **E2E opt-in real** em `tests/executar_aprovacao_navegador.py` e
  `frontend/e2e/radar-aprovacao-local.spec.ts`: quatro logins reais,
  Chromium → HTTP → Service → PostgreSQL com `SET ROLE` restrito em schema
  sintético descartável. Não intercepta API nem autenticação; só bloqueia
  assets externos. Segunda sessão recebe 409, CSRF ausente recebe 403;
  persiste uma decisão/um aviso, com destinatários admin e gestor, e não
  cria instrumento monitorado. Sem overflow nas larguras 320/375/400/768/
  1024/1440 px. Capturas privadas em `/private/tmp/sigeo-radar-*-real-*.png`.
- Suíte ampliada: **306 testes frontend em 67 arquivos**; build, lint e tipos
  passaram. Inclui central/sino reais com HTTP simulado somente na fronteira:
  leitura, destino, arquivo/restauração, lote, erros e última linha da página;
  filtros combinados de monitoramento e equivalência das coleções financeiras
  SICONV nas apresentações celular/desktop (inclui zero e estorno).
- O medidor frontend anterior colidia números de linha entre arquivos e
  ignorava branches. Corrigido e protegido por quatro regressões. Nos
  arquivos instrumentados: hooks **95,4% linhas / 90,1% branches** e domínio
  **82,9% / 72,2%**, piso de 70% para ambos. Não é certificação de arquivos
  nunca importados, nem foi alterado o inventário para esconder módulos.
- Primeira rodada completa no clone histórico revelou 28 falhas. Configurar
  cookies não Secure apenas no teste HTTP local, atualizar a fixture SICONV
  para distinguir cabeçalho de filhas e manter loggers existentes no Alembic
  resolveu 27. A revisão histórica e6→b7 não foi mascarada com stamp: a suíte
  foi repetida em banco vazio, migrado de verdade até o head e removido ao
  terminar, preservando os dois clones existentes.
- Rodada final completa nesse banco, após os ajustes de tipos: **1.181
  aprovados / 1 xfail estrito RB-001**, em 146,20 s. E2E opt-in repetido
  separadamente em banco recém-migrado: **1 Chromium aprovado** (14,4 s),
  com as quatro verificações de observabilidade/CORS também aprovadas.
  A origem do Vite do ensaio foi somada à origem local dos testes anteriores,
  sem modificar CORS de produção. Não somar reexecuções às contagens da suíte.
  Pisos backend passaram: services **94,2% linhas / 86,8% branches** (80%),
  repositories **96,6% / 84,0%** (70%), routes **92,8% / 68,8%** (60%).
  O xfail continua bloqueio conhecido; não equivale a rollback aprovado.
- Verificação global: Ruff passou, 328 arquivos de app/tests/scripts
  formatados e mypy passou em **397 arquivos**. Corrigidos tipos das fixtures
  recuperadas com asserts verificáveis, sem `type: ignore`/`Any` novo. Quatro
  arquivos históricos de migration foram incluídos na lista fechada já
  existente de exceções somente de ordem de imports, preservando os arquivos;
  migrations novas continuam integralmente verificadas.
- Localhost reiniciado: frontend `http://127.0.0.1:5181/login`, API 8001 e
  caixa sintética 8002. Health confirmou banco conectado; OpenAPI confirmou
  GET `/candidatos-legados/{id}/prova` e POST `/{id}/aprovacoes`. Runtime novo
  restrito e configuração privada; sem migrations no boot ou e-mail externo.
- Nenhum commit, push, deploy, agendamento ou escrita em produção nesta
  rodada. As publicações de monitor/health de outro contexto são separadas.

### Integridade do coletor e aceite literal do 825374 — 18/10

- O coletor usado no espelhamento descartava linhas truncadas e reagrupava
  colunas excedentes de qualquer tabela como se fossem texto livre. Agora
  exige um CSV único no ZIP, cabeçalho sem nomes vazios/duplicados, sintaxe
  CSV estrita e quantidade exata de campos. Uma falha invalida a tabela;
  nunca publica apenas as linhas válidas anteriores à corrupção.
- Preservada a única reparação histórica documentada: ponto e vírgula não
  citado no último campo `JUSTIFICATIVA_TA`, exclusivamente no arquivo de
  termos aditivos. Não se estende a outra tabela nem a coluna intermediária.
  Os recursos ZIP/CSV fecham também em exceção. Universo vazio não baixa os
  arquivos nacionais de convênios, itens ou programas.
- O job rejeita cabeçalho com convênio duplicado ou fora do universo
  solicitado antes da reconciliação. Erro principal reverte a transação e
  registra tentativa com erro; erro em coleção filha preserva a coleção
  inteira e marca captura parcial, mantendo atualizações principais válidas.
- O espelho usava somente `ID_SOLICITACAO` para termos aditivos, enquanto a
  recaptura já distinguia `ID_SOLICITACAO + NUMERO_TA`. A função canônica de
  chave agora é compartilhada. Dois termos da mesma solicitação permanecem
  separados; número oficial sem ID de solicitação também é aceito. IDs da
  fonte não são reescritos; evidência antiga sem chave é preservada, nunca
  associada por aproximação. Registro novo sem identidade é recusado.
- Regressões com ZIP sintético apenas na fronteira de download e PostgreSQL
  real: literal com acentos/quebra de linha, seleção exata, CSV/ZIP ambíguos,
  truncamento inclusive fora da amostra, exceção da justificativa, corrupção
  depois de uma linha válida, colisão de termos, replay e rollback das duas
  visões. Matriz dirigida: **72 aprovados**; Ruff/formatação e mypy global
  passaram (398 arquivos). Não há mudança de cálculo assistencial ou schema.
- Suíte completa após as correções, em banco vazio realmente migrado e
  removido ao final: **1.202 aprovados / 1 xfail estrito RB-001**, em 151,56 s.
  Os 21 novos casos não são adicionais à contagem da suíte. Pisos backend
  mantidos: services 94,2% linhas / 86,8% branches; repositories 96,6% / 84,0%;
  routes 92,8% / 68,8%. Nenhum piso reduzido nem falha nova ignorada.
- Aceite federal somente de leitura: download fresco de
  `https://repositorio.dados.gov.br/seges/detru/siconv_convenio.csv.zip`,
  iniciado em **2026-10-18T22:10:09.510169Z**, 16.517.558 bytes, SHA-256
  `7b4d1b9ab5c822184bffae77f993b6e3c8a705f22a2f3d86f7aa4faa5c3e4a34`.
  CSV inteiro percorrido pelo parser estrito, mantendo só dois números na
  amostra. Download temporário separado do cache do app e removido ao final.
- **825374 / proposta 1035334:** fonte, `Convenio.situacao` e
  `InstrumentoEquipamento.situacao_prestacao_contas` no clone são exatamente
  **`Prestação de Contas Concluída`**. Consulta ao clone com runtime restrito,
  OID validado e transação `READ ONLY`; nenhuma reconciliação foi executada.
- **999548 / proposta 2182428:** consta no SICONV como `Em execução`; não
  consta na carteira nem no monitoramento do clone. Existir no cabeçalho não
  comprova equipamento prioritário, vínculo MS nem confirmação no Portal.
  Não foi feita nova consulta dos itens/Portal nem alterado o Radar histórico.
- Na conclusão desta rodada, a ligação operacional do coletor à prova de recaptura continuava pendente;
  não substituir por payload do navegador ou contornar a prova de 24 h.
  Pagamentos continuam fora da descoberta do Radar. Nenhum schedule, commit,
  push, migração, deploy ou escrita em produção nesta etapa.

### Ligação do coletor à prova de recaptura — 18/10

- Criados os contratos internos `AlvoRecapturaLegado` e
  `PacoteRecapturaLegado`, o coletor `scripts/coletar_recaptura_legado.py`
  e o worker `scripts/job_recaptura_legado_local.py`. A entrada é um único
  ID de candidato existente, nunca payload oficial enviado pelo navegador.
- O preflight do Service exige descoberta oficial elegível, critério
  `prioritarios_ms_celebrados_v2`, órgão MS, confirmação no Portal e análise
  ainda aberta. Encerra a transação de leitura antes da rede. Na publicação,
  o Service existente confere novamente referência/estado sob lock e grava
  rodada + prova atomicamente, mantendo frescor de 24 h e replay.
- Coleta dez ZIPs oficiais e a consulta pontual do Portal. Identidade,
  celebração e equipamento/componente são revalidados pela regra canônica
  antes das filhas financeiras. Portal ausente, incompleto, de outro número
  ou ambíguo bloqueia a prova; o cliente não escolhe arbitrariamente o
  primeiro registro de uma resposta múltipla.
- Pagamentos são prova financeira da recaptura, **não descoberta nacional
  do Radar**. Nenhuma aprovação, entrada na carteira ou início de monitoramento
  ocorre automaticamente. Não foram criadas rota pública nem migration.
- Seleção exata por número/proposta/programa; cabeçalhos e CSV completos
  precisam ser íntegros. Coleção vazia consultada é diferente de fonte omitida.
  Limite de 10.000 linhas por coleção aborta, nunca trunca. Estornos e chaves
  compostas dos termos são preservados. Cada ZIP tem SHA-256 registrado.
- Cache privado temporário, removido em sucesso/falha, sem tocar no cache
  compartilhado. Sessões HTTP são fechadas. Payload passa pela proteção local
  existente e é revalidado antes de persistir; isso não certifica anonimização.
- Falha da coleta preserva prova anterior e registra rodada em sessão própria;
  alerta restrito a admin/gestor mantém deduplicação de 24 h. Conflito de
  decisão na publicação não é registrado como indisponibilidade da fonte.
- Launcher exige URLs explícitas loopback e rejeita opções PG/redirecionamento.
  Para a cópia servida, verifica role restrita, revisão e OID; também impede
  engine pré-carregada com outro banco/usuário. JWT e chave do Portal precisam
  ser explícitos e New Relic desabilitado, sem herdar esses valores de `.env`.
- Conferência somente de leitura confirmou runtime/OID da cópia local. O
  ambiente servido mantém a chave do Portal vazia por proteção; uma chave
  explícita e separada para o worker ainda é necessária para o aceite federal
  completo. Não reutilizar credencial de produção implicitamente.
- Entrada manual, em processo com ambiente local previamente validado:
  `python -m scripts.job_recaptura_legado_local --candidato-id N`.
  Não há cron, schedule ou chamada disparada pela requisição da UI.
- Validação consolidada: **1.249 testes backend aprovados / 1 xfail estrito
  RB-001**, em 141,35 s, em PostgreSQL temporário vazio realmente migrado até
  `b7f35c806e4a` e removido ao final. São 47 casos adicionais à suíte anterior
  de 1.202, não outra suíte a ser somada. Inclui ZIP/CSV/HTTP sintéticos com
  Services e SQL reais, transação encerrada durante a rede, preservação da
  prova anterior, duas falhas com um alerta e destinatários admin/gestor,
  decisão concorrente, histórico, guardas e CLI sem vazamento de segredo.
- Pisos por camada passaram: services **94,2% linhas / 87,0% branches**;
  repositories **96,6% / 84,0%**; routes **92,8% / 68,8%**. Ruff, formatação e
  mypy passaram nos **336 arquivos de app/scripts/tests**, e `git diff --check`
  passou. As duas fixtures HTTP antigas foram adequadas ao fechamento da
  sessão; não houve redução de gate nem novo teste ignorado.
- Próximo aceite: exercitar as fontes federais completas com chave explícita
  do worker e critérios vigentes, antes de certificar dados reais e runner
  automático. E2E amplo, cobertura frontend integral e rollback operacional
  continuam no checklist. Nenhum commit, push ou alteração em produção.

### Restore com runtime e corte da aplicação — 18/10

- A estratégia alternativa ao downgrade RB-001 ganhou ensaio integrado:
  `pg_dump`/`pg_restore` reais em bancos sintéticos distintos, restauração
  exata por manifesto e schema, invalidação auditada dos acessos, reaplicação
  de grants e consultas da aplicação com runtime TCP restrito.
- `scripts/corte_restore_sintetico.py` aceita exclusivamente banco sintético
  UUID privado, revisão b7 e nenhum outro cliente. Recusa trabalho pendente
  do chamador e manifesto divergente. Invalida somente refresh sessions e
  links de ativação/recuperação; preserva senha, papéis, status e IDs.
  Uma falha real de trigger na auditoria reverte as duas atualizações.
- Confirmada a borda de segurança: um refresh ID criado depois do snapshot
  pode ser reutilizado no banco restaurado. O ensaio confere essa colisão e
  exige nova chave JWT antes de novas sessões: cookies anteriores e posteriores
  ao snapshot são rejeitados, enquanto novo login e consulta funcionam.
  Esse procedimento não foi executado em nenhuma conta real.
- A role de origem não consegue conectar ao destino. A nova role passa a
  conferência efetiva de runtime e não consegue DDL, alterar a revisão nem
  apagar auditoria. O pool antigo é drenado e o teste rejeita tentativa de
  voltar a consultá-lo após a troca da conexão.
- Health, login, `GET /auth/me`, renovação rejeitada das sessões antigas e
  consulta do 999001 são requisições ASGI à aplicação real. O registro 999002,
  criado só após o backup, não aparece no destino e continua na origem;
  hashes confirmam que origem e arquivo de backup não foram alterados.
  Trata-se de corte local na fronteira de conexão, não deploy/socket/proxy.
- Matriz direcionada: **13 aprovados em 10,97 s**, incluindo seis novos casos
  operacionais, três de runtime e quatro revisões de snapshot. Os recursos
  temporários foram removidos sem encerrar sessões alheias. Runbook versionado
  em `runbook-restore-homologacao-2026-10-18.md` explicita ordem, janela de
  recuperação, JWT, permissões e limites de certificação.
- Regressão completa em PostgreSQL temporário vazio migrado de verdade:
  **1.255 aprovados / 1 xfail estrito RB-001 em 155,18 s**. São seis casos
  adicionais à suíte de 1.249, não somar reexecuções. Cobertura mantida acima
  dos pisos: services **94,2% linhas / 87,0% branches**, repositories
  **96,6% / 84,0%**, routes **92,8% / 68,8%**. Ruff, formatação e mypy passaram
  em **339 arquivos de app/scripts/tests**; `git diff --check` passou.
- RB-001 continua xfail estrito: não houve edição de migration compartilhada,
  exclusão de enum ou downgrade de clone. RPO/RTO, retenção e aceite do corte
  real dependem de decisão e autorização de publicação; não estão inferidos
  dos tempos desta suíte. Nenhum commit, push, deploy ou escrita em produção.

### Cópia persistente em quarentena — histórico de preparação em 17/10

- `scripts/preparar_clone_persistente.py`: operação manual, sem CLI ou leitura
  de `.env`, controlador limitado ao banco local de testes; cria destino vazio
  privado, aplica migrations reais, adota o clone preservado em snapshot
  read-only e confere novamente os hashes antes da promoção.
- `scripts/promover_clone_recuperacao.py`: nova conferência read-only, mesma
  identidade PostgreSQL (OID), sem sobrescrever destino existente, sem terminar
  sessões ou usar FORCE. Rename e bloqueio de conexões são transacionais.
  A função pública promove somente para o nome persistente acima; o kernel
  admite também nomes descartáveis gerados para testes reais de rollback.
- Duas tentativas da preparação foram recusadas pelo gate de ausência de
  conexões na promoção, após a adoção. As cópias continuaram privadas; nenhuma
  trava foi removida. A retomada manual da segunda cópia reconferiu o manifesto
  e as credenciais neutralizadas, promoveu-a e comprovou a quarentena.
  O encerramento do PID da própria conferência tem espera limitada de 2 s;
  qualquer outra sessão continua bloqueando a operação. Não se considera
  comprovada uma execução automática ininterrupta do preparador completo.
- A primeira cópia redundante desta rodada foi removida por nome e OID exatos,
  após comprovar propriedade, ACL privada, ausência de sessões e existência da
  cópia persistente. Pode ser recriada a partir da origem preservada. Nenhum
  banco preexistente foi removido ou alterado.
- Ao final desta preparação ainda faltavam runtime novo, contas locais,
  configuração/JWT, caixa e servidores; foram tratados na etapa seguinte.
  Nenhuma credencial antiga foi reativada.
- Validação: matriz de 57 módulos com **672 testes aprovados e 1 xfail estrito
  RB-001** (90,80 s); após endurecer também endereço/porta efetivos do
  controlador, o bloco atualizado de promoção foi reexecutado: **19 aprovados**
  (inclui casos já presentes na matriz; não somar as contagens). A retomada
  manual da cópia real teve 1 aprovação separada. Ruff/formatação dos quatro
  arquivos novos, mypy dos dois scripts e `git diff --check` passaram. A
  variação `127.0.0.1/32` retornada pelo cast PostgreSQL é normalizada pela
  função SQL `host()`, sem aceitar endereços remotos ou porta divergente.

### Runtime restrito e localhost — 17/10 (estado atual)

- `runtime_clone_recuperacao.py` cria somente a role nova
  `sigeo_homologacao_runtime_20261017` no par de banco/role autorizado.
  Senha local aleatória convertida em SCRAM pela libpq antes do DDL; recusa
  role existente. Sem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS,
  INHERIT ou memberships. Sem propriedade, CREATE/TEMP no banco ou CREATE no
  schema. DML da aplicação, revisão Alembic somente leitura e auditoria apenas
  leitura/inserção. O runtime não tem CONNECT nos clones preservados.
- `configuracao_local_recuperacao.py` e `provisionar_local_recuperacao.py`:
  quatro contas novas (`admin`, `gestor`, `colaborador`, `leitor`, e-mails
  `*.homologacao@example.com`) com senhas independentes/Argon2id. Role, grants,
  contas e evento de auditoria transacionais. Identidades e sessões copiadas
  não foram reativadas. O fluxo positivo passou também na cópia persistente.
- Configuração nova em `.codex-work/runtime-recuperado-20261017/.env.local`,
  relativa ao workspace principal (fora do checkout em execução): diretório
  0700, arquivo exclusivo 0600, confirmado como ignorado pelo Git. Sem
  sobrescrever configuração anterior. Falha pós-abertura recoloca a cópia em
  quarentena; ensaio completo de falhas/restore continua no gate operacional.
- `servir_local_recuperacao.py` valida revisão, OID, servidor efetivo e
  permissões antes de iniciar. Usa o interpretador atual, sem depender de uma
  `.venv` inexistente no checkout. Subprocesso da API recebe só a allowlist de
  Settings/sistema, sem credencial de migração, URL de teste ou senhas E2E;
  caixa recebe apenas sua chave e ambiente mínimo. Não herda PG*/segredos
  extras. Portal/New Relic externos e jobs não foram habilitados.
- Serviços confirmados em loopback: UI `http://127.0.0.1:5181`, API `:8001`
  e caixa `:8002`. Usar **127.0.0.1** de ponta a ponta; não misturar hostname
  `localhost` com o endereço de API configurado e cookies SameSite=Lax.
  Religar API/caixa, no backend, com
  `python -m scripts.servir_local_recuperacao --env <arquivo privado> app|email`.
- Aceite de navegador sem mock: `authenticated.spec.ts`, caso de login,
  renovação/rotação e reload (1 aprovado), e `homologacao-local.spec.ts`,
  Dados Oficiais/Instrumentos/Painel (1 aprovado). Chromium real; trace desligado,
  credencial passada em memória, sem argumento de linha de comando.
- `python -m scripts.verificar_http_recuperacao --env <arquivo privado>`:
  4 casos aprovados contra os servidores reais. Saúde/banco, CORS, ausência de
  sessão, três perfis restantes, cookies HttpOnly com 60 min, CSRF sem header
  recusado, refresh rotativo, logout, acesso à gestão de usuários recusado
  para não-admin, consultas de notificações/Radar e caixa protegida. A caixa
  recebeu só mensagem sintética sem token e rejeitou destinatário externo;
  **isso ainda não prova convite/ativação/primeiro login por link**.
- Regressão: **698 aprovados e 1 xfail estrito RB-001**, 60 módulos, 92,62 s.
  Ruff/formatação dos sete arquivos novos, mypy dos cinco scripts e diff-check
  passaram. O aceite HTTP manual não integra a coleta automática de CI e não
  desativa rate limit (três logins por rodada); não somar seus casos à matriz.
- Próximo gate: aprovação completa no Radar pela aplicação, com prova de 24 h,
  autorização, conflitos/replay e destino correto. Depois seguem as fontes e
  automação, E2E/cobertura completos e aceite operacional. Não há commit, push,
  deploy, alteração de master/produção ou ativação de recorrência nesta etapa.

### Evidências e limites da recuperação

- O checkout `/private/tmp/sigeo-homologacao-integridade` não está presente.
  A referência Git continua cadastrada como worktree removível. Os bancos
  locais sobreviveram; código não commitado e arquivos privados temporários
  não foram encontrados nos locais pesquisados.
- `homologacao` aponta para `bade9ad`, de 06/10. Inclui `cc877bc` e `ca33b02`.
  Não foi encontrada uma revisão Git posterior que represente a validação
  completa registrada em 09/10.
- A retomada usa checkout isolado em
  `.codex-work/recuperacao-homologacao-20261013`, com HEAD destacado em
  `bade9ad`. Não altera master, produção ou o checkout principal do usuário.
- Foram identificados 372 patches completos no histórico local; 67 foram
  aplicados. Outros 305 não se aplicaram (pré-requisito ausente, contexto
  divergente ou alteração já presente). Há 213 registros incompletos.
  Esses números não representam arquivos recuperados nem percentual do plano.
  A reprodução parcial permanece em quarentena, não pronta para publicação.
- O clone servido `sigeo_homologacao_clone_20261006` tem revisão Alembic
  `e6a7b8c9d0f1`, sem migration correspondente no checkout recuperado.
  Não foi feito downgrade, migration improvisada ou escrita nesse clone.

### Plano versus evidência disponível

| Bloco | Execução registrada até 09/10 | Condição atual / próxima prova |
| --- | --- | --- |
| Espelho SICONV e caso 825374 | Recaptura real de 403 convênios, projeções e prestação de contas literal; replay e carga inicial silenciosa | Recuperar services/contratos completos, migrations e testes antes de repetir aceitação; não inferir situação pelo histórico |
| Filhas e financeiro oficial | Itens, empenhos, desembolsos, licitações, termos e pagamentos; correções de chave de aditivo e decimal | Recuperação parcial; não substituir por soma manual, leitura simplificada ou zero em dado ausente |
| TransfereGov novo | Recaptura e teste real de cinco propostas com coleções financeiras | Há código recuperado com erro de tipagem; validar novamente contratos/projeções e universo restante |
| Descoberta e aprovação do Radar | Critérios MS/equipamentos, exclusão de obras, aprovação humana, recaptura de 24 h e auditoria registrados | Contratos de escopo/componentes e descoberta reconstruídos com regressões; aprovação, recaptura e migrations ainda incompletas; não habilitar aprovação |
| Caixa e destinatários | UI, busca, arquivo individual e leitura em lote; matriz ampliada ainda pendente | Etapa retomada em PostgreSQL sintético: correção de exclusão lógica e broadcast sem responsável; resultados abaixo |
| Localhost/E2E | Fluxos locais registrados, com algumas fronteiras simuladas | Servidores ainda não restabelecidos: alinhar código/schema/config local antes de E2E; não apontar para produção |
| Automação | Workflow isolado/travas desenhados; sem agendamento ativo | Provar runner, secrets, permissões, replay e falhas no banco isolado; schedule/produção continuam sem autorização |
| Fechamento | Rollout e New Relic ao final | Pendentes: suíte/gates completos atuais, E2E, backup/rollback e rollout autorizado; classificação de 401 sem ocultar falhas reais de sessão |

### Avanço novo, restrito à retomada local

- Repository de notificações exclui usuários com `deleted_at` preenchido,
  além de manter os filtros de status ativo e perfil elegível.
- Instrumento sem titular/suplente cadastrado usa broadcast para
  colaborador/gestor/admin elegíveis, independentemente da existência de
  gestores. Antes, a existência de um gestor suprimia o broadcast.
- Responsável cadastrado mas inativo/suspenso/excluído/leitor não autoriza
  ampliar o aviso para outros colaboradores. Sem gestores elegíveis, o
  conjunto de destinatários pode ser vazio; isso não remove o aviso.
- Avisos de inclusão no monitoramento e fonte indisponível continuam somente
  para gestor/admin. Leitor nunca recebe; regra materializada na criação,
  sem migration, endpoint novo ou mudança de autorização de instrumentos.
- Regressões em `tests/test_notificacoes_destinatarios_db.py`: schemas
  sintéticos isolados no banco `sigeo_test_clone_20261006`; launcher sem
  leitura de `.env`, chave JWT efêmera e serviços externos desabilitados.
  A primeira execução demonstrou os defeitos de destinatários e uma falha
  no teardown do teste; os 21 schemas dessa execução foram removidos por
  nome exato e a limpeza corrigida. Nenhum dado operacional foi apagado.
- Validação atual: **40 testes passaram**, sendo 24 da matriz nova e 16
  testes existentes de Service/Router/caixa. Incluem busca, paginação,
  arquivo, leitura em lote, autenticação, CSRF, validação e IDOR. Ruff passou
  nos dois arquivos de implementação/teste deste avanço. O hostname
  `testserver` foi permitido apenas no launcher de testes, não na aplicação.
  Não equivale a E2E do navegador, teste de API federal real nem suíte completa.

### Continuação da recuperação — segunda rodada em 13/10

- A extração por seção completa encontrou **192 fragmentos verificáveis**
  dentro de chamadas truncadas. Não são 192 arquivos completos e não foram
  aplicados em massa. Cada seção recuperada mantém a origem no inventário
  `.codex-work/inventariar-fragmentos.py`; trecho ausente nunca é executado.
- Recuperados cinco fragmentos: exclusão de obras/serviços no classificador,
  critérios prioritários, catálogo de componentes, guarda de staging local
  e Repository de auditoria de marcadores. O catálogo fica na camada `app`,
  sem importar script operacional; somente aliases oficiais explícitos,
  sem fuzzy-match. Isso não restabelece a orquestração completa do Radar.
- Corrigidos os dois erros independentes de tipagem em reconciliação e
  paginação TransfereGov, sem `Any`/supressão. Regressões cobrem IDs simples
  e compostos, publicações sem ID, replay, envelopes inválidos e leitura
  integral das páginas. Mantida preservação de coleções omitidas/vazias.
- Regressões sintéticas de classificação cobrem padrões de obra como o caso
  971252, área construída, serviço, acessório, equipamento existente e item
  não prioritário; os equipamentos prioritários expressos continuam aceitos.
  Não foi executado saneamento da carteira nem alterado instrumento real.
- Removidas definições de testes duplicadas introduzidas pela reprodução
  parcial; preservada a versão que também verifica proteção da mensagem de
  notificação. Imports normalizados sem mudança de SQL.
- **111 testes atuais passaram**, em duas execuções sem sobreposição:
  95 de notificações/reconciliação/contratos/equipamentos/descoberta e
  16 de capturas/auditoria de marcadores. Ruff passou em `app` e nos
  scripts/testes verificados; `git diff --check` passou.
- `mypy app` continua **reprovado com dois erros**, ambos de
  `criterio_escopo` ausente em `CandidatoLegadoCaptura`/`CandidatoLegado`.
  O contrato não foi removido para fazer o gate passar.
- A coleta da suíte inteira inicialmente encontrou duas dependências
  ausentes. Recuperados `captura_local_guardas.py` e
  `auditoria_marcadores.py`, resta erro de importação de
  `scripts/recapturar_propostas_local.py`. Nenhum teste foi ignorado para
  declarar a suíte completa aprovada.
- Leitura exclusiva do schema do clone confirmou sete campos adicionais em
  `candidato_legado_captura`: `criterio_escopo`, `orgao_superior`,
  `data_assinatura_siconv`, `data_publicacao_siconv`, `elegivel`,
  `motivo_inelegibilidade` e `fonte_captura_id`, além dos CHECKs/FK.
  São evidência para reconstrução, não autorização para fabricar/stampar
  migrations antigas ou iniciar a API com modelos incompatíveis.
- Próximo bloqueio: recuperar o script de recaptura e sua cadeia de
  contratos, depois modelos/migrations do escopo e aprovação. Servidores
  ainda não restabelecidos, sem novo download federal, workflow, commit,
  push, deploy ou escrita no clone servido/produção.

### Continuação — worker de propostas reconstruído em 13/10

- Recuperados integralmente `schemas_campos_proposta_transferegov.py` e
  `schemas_amostra_transferegov.py`, incluindo a correção histórica que
  rejeita booleano/valor negativo/não finito sem converter inteiro para float.
  O corpo original de `recapturar_propostas_local.py` permanece truncado;
  o arquivo atual é **reconstrução**, não reprodução garantida do original.
- O worker reutiliza coleta/reconciliação do job existente, seleciona no
  Repository somente propostas conhecidas (até cinco, IDs exatos quando
  fornecidos) e trava as linhas durante a transação. Proposta desconhecida,
  identidade divergente, programa diferente e resposta ambígua abortam o lote.
- Guardas verificam runtime, migration e URL da engine efetivamente carregada:
  somente staging PostgreSQL loopback, sem parâmetros de redirecionamento.
  Conexão pré-carregada em outro banco é recusada antes do HTTP/publicação.
  Não executa descoberta, aprovação nem inclusão automática no monitoramento.
- Payload é protegido antes do contrato, diff, evidências e notificação.
  Baseline silenciosa e replay permanecem; mudança posterior gera resumo
  agrupado. A decisão humana de proposta rejeitada foi preservada no teste.
- Publicação do lote, evidências, avisos e captura de sucesso compartilham uma
  transação. Falha após a primeira proposta reverte o lote e registra captura
  de erro/alerta gerencial em sessão separada pelo Service existente, sem
  mensagem privada. CLI interrompido não imprime traceback ou payload.
- Testes de integração usam schema PostgreSQL sintético descartável. Somente
  HTTP e a fábrica/identidade da conexão de teste são substituídos; SQL,
  seleção, reconciliação, evidências, destinatários e captura rodam reais.
- A coleta da suíte inteira deixou de falhar por importação do worker. Isso
  não significa suíte inteira executada nem recuperação de testes ausentes.
- Rodada específica: 18 testes de contratos/worker passaram; a execução
  conjunta atual dos blocos recuperados terminou com **129 testes aprovados**.
  Isso não substitui o gate global de cobertura. Lint de `app`
  e dos scripts/testes tocados passou; mypy dos quatro arquivos do worker e
  contratos passou. `mypy app` global ainda depende dos dois contratos de
  `criterio_escopo` ausentes no Radar; não houve supressão desse problema.
- Pendente antes de operação real: esquema/migrations completos do Radar,
  suíte/gates globais, concorrência em conexões independentes, staging
  provisionado com credenciais DML mínimas, coleta real e prova de descarte
  seguro. Nenhuma API federal foi consultada e o worker não foi executado
  contra staging com dados reais. Servidores ainda não reiniciados.

### Continuação — contrato de escopo do Radar reconstruído em 13/10

- Reconstruídos no modelo os sete campos de escopo/elegibilidade encontrados
  no schema local sobrevivente, com CHECKs, índice da rodada e FK para
  `fonte_captura` com RESTRICT. Contrato Pydantic aceita somente os dois
  critérios históricos e órgão `36000`; a versão de convênio celebrado exige
  assinatura e publicação SICONV. Não confundir essas datas com publicação
  do Portal. Não foi criada/aplicada migration nem alterado o clone servido.
- O Service persiste critério, órgão e datas. Troca de critério não herda
  evidências nem confirmação do Portal da captura antiga; a captura anterior
  permanece no histórico. Dentro do mesmo critério, permanece o comportamento
  recuperado de união das evidências: ainda deve ser confrontado com o contrato
  da coleta completa antes de liberar a descoberta.
- **15 regressões novas passaram**: validação do contrato, CHECKs e FK reais,
  persistência, replay e troca de critério sem contaminação. Usam schema
  sintético descartável, não dados operacionais. São testes do modelo via
  `create_all`, **não prova de upgrade/downgrade Alembic**.
- Execução conjunta dos 14 módulos recuperados: **144 testes passaram**;
  `mypy app` passou nos 89 arquivos, Ruff de `app`/teste novo e
  `git diff --check` passaram. Isso não equivale à suíte global aprovada.
- Rodada ampliada incluindo `test_candidatos_legados_db.py`: 41 passaram,
  três falharam e cinco tiveram erro de setup. Falta
  `app.services.descoberta_prioritaria_ms`; dois testes esperam confirmação
  sem cadastrar uma captura confirmada, e um espera preservar confirmação
  mesmo após resposta `nao_encontrado`. Nenhuma expectativa foi afrouxada:
  recuperar o contrato/orquestrador e revisar esses casos com as regras da
  fonte antes de alterar testes. As falhas continuam pendentes e visíveis.
- Próxima etapa: recuperar descoberta prioritária e contratos de componentes,
  recaptura/aprovação e cadeia de migrations; testar up/down em ambiente
  descartável antes de reiniciar servidores. Produção, schedules e remoto
  permanecem intactos.

### Continuação — descoberta prioritária reconstruída em 13/10

- Reconstruído `descoberta_prioritaria_ms.py` e os contratos institucionais.
  Recuperado o contrato de celebração com import ajustado ao checkout atual.
  Não é reprodução garantida do módulo original: o corpo histórico faltante
  foi implementado a partir do plano, fragmentos e regressões preservadas.
- A descoberta exige proposta do MS (`36000`) e equipamento prioritário
  explícito no item, ou componente integral do catálogo ligado ao programa
  MS por IDs exatos. Não usa objeto genérico, fuzzy-match, texto semelhante,
  município ou inferência de equipamento a partir do componente. Números
  reservados/planos de trabalho sem assinatura e publicação são excluídos;
  data malformada e vínculo ambíguo abortam o lote, não geram êxito parcial.
- Job recuperado solicita também `DIA_ASSIN_CONV`, `DIA_PUBL_CONV` e
  `SIT_CONVENIO`. Guardas rejeitam limite inválido antes da leitura e limite
  excedido sem publicar os primeiros candidatos. Nenhum download real rodou.
- Reconstruído o modelo `candidato_legado_componente` após leitura somente
  de metadados locais: identidade, FK RESTRICT da captura, UNIQUE e índice.
  Service persiste a evidência; Repository consulta em lote com paginação;
  resposta do Radar expõe `componentes` sem criar equipamento ou monitoramento.
  O DTO rejeita componente incompatível com o nome integral do programa.
  Ainda não há prova de migration up/down: testes novos usam metadata no
  schema sintético, e o clone servido continua intocado.
- Capturas com critério oficial substituem integralmente evidências de itens,
  em vez de acumular itens removidos. Capturas anteriores permanecem auditáveis.
  Candidato oficial sem confirmação do Portal ou inelegível sai da fila e
  do contador; decisões encerradas permanecem consultáveis. Isso não substitui
  a reavaliação de ausentes da rodada nacional, ainda por recuperar.
- Resolvidas as oito pendências da rodada anterior neste módulo. Restaurada
  a fixture com cabeçalhos de celebração conforme patch histórico 382; testes
  que esperavam confirmação agora cadastram explicitamente captura confirmada.
  Pacote vazio é rejeitado, preservando o histórico (expectativa recuperada do
  patch 383), não aceito como captura parcial silenciosa.
- **187 testes atuais passaram juntos**, em 16 módulos, sem ignorar as falhas
  anteriores. Incluem HTTP/dumps simulados com SQL real, replay, erro HTTP,
  limites, datas, obra/contexto/serviço/acessório, escopo MS, componente exato,
  preservação do histórico e retirada da fila. Mypy passou em `app` + job
  (93 arquivos); Ruff dos arquivos verificados e `git diff --check` passaram.
  Não equivale à suíte global, captura federal real, E2E ou aceitação do runner.
- Próximo bloco: contratos de recaptura/aprovação e recuperação da cadeia
  Alembic; depois gates globais e localhost. Sem commit, push, schedule,
  deploy ou qualquer operação de produção nesta rodada.

### Continuação — base da recaptura e pedido de aprovação em 13/10

- Recuperado integralmente o fragmento de `schemas_programas_legado.py`
  (inventário de fragmentos, índice 83): vínculos por IDs, catálogo coerente
  e preservação dos campos oficiais adicionais. Recuperada a mudança do
  patch 273 que transfere `ItemDump` para schema compartilhado; o Service
  mantém reexport para compatibilidade, sem DTO duplicado.
- Recuperados `ConvenioRecapturado` e `ItemRecapturado` da base histórica,
  com valor decimal válido/não negativo/finito, situação obrigatória e campos
  oficiais extras preservados. Reconstruído **CapturaLegadoBasica** para
  validar identidade dos itens/programas, duplicidade e presença de evidência.
  Não foi denominado `CapturaLegadoParaPromocao`: falta recuperar o Portal,
  as filhas financeiras e hashes da rodada para compor a prova completa.
  Nenhum stub ou payload genérico substitui essas dependências ausentes.
- Recuperado o pedido `AprovacaoLegadoCreate` a partir do fragmento 95:
  chave idempotente, captura, recaptura, hash, versão e justificativa.
  IDs/versão recebem validação estrita adicional contra booleano e coerção.
  Payload, valor, situação, data de captura e identidade do aprovador vindos
  do navegador são recusados por `extra=forbid`. Ainda não há Service/rota
  habilitado: existência do DTO não comprova autorização, frescor de 24 h,
  transação, idempotência ou aprovação concluída no banco.
- **36 regressões novas passaram**; a execução conjunta de 17 módulos
  terminou com **223 testes aprovados**. Cobrem formatos inválidos, campos
  ausentes, zero, extras oficiais, outra proposta, duplicidade, catálogo
  incompleto e tentativas de fornecer prova/identidade pelo pedido humano.
  Testes novos são de contrato, não integração SQL de aprovação. Mypy passou
  em `app` + job (96 arquivos), Ruff verificado e `git diff --check` passaram.
- Continuação necessária: Portal/filhas/hashes e validação da prova completa,
  modelos/Repository/Service de recaptura e aprovação, migrations recuperadas
  com up/down, concorrência e gates globais; somente então localhost/E2E.
  Nenhuma aprovação, coleta federal, migration, commit/push ou alteração de
  produção foi executada nesta rodada.

### Continuação — estrutura completa da prova reconstruída em 13/10

- Reconstruídos contratos de identificação do Portal e das cinco tabelas
  filhas, conferindo fragmentos e saídas históricas. Campos extras oficiais
  permanecem na evidência; UF usa o catálogo existente e CNPJ é normalizado.
  Portal não substitui os totais do SICONV. Projeção financeira completa,
  última liberação e compatibilidade de todos os formatos reais ainda
  dependem da recuperação/aceitação dos Services correspondentes.
- A chave técnica dos aditivos usa solicitação + número do termo quando
  ambos existem, com fallback para número do termo em registro histórico;
  IDs oficiais não são reescritos. Duplicidades são recusadas. Pagamento
  negativo finito é preservado como dado oficial (possível estorno), não
  transformado em zero; valor inválido/não finito aborta validação.
- `CapturaLegadoParaPromocao` reconstruída exige Portal, proposta, programas
  e todas as coleções filhas, mesmo vazias. Identidades de convênio/proposta
  devem coincidir. A origem exige hashes de todas as fontes e horário com
  fuso. Estes contratos descrevem uma prova, não atestam download real ou
  vínculo persistido entre prova, candidato e rodada.
- Service puro verifica hash, MS, celebração, confirmação do Portal e os
  equipamentos/componentes revisados; mudança exige revisão. Frescor de
  **24 horas** aceita exatamente o limite, recusa prazo excedido, horário
  futuro ou sem fuso. Horários devem vir do banco/servidor, nunca do pedido.
  Hash canônico atual foi reconstruído; compatibilidade com hashes históricos
  sobreviventes ainda não foi provada e não será presumida para aprová-los.
- Corrigida uma fronteira adicional: itens exclusivamente de obra/serviço
  sem aquisição explícita não podem autorizar descoberta apenas por componente
  prioritário. A mesma guarda existe na prova pura. Sem saneamento de carteira
  ou alteração de instrumento real nesta rodada.
- **31 regressões novas passaram**; execução ampliada específica: 108 testes.
  Execução conjunta dos 18 módulos recuperados: **254 testes aprovados**.
  Mypy em `app` + job (100 arquivos), Ruff verificado e `git diff --check`
  passaram. As regressões novas são puras/sintéticas: não demonstram aprovação
  SQL, concorrência, chamada federal, navegação ou upgrade/downgrade Alembic.
- Próxima etapa: recuperar modelo/Repository de recaptura e transação de
  aprovação (autorização, vínculo candidato→captura→rodada, versão, lock,
  replay, auditoria e notificação gerencial), depois migrations e localhost.
  Nenhuma rota de aprovação foi habilitada. Produção e remoto permanecem
  intactos, sem captura federal, migration ou novo serviço local iniciado.

### Continuação — modelo e Repository da recaptura recuperados

- Reconstruído `app/db/models_recaptura_legado.py` pela inspeção somente de
  metadados do clone local sobrevivente; reexportado em `models_legado.py`
  para registro da metadata existente. Nenhuma migration aplicada ou
  identidade Alembic presumida. `Numeric` sem escala fixa mantém a precisão
  observada no schema; JSONB preserva o payload oficial.
- Chave composta vincula captura ao candidato correto; FKs restringem a
  remoção de referências e a unicidade impede duas provas do mesmo candidato
  na mesma rodada. Hash, situação não vazia e valor não negativo são
  protegidos também por constraints, independentemente de Pydantic.
- Repository separado fornece gravação com `flush` e leituras por rodada ou
  identidade completa. Não realiza commit, rollback, autorização, aprovação
  ou validação de frescor. Essas responsabilidades permanecem no Service.
- **9 regressões SQL novas passaram**, usando apenas schemas sintéticos no
  banco dedicado de teste. Demonstram rejeição de vínculos alheios/ausentes,
  duplicidade e valores inválidos, precisão decimal, situação oficial sem
  tradução e rollback conjunto da prova e da rodada. Execução específica:
  57 testes; matriz conjunta de 19 módulos: **263 testes aprovados**.
  Ruff, mypy em `app` + job (102 arquivos) e `git diff --check` passaram.
- Próxima etapa: Service de persistência da prova completa, com validação
  contra evidências do candidato carregadas no servidor, lock, origem e
  transação; depois aprovação auditada, migrations e aceitação local.
  Esta etapa não demonstra idempotência do Service, concorrência, imutabilidade
  por permissões/trigger, aprovação, captura HTTP real ou E2E. O Repository
  não é exposto em rota ou job; a aprovação permanece desabilitada.
- Produção, remoto e dados operacionais do clone não foram modificados.
  Nenhum commit, push, deploy ou servidor iniciado nesta continuação.

### Continuação — Service transacional da prova completa

- Criados `schemas_recaptura_persistencia.py` e
  `services/recapturas_legado.py`: referência interna com IDs estritos e
  resultado sem payload federal. Service exclusivo do coletor confiável;
  não foi ligado a endpoint, navegador ou job operacional. Origem, horário
  e hashes devem vir da coleta no servidor, não de upload do usuário.
- Service revalida contratos, exige frescor de 24 horas e carrega do banco
  a descoberta vigente, evidências, componentes e decisão. Recusa referência
  antiga, descoberta não oficial/inelegível, análise encerrada, órgão ou
  aquisição fora do recorte. Não recebe o candidato revisado do cliente.
- Usa o mesmo advisory lock da descoberta e lock de linha do candidato.
  A leitura bloqueada recarrega o identity map para não confiar em uma
  referência antiga da Session. Rodada `ok` e prova completa são gravadas
  em um commit; qualquer falha reverte ambas, sem apagar a descoberta.
- Repetição do mesmo candidato e horário inicial do coletor reutiliza a
  prova somente se referência, hash de conteúdo e todos os metadados da
  origem coincidirem. Divergência conflita; consulta posterior adiciona
  nova prova sem atualizar a anterior. O coletor ainda precisa preservar
  esse horário ao repetir a mesma tentativa; não presumir deduplicação
  entre rodadas com horários diferentes.
- **18 regressões novas passaram** em schemas sintéticos: repetição,
  divergência, rollback após flush, invalidez/expiração, rejeição preservada,
  histórico de provas, duas Sessions simultâneas e identity map desatualizado.
  Matriz conjunta, incluindo regressões das decisões: **294 testes aprovados
  em 21 módulos**. Ruff, mypy (104 arquivos) e verificação de formatação/diff
  passaram. Nenhum instrumento foi incorporado ou aprovado por este Service.
- Próxima etapa: aprovação auditada com autorização, versão, revisão da
  prova persistida, projeção oficial da carteira e notificação gerencial.
  Permanecem pendentes a integração do coletor real, registro separado das
  falhas da fonte, migrations, permissões de imutabilidade, validação HTTP
  das fontes e E2E. Esta execução não atesta esses itens nem suíte global.
- Nenhuma migration, captura federal, servidor, commit, push ou deploy
  executado; produção e remoto permanecem intactos.

### Continuação — projeção oficial e inserção estrita da carteira

- Reconstruídos `schemas_projecao_legado.py`,
  `schemas_ultima_liberacao_legado.py`, `services/projecao_legado.py` e
  `repositories/carteira_legado.py`, conferindo os fragmentos históricos,
  importer existente e shape consumido pelo job de espelhamento.
- Projeção pura preserva situação literal SICONV e situação Portal em campos
  distintos; identificação, objeto e publicação vêm do Portal. Totais SICONV
  ausentes não recebem fallback financeiro do Portal. Última liberação do
  Portal tem campos próprios, sem substituir desembolso acumulado.
- Financeiro usa Decimal; ausência permanece `None`, zero permanece zero e
  estornos finitos são preservados. Pagamentos vazios têm total ausente e
  contagem zero; soma e contagem de pagamentos são derivadas da coleção
  consultada. Valores inválidos abortam em vez de serem convertidos em nulo.
- Datas de vigência priorizam Portal e usam SICONV apenas como fallback;
  inválidas/invertidas abortam. Ano só vem de sufixo `/AAAA` do número oficial,
  não de publicação presumida. IBGE informado exige sete dígitos; região usa
  o catálogo compartilhado por UF. Todos os programas são preservados no raw;
  os nomes distintos aparecem juntos, sem escolher arbitrariamente o primeiro.
- Raw mantém tabelas filhas vazias, itens, programa/proposta/Portal e marcador
  `_espelho` versão 1 para o job existente. Não escreve tags legadas, CNES,
  técnicos, marcos físicos ou InstrumentoEquipamento. Normalização municipal,
  marcadores canônicos e revisão server-side da prova ainda precisam integrar
  a futura transação de aprovação.
- Repository faz somente INSERT e flush, sem commit ou upsert. Número
  existente conflita sem sobrescrita; rollback desfaz a inclusão sintética.
  Não foi conectado a endpoint ou job, não aprova e não altera carteira real.
- **35 regressões novas passaram** (32 puras, 3 PostgreSQL sintéticas).
  Execução focada: 53 testes; matriz conjunta de 23 módulos: **329 testes
  aprovados**. Ruff, mypy (108 arquivos), formatação e diff passaram.
- Próxima etapa continua sendo revisão da prova persistida e aprovação
  auditada: autorização gestor/admin ativo e não excluído, hash/frescor/rodada,
  versão/estado/replay, decisão append-only, marcadores e aviso gerencial
  específico da carteira. Ainda não há autorização/aprovação implementada
  para esta reconstrução, migration aplicada, captura real ou E2E deste fluxo.
- Produção e remoto intactos; nenhum commit, push, deploy ou servidor iniciado.

### Continuação — revisão autorizada da prova persistida

- Criados `services/revisao_legado.py`, `repositories/revisao_legado.py` e
  `schemas_revisao_legado.py`: preparação interna para composição na futura
  transação de aprovação. Não é endpoint, resposta de UI ou aprovação; não
  grava carteira/decisão/aviso e não faz commit. O chamador deve preservar
  os locks e confirmar ou reverter a transação ao finalizar a operação.
- Autorização relê e bloqueia em modo compartilhado o usuário no banco,
  inclusive se houver objeto antigo no identity map: somente gestor/admin
  ativo e não excluído. Não confia em perfil enviado pelo navegador.
- Confere versão e situação humana, descoberta vigente oficial elegível,
  número ainda fora da carteira, última recaptura do candidato e vínculo à
  captura atual. Rejeição é terminal; versão antiga exige atualizar a revisão.
- Rodada deve ser `siconv_recaptura` com status `ok`; horários devem ser
  coerentes e o início não pode ter mais de 24 horas nem estar no futuro.
  Proveniência completa é revalidada e deve ter o mesmo início da rodada.
- Revalida payload JSONB, hash salvo/hash revisado/hash canônico, situação
  e valor projetados, identidades, MS, celebração e evidências atuais do
  candidato. Payload incompleto/adulterado ou prova histórica incompatível
  exige recaptura; não aceita fallback de hash nem sobrescreve evidência.
- Extraída montagem compartilhada do candidato revisado em
  `services/candidato_revisado_legado.py`, reutilizada pelo Service de coleta
  para não duplicar projeção de evidências/componentes do banco.
- **32 regressões SQL sintéticas novas passaram**: perfis/usuário obsoleto,
  roundtrip JSONB, fontes/hash/payload/horários inválidos, última prova,
  carteira existente, versão/estado humano e ausência de commit/inclusão.
  Matriz conjunta de 24 módulos: **361 testes aprovados**. Ruff, mypy
  (112 arquivos) e diff passaram. Resultado específico anterior: 82 testes,
  antes de adicionar as três regressões finais de payload e estado.
- Próximo bloco: reconstruir vínculo da decisão à recaptura/carteira,
  autorização/estado/replay da aprovação transacional, marcadores e aviso
  gerencial específico. A preparação atual não substitui essas garantias;
  frescor deve ser conferido na transação efetiva de aprovação. Permissões
  de imutabilidade, migrations, coletor real e E2E continuam pendentes.
- Nenhuma captura federal, servidor, migration, commit, push ou deploy nesta
  rodada; produção, remoto e carteira operacional do clone permanecem intactos.

### Continuação — aprovação interna transacional reconstruída

- Metadados do clone sobrevivente confirmaram `recaptura_id`/`convenio_id`
  na decisão e o enum `aprovacao_carteira`. Modelo reconstruído com FKs
  compostas, unicidade de prova/convênio e checks que exigem vínculos somente
  para aprovação. Não foi aplicada migration nem presumida revisão Alembic.
- `services/aprovacao_legado.py` integra autorização atual, locks, revisão
  completa, INSERT sem upsert, marcadores de financiamento, decisão ligada
  a ator/prova/carteira e aviso em um commit. O frescor de 24h é conferido
  novamente antes do commit. Falha em qualquer ponto reverte toda a inclusão.
- Repetição da chave exige o mesmo ator, captura, recaptura/hash,
  justificativa e versão anterior. Versão anterior é obtida do histórico
  append-only, não de campo inventado no schema sobrevivente. Replay retorna
  a decisão original sem nova inclusão ou aviso; chave divergente conflita.
  Nova chave não reabre estado terminal.
- Marcadores usam o classificador canônico e somente relações aquisição/
  modernização dos itens oficiais. Componentes não inventam equipamento.
  Não há escrita em tags legadas, CNES inferido ou InstrumentoEquipamento.
- Aviso `aprovacao_carteira` é distinto de `inclusao_monitoramento` e aponta
  para Convenio.id. Destinatários materializados são apenas gestor/admin
  ativo e não excluído. Contrato/rótulo/destino no frontend ainda não foram
  recuperados nesta etapa; não habilitar endpoint ou UI antes dessa integração.
- **19 regressões SQL sintéticas novas passaram**: aprovação por gestor/admin,
  replay/divergência/estado terminal, análise anterior, perfis bloqueados,
  vínculos protegidos no banco, rollback após flush do aviso e duas Sessions
  simultâneas com mesma chave. Matriz conjunta de 25 módulos: **380 testes
  aprovados**. Ruff, mypy (113 arquivos), formatação e diff passaram.
- Próxima etapa: migrations reconstruídas e verificadas em banco descartável,
  proteção de imutabilidade, contrato frontend/notificação e conexão controlada
  do coletor/rotas locais. Ainda faltam aceitação das fontes reais, E2E e
  regressões de concorrência com comandos distintos/operações externas ao
  Service. A decisão mantém histórico por INSERT; permissões/triggers de
  append-only no banco continuam pendentes e não foram presumidos.
- Operação permanece interna, sem rota/comando de UI ou instrumento real
  aprovado. Nenhuma migration, captura federal, servidor, commit, push ou
  deploy nesta rodada. Produção e remoto continuam intactos.

### Continuação — migration histórica de decisões validada isoladamente

- A cadeia de arquivos disponível termina em `b5c6d7e8f9a0`. A revisão
  `e6a7b8c9d0f1` observada no clone sobrevivente não está nessa cadeia.
  Não foi inventado predecessor, aplicado stamp ou alterado o clone para
  contornar a lacuna. Aprovação e recaptura continuam sem liberação operacional.
- `test_migration_decisoes_radar_recuperada_db.py` executa o `upgrade` real
  da migration histórica disponível contra predecessores mínimos sintéticos
  em schema exclusivo do banco dedicado de testes. Não usa `create_all` como
  substituto de execução Alembic e não modifica tabelas do schema `public`.
- **5 regressões novas passaram**: trigger rejeita UPDATE e DELETE com
  SQLSTATE 23514, preservando a decisão e permitindo novo INSERT; FK composta
  rejeita captura de outro candidato; unicidade rejeita chave duplicada;
  up/down/up funciona com histórico vazio. O schema gerado é descartado
  após cada teste, inclusive em falha.
- Matriz conjunta de 26 módulos: **385 testes aprovados**. Ruff e formatação
  do novo módulo passaram. Isso não representa validação da cadeia completa,
  dos triggers da recaptura reconstruída, de privilégios runtime ou do E2E.
- Limitação encontrada: o downgrade histórico disponível remove a tabela de
  decisões sem bloquear histórico preenchido. O teste só reverte tabela vazia;
  **não executar esse downgrade com dados de auditoria**. Não reescrever a
  migration já compartilhada; a estratégia de reversão preservadora precisa
  ser definida junto da recuperação das revisões posteriores.
- Próximo gate: recuperar a cadeia posterior e testar as expansões de
  recaptura/aprovação com preservação da auditoria. Só depois integrar contrato
  de notificação/frontend, coletor e rotas controladas, e realizar aceitação
  local de ponta a ponta. Nenhum servidor, commit, push ou deploy nesta rodada;
  produção permanece intacta.

### Continuação — aviso de aprovação recuperado sem inventar a cadeia

- Recuperado integralmente `f0a1b2c3d4e5_aviso_aprovacao_carteira.py` de
  um patch histórico completo. Arquivo preservado em `alembic/recuperados`,
  com procedência documentada, **fora de `versions`** porque o predecessor
  `e9f0a1b2c3d4` está ausente. O head ativo continua `b5c6d7e8f9a0`;
  não houve stamp, mudança de revision/down_revision ou migration operacional.
- **4 regressões SQL novas passaram**: expansão do enum aceita o novo aviso
  e preserva avisos anteriores; repetição do upgrade não duplica o literal;
  downgrade com aviso de aprovação é bloqueado preservando as linhas;
  downgrade sem esse aviso preserva o enum e os outros tipos de notificação.
  O teste usa schema sintético exclusivo e descarta somente esse schema.
- Matriz conjunta de 27 módulos: **389 testes aprovados**. Ruff de app e
  testes, formatação do teste novo e diff passaram. O arquivo histórico
  preservado apresenta aviso I001 de organização de imports; não foi
  reformulado para evitar descaracterizar a evidência recuperada. Isso deve
  ser resolvido explicitamente antes de eventual reintegração à cadeia.
- Aprovação, recaptura e notificação têm provas isoladas; **a cadeia completa
  ainda não está validada**. A busca complementar nas saídas diretas dos logs
  não recuperou o predecessor. Seguem pendentes migrations posteriores,
  proteção append-only da recaptura/privilégios runtime e aceitação local
  integrada com coletor, contratos frontend e E2E. Produção, clone operacional,
  servidores e remoto não foram alterados nesta rodada.

### Continuação — revisão do clone e identidade histórica recuperadas

- Recuperados integralmente dois arquivos de patches históricos completos:
  `e6a7b8c9d0f1_aviso_descoberta_radar.py` (patch 299) e
  `a1c2d3e4f5b6_numero_convenio_alfanumerico.py` (patch 221). A comparação
  textual confirmou conteúdo idêntico ao original. Ambos ficam em
  `alembic/recuperados`, fora da cadeia ativa, com procedência registrada.
- **Correção do diagnóstico anterior:** o arquivo da revisão `e6a7b8c9d0f1`
  observada no clone agora foi recuperado. A cadeia continua incompleta,
  porque seu predecessor `d5f6a7b8c9e0` não foi recuperado integralmente.
  A revisão de identidade depende de `f0a1b2c3d4e5`, também em quarentena,
  cujo predecessor `e9f0a1b2c3d4` permanece ausente. Não mudar esses vínculos.
- **12 regressões adicionais passaram:** quatro testes da expansão do aviso
  de descoberta, preservação de avisos anteriores, replay e rollback
  bloqueado com histórico; oito da identidade alfanumérica, rejeição de
  caracteres inválidos/proposta não numérica, preservação dos identificadores
  e reversão segura somente quando os números existentes são compatíveis.
  Aceitar identidade alfanumérica não altera o recorte MS/equipamentos.
- Matriz conjunta de 28 módulos: **401 testes aprovados**. Ruff de app e
  testes, formatação dos testes e diff passaram. Arquivos históricos mantêm
  a organização original de imports, como evidência; não foram formatados.
  `alembic heads` continua `b5c6d7e8f9a0`.
- Esta rodada avançou na recuperação histórica, **não instalou proteção
  append-only da recaptura**. Esse gate continua pendente junto da cadeia
  anterior, privilégios runtime e integração local. Nenhuma migration foi
  aplicada ao clone operacional; nenhum servidor, commit, push ou deploy.

### Continuação — imutabilidade da recaptura e decisão sob SQL direto

- Consulta read-only a `pg_get_functiondef`/`pg_get_triggerdef` no clone
  sobrevivente confirmou a função `impedir_mutacao_recaptura_legado` e o
  trigger `recaptura_legado_append_only`, com bloqueio BEFORE UPDATE/DELETE.
  Essa evidência não recupera a migration original nem autoriza inventar
  revisão/predecessor. Nenhuma escrita foi realizada no clone operacional.
- `test_radar_append_only_recuperado_db.py` instala as definições sobreviventes
  da recaptura e decisão **somente no schema sintético descartável**. Os
  qualificadores de schema são adaptados para isolamento; não se afirma que
  `Base.create_all` cria triggers ou que a cadeia Alembic foi executada.
- **11 regressões novas passaram:** UPDATE de situação/hash/valor/payload e
  DELETE de recaptura rejeitados com SQLSTATE P0001; UPDATE de justificativa/
  ator/situação e DELETE da decisão rejeitados com 23514, preservando os
  registros. Nova rodada insere outra prova sem alterar a anterior; aprovação
  e replay funcionam com ambos os triggers ativos, sem duplicar o aviso.
- A primeira execução revelou erro no próprio teste (DTO de recaptura não
  contém payload/situação). Corrigida a leitura para consultar a entidade
  persistida, sem mudar contrato ou relaxar a aplicação. Reexecução focada:
  **48 testes aprovados**; matriz conjunta de 29 módulos: **412 aprovados**.
  Ruff, formatação do módulo novo e diff passaram.
- Verificação adicional read-only do runtime local existente confirmou
  ausência de SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS, CREATE no
  schema public, TRUNCATE e TRIGGER nas duas tabelas. Isso é inspeção de ACL,
  não execução das regressões com credencial runtime; esse teste ainda falta.
- Gate de imutabilidade comportamental comprovado isoladamente. Continuam
  pendentes a cadeia/migration original, instalação versionada da proteção
  no ambiente reconstruído, aceitação com runtime, integração coletor/rotas/
  frontend e E2E. Sem servidor, commit, push ou deploy nesta rodada.

### Continuação — aprovação e auditoria com privilégios runtime efetivos

- `test_radar_runtime_restrito_db.py` executa os Services com o role local
  existente `sigeo_homologacao_runtime_20261006`, via SET ROLE em conexão
  dedicada. Não lê senha, cria role ou muda seus atributos globais. Grants
  USAGE/DML/sequences são concedidos somente no schema sintético descartável,
  sem tocar public ou o clone operacional. A fixture recusa role privilegiado.
- A conexão dedicada mantém o role durante commits/replay do Service. RESET
  ROLE é confirmado antes de devolver a conexão ao pool; falha no reset
  invalida a conexão. Não se reutiliza conexão privilegiada como fallback.
- **20 regressões novas passaram:** gestor/admin aprovam e repetem a mesma
  chave sem duplicação; colaborador/leitor/gestor inativo/admin excluído são
  bloqueados pelo Service; UPDATE/DELETE das provas e decisões são rejeitados
  pelos triggers mesmo com permissão DML; TRUNCATE, DISABLE TRIGGER, ALTER/
  DROP TABLE e CREATE TABLE são negados com SQLSTATE 42501 nas duas tabelas.
- Reexecução focada: **50 testes aprovados**. Matriz conjunta de 30 módulos:
  **432 testes aprovados**. Ruff de app e módulo novo, formatação e diff
  passaram. Tudo usa registros sintéticos e schemas removidos ao final.
- **Gate de privilégios efetivos runtime validado no schema de testes.**
  SET ROLE valida autorização PostgreSQL, não login por senha/pg_hba,
  credenciais da API ou grants após instalação por migrations. A cadeia
  histórica continua incompleta; esse teste não autoriza stamp ou liberação
  do app. Próximos gates: cadeia versionada e integração coletor/rotas/
  frontend/notificações, depois E2E com runtime da API e fontes reais.
- Nenhuma alteração na produção, no clone servido ou em servidores;
  nenhum commit, push ou deploy nesta rodada.

### Continuação — aviso de aprovação integrado à central existente

- Resolvida a incompatibilidade: o backend emitia `aprovacao_carteira`, mas
  o schema Zod do frontend rejeitava esse tipo. Contrato e rótulo agora aceitam
  **Entrada aprovada**, distinto de **Novo monitoramento**. Nenhuma nova rota
  de aprovação foi exposta e nenhum instrumento operacional foi incluído.
- O Repository resolve Convenio.id → numero em lote. O Service gera destino
  para Dados Oficiais com `busca` codificada na URL, sem exigir ou fabricar
  InstrumentoEquipamento. Referência ausente retorna destino nulo; IDs iguais
  em tabelas distintas não redirecionam para o instrumento errado. A busca
  já era persistida na URL pelo hook da página oficial.
- **9 regressões backend novas passaram:** aviso gerado pela aprovação real
  visível somente a gestor/admin destinatário ativo; colaborador/leitor/
  contas inaptas não recebem; colisão de PK entre entidades não altera link;
  referência ausente não inventa destino; GET /notificacoes serializa tipo,
  destino e contadores. Nesse teste HTTP, autenticação é substituída somente
  para validar leitura/serialização, não como prova de login ou CSRF.
- Frontend valida tipo/filtro, rótulo e abertura do aviso; mensagem permanece
  completa e visível conforme decisão anterior. Corrigida expectativa antiga
  de mensagem recolhida, sem mudar a UI para esconder o corpo.
- A suíte completa encontrou duas expectativas antigas: filtro de confirmação
  do Portal removido e texto de recolhimento de detalhes substituído. Testes
  atualizados para confirmação apenas como evidência, situação preservada e
  **Mais detalhes/Menos detalhes**. Removidos import duplicado do header e
  bloco E2E duplicado/obsoleto; a verificação responsiva atual permanece.
- Matriz backend de 31 módulos: **441 testes aprovados**. Suíte frontend
  completa: **223 testes em 61 arquivos aprovados**. Mypy (112 arquivos),
  Ruff, typecheck frontend, lint frontend completo, formatação dos arquivos
  selecionados e diff passaram. Warnings experimentais de localStorage do
  runtime Node foram observados; nenhuma mudança de sessão foi realizada.
- Dependências frontend existentes reutilizadas por symlink local ignorado
  de node_modules; nenhuma instalação ou mudança de lockfile. Não foi feita
  validação visual em navegador nem execução Playwright. Permanecem gates da
  cadeia Alembic, coletor/rotas operacionais e E2E com runtime/login reais.
  Sem servidor, migration operacional, commit, push ou deploy nesta rodada.

### Continuação — contrato gerencial de convênio descoberto restaurado

- Restaurado `convenio_descoberto` no enum Python e contrato Zod/rótulos,
  compatível com a migration histórica recuperada em quarentena. Rótulo
  **Novo convênio no Radar** é distinto de aprovação e inclusão no pós-repasse.
  `entidade_id` representa CandidatoLegadoRegistro.id; destino permanece nulo
  porque a triagem ocorre no Radar flutuante. Não resolver por PK de instrumento.
- Destinatários materializados são somente gestor/admin ativos e não excluídos.
  O Repository `criar_avisos_descoberta` prepara o lote com uma consulta de
  destinatários, sem commit próprio. Lote vazio não consulta; lote misto é
  rejeitado antes de escrita; ausência de gestores não amplia o escopo.
- **10 regressões SQL novas passaram:** matriz de seis perfis, colisão de
  identidade sem link falso, lote de três avisos/seis destinatários com uma
  consulta, rollback integral, ausência de gestores, rejeição de lote misto
  e lote vazio. Testes frontend verificam aceitação/filtro do novo tipo,
  rótulo, ausência de link/indicação de aprovação e ação de leitura.
- Matriz backend de 32 módulos: **451 testes aprovados**; frontend completo:
  **225 testes em 61 arquivos aprovados**. Mypy (112 arquivos), Ruff,
  typecheck/lint frontend completos, formatação selecionada e diff passaram.
- **Pendente:** conectar emissão à primeira descoberta oficial confirmada,
  deduplicar pelo histórico de captura elegível do recorte MS celebrado v2,
  testar replay/concorrência/perda e recuperação de confirmação/rollback.
  Nesta rodada o lote é uma capacidade testada, **não um job habilitado nem
  prova de notificação automática real**. Migração operacional do enum também
  depende da cadeia ausente; não aplicar arquivo em quarentena ao clone servido.
- Não foram modificados critérios de equipamento, aprovação, coleta real,
  servidores, cron, produção ou remoto. Nenhum commit, push ou deploy.

### Continuação em 14/10 — primeira descoberta oficial gera aviso transacional

- `registrar_descoberta` agora conecta planejamento/emissão do aviso no
  mesmo commit da captura. Responsabilidade separada em
  `services/avisos_descoberta_legado.py`; SQL histórico permanece no Repository.
  O job existente já chama esse Service, sem alteração de cron/workflow.
- Aviso somente para fonte `siconv_oficial`, critério
  `prioritarios_ms_celebrados_v2`, órgão 36000, confirmação atual no Portal
  e publicação presente. Snapshot diagnóstico, v1, ausência de escopo ou
  confirmação não notificam nem impedem futura descoberta oficial válida.
- Deduplicação consulta todo histórico de capturas oficiais elegíveis, sob
  o advisory lock já usado pela descoberta. Replay, alteração posterior da
  evidência e perda/retorno da confirmação não repetem aviso de novidade.
  Não se usa apenas a última captura nem um booleano mutável no candidato.
- `notificar_novos=False` permite baseline oficial explicitamente silenciosa:
  ela permanece registrada e replay futuro não dispara avisos antigos.
  Esse parâmetro é interno, não um campo da UI/HTTP. Fixture de recaptura/
  aprovação usa essa baseline para isolar sua transação sem apagar avisos.
- **12 regressões SQL novas passaram:** primeira descoberta/replay,
  quatro exclusões diagnósticas seguidas de confirmação oficial, baseline
  silenciosa, retorno da confirmação, mudança de evidência, número já na
  carteira, rollback após materializar destinatários, segundo candidato
  inválido e duas Sessions concorrentes com resultado único.
- Matriz de 33 módulos: **463 testes aprovados**; reexecução focada após
  reforçar o job: **29 aprovados**. Duas rodadas do job com downloads/HTTP
  simulados preservaram três candidatos e somente três avisos (um por
  candidato). Cleanup remove exclusivamente avisos/IDs sintéticos da fixture.
  Mypy (113 arquivos), Ruff, formatação selecionada e diff passaram.
- **Gate de emissão/deduplicação integrado ao fluxo local do Service/job.**
  Não houve consulta federal real, envio externo, migration operacional,
  liberação da aprovação, início de servidor ou habilitação de schedule.
  Cadeia Alembic, parâmetros operacionais de primeira carga, aceitação real
  das fontes e E2E com runtime/login seguem pendentes. Produção e remoto
  intactos; nenhum commit, push ou deploy nesta rodada.

### Continuação em 14/10 — comando local protegido e baseline operacional

- `scripts/descobrir_siconv_local.py` é entrada explícita para ensaios.
  Valida ambiente antes de importar o app, aceita limite inteiro 1–1000 e
  `--baseline-silenciosa`; padrão é incremental. CLI antiga do job delega
  para essa entrada protegida; o Service/job continuam testáveis internamente.
- `descoberta_local_guardas.py` aceita apenas staging exclusivo já validado
  pelo projeto ou banco dedicado de testes com TEST_DATABASE_URL explícito.
  URLs runtime/migration/teste precisam apontar para mesmo host/porta/banco.
  Produção, clone servido, base congelada, query de redirecionamento, URL
  ausente e opções PG herdadas são recusadas. Engine já carregada também é
  verificada contra o destino autorizado antes de iniciar a coleta.
- Job valida tipo estrito de limite/modo antes da captura. Modo
  `baseline_silenciosa`/`incremental` fica registrado nos detalhes da rodada;
  baseline passa `notificar_novos=False` sem apagar histórico ou inventar
  primeira carga por tabela vazia. O CLI exibe erro genérico sem URL/chave.
- **28 regressões adicionais passaram:** 26 guardas puras e dois ensaios
  integrados. No comando protegido com HTTP/downloads sintéticos, baseline
  registrou três candidatos sem avisos, replay permaneceu silencioso e novo
  quarto candidato gerou um único aviso; rodadas preservaram modos e
  contadores [3, 0, 1]. Engine carregada para outro banco falhou sem download.
- Matriz de 34 módulos: **491 testes aprovados**. Mypy de app e três scripts
  (**116 arquivos**), Ruff, formatação selecionada e diff passaram. `--help`
  do comando foi executado sem carregar fontes, conectar banco ou consultar API.
- **Não usar o CLI recuperado para produção:** ele está intencionalmente
  restrito a destinos locais; entrada operacional remota e schedule requerem
  etapa DevOps aprovada após cadeia/aceitação. Nenhum workflow, segredo, role,
  fonte federal real, clone operacional, servidor ou remoto foi alterado.
  Continuam pendentes migrations completas e E2E integrado. Sem commit/push/deploy.

### Continuação em 14/10 — central com login/cookies/CSRF reais e runtime SQL

- `test_central_radar_sessao_real_db.py` encadeia descoberta confirmada,
  recaptura, aprovação interna e notificações sob role SQL restrito, com
  triggers ativos em schema sintético. Em seguida faz login real em
  `/auth/login` e usa os cookies emitidos pelo backend nas rotas da central.
  Apenas get_db é redirecionado ao schema dedicado; autenticação, sessão,
  CSRF, autorização, Services e repositories não são substituídos.
- **8 regressões adicionais passaram:** gestor/admin veem os dois tipos e
  seus destinos corretos; leitura, arquivo, restauração e marcação em lote
  mantêm contador por destinatário e não afetam a outra sessão; colaborador/
  leitor logados recebem lista vazia e 404 ao tentar agir sobre aviso alheio;
  CSRF ausente/divergente bloqueia escrita; sem cookie/token inválido retorna
  401; logout revoga token anterior; usuário inativado perde acesso mesmo com
  cookie presente. Senhas e identidades são exclusivamente sintéticas.
- Helpers de preparação admitem notificação inicial explicitamente para
  este ensaio. Demais testes mantêm baseline silenciosa por padrão, sem
  apagar avisos para mascarar contadores ou duplicações. Conexão runtime
  dedicada continua com RESET ROLE antes de voltar ao pool.
- Matriz de 35 módulos: **499 testes aprovados**. Mypy (**113 arquivos**),
  Ruff, formatação do módulo novo e diff passaram. Login HTTP não devolve
  access_token no corpo; testes usam cookie e sessão persistida de verdade.
- **Gate HTTP autenticado do fluxo da central comprovado em ensaio sintético.**
  TestClient não é navegador, implantação ou prova de CORS/SameSite entre
  origens reais. Aprovação foi chamada internamente, não por rota pública.
  Persistência foi criada pela fixture, não pela cadeia Alembic incompleta.
  Portanto E2E visual, migrations completas e aceitação federal continuam
  pendentes. Nenhum servidor, fonte real, produção, workflow ou remoto foi
  alterado; nenhum commit, push ou deploy nesta rodada.

### Continuação em 14/10 — cadeia disponível executada em banco realmente vazio

- Alembic env aceita SQLAlchemy Connection explícita via Config.attributes,
  sem abrir outro banco por Settings quando ela é fornecida. CLI normal
  mantém a resolução já existente; não foi alterada migration compartilhada.
  Esse suporte permite ensaio programático com destino previamente validado.
- `test_cadeia_migrations_recuperacao_db.py` cria PostgreSQL vazio com nome
  gerado exclusivo, sem clonar dados nem usar Base.create_all; executa a
  cadeia real até `b5c6d7e8f9a0`, reverte a última revisão em histórico vazio
  e reaplica. O banco exato do ensaio é removido ao final, inclusive em falha;
  não há encerramento de sessões alheias ou exclusão por prefixo/glob.
- A execução confirmou estruturalmente a lacuna: cadeia disponível cria
  triagem, mas não recaptura, componentes, recaptura_id/convenio_id na decisão
  ou outras expansões recuperadas só nos modelos. Não autoriza reiniciar app
  com modelo novo nem adotar por stamp o schema e6 do clone sobrevivente.
- **Novo bloqueante RB-001: rollback histórico até base falha.** A migration
  `9c2e4f7a1d38` cria alert_type explicitamente e depois op.create_table tenta
  criar o mesmo enum novamente (SQLSTATE 42710). Não é tipo órfão: o upgrade
  histórico já remove o tipo. O diagnóstico inicial de órfão foi corrigido.
- Regressão preservada com xfail estrito, somente ProgrammingError 42710
  relativo a alert_type; outro erro falha normalmente e sucesso futuro vira
  XPASS bloqueante até retirar a marca. **Não considerar rollback completo
  aceito.** Antes de qualquer aceite/deploy, definir solução compatível com
  imutabilidade das migrations compartilhadas e testar rollback por restauração
  de snapshot quando não for seguro atravessar revisões antigas. Não editar
  a revisão aplicada nem usar DROP manual no clone para esconder a falha.
- Matriz de 36 módulos: **500 testes aprovados e 1 falha conhecida (xfail)**,
  não 501 aprovados. Mypy de app (113 arquivos), Ruff, formatação e diff
  passaram. Bancos descartáveis criados pelo teste foram removidos; nenhum
  clone operacional, banco-base congelado ou produção foi migrado/removido.
- Próximos gates: estratégia de rollback preservadora e reconstrução aditiva
  das expansões ausentes com identidade nova, sem inventar IDs históricos;
  depois aceitação local com schema versionado e E2E. Nenhum servidor, cron,
  commit, push ou deploy nesta rodada. Produção e remoto permanecem intactos.

### Continuação em 14/10 — rollback por snapshot ensaiado sem reescrever histórico

- `test_rollback_snapshot_recuperacao_db.py` executa pg_dump/pg_restore reais
  entre dois PostgreSQL descartáveis criados do zero. A origem é migrada pela
  cadeia disponível e recebe candidato/captura/decisão exclusivamente sintéticos.
  Todos os nomes/e-mails institucionais estáticos inseridos pela migration
  antiga são substituídos por identidades sintéticas **antes de exportar**.
- Dump custom com modo 0600, digest SHA-256 conferido, sem senha em argumento
  ou URL de processo. Opções PG herdadas são removidas do subprocesso. Restore
  usa exit-on-error e single-transaction, em destino comprovadamente vazio;
  não há --clean, restore no clone servido ou remoção de tabelas operacionais.
- Verificados hashes de dados de todas as tabelas, revisão Alembic, enums,
  colunas/tipos/defaults/identity, PKs, FKs, unicidades, índices e CHECKs. O
  restore pode redistribuir casts em arrays; a equivalência foi conferida pelo
  plano normalizado do PostgreSQL, sem apagar casts por regex ou ignorar checks.
- Uma mudança sintética de schema/dado após o snapshot ficou ausente no
  destino restaurado, enquanto a origem permaneceu no estado posterior.
  Trigger append-only continuou rejeitando DELETE da decisão com 23514;
  sequence restaurada gerou novo ID sem colisão. Nenhuma revision falsa ou
  mutação de decisão histórica foi usada na simulação.
- Matriz de 37 módulos: **501 testes aprovados e 1 xfail conhecido**.
  Mypy de app (113 arquivos), Ruff, formatação selecionada e diff passaram.
  Bancos descartáveis foram removidos após o ensaio. Artefato temporário do
  pytest contém somente dado sintético/protegido; não é backup operacional.
- **Gate de restauração do snapshot sintético validado.** RB-001 não foi
  corrigido: downgrade histórico até base continua falhando. A alternativa
  de rollback é restauração controlada, não reescrita de migration aplicada.
  O ensaio usa --no-owner/--no-acl; grants/roles e troca de conexão/serviço
  precisam de aceite operacional separado, não foram provados neste teste.
- Próximo gate: reconstrução aditiva das expansões ausentes, com revision
  nova e rollback preservador; depois schema versionado compatível com app e
  E2E. Não foi feito backup/restore de banco real, iniciado servidor, alterada
  automação ou realizada qualquer escrita na produção/remoto. Sem commit/deploy.

### Continuação em 14/10 — primeira expansão aditiva reconstruída

- Nova revisão `42d8a91c6f03`, filha da revisão existente `b5c6d7e8f9a0`:
  escopo MS/celebração, elegibilidade vinculada à rodada oficial e evidências
  de componentes. Não reutiliza IDs perdidos nem altera migrations históricas.
- Capturas antigas mantêm conteúdo/identidade; escopo, órgão, datas e rodada
  permanecem nulos. O default de elegibilidade mantém compatibilidade, mas não
  atribui escopo oficial às capturas antigas nem as torna aprováveis.
- CHECKs rejeitam escopo desconhecido, órgão diferente de 36000, celebração
  incompleta e inelegibilidade sem motivo/rodada. Componentes exigem captura
  existente, programa numérico e unicidade da evidência por programa/nome.
- Downgrade adquire locks transacionais e bloqueia antes de remover dados
  quando há evidências novas. Up/down/up sem evidência nova preserva capturas
  históricas. Não é autorização para reverter a cadeia histórica inteira.
- Testes históricos de cadeia e snapshot agora fixam explicitamente a revisão
  histórica b5, para não confundir suas provas com o novo head.
- Executado somente em PostgreSQL descartável, sem stamp ou migration no
  clone servido. Matriz de 38 módulos: **515 aprovados e 1 xfail conhecido
  RB-001**. Inclui 14 provas novas de migration, vínculo de inelegibilidade
  e reversão preservadora. Ruff, formatação selecionada, mypy de app (113
  arquivos) e diff passaram. Nenhuma falha inesperada na rodada final.
- Ainda faltam migrations aditivas de recaptura imutável, aprovação auditada
  e tipos de notificações, compatibilidade do schema e E2E. Servidores não
  habilitados nesta etapa. Produção/remoto intactos; sem commit ou deploy.

### Continuação em 14/10 — recaptura, aprovação e avisos versionados

- Revisões novas aditivas `73b91e4c2a06` → `84c02f5d3b17` → `95d13a6e4c28`,
  encadeadas à expansão de escopo. Não inventam predecessores históricos;
  não foram aplicadas ao clone sobrevivente nem a banco compartilhado.
- Prova oficial tem FKs de candidato/captura/rodada, identidade composta,
  unicidade por candidato/rodada, NUMERIC sem arredondamento imposto e checks
  de hash/situação/valor. JSONB é snapshot de auditoria; as relações ficam
  normalizadas. Trigger confirmado no schema sobrevivente impede UPDATE/DELETE.
- Decisão recebe vínculos nullable de recaptura/convênio; aprovação exige
  ambos e outros estados proíbem esses vínculos. FKs compostas impedem usar
  prova de outra captura/candidato; unicidades impedem reutilizar prova ou
  convênio. Trigger histórico de decisão permanece ativo sem alterações.
- Up/down/up preserva decisões antigas. Downgrade bloqueia antes de apagar
  provas ou vínculos aprovados, com locks na mesma transação. Não exporta,
  remove ou modifica auditoria para forçar reversão.
- Enum recebe `aprovacao_carteira` e `convenio_descoberto` em expansão
  idempotente. Autocommit é obrigatório para tornar novos literais utilizáveis;
  eventual retomada usa IF NOT EXISTS. Sem mensagens novas, rollback mantém
  literais (contração bloqueante separada); com mensagens, bloqueia reversão.
- Teste de pg_dump/pg_restore agora cobre b5 histórico **e** o novo head com
  prova sintética: compara schema/dados/enums e comprova trigger restaurado.
  Continua sem provar grants/roles, corte operacional ou restore de banco real.
- Testes de migration usam cadeia Alembic real em bancos vazios descartáveis,
  sem Base.create_all/stamp. Matriz retomada em 15/10: **540 aprovados e 1
  xfail RB-001**; Ruff e mypy de app passaram. O fluxo versionado adicional
  descrito abaixo ainda não fazia parte dessa contagem.
- Ainda pendentes: compatibilidade global do schema/aplicação, decisão de
  adoção da cadeia reconstruída frente ao clone e ao histórico compartilhado,
  E2E e gates completos atuais. RB-001 histórico segue sem alteração.
  Não habilitar aprovação, servidor ou automação antes desses gates.
- Sem commit/push/deploy, escrita em produção ou migração do clone servido.

### Continuação em 15/10 — services sobre schema migrado do zero

- `test_fluxo_radar_schema_versionado_db.py` cria banco descartável, aplica
  Alembic até `95d13a6e4c28` e executa descoberta, recaptura, revisão,
  aprovação e replay com services/repositories reais. Não usa create_all,
  stamp, clone operacional, HTTP federal ou mocks das unidades de domínio.
- Usuários inseridos pela migration histórica são anonimizados e inativados
  nesse banco descartável. Somente quatro identidades sintéticas participam
  do teste; não são emitidos e-mails nem exportados dados institucionais.
- Admin e gestor aprovam, preservando literalmente prestação de contas e
  NUMERIC de nove casas decimais. Replay não duplica carteira, prova, decisão,
  marcador ou avisos. Descoberta e aprovação geram avisos distintos, destinados
  exatamente aos dois perfis gerenciais; não criam monitoramento pós-repasse.
- Colaborador/leitor e prova acima de 24 horas são bloqueados sem inclusão
  parcial de convênio/decisão nem notificação de aprovação.
- Todos os modelos registrados têm tabela e colunas correspondentes na cadeia
  reconstruída. A verificação permite colunas extras de expand-contract;
  não comprova equivalência global de tipos/defaults/índices/checks, grants,
  desempenho ou compatibilidade com a revisão e6 do clone sobrevivente.
- **6 testes específicos aprovados; matriz de 40 módulos com 546 aprovados
  e 1 xfail RB-001 em 15/10.** Ruff de app/arquivos novos, mypy de app (113
  arquivos), formatação selecionada e diff passaram. Não equivale ao aceite
  de toda a aplicação, CI remoto ou E2E no navegador.
- Próximo gate: confrontar o schema reconstruído com o clone preservado em
  leitura, resolver a estratégia de adoção sem stamp fictício e então preparar
  runtime/E2E isolado. Não habilitar servidor, aprovação pública ou automação
  antes dessa decisão. RB-001 histórico permanece conhecido.
- Sem commit/push/deploy, migração do clone ou escrita na produção.

### Continuação em 16/10 — comparação do clone e restauração da exclusão de escopo

- Comparação de metadados entre o clone `e6a7b8c9d0f1` e banco descartável
  migrado: ambos com 36 tabelas. Clone lido em transação REPEATABLE READ,
  `transaction_read_only=on` confirmado antes/depois; sem DDL/DML ou exportação.
- Encontradas três diferenças de tamanho e a coluna ausente
  `convenio.fora_escopo_equipamentos`. A implementação recuperada também não
  aplicava essa marcação nas leituras da carteira: risco de reexibir obras.
- Revisão corretiva nova `a6e24b7f5d39` restaura boolean NOT NULL/default false
  e limites `criterio_escopo(32)`, `orgao_superior(5)`, `hash_conteudo(64)`.
  Verificação anterior ao ALTER impede truncar evidências; rollback bloqueia
  quando descartaria decisões de ocultação. Aplicada somente em descartáveis.
- Predicado único no Repository é usado em listagem/contagem, detalhe e
  exportação. Registros ocultos permanecem conhecidos pela descoberta, para
  não retornarem ao Radar. Não há exclusão física nem reclassificação automática.
- Clone contém seis marcações de exclusão; todas permaneceram intocadas.
  Nova migration não inventa backfill desses casos em outros ambientes:
  adoção/cópia posterior deve preservar as decisões existentes explicitamente.
- Nova comparação confirmou colunas/tipos/defaults/identities, PKs/FKs,
  unicidades, índices, enums e definições de triggers sem diferenças nesses
  grupos. Restam: CHECK numérico versus alfanumérico da identidade do Radar,
  representações diferentes de casts de arrays em CHECKs e formatação da função
  de recaptura (ambas rejeitam mutação com P0001 nos testes já executados).
- Identidade alfanumérica não foi liberada só porque o clone a aceita: os
  contratos recuperados ainda exigem dígitos; tratar coerência integral antes
  de qualquer importação/adoção. Não declarar os schemas equivalentes.
- Dez regressões novas sobre Alembic real cobrem filtros da carteira,
  contagem/relatório, detalhe, preservação do registro/conhecidos, limites e
  rollback; snapshot do novo head inclui uma exclusão sintética.
- Checagem metodologia-sync confirmou ausência de impacto em cobertura,
  déficit, distância, produtividade e execução por família; doc metodológica
  não requer mudança. Ruff, mypy de app (113 arquivos), formatação selecionada
  e diff passaram. Matriz de 41 módulos: **557 aprovados e 1 xfail RB-001**;
  bateria adicional de 5 módulos de relatórios/contratos: **60 aprovados**.
  São resultados locais, não gates de cobertura completos nem CI remoto.
- Gate operacional permanece fechado: sem stamp, migration no clone,
  servidor, commit/push/deploy ou escrita na produção. Próximo bloco é resolver
  identidade/adotar dados preservando histórico e depois runtime/E2E isolado.

### Continuação em 16/10 — identidade textual coerente com o cache da fonte

- Diagnóstico read-only do cache local `siconv_convenio.csv.zip`, SHA-256
  `7b4d1b9ab5c822184bffae77f993b6e3c8a705f22a2f3d86f7aa4faa5c3e4a34`:
  283.283 identificadores numéricos e 2.460 alfanuméricos. A validação numérica
  anterior, aplicada antes do filtro institucional, podia abortar a carga toda.
  Não é consulta atual à API nem comprovação de elegibilidade desses registros.
- Contrato único `NumeroConvenioLegado` aceita somente dígitos/letras ASCII
  maiúsculas e preserva o texto integral (inclusive zeros à esquerda). Aplicado
  no dump, candidato, convênio recapturado, filhas e identificação do Portal;
  proposta/item/programa continuam numéricos. Não há strip de letras, conversão
  para inteiro, normalização de minúsculas ou cruzamento aproximado.
- Revisão nova `b7f35c806e4a`, filha de a6, alinha o CHECK à expansão histórica
  recuperada em quarentena e ao clone. Não reutiliza a revisão histórica nem
  altera seus predecessores. Down bloqueia com identidades alfanuméricas, sem
  apagar linhas ou remover o CHECK; up/down/up numérico foi testado.
- MS 36000, equipamento/componente, celebração, confirmação do Portal,
  identidade exata entre fontes e frescor de 24 horas continuam obrigatórios.
  Convênios alfanuméricos de outro órgão, sem publicação ou de obras não entram
  no recorte e não impedem descobrir um convênio válido do mesmo lote.
- Quinze regressões novas: formato válido/inválido nos contratos, lote misto,
  identidade divergente, fluxo real de aprovação e rollback da migration.
  Aprovação sintética preserva letras na carteira/pagamento/notificação.
- Diagnóstico executou o contrato sobre **285.743 identidades do cache**, sem
  erro e com SHA-256 antes/depois idêntico. Não descarregou fontes novamente,
  não chamou Portal nem inseriu esses dados em qualquer banco.
- Snapshot do head novo inclui identidade alfanumérica e decisão sintética
  de exclusão, além da prova imutável. Matriz de 42 módulos: **573 aprovados
  e 1 xfail RB-001**. Ruff, mypy de app (114 arquivos), formatação selecionada
  e diff passaram; não são gates de cobertura completos nem CI remoto.
  Bateria adicional de relatórios/contratos reexecutada: **60 aprovados**.
- Nova comparação read-only entre e6 preservado e b7 reconstruído: 36 tabelas,
  sem diferença de colunas/tipos/defaults/identities, PK/FKs, unicidades,
  índices, enums ou triggers. Os sete CHECKs com cast diferente produziram
  filtros idênticos no EXPLAIN normalizado do PostgreSQL; não se apagaram casts
  por regex. A função de recaptura só difere na formatação do mesmo RAISE.
- **Gate de estrutura comparada atendido**, não de adoção: revisões/históricos
  Alembic continuam distintos. Ainda faltam transferência/validação dos dados
  protegidos para destino efetivamente migrado, grants/roles, runtime e E2E.
  Não usar a semelhança estrutural para stamp ou para executar head sobre e6.
- Clone e produção intocados; sem stamp, migração em banco compartilhado,
  ativação de job, servidor, commit/push ou deploy.

### Continuação em 16/10 — ensaio transacional de transferência entre descartáveis

- `scripts/transferencia_sintetica_recuperacao.py` implementa **somente ensaio
  sintético**, sem CLI e sem aceitar clone/base preservados, bancos remotos,
  URLs com opções ou bancos fora de `sigeo_test_migrations_<uuid>`.
- Origem tem snapshot REPEATABLE READ read-only; destino é realmente migrado
  a b7. Manifesto obtido imediatamente após Alembic confirma o bootstrap antes
  de qualquer escrita. Destino modificado/ocupado ou revisão não validada
  aborta. Esse manifesto é interno do ensaio, não autorização recebida da UI.
- Transação exclusiva no destino substitui somente seeds geradas pelas
  migrations (`user`, `config_decision`, `equipamento_catalogo`) no descartável.
  Não remove dados do clone, não altera decisões originais nem desativa
  triggers/FKs, session_replication_role ou constraints. Em falha, bootstrap
  e dados copiados são revertidos. Não executar isso em banco compartilhado.
- COPY em streaming preserva IDs, NUMERIC, timestamps e JSON/texto; hashes
  canônicos de linhas são calculados no PostgreSQL sem converter dinheiro em
  float. Comparadas as **35 tabelas de dados**, excluindo somente alembic_version.
  Cobertura estrutural não significa que todas tinham alto volume/linhas.
- Resolvidos explicitamente os ciclos candidato/captura e competência/execução:
  só os ponteiros mutáveis são preenchidos na segunda fase, com FKs ativas.
  Publicação de Tomógrafo e Ressonância mantém seu vínculo por família. Ações
  com autorreferência para linha posterior são copiadas sem apagar histórico.
- Sequências preservam o high-water mark (inclusive IDs consumidos sem linha),
  com RESTART transacional, não setval no processo de transferência. Falha
  tardia real de sequência inválida reverte também RESTARTs já executados.
- Testes usam duas bases criadas do zero, source a6→target b7 e b7→b7, sem
  inventar revisões ou stamp. Provam hashes iguais, ponteiros, flags de exclusão,
  gatilhos imutáveis ativos, próximos IDs, rejeição de replay/destino ocupado,
  origem sem read-only, revisão não validada e rollback diante de CHECK real.
- Somente credenciais/identidades sintéticas entram nesse ensaio. A cópia real
  protegida ainda exige guardas próprias de origem/destino e privacidade,
  além de preservar auditoria, excluir sessões reutilizáveis e validar roles.
  **Não é ainda uma ferramenta operacional de adoção do clone e6.**
- **13 regressões novas aprovadas** (8 de integração e 5 guardas de URL).
  Matriz de 44 módulos: **586 aprovados e 1 xfail RB-001**. Ruff, formatação
  selecionada, mypy de app + ferramenta (115 arquivos) e diff passaram. Não
  são gates de cobertura completos, teste de volume real ou CI remoto.
- Próximo gate: adaptador específico para o clone protegido, verificando
  privacidade e tratamento das sessões, sem relaxar as guardas do ensaio;
  depois permissões de runtime e E2E. Nenhum servidor foi iniciado e não houve
  transferência do clone real, commit/push/deploy ou escrita em produção.

### Continuação em 16/10 — inventário protegido antes da adoção do clone

- `scripts/preflight_clone_recuperacao.py` é inventário **sem escrita e sem
  CLI**, não ferramenta de adoção. Não carrega Settings nem lê hashes de senha
  ou token, nomes, e-mails ou payloads para a saída: só retorna contagens.
  Aceita apenas o clone local preservado identificado abaixo ou bancos
  sintéticos descartáveis; rejeita remoto, base congelada, banco compartilhado
  de testes, opções de URL, revisão diferente e conexão sem REPEATABLE READ
  read-only. Não amplia o escopo permitido pelo copiador sintético.
- Diagnóstico do snapshot de `sigeo_homologacao_clone_20261006`, revisão
  `e6a7b8c9d0f1`: **28 usuários**, **6 identidades fora do padrão do protetor**,
  **0 convites com segredo/validade**, **489 registros de refresh**, dos quais
  **46 não revogados e ainda não expirados**, **258 auditorias sem o marcador
  exato de proteção**, **0 provas imutáveis de recaptura** nesse snapshot.
  Nenhuma linha foi exportada, reescrita ou apagada; revisão e read-only
  conferidos antes/depois. Diagnóstico efêmero em `/private/tmp`, não job.
- As 46 sessões são potencialmente válidas pelo critério conservador de
  revogação/expiração, **não** prova de login possível: não avalia segredo,
  idle timeout, status do usuário ou chave JWT. Também não indica incidente
  na produção. As 6 identidades e 258 auditorias podem ter sido criadas pelos
  testes locais; precisam de verificação protegida de proveniência, não de
  descarte automático. Marcador/padrão correto não certifica anonimato.
- **Adoção direta não liberada.** Política para o futuro destino: substituir
  todas as credenciais copiadas (hash não comprova segredo exclusivamente
  local), invalidar convites e sessões sem reutilizar os tokens originais,
  preservar IDs/vínculos/atores e auditoria, provisionar acesso de teste
  explicitamente com segredo local separado. Não alterar o clone sobrevivente
  para obter esses resultados. Provas imutáveis, quando existirem, exigem
  avaliação específica sem desabilitar gatilhos ou reescrever seu hash.
- O inventário é gate mínimo de acesso, não varredura completa de texto livre,
  evidência oficial, backups ou permissões. Ainda pendentes: política executável
  e transacional no destino descartável, tratamento de dados pessoais com
  proveniência, manifesto explícito das diferenças autorizadas, grants da
  role de runtime sem DDL/superuser, nova chave local e E2E no schema migrado.
- Testes adicionados cobrem contagens, convite já expirado, sessões revogadas
  e expiradas, prova imutável preservada, hashes integrais antes/depois,
  rejeição de URL/revisão/isolamento e bloqueio real de UPDATE pelo PostgreSQL
  (`25006`). Não há rota nova, botão habilitado, servidor iniciado, cópia do
  clone, alteração de produção, commit/push/deploy ou acionamento de workflow.
- Matriz ampliada para 46 módulos: **596 aprovados e 1 xfail histórico
  RB-001**, além do diagnóstico read-only separado (1 aprovado). Ruff,
  formatação selecionada, mypy de app + ferramentas (116 arquivos) e
  `git diff --check` passaram. Não equivale a cobertura integral, E2E de
  navegador, aprovação para adoção do clone ou CI remoto.

### Continuação em 16/10 — neutralização transacional de acesso no destino sintético

- `scripts/neutralizar_acesso_sintetico.py` executa a política de acesso
  **somente em banco descartável sintético** `sigeo_test_migrations_<uuid>`
  realmente migrado a b7. Sem CLI, Settings/auth, endpoint, novo login,
  chamada externa ou aceitação do clone/base protegidos. Nenhuma guarda do
  copiador foi relaxada para aceitar dados reais.
- Manifesto integral de todas as tabelas precisa coincidir sob locks antes
  de qualquer mudança. A rotina usa transação própria; não aceita transação
  anterior, destino alterado, remoto, opções de URL ou revisão desconhecida.
  Lock e statement timeout são locais à transação, só neste descartável.
- Contas copiadas ficam inativas; senhas são substituídas por Argon2id de
  segredo aleatório descartado, não por senha padrão conhecida. Convites e
  validade são zerados. Refresh tokens recebem hashes aleatórios novos e
  revogação; datas de revogação já existentes são mantidas. Não há DELETE,
  reaproveitamento de segredo, token emitido ou credencial exibida/devolvida.
- Allowlist de diferenças: `user.password_hash/status/activation_token_hash/
  activation_expires_at` e `refresh_token.token_hash/revoked_at`. Todo o resto
  precisa manter hashes canônicos e contagens, incluindo demais colunas de
  usuário/sessão, IDs, papéis, atores, auditoria, decisões, provas imutáveis,
  flags de exclusão e vínculos. Pós-condições conferem também a senha/hash
  efetivamente gravados: trigger que retenha segredo antigo causa rollback.
- Tokens são processados por chave em lotes de 500; teste com **502 sessões**
  atravessa a fronteira do lote. Valores de dinheiro permanecem no manifesto
  original sem conversão em float. Retorno contém apenas duas contagens.
  Erros SQL são substituídos por erro estático após rollback, sem propagar
  detalhes de linha/parâmetros do driver.
- Ensaio com duas bases migradas: transferência sintética completa, isolamento
  só no destino e manifesto da origem read-only intacto. Testes cobrem replay,
  destino alterado, revisão/URL/transação inválidas, falha SQL após atualizar
  usuários, trigger que altere nome indevidamente e triggers que preservem
  senha/token antigos. Todos exigem reversão integral em falha.
- TestClient HTTPS usa autenticação/cookies/CSRF/SQL reais no destino copiado,
  sem mock das regras de acesso: cookie antigo funciona antes; após isolamento,
  access/refresh e senha anterior são recusados, convite e redefinição antigos
  são inválidos. Reativação isolada da conta não ressuscita sessão nem senha.
  A chave JWT efêmera permanece igual durante o teste, provando invalidação
  no banco independentemente da futura chave distinta do ambiente local.
- **Limite explícito:** cópia e neutralização são duas transações no ensaio,
  em destino sintético sem app servido. Não autoriza uma janela operacional
  com credenciais copiadas; adaptador real deverá manter o destino inacessível
  até concluir os gates, ou integrar transformação na transação de adoção.
  Esta rotina não protege nomes/texto/evidências nem cria usuário de teste.
- Próximos gates: verificar proveniência das identidades/auditorias e demais
  textos protegidos, adaptar adoção sem afrouxar guardas, provisionar acesso
  local separado e chave própria, validar permissões de runtime e E2E de
  navegador. O rollback histórico RB-001 também segue pendente. Nenhum clone
  real foi copiado/alterado, servidor iniciado, commit/push/deploy realizado,
  job habilitado ou operação de produção executada.
- **15 regressões novas aprovadas** (9 casos de integração e 6 guardas de
  URL). Matriz de 48 módulos: **611 aprovados e 1 xfail histórico RB-001**.
  Ruff, formatação selecionada, mypy de app + ferramentas (117 arquivos) e
  diff passaram. São testes locais de integração/HTTP, não E2E de navegador,
  gates integrais de cobertura, CI remoto ou aceite do clone protegido.

### Continuação em 16/10 — proteção de identidade e auditoria antes da gravação

- O ensaio sintético agora oferece modo explícito
  `proteger_identidades_auditoria=True`. **As mesmas guardas de bancos
  descartáveis permanecem**: não aceita clone/base protegidos ou produção.
  O modo integral anterior continua disponível para regressões de cópia fiel,
  sem ser apresentado como fluxo seguro para dados pessoais reais.
- No modo protegido, projeção SQL na origem read-only substitui `user.name`
  por `Usuário local <id>`, `user.email` por endereço sintético individual e
  `audit_log.details` pelo marcador de proteção. Campos nulos de detalhes
  também passam a esse marcador. Conteúdo privado desses três campos não
  atravessa COPY nem é gravado temporariamente na tabela do destino.
- Manifesto esperado usa a mesma allowlist de projeções, comparado com o
  destino efetivamente gravado. Contagens e todos os demais campos/tabelas
  permanecem iguais, incluindo IDs, autoria, entity/action/data da auditoria,
  decisões, provas imutáveis, vínculos por família, exclusão de obras e valores
  exatos. Não é edição do histórico original: ele permanece na origem intacta;
  os detalhes privados da cópia têm descarte intencional conforme política
  de homologação já aprovada, sem apagar o evento de auditoria.
- Testes criam dados exclusivamente sintéticos em duas bases migradas. Triggers
  BEFORE INSERT no destino exigem os três campos protegidos: provam tratamento
  pré-gravação, não UPDATE corretivo posterior. Verificadas idempotência da
  projeção, preservação de autoria/metadados, manifesto integral da origem e
  encadeamento com a neutralização de acesso implementada no bloco anterior.
- Falha real de trigger no COPY de auditoria reverte também usuários já
  inseridos e restaura o bootstrap. Driver psycopg pode incluir a linha do COPY
  no erro; modo protegido agora substitui erros SQL/psycopg por mensagem fixa
  somente após rollback, sem contexto de linhas/parâmetros. O modo integral
  sintético mantém os erros específicos necessários às regressões anteriores.
- Tentativa de comparar proveniência com a referência congelada foi impedida
  porque `sigeo_homologacao_base_20261006` **não aceita conexões**, conforme sua
  proteção original. Não reabri a base, não alterei flags de catálogo nem
  declarei os seis usuários/258 eventos como dados necessariamente locais.
  A comparação ficou inconclusiva; não é resultado positivo de privacidade.
- **Limite:** este modo cobre somente identidade de usuário e corpo privado
  de auditoria; não certifica textos internos, nomes em outros campos ou
  payloads oficiais. Recaptura imutável não é saneada por UPDATE, nem seu hash
  é reescrito. Adoção real continua bloqueada até validar a proteção restante
  e implementar o adaptador específico, permissões e acesso local separado.
- Nenhum servidor iniciado, banco preservado copiado/alterado, produção
  acessada, commit/push/deploy ou workflow ativado nesta rodada.
- **3 regressões novas aprovadas**. Matriz de 49 módulos: **614 aprovados e
  1 xfail histórico RB-001**; Ruff, formatação selecionada, mypy de app +
  ferramentas (117 arquivos) e diff passaram. A tentativa de diagnóstico da
  referência congelada falhou por bloqueio de conexão e não integra esse
  resultado. Sem gate integral de cobertura, CI remoto ou E2E de navegador.

### Continuação em 16/10 — varredura delimitada de textos/payloads e checklist final

- `scripts/inventario_textos_clone.py` examina, em snapshot read-only, todos
  os campos JSON/JSONB do schema público e os campos pessoais/internos
  delimitados, mensagens de notificação e nome de arquivo de referência.
  Retorna só tabela/coluna/contagens/tipos de sinal, nunca células, caminhos
  JSON pessoais ou valores. Reutiliza guardas de loopback, banco e revisão.
- `sinais_privacidade_clone.py` detecta e-mail fora dos marcadores aceitos,
  CPF/telefone formatados, segredo em URL e chaves pessoais sem marcador
  em JSON aninhado; nomes/textos internos seguem o padrão do protetor.
  Não reclassifica CPF livre de 11 dígitos como identificador automaticamente:
  identidades oficiais/NUP/valores permanecem intactos. JSON é só examinado,
  nunca serializado de volta, re-hasheado ou usado para cálculo financeiro.
- Diagnóstico separado no clone preservado e6, revisão e read-only conferidos
  antes/depois: **23 campos / 5.164 células não nulas**. Achados: `user.name`
  (6/28), `user.email` (6/28), `audit_log.details` (38/1.555 com sinais; 2
  também com e-mail). Os 38 não contradizem as 258 auditorias sem marcador
  do inventário anterior: ausência de marcador e sinal detectável são
  critérios diferentes. Nenhum valor pessoal foi emitido/exportado.
- **Não houve sinais fora dos campos já cobertos pela projeção privada**
  nesse snapshot. `validar_achados_cobertos` bloqueia inventário vazio ou
  achado em campo não tratado, inclusive prova imutável. Gate delimitado
  passou condicionado à aplicação da projeção no destino; não é certificado
  de anonimização nem autorização para copiar sem guardas. Nomes em texto
  arbitrário, aliases de chave não catalogados e formatos não reconhecidos
  podem escapar do detector; continua necessária política conservadora de cópia.
- Testes incluem JSON aninhado, marcadores, identidade oficial de 11 dígitos,
  origem/hash de prova preservados, recusa de conexão com escrita e bloqueio
  de prova com sinal pessoal. Mensagens de falha de validação de JSON são
  substituídas por erro fixo sem conteúdo. Não modifica dados ou gatilhos.
- Checklist consolidado no início deste documento agora separa cinco gates
  locais restantes da publicação autorizada, evitando somar pendências
  históricas já resolvidas. Servidores, cron e aprovação pública permanecem
  desligados; sem acesso/mutação de produção, commit/push ou deploy.
- **17 testes novos aprovados**; matriz de 51 módulos: **631 aprovados e 1
  xfail histórico RB-001**, além do diagnóstico read-only separado (1 aprovado).
  Frontend revalidado: **225 testes / 61 arquivos**, lint e typecheck aprovados.
  Ruff, formatação selecionada, mypy de app + ferramentas (119 arquivos) e
  diff passaram. Ainda não são suíte backend integral, gate de cobertura,
  build/E2E de navegador, CI remoto ou aceite de publicação.

### Continuação em 16/10 — adoção sintética integral em uma transação

- `adotar_sintetico_atomico` reúne varredura de privacidade no snapshot da
  origem, projeção privada, COPY, vínculos cíclicos, comparação de manifestos,
  neutralização de usuários/convites/sessões e restauração de sequências na
  **mesma transação do destino**. Não permite omitir proteção/neutralização.
  O novo caminho substitui a limitação de duas transações dos ensaios
  separados anteriores, que continuam disponíveis para regressão isolada.
- As guardas de banco continuam aceitando **somente descartáveis sintéticos**;
  a composição usa origem b7 em REPEATABLE READ read-only e destino novo
  migrado a b7, com manifesto de bootstrap. Não aceita clone e6, base
  congelada, banco compartilhado de testes, remoto ou opções de URL.
  Não existe commit intermediário de credenciais copiadas neste fluxo.
- Neutralização tem núcleo interno sem commit/rollback próprio, chamado só
  sob a transação do orquestrador; o ensaio isolado mantém sua transação
  própria e recusa uma preexistente. Erro SQL/COPY no orquestrador chega ao
  chamador como mensagem fixa somente depois do rollback integral.
- Manifesto/projeções/guardas de ensaio extraídos para
  `scripts/integridade_recuperacao.py`, evitando dependência circular entre
  transferência, inventário e acesso. Imports públicos anteriores de
  `IntegridadeTabela`/`integridade_tabelas` continuam compatíveis. Não é um
  kernel que aceite qualquer conexão nem um relaxamento de validação.
- Integração usa bancos realmente migrados, 502 sessões, convite vigente,
  decisão já protegida, prova imutável, valor NUMERIC de nove casas, obra
  excluída e sequência consumida até 500. Compara origem antes/depois,
  contagens de todas as tabelas e allowlist de diferenças; no sucesso,
  destino tem contas inativas, marcadores privados e nenhuma sessão/convite
  reutilizável. Trigger de imutabilidade da prova permanece ativo.
- Falha SQL real em UPDATE de usuário, **após o COPY**, devolve o destino ao
  bootstrap original: demonstra que a cópia não tinha sido commitada antes
  da neutralização. Falha tardia de sequência também reverte dados/acesso e
  RESTARTs anteriores. Sinal pessoal em JSON de convênio ou em nova prova
  bloqueia antes da cópia; prova antiga nunca é modificada para simular erro.
- Helper de histórico sintético ganhou somente parâmetro opcional de
  justificativa para inserir prova de decisão já protegida nos novos testes;
  default anterior preservado. Não se faz UPDATE em decisão append-only.
- **Ainda falta o adaptador específico para adotar o clone preservado e6**,
  com destino privado validado, conferência do schema/revisões e gates no
  mesmo snapshot. Não se deve ampliar este ensaio para aceitar o clone por
  regex/permissão genérica nem usar stamp. Depois vêm runtime/localhost,
  HTTP/UI da aprovação, fontes/automação, E2E/gates e rollback operacional.
- Nenhum clone preservado ou produção acessado/alterado nesta rodada, sem
  servidor, cron, endpoint novo, commit/push/deploy ou ativação de workflow.
- **12 regressões novas aprovadas** (6 casos PostgreSQL e 6 guardas de URL).
  Matriz de 53 módulos: **643 aprovados e 1 xfail histórico RB-001**. Ruff,
  formatação selecionada, mypy de app + ferramentas (120 arquivos) e diff
  passaram. Não é suite backend integral/gate de cobertura, E2E de navegador
  nem aceite da cópia real; frontend não foi alterado nesta rodada.

### Continuação — adaptador específico e prova com o clone preservado real

- `scripts/adotar_clone_recuperacao.py` aceita somente a origem local exata
  `sigeo_homologacao_clone_20261006`, revisão e6, em REPEATABLE READ read-only,
  sem outro cliente na origem. Destino continua sendo novo descartável
  `sigeo_test_migrations_<uuid>` migrado a b7, sem clientes adicionais e com
  ACL de banco exclusiva do proprietário. Não cria banco/role, não importa
  Settings, não oferece CLI, não serve o app e não aceita produção.
- Guardas originais dos ensaios sintéticos permanecem intactas. Manifesto
  ganhou núcleo interno reutilizável somente depois da guarda específica;
  escrita compartilhada também é interna e exige transação ativa, destino
  descartável e origem read-only. Não há parâmetro da UI que desative essas
  proteções ou aceite manifesto fornecido pelo navegador.
- `schema_adocao_recuperacao.py` confronta colunas/tipos/nulabilidade/defaults/
  identidades, PK/FK/uniques/índices, enums, triggers e funções/propriedades de
  segurança. CHECKs com deparse diferente precisam de filtros equivalentes
  no EXPLAIN, sem remover casts por regex. Léxico PL/pgSQL preserva strings e
  identificadores citados; comentários/dollar quoting fora da normalização
  exigem corpo idêntico, não equivalência presumida.
- A primeira comparação bloqueou antes da cópia: ordem física de colunas
  diferente em `pagamento_obra_persus`. Confirmada comparação por nome, pois
  o COPY enumera cada coluna explicitamente; ordem física não é contrato.
  Tipos/constraints continuam comparados. Regressão com colunas em ordem
  diferente passa; tipo, CHECK ou conteúdo de função diferente continuam
  bloqueando. Nenhum schema de origem foi alterado para fazer a guarda passar.
- **Ensaio com o clone real aprovado (72,24 s):** destino começou vazio,
  recebeu Alembic até b7, ficou privado antes da adoção e recebeu a cópia
  protegida/neutralizada em uma transação. Comparadas contagens de todas as
  tabelas, manifestos do destino e integridade da origem antes/depois.
  Diferenças permitidas ficaram limitadas a user/audit_log/refresh_token;
  nenhuma conta ativa, convite ou sessão potencialmente válida no destino.
- Origem permaneceu em e6 e read-only; destino em b7, sem stamp, reescrita de
  revisão ou migration sobre o clone sobrevivente. Destino temporário foi
  removido pelo teardown de nome exato; original preservado permite repetir
  o ensaio. Nada foi apontado para o app, gateway de e-mail ou API federal.
  A base congelada continuou fechada. Isto valida o snapshot local, não o
  frescor atual das fontes oficiais ou o estado da produção.
- Ainda faltam cópia persistente privada, credenciais/roles locais, runtime
  e localhost, aprovação HTTP/UI, aceitação federal/automação, gates completos,
  navegador e rollback operacional RB-001. Sem commit/push/deploy/agendamento.
- **13 regressões novas aprovadas** (9 guardas/léxico e 4 testes PostgreSQL
  de schema/ACL). Matriz de 55 módulos: **656 aprovados e 1 xfail histórico
  RB-001**, além do ensaio separado com clone real (1 aprovado). Ruff,
  formatação selecionada, mypy de app + ferramentas (122 arquivos) e diff
  passaram. A primeira revisão automática de permissão da matriz expirou
  antes de iniciar o comando; repetição única autorizada executou a matriz.
  Não equivale à suíte backend integral, gate de cobertura, navegador ou CI
  remoto. Nenhuma alteração de frontend nesta rodada.

### Sequência obrigatória para continuar

1. Recuperar ou reconstruir, com regressões, os arquivos/migrations ausentes.
   Verificar diferenças do schema sobrevivente antes de executar a aplicação.
2. Resolver as incompatibilidades ainda presentes na recuperação; mypy de
   `app` já passou, mas faltam módulos operacionais e regressões do Radar.
   Não mascarar erro
   de domínio com `Any`, `type: ignore` ou queda silenciosa.
3. Repetir suíte backend/frontend, gates constitucionais e aceitação das
   fontes oficiais no ambiente local protegido. Resultados antigos não
   dispensam esta rodada.
4. Restabelecer localhost com credenciais locais, conferir browser → API →
   banco e executar E2E mutável em banco isolado; depois validar o workflow.
5. Somente após aprovação explícita de rollout, preparar publicação e
   operação de produção. Nenhum commit/push/deploy nesta retomada.

## Contrato e fontes

- Convênios legados: dump oficial SICONV por `NR_CONVENIO`; não confundir com
  a API nova do TransfereGov. Entrada na carteira depende de convênio assinado
  confirmado pelo Portal da Transparência; descoberta no dump, sozinha, não
  autoriza inclusão automática.
- Propostas novas: API de Gestão de Parcerias, identificadas por `id_proposta`.
  Monitoramento interno continua uma decisão humana, nunca automático.
- Cada alteração de campo de fonte externa deve produzir um resumo agrupado
  por instrumento e por rodada, com deduplicação e sem aviso de carga inicial.
- Gestor/admin recebem todas as atualizações; colaborador recebe somente dos
  instrumentos de que é titular/suplente, com broadcast quando não há dono;
  leitor não recebe. Inclusão no monitoramento avisa apenas gestor/admin.
- Preservar último valor confirmado em falha/omissão da fonte; registrar
  proveniência, data da captura e divergência sem inferir estado desconhecido.

## Etapas e estado

1. **Em homologação — concluído:** situação SICONV reconciliada em `Convenio`
   e `InstrumentoEquipamento`; download fresco, ZIP validado, regressão do
   825374, UI sem falso “pendente” e aviso de inclusão gerencial.
2. **Em homologação — concluído:** job TransfereGov preserva estados em resposta
   parcial e resume as duas situações num aviso; auditoria SICONV read-only
   detecta ausências e diferenças antes da aplicação.
3. **Parcial:** o registro principal `siconv_convenio` usa o payload anterior
   persistido como baseline, compara seus campos e agrupa o resumo por
   convênio; valores financeiros derivados também são atualizados. Capturas
   e frescor por rodada estão registrados; empenhos, desembolsos, licitações,
   termos aditivos, pagamentos e itens são comparados por chave, com baseline
   inicial silenciosa e resumo dos campos alterados. O Radar recaptura
   proposta/programa, metas/etapas/itens, análises, cronograma, distribuição,
   parceria e timeline financeira; compara por ID, atualiza as projeções
   oficiais e agrupa avisos sem alterar revisão humana. Faltam validar
   esses contratos nas fontes reais, tratar coleções sem ID estável e
   completar projeções como CNES verificado e datas do legado.
4. **Pendente:** descobrir novos convênios legados, validar assinatura no
   Portal e apresentar candidatos no Radar; notificar gestor/admin quando
   convênio ou proposta for incluído no monitoramento.
5. **Parcial:** histórico/frescor via `GET /fontes/capturas`, alerta gerencial
   de fonte indisponível com dedup de 24h e contrato frontend compatível.
   Falta apresentar frescor na UI e a nova UX de notificações com busca,
   filtros, arquivar e ler tudo, mantendo autorização.
6. **Parcial (proteções locais):** recaptura pontual/lote compartilham trava
   entre processos no mesmo host/clone; lote tem prazo técnico de coleta,
   sem interromper publicação SQL, e coordenação PostgreSQL em conexão
   dedicada com verificação de posse antes de publicar. Sem agendamento ativo. Ainda falta
   automatizar workflow diário somente depois de confirmar
   secret, runner, migrations e branch/deploy corretos; testar contra banco
   isolado, replay idempotente, alertas e rollback antes da produção.
7. **Ao final:** retomar classificação dos 401 esperados no New Relic, após
   confirmar que não esconde falhas de sessão reais.

Não declarar “espelho sempre atualizado” enquanto as etapas 3–6 não passarem
nos testes de contrato, integração, E2E e operação programada.

## Retomada — pré-condição de recaptura para aprovação

- Implementados `schemas_captura_legado.py` e `services/captura_legado.py`:
  contrato interno exige identidade, situação oficial, valor global válido e
  itens não vazios. Campos adicionais de convênio/itens são preservados no
  contrato e participam do hash, sem serem automaticamente projetados.
- Validação compara número/proposta com o candidato, rejeita itens de outra
  proposta e duplicados, reexecuta o classificador canônico e compara evidências.
  Obra ou simples menção não comprova financiamento de equipamento; alteração
  de hash exige nova revisão. Zero é preservado, nunca tratado como ausente.
- Esta é uma **pré-condição ainda não conectada a uma operação de aprovação**.
  Não prova completude do download nem origem por si só: essas garantias devem
  vir do coletor e da persistência auditável da rodada. Não usar payload enviado
  pelo navegador como captura oficial.
- Próximo bloco: armazenar recaptura completa vinculada à rodada e ao candidato,
  preservar evidências sem atualizações destrutivas e testar rollback/replay.
  Depois, mapear os dados oficiais para a carteira e implementar aprovação
  humana transacional, histórico e avisos gerenciais. Não criar monitoramento
  interno automaticamente nem habilitar aprovação antes desses testes.
- 49 testes focados passaram; validador com 100% de linhas/branches;
  suíte backend completa: 601 testes aprovados no clone local isolado.
  Ruff e mypy de `app` passaram (92 arquivos). Sem migração, escrita na carteira,
  chamada federal, push, workflow ou alteração em produção neste bloco.

## Evidência da integração do trabalho do Claude (2026-10-06)

### Persistência auditável da recaptura — bloco seguinte

### Conexão do coletor pontual — avanço posterior

- `job_recaptura_legado_local.py` recaptura **um candidato já existente**.
  Guarda loopback/nome do clone antes de importar Settings e confere também
  a URL da engine efetiva antes de qualquer consulta ou registro de falha.
  Execução remota, banco fora do escopo e candidato inválido são recusados.
- Download SICONV de convênios/itens sempre usa `atualizar_cache=True`;
  leitor estrito compartilhado com a descoberta valida CSV único, cabeçalho,
  número de campos e identidade exata. Preserva campos adicionais da fonte;
  seleção de itens limitada a 10 mil por candidato, sem truncamento silencioso.
- Antes de persistir no clone, aplica a proteção textual/payload já usada na
  recaptura local de propostas. Teste comprova e-mail protegido, identidade e
  valores preservados; rodada marca `payload_protegido_local=true`. Hash do ZIP
  original e hash do contrato protegido têm propósitos distintos. Estas provas
  locais não devem ser copiadas como evidência oficial de produção.
- `registrar_recaptura_coletada` grava rodada `ok` e prova na mesma transação;
  falha na validação/persistência não deixa uma rodada falsamente bem-sucedida.
  O job registra a tentativa com erro separadamente, usando mensagem pública
  segura e alerta gerencial existente, sem apagar provas anteriores.
- Integração testada com ZIPs sintéticos na fronteira de download; parser,
  classificador, Repository, Service e PostgreSQL reais. Não executado contra
  fontes federais nesta rodada. Sem schedule, publicação ou promoção automática.
- Ainda pendente: enriquecer contrato/projeção de carteira com identificação,
  Portal, datas e demais dados oficiais; conectar aprovação humana e avisos.
  Este coletor só captura convênio e itens: **não é espelho completo** das tabelas
  filhas nem autorização para habilitar o botão Aprovado.
- O schema do banco local do app permanece na revisão anterior; executar o
  coletor sobre ele exige upgrade local controlado. Recaptura federal real e
  revisão de armazenamento/retenção do cache ainda não executadas neste bloco;
  não transportar payload real cru para o banco protegido.
- Suíte completa: 638 testes aprovados após o ajuste final de proteção;
  Ruff/mypy aprovados. Gates de linhas/branches: services 96,3%/90,6%,
  repositories 95,3%/84,0%, routes 92,4%/65,2%; todos acima dos pisos.

### Evidência do armazenamento

### Continuação — projeção persistível e revisão da prova no servidor

- Repository `carteira_legado.py` insere a projeção oficial com Decimal,
  situação SICONV, identificação Portal, última liberação e tabelas filhas.
  Preserva listas vazias e baseline `_espelho` para diffs posteriores; não
  escreve tags legadas, CNES inferido ou `InstrumentoEquipamento`. Não faz
  commit/upsert: número existente é rejeitado sem sobrescrever cadastro.
- Contrato estrito da futura aprovação referencia captura, recaptura, hash,
  versão, chave e justificativa; não aceita payload oficial do navegador.
  Preparação de revisão no servidor exige a última recaptura do candidato,
  captura atual oficial, rodada `ok`, proveniência completa de downloads,
  hash íntegro, identidades/evidências canônicas e Portal/filhas/programas
  consultados. Não decide estado humano nem autoriza/aprova isoladamente.
- Teste real identificou instabilidade do hash após roundtrip em JSONB: ordem
  de chaves não é preservada pelo PostgreSQL. Hash passou a serialização
  canônica com chaves ordenadas; ordem de listas continua significativa.
  Provas antigas não são reescritas (append-only): quando seu hash anterior
  divergir, precisam de nova recaptura e revisão, nunca aprovação por fallback.
- Testes sintéticos contra PostgreSQL exercitam releitura de valores, situação
  concluída, ausência de ingresso em monitoramento, snapshot/baseline, rollback,
  conflito de número, revisão divergente e fonte/proveniência inadequadas.
  Regressão comprova estabilidade do hash da prova persistida.
- Validação final: **793 testes aprovados**, Ruff/formatação/mypy sem erros.
  Gates: services 96,3% linhas/90,6% branches; repositories 95,5%/84,8%;
  routes 92,4%/65,2%, acima dos pisos. Relatório local:
  `/private/tmp/sigeo-homologacao-20261006/coverage-carteira-revisao.json`.
- A transação final ainda NÃO está exposta: faltam autorização/estado/replay,
  aprovação + marcadores + aviso gerencial correto na mesma transação e provas
  de concorrência/HTTP/UI. Aviso de inclusão em monitoramento não deve ser
  reutilizado para mera entrada na carteira. Política temporal de validade da
  recaptura ainda precisa ser fechada antes da habilitação; usar a última prova
  não garante, sozinho, que seja recente.
- Sem migration adicional, nova coleta federal, alteração em produção,
  commit/push ou habilitação de aprovação. Dois downloads reais grandes
  continuam não validados, conforme evidência anterior.

### Continuação — transação interna de aprovação e aviso gerencial

- Service interno `aprovar_entrada` compõe Convênio, marcadores canônicos de
  financiamento, decisão append-only vinculada à recaptura/ator e notificação
  numa única transação. Não cria InstrumentoEquipamento, CNES inferido nem
  escreve tags legadas. Não há endpoint/comando de UI para chamar a operação.
- Autorização exige gestor/admin ativo e não excluído. Lock do candidato
  relê o estado mesmo se já existir no identity map da Session; versão/captura,
  completude, hash, origem oficial e estado humano são conferidos no servidor.
  Carteira existente nunca é sobrescrita. Rejeitado/Aprovado são terminais.
- Replay confere ator, captura, recaptura/hash, justificativa e versão anterior;
  mesma chave retorna a decisão original, sem novo convênio/marcador/aviso.
  Chave com dados diferentes ou novo comando sobre aprovação encerrada conflita.
- Tipo de aviso `aprovacao_carteira`, distinto de inclusão no monitoramento,
  materializa apenas gestor/admin ativo e não excluído. Central aceita o tipo
  via Zod, rótulo Entrada aprovada, destino na aba de convênios/Dados Oficiais.
- Migration aditiva `f0a1b2c3d4e5`: up/down/up passou no clone de testes;
  expansão aplicada também ao clone de trabalho, sem aprovar dados reais.
  Down mantém o literal do enum para evitar recriação bloqueante e impede
  rollback com avisos desse tipo persistidos; contração fica em plano próprio.
  Teste do bloqueio do down com aviso existente ainda pendente.
- Integração real usa dados sintéticos e transação externa revertida: aprovação
  inicial/replay, estado terminal/rejeição, carteiras existentes, perfis sem
  permissão, gestor inativo/excluído, recaptura vencida e destino/destinatários.
  Falha injetada na fronteira de flush do aviso reverte todas as inclusões,
  sem mockar Services de domínio. Não comprova duas sessões concorrentes.
- Política temporal aprovada pelo usuário: recaptura vale por **24 horas desde
  o início da consulta**. Service exige nova captura/revisão após esse prazo,
  rejeita datas futuras/invertidas e não aceita prazo enviado pelo navegador.
  Replay válido de uma decisão já concluída não reaprova nem expira a decisão.
  O prazo é para revisar fonte novamente, não para expirar candidato/decisão.
  Sem operação de aprovação exposta na UI ou política aplicada à produção.
- Pendente antes de habilitar: prova concorrente com
  commits independentes, contrato HTTP/CSRF/RBAC e interface de aprovação;
  também validar os dois downloads federais grandes e recaptura real completa.
  Sem commit, push, deploy, workflow ou alteração na produção/referência congelada.
- Validação final: **814 testes backend** e **221 frontend** aprovados;
  Ruff, mypy, lint, TypeScript e build frontend passaram. `alembic check`
  sem divergências. Gates: services 96,4% linhas/91,2% branches;
  repositories 95,8%/84,9%; routes 92,4%/65,2%, acima dos pisos.
  Evidência: `/private/tmp/sigeo-homologacao-20261006/coverage-aprovacao-transacao.json`.

### Continuação em 2026-10-07 — exclusão de recapturas simultâneas locais

- `scripts/trava_recaptura_local.py` fornece trava não bloqueante compartilhada
  pelas entradas dos jobs pontual e em lote. Identifica o clone por banco/porta;
  alias de loopback e credenciais diferentes não criam uma segunda trava.
- URL de ambiente e engine efetiva continuam validadas antes da execução.
  Banco remoto/fora do clone é recusado. A disputa da trava ocorre antes
  de começar a rodada/coleta, fora do tratamento de falha de fonte: não
  registra falsa indisponibilidade nem inicia downloads ou gravações.
- Arquivo vazio 0600 no temporário local, com nome derivado de hash sem
  usuário/senha. Não aceita symlink, FIFO, hardlink, proprietário diferente
  ou permissões de grupo/outros. Não remove o inode durante a operação;
  fechamento e término do processo liberam a trava sem limpar histórico.
- Testes usam `flock` e processos reais: segunda execução recusada, reentrada
  após sucesso/erro, mesmo inode preservado, término abrupto via `os._exit`,
  arquivos inseguros e duas entradas dos jobs recusadas antes da coleta.
  Configuração/engine sintéticas não conectam ao banco; domínio não é mockado.
- Limite explícito: proteção POSIX de homologação no mesmo host, não trava
  distribuída entre runners/máquinas. Nenhuma transação/conexão PostgreSQL
  adicional é mantida aberta para essa trava durante downloads. O coletor
  pontual anterior ainda mantém sua sessão de leitura durante a coleta;
  o coletor em lote fecha a leitura antes da rede.
- Recorrência operacional permanece pendente: coordenação distribuída,
  timeout global da rodada, fontes reais completas, secret/runner/migrations,
  replay e alerta precisam ser validados antes de ativar workflow diário.
  Não foi criado agendamento local nem ativado schedule do GitHub.
- **859 testes backend aprovados**, incluindo 12 novos testes da trava.
  Ruff/formatação e mypy (116 arquivos) aprovados. Gates de linhas/branches
  preservados: services 96,4%/91,1%, repositories 95,8%/85,1%,
  routes 92,5%/65,2%; acima dos pisos constitucionais.
- Sem alteração de contratos HTTP, schema, cálculos ou frontend; sem migration,
  commit, push, deploy ou alteração de produção.

### Continuação em 2026-10-07 — coordenação PostgreSQL do coletor em lote

- Repository `coordenacao_recaptura.py` adquire advisory lock de sessão por
  fonte; disputa é não bloqueante. Service controla contexto e recusa engine
  com pool reutilizável. Não há tabela, migration, extensão ou privilégio
  novo exigido: a trava é uma função nativa do PostgreSQL.
- Entrada pública do job em lote mantém guardas de URL/engine/clone, chave
  do Portal, trava local e cria conexão física dedicada com NullPool.
  Disputa PostgreSQL ocorre antes da rodada e não gera falso alerta de fonte.
  A coleta mantém a conexão de trava em AUTOCOMMIT, sem transação de banco
  aberta durante downloads; leitura dos alvos usa sessão separada e curta.
- Publicação muda a mesma conexão física para READ COMMITTED e confere PID
  e posse em pg_locks. Session assume controle integral da transação, sem
  savepoint que esconda o commit. Provas e FonteCaptura continuam atômicas.
  Perda/invalidação da conexão, PID diferente ou trava liberada impedem a
  publicação; erro de conexão é traduzido para conflito sanitizado.
- Fechamento físico libera a trava no sucesso/erro. Ela não é devolvida a
  um pool com estado de sessão. Encerramento do backend pelo PostgreSQL
  também libera a fonte e não permite reconectar silenciosamente para gravar.
- Testes PostgreSQL reais usam conexões independentes: disputa, estado idle,
  liberação em erro, close/invalidate/unlock, backend encerrado explicitamente
  apenas no teste, pool inválido, commit/rollback reais e recaptura completa
  com sucesso ou perda da posse. Terceira sessão observa provas/rodadas
  confirmadas em schema sintético descartável; nada fica no schema público.
- Limites: proteção verificada em PostgreSQL direto local. Não usar trava de
  sessão por proxy de pooling transacional; validar endpoint direto/secret,
  timeouts e comportamento do provedor antes do rollout. O coletor pontual
  diagnóstico antigo continua apenas com trava de arquivo local; migrar ou
  retirar seu uso operacional antes da recorrência. Jobs de descoberta/
  verificação ainda precisam integrar a coordenação apropriada por fonte.
- `_executar_rodada` mantém caminho interno sem coordenação para fixtures
  transacionais isoladas; CLI pública exige coordenação antes de chamar o
  fluxo. Não há endpoint HTTP nem comando externo que dispense essa guarda.
- Próximo bloco: integração operacional dos jobs e validação das fontes reais,
  preservação/replay/notificações, workflow diário com endpoint correto e
  timeout do runner/banco. Nenhum schedule foi ativado nesta etapa.
- **883 testes backend aprovados**, incluindo 10 casos novos de coordenação.
  Ruff/formatação e mypy aprovados. Gates de linhas/branches: services
  96,4%/91,1%, repositories 95,9%/85,1%, routes 92,5%/65,2%, acima dos pisos.
- Sem migration, alteração de cálculo/frontend, commit, push, deploy ou
  escrita em produção; tudo permanece no checkout de homologação.

### Continuação em 2026-10-07 — validação federal real e interrupção de streaming

- Leituras reais somente HTTPS, via transporte privado efêmero e sem SQL.
  ZIP, CRC, cabeçalhos exigidos e largura de todas as linhas passaram em:
  `siconv_convenio` (285.743 linhas), `siconv_programa_proposta` (1.155.057),
  `siconv_programa` (1.255.214), `siconv_empenho` (434.899),
  `siconv_desembolso` (378.212), `siconv_licitacao` (952.712) e
  `siconv_termo_aditivo` (455.215). Prova estrutural do download nacional,
  não validação semântica de cada registro nem aprovação de candidatos.
- Convênio 825374 encontrado uma única vez no dump real; `SIT_CONVENIO`
  publica **Prestação de Contas Concluída**, não vazio. Não houve correção
  do banco local/produção nesta conferência nem comparação autenticada da UI.
- Pagamentos e itens do plano falharam inicialmente durante transferência,
  com `ChunkedEncodingError`; arquivos parciais foram removidos sem publicação.
  Não afirmar completude dessas fontes com base nos outros sete downloads.
- Retry do adapter HTTP não cobre falha durante `iter_content`. Wrapper local
  agora permite no máximo três tentativas integrais para interrupção de stream,
  conexão ou timeout, com esperas de 1/2s. Cada tentativa usa sessão/diretório
  novos; nunca concatena, retoma ou publica arquivo parcial. ZIP/CRC inválido
  não provoca retry de rede nem é aceito por fallback.
- Releitura de pagamentos esgotou as três tentativas com a mesma falha de
  transferência; não houve validação de seu CSV real. Origem exata da falha
  de infraestrutura ainda não determinada; não atribuir automaticamente ao
  SICONV nem considerar o retry uma resolução comprovada dessa indisponibilidade.
- Releitura dos itens do plano também esgotou três tentativas com
  `ChunkedEncodingError`, sem chegar à validação do CSV. Resultado final desta
  rodada: sete estruturas nacionais validadas, dois downloads grandes não
  validados. Todas as leituras encerradas, nenhum job de download deixado ativo.
- 767 testes passaram, incluindo falha/sucesso de retry, teto, limpeza e
  integridade. Ruff, formatação e mypy (107 arquivos) aprovados. Gates:
  services 96,3%/90,7%, repositories 95,4%/85,1%, routes 92,4%/65,2%.
- Sem INSERT, migration, commit, push, workflow ou alteração de produção.
  Aprovação permanece desabilitada. Pendentes: validar os dois downloads
  grandes integralmente, recaptura completa por candidato com Portal e dados
  protegidos, transação de aprovação/avisos e provas de concorrência/RBAC/UI.

### Continuação em 2026-10-07 — transporte privado dos downloads locais

- Coletor pontual do Radar deixou de usar `_baixar_zip`/cache compartilhado
  do script histórico. Wrapper exclusivo cria sessão com retry existente e
  consulta sempre fresca; não aceita reutilização de cache.
- Repository recebe a sessão e mantém o ZIP em diretório temporário 0700,
  arquivo 0600 criado exclusivamente. Só lê em memória após validar; contexto
  remove arquivo/diretório no sucesso e nos erros. Retenção em disco limitada
  à chamada. Não extrai membros, publica arquivos ou registra payload bruto.
- URL fixa HTTPS e catálogo fechado de nove downloads; bloqueia nomes livres,
  redirecionamentos e respostas diferentes de 200 (inclusive 206 parcial).
  Limites defensivos: 1 GiB comprimido e 20 GiB de CSV anunciado no ZIP.
  Exige exatamente um CSV e CRC válido; excedente/arquivo inválido falha,
  não é truncado ou considerado captura bem-sucedida.
- Download permanece somente no job local com guarda de banco loopback.
  Proteção do recorte antes do SQL e hashes das fontes permanecem inalterados.
  Scripts históricos de coleta/produção e seus caches não foram modificados.
  Arquivos anteriormente existentes nesses caches não foram apagados nem
  considerados saneados; sua revisão/limpeza exige inventário próprio.
- Testes usam HTTP substituído na fronteira, respostas requests reais e
  filesystem real para verificar modos, limpeza em falha, limites, CRC,
  consulta repetida fresca e ausência de logs de payload. Integração PostgreSQL
  mantém as oito combinações Portal/filhas/programas, agora no novo transporte.
  760 testes passaram; Ruff, formatação e mypy (107 arquivos) aprovados.
  Gates linhas/branches: services 96,3%/90,7%, repositories 95,4%/85,1%,
  routes 92,4%/65,2%; acima dos pisos da Constituição.
- Pendente: validação contra os downloads federais reais (volume, cabeçalhos,
  linhas, redirecionamento/status efetivo), seguida da aprovação transacional
  com recaptura/ator, marcadores/avisos, replay, concorrência, RBAC e UI.
  Ainda não foi efetuado download federal real neste bloco nem habilitada
  aprovação. Sem nova migration, commit, push, workflow ou escrita em produção.

### Continuação em 2026-10-07 — última liberação e completude para aprovação

- Conferida a origem no importador existente: `dataUltimaLiberacao` e
  `valorDaUltimaLiberacao` vêm do Portal. Projeção agora tipa esses campos
  separadamente, sem trocar totais do SICONV pelos valores do Portal e sem
  inferir última liberação pela ordem, maior valor ou data dos desembolsos.
- Novo contrato usa date/Decimal, mantém zero, nulo e ajustes negativos
  publicados, bloqueia valores não finitos, formato inválido e datas inválidas.
  Extras do Portal seguem sendo a evidência original; não houve mudança no
  hash de contratos anteriores por introduzir defaults novos no Portal.
- `preparar_carteira_para_aprovacao` exige Portal, cinco tabelas filhas e
  programas consultados. Coleções vazias são consulta válida, mas não geram
  programa ou pagamento fictício. Identidade, precedência e ambiguidades
  continuam validadas pela projeção. Função pura: não autoriza usuário, não
  decide situação humana, não escreve em banco e não habilita UI de aprovação.
- Origem da recaptura exige todos os hashes SHA-256 de cada grupo consultado,
  sem chaves extras ou hashes inválidos. Service rejeita coleção presente sem
  hashes correspondentes ou hashes de coleção não capturada antes de inserir
  rodada/prova, com rollback. Não basta enviar uma coleção vazia para marcar
  o grupo como consultado. Prova de download permanece responsabilidade do
  coletor confiável; hash isolado não autentica conteúdo enviado pela UI.
- 742 testes backend passaram, com fixtures sintéticas e PostgreSQL local:
  ausências, zero, precisão, ajustes negativos, datas/valores malformados,
  completude, hashes incompletos e preservação da rodada/carteira em conflito.
  Ruff, formatação e mypy (105 arquivos) aprovados.
  Gates de linhas/branches: services 96,3%/90,7%, repositories 95,1%/84,1%,
  routes 92,4%/65,2%; todos acima dos pisos da Constituição.
- Sem migration nova, download federal real, INSERT em Convenio ou
  InstrumentoEquipamento, commit, push, workflow ou mudança de produção.
  Pendente: prova de recaptura federal real/cache protegido e transação de
  aprovação vinculada à recaptura/ator, marcadores, avisos gerenciais,
  replay/concorrência, RBAC e contrato HTTP/UI. Não confundir preparação pura
  com aprovação concluída; botão continua desabilitado.

### Continuação em 2026-10-07 — vínculos de programas do SICONV

- Recaptura tipada de `siconv_programa_proposta` e `siconv_programa`, com
  seleção exata por ID_PROPOSTA e ID_PROGRAMA, validação das duas estruturas,
  rejeição de vínculo duplicado e catálogo ausente. Teto de 10.000 registros
  por coleção/proposta; não descarta silenciosamente o excedente.
- Todas as variantes publicadas do catálogo são preservadas na evidência.
  Variantes com mesmo ID/nome e situações diferentes não provocam escolha
  arbitrária da primeira linha. Múltiplos IDs vinculados ou nomes divergentes
  impedem a projeção singular do campo Programa; sem vínculo, não se inventa
  programa. Vínculo de outra proposta bloqueia montagem/validação de identidade.
- `--com-programas` no coletor pontual local faz download fresco das duas
  fontes, registra os hashes da rodada e protege o payload antes do SQL.
  `programas_capturados` distingue consulta vazia de consulta não executada.
  Coleta sem a opção preserva comportamento anterior e não presume completude.
- Conteúdo efetivamente capturado participa do hash revisável; campo opcional
  ausente não muda hashes de contratos anteriores. Nenhuma migration nova.
- Testes unitários exercitam seleção exata, vazios, formatos inválidos,
  duplicidade, catálogo faltante e ambiguidades. Integração PostgreSQL percorre
  oito combinações com/sem Portal, filhas e programas, mockando só download/API.
  Suíte completa: 704 testes aprovados; Ruff e mypy (103 arquivos) aprovados.
  Gates de linhas/branches: services 96,2%/90,6%, repositories 95,1%/84,1%,
  routes 92,4%/65,2%; todos acima dos pisos da Constituição.
- Nenhum download federal real, aprovação ou INSERT de convênio/monitoramento
  executado. Evidência de ambiguidade não equivale a aprovação: a montagem
  ambígua falha antes da persistência quando `--com-portal` também é solicitado,
  preservando a última captura válida; captura somente SICONV pode guardar
  os vínculos sem decidir o programa.
- Próximos passos: conferir campos ainda necessários à carteira (inclusive
  última liberação), validar cache/contrato contra fonte federal real em
  ambiente protegido, vincular decisão à recaptura e implementar aprovação
  transacional com marcadores/avisos, replay, RBAC e prova de concorrência.
  Aprovação na UI continua desabilitada. Produção e workflows intactos;
  alterações permanecem não commitadas na homologação local.

### Tabelas filhas da recaptura — avanço posterior

- Contratos tipados para empenhos, desembolsos, licitações, termos aditivos e
  pagamentos. As cinco coleções são obrigatórias quando `filhas` está presente;
  captura sem esse campo continua explicitamente incompleta para aprovação.
- Leitura estrita de ZIP/CSV exige cabeçalho, identidade e linhas íntegras.
  Seleção por número exato, chaves únicas por tabela e limite defensivo de
  10.000 registros por tabela/candidato, sem truncamento silencioso.
- Coletor exclusivamente local aceita `--com-filhas`. Baixa cada tabela fresca,
  percorre uma por vez e mantém somente o recorte, evitando reter os cinco ZIPs
  nacionais simultaneamente. Hash de cada download fica na rodada; evidência
  segue protegida antes da persistência. Sem a opção, não presume consulta.
- Projeção pura soma pagamentos com Decimal, preservando ajustes negativos
  publicados. Valor inválido/ausente bloqueia a captura, não vira zero.
  Coleção vazia mantém valor pago desconhecido e contagem zero; coleção não
  consultada mantém contagem nula. Nenhuma regra de pagamento manual é aplicada
  a convênios oficiais. Registros de outro convênio bloqueiam a projeção.
- Hash de contratos antigos permanece compatível: campos opcionais ausentes
  não alteram a revisão. Coleções efetivamente capturadas integram o hash.
- 682 testes backend aprovados, incluindo integração PostgreSQL do coletor
  com/sem Portal e com/sem tabelas filhas. Ruff e mypy aprovados. Gates:
  services 96,3% linhas/90,6% branches; repositories 95,3%/84,3%;
  routes 92,4%/65,2%. APIs simuladas somente nas fronteiras de download.
- Pendente: metadados/programas e demais projeções necessárias, prova contra
  respostas federais reais com cache protegido, aprovação humana transacional
  e seus avisos. Nenhum botão de aprovação liberado, convênio incluído, migration
  nova, workflow acionado, commit, push ou alteração de produção neste bloco.

### Identificação do Portal e projeção tipada — avanço posterior

- `schemas_portal_legado.py` define identidade exata, convenente/CNPJ,
  município/UF e datas; preserva extras como evidência. CNPJ é normalizado
  somente no formato, sem inferir instituição/CNES. Código do convênio e
  código IBGE aceitam identidade numérica textualizada, sem casamento por nome.
- Captura pode conter Portal; hash de captura sem Portal continua compatível
  com o contrato anterior (campo opcional ausente não altera hash). Validação
  recusa identidade do Portal diferente da descoberta/SICONV.
- `projecao_legado.py` monta `ProjecaoCarteiraLegado` sem SQL. Identificação,
  objeto e datas vêm do Portal; situação e valores vêm do SICONV. Valores do
  Portal nunca substituem o financeiro SICONV neste fluxo. Decimal preserva
  precisão, zero e ausência; saldo negativo publicado não é descartado.
- Datas inválidas não viram nulo silenciosamente; vigência invertida,
  identificação ausente e financeiro malformado bloqueiam a montagem. Ano vem
  do número do instrumento quando disponível, com publicação como fallback
  já utilizado no importador. Não usa datas para inventar inauguração.
- Coletor pontual aceita `--com-portal`, exige a chave existente do Portal e
  valida a montagem antes de persistir a evidência protegida. Sem a opção,
  continua apenas SICONV/itens; essa captura não pode montar a carteira.
- 655 testes backend passaram com APIs simuladas na fronteira de I/O;
  integração PostgreSQL cobre recaptura com e sem Portal. Ruff e mypy passaram.
  Sem nova migração, download federal real, INSERT em Convenio ou monitoramento.
- **Aprovação permanece pendente**: completar metadados/coleções oficiais,
  vincular a recaptura utilizada à decisão e implementar a transação de
  aprovação + marcadores + avisos, com replay/conflito/rollback e RBAC. Não
  habilitar botão apenas porque a projeção mínima foi montada com sucesso.

- Nova entidade `CandidatoLegadoRecaptura` e migração aditiva
  `d8e9f0a1b2c3`: FK para candidato, vínculo composto com a evidência do Radar
  e FK para `FonteCaptura`; situação e valor global (`NUMERIC`) em colunas
  próprias. JSONB preserva exclusivamente a prova do contrato oficial, não
  substitui relacionamentos nem é exposto na listagem.
- UNIQUE candidato/rodada evita duplicação; replay de conteúdo divergente
  conflita. CHECKs de hash/valor/situação e trigger append-only impedem alteração
  ou exclusão da prova. Transação no Service, queries no Repository; locks de
  candidato e rodada serializam gravações sobre o mesmo candidato.
- Somente rodada `siconv_legado_recaptura` com status `ok` é aceita; a captura
  precisa pertencer ao candidato e continuar vigente, com origem oficial.
  Rodada de outra fonte, erro/parcial, descoberta local e evidências alteradas
  não geram prova. Rollback após INSERT foi testado com SQL real.
- Migração up/down/up aplicada somente no banco descartável de testes local;
  down em ambiente com provas reais exige exportação prévia. O banco do app
  local e a referência congelada não foram migrados neste bloco.
- Ainda **não conectado ao job**: o coletor deve concluir e registrar a rodada,
  preservar o download íntegro e só então chamar o Service. Nenhuma rota aceita
  payload do navegador como evidência oficial. Contrato ainda cobre convênio e
  itens, não Portal, demais tabelas filhas ou projeção completa da carteira.
- Clones futuros com esta tabela exigem anonimização da evidência antes da
  proteção append-only e recomputação do hash do contrato protegido. Não
  desabilitar o trigger no banco operacional nem publicar cópia não protegida.
  Fluxo de cópia dessa nova prova permanece pendente de teste dedicado.
- 619 testes backend passaram; Ruff e mypy passaram. Testes incluem sucesso,
  replay, conflitos, constraints, imutabilidade, fonte inadequada e rollback.
  Gates de linhas/branches: services 96,3%/90,6% (piso 80%), repositories
  95,3%/83,9% (70%), routes 92,4%/65,2% (60%). Novo Service e Repository de
  recaptura com cobertura completa no relatório local `coverage-recaptura.json`.
  Prova concorrente em sessões independentes ainda pendente antes do rollout.
- Não há aprovação/promoção implementada, nem criação automática de
  `InstrumentoEquipamento`, chamada federal, push, deploy ou escrita em produção.

- `ca33b02` e `cc877bc` preservados; navegação segue isolada em `8a7a8c1`.
- Migration de capturas aplicada somente em PostgreSQL sintético local.
- 423 testes backend e 132 frontend passaram; Ruff, mypy, lint e build passaram.
- Testes cobrem as seis tabelas filhas, campos omitidos, replay e rollback
  integral diante de chave duplicada/ausente ou pagamento inválido.
- Downloads externos são substituídos na fronteira dos testes; nenhum job foi
  executado contra produção. Ainda falta validação operacional das fontes reais.

## Continuação — recaptura TransfereGov

- 432 testes backend passaram, além de Ruff e mypy; nenhum schema novo.
- Metas e dados financeiros deixam de ficar congelados na primeira coleta.
- Coleções reordenadas não notificam; campos/itens omitidos são preservados;
  IDs ambíguos ou falha HTTP abortam a transação, com captura de erro.
- Primeira recaptura de payload antigo é silenciosa. Alterações posteriores
  avisam uma vez e sincronizam situações do monitoramento, sem duplicação
  pela verificação seguinte. Revisão humana permanece intacta.
