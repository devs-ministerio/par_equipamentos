# Plan Mode — espelho oficial e notificações por mudança (2026-10-06)

Plano aprovado pelo usuário. Implementação restrita à `homologacao`; nenhum
job, migration ou deploy deve ser executado em produção nesta fase.

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
4. **Parcial:** diagnóstico, persistência própria, consulta paginada e job de
   download fresco implementados em homologação. Convênios legados ficam na
   Central de entradas flutuante, acessada por ícone no cabeçalho, fora de Linhas de
   financiamento. Faltam decisão humana auditável, promoção à carteira e
   avisos de descoberta no ícone; a recorrência operacional depende da etapa 6.
   Avisos gerenciais de inclusão no monitoramento já foram implementados,
   mas não confundem descoberta, aprovação na carteira e monitoramento interno.
5. **Parcial:** histórico/frescor via `GET /fontes/capturas`, alerta gerencial
   de fonte indisponível e central com busca, tipo, caixas, paginação,
   arquivar/restaurar por destinatário e leitura em lote individual.
   Frescor agora é visível na central de notificações, com última tentativa,
   último sucesso, parcial/falha e defasagem. Falta validar a operação nas fontes reais.
6. **Pendente:** automatizar workflow diário somente depois de confirmar
   secret, runner, migrations e branch/deploy corretos; testar contra banco
   isolado, replay idempotente, alertas e rollback antes da produção.
7. **Ao final:** retomar classificação dos 401 esperados no New Relic, após
   confirmar que não esconde falhas de sessão reais.

Não declarar “espelho sempre atualizado” enquanto as etapas 3–6 não passarem
nos testes de contrato, integração, E2E e operação programada.

## Evidência da integração do trabalho do Claude (2026-10-06)

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

## Continuação — central de notificações

- Migration `e8f9a0b1c2d3` adiciona arquivo por destinatário (sem excluir
  histórico). Upgrade/downgrade/reaplicação testados só no PostgreSQL sintético.
- API filtra/pagina no banco; contagem global ignora busca e exclui arquivos.
  Arquivar, restaurar e ler todas não afetam outro usuário. IDOR/CSRF testados.
- 437 testes backend, 134 frontend, Ruff, mypy, lint, tipagem e build passaram.
- Teste de navegador com API sintética cobre arquivo/restauração/leitura,
  popup do filtro e larguras 320/400/768/1440; inspeção visual em 400/768.
- Rollout futuro: migration → backend → frontend. Nada aplicado em produção;
  rollback da migration elimina apenas a preferência de arquivo, não os avisos.

## Continuação — frescor visível e mensagens seguras

- Central apresenta as capturas persistidas, não uma data artificial de atualização.
  Sem captura, informa que não é possível confirmar o frescor; uma tentativa com
  erro/parcial preserva e exibe o último sucesso. Defasagem de 36h vem do backend.
- Consultas movidas para Repository, teto de 50 fontes e última tentativa por
  data de finalização (ID somente desempata). Sem nova migration.
- Exceções cruas deixam de ser gravadas em novos avisos/capturas. A resposta
  HTTP de capturas e avisos antigos também não expõe o detalhe técnico persistido.
  A exceção original continua sendo propagada ao job: falha não vira sucesso.
- 440 testes backend e 138 frontend, Ruff/mypy, lint/tipos/build passaram.
  E2E com fronteira HTTP sintética e inspeção visual em 400/768px; verificação
  de largura também em 320/1440px, com rolagem interna e arquivo/restauração.
- Localhost de demonstração utiliza base sintética própria, distinta da base
  efêmera dos testes e da produção. Não representa uma captura real da fonte.
- Permanecem pendentes descoberta do legado, contratos operacionais, workflow
  diário e New Relic. Este bloco não autoriza push, deploy ou jobs em produção.

## Continuação — descoberta diagnóstica do legado

- `diagnosticar_descoberta_siconv` lê ZIPs locais fornecidos explicitamente;
  não baixa arquivos, não grava candidatos/carteira/capturas e não notifica.
  A consulta opcional ao Portal é somente leitura, com chave no ambiente.
- Cruzamento `ID_PROPOSTA` → `NR_CONVENIO`, limitado ao catálogo canônico,
  mantém evidência por item e relação (aquisição/modernização/existente/menção).
  Identidades ausentes/duplicadas divergentes abortam; não aproximar por CNPJ.
- Exclui números já presentes em convênios legados ou monitoramento legado;
  NUP de FAF/TED não é usado como identidade SICONV. ZIP é lido em streaming,
  exige um CSV e cabeçalho íntegro; linha truncada/ambígua não é omitida.
- Confirmação exige que o Portal devolva o mesmo número e data de publicação
  válida. Ausência no Portal ou ausência de publicação mantém o candidato sem
  confirmação. Isso não é autorização de inclusão no monitoramento.
- Resultado tem teto explícito de processamento e contagem dos não processados;
  snapshot local não é tratado como evidência de coleta atualizada.
- Testes unitários/IO sintético e integração SQL cobrem deduplicação, ordem,
  aliases, evidências, vazio, IDs inválidos, Portal ausente/parcial/divergente e
  ZIP inválido. Não houve chamada à API real ou alteração em produção.
- Próximo bloco: persistência própria dos candidatos, integração com Radar e
  captura recorrente, mantendo confirmação de assinatura e revisão humana.
- Validação: 458 testes backend passaram; cobertura de linhas/branches dos
  novos Service e Repository em 100%, Ruff e mypy passaram. Não significa
  cobertura global de 100% ou validação operacional contra o dump/API reais.

## Ajuste solicitado — central de entradas e aprovação

- Legados não aparecem como seção em Linhas de financiamento nem Dados Oficiais.
- Ícone próprio no cabeçalho abre janela flutuante, mantendo a rota atual;
  manter o sino de atualizações separado. Contagem futura representa entradas
  pendentes reais, não quantidade inventada de notificações não lidas.
- Propostas da nova API seguem diretamente para Linhas de financiamento →
  Em tramitação, sem passar por aprovação nesta central. Preservar o estágio
  oficial real; não regredir propostas já confirmadas para tramitação.
- Legados exigem verificação oficial e aprovação humana antes de entrar em
  Instrumentos/programas. Não criar monitoramento pós-repasse automaticamente.
- Próximo bloco: decisão relacional append-only, FK para candidato, captura
  utilizada, aprovador autenticado, instante, resultado e justificativa.
- Aprovar/rejeitar somente gestor/admin, verificado no Service; leitura do
  histórico autenticada. CSRF e contrato estrito nas rotas de decisão.
- Aprovação bloqueada sem publicação/identidade confirmadas; recapturar dado
  oficial necessário à carteira, sem fabricar campos a partir da descrição.
- Uma transação inclui convênio, registra decisão e avisos gerenciais;
  lock/UNIQUE garantem replay e cliques concorrentes sem duplicação.
- Histórico paginado mantém quem decidiu, quando, evidência e destino,
  mesmo depois que o candidato sair da fila. Rejeição não apaga capturas.
- Arquivos: models/migration/schemas/repositories/services/routers da central;
  frontend services/hooks/features e rota de composição, sem fetch na UI.
- Migration aditiva separada para decisões, com up/down testados; rollback
  perde somente decisões novas, exige backup antes de uso compartilhado.
- Testes: gestor/admin versus colaborador/leitor, CSRF/IDOR, vazio, inválido,
  fonte indisponível, estado não confirmado, repetição, concorrência e rollback;
  E2E e inspeção visual em celular/tablet. Só I/O externo simulado.
- Visual mantém tokens verdes, fonte do produto, divisores e densidade de
  operação; sem cartões aninhados, títulos decorativos ou largura fixa.
- Tudo local/homologação: sem push/deploy, jobs, migrations ou schedule na
  produção. Aprovação e histórico ainda não estão disponíveis nesta etapa.

## Continuação — persistência e central local

- Migration `f9a0b1c2d3e4` cria candidato, captura e evidências relacionais;
  não altera convênios/monitoramento. Up/down/reaplicação testados somente
  no PostgreSQL efêmero; depois aplicada à base sintética de demonstração.
- Lote é atômico, serializado por lock; replay não duplica capturas. Resposta
  parcial preserva confirmação/evidência anterior. Identidade conflitante
  aborta, inclusive com violação UNIQUE; teste com duas sessões concorrentes.
- `GET /candidatos-legados` autenticado, paginado (máximo 50), busca literal
  e filtro de confirmação no SQL; candidatos já na carteira saem da fila,
  sem apagar o histórico. Nenhuma rota de escrita pública adicionada aqui.
- Job de descoberta força download fresco, valida ZIP/identidades e consulta
  o Portal antes de persistir o lote. Falha HTTP/limite aborta; captura da
  falha permanece com mensagem segura. Não está conectado a schedule.
- Job testa fronteiras externas simuladas, sem substituir a regra de negócio;
  17 testes novos incluem coleta fresca, 404/500, replay, limite, rollback,
  paginação, concorrência, constraints e contrato HTTP.
- Validação: 475 testes backend sem warnings, Ruff e mypy (83 arquivos);
  novos Service 98%, Repository e Router 100% na medição com branches.
  Esses percentuais não são a cobertura global do sistema.
- Frontend: 144 testes, lint/tipagem/build passaram; dois E2E com API sintética
  cobrem central e notificações. Larguras 320/375/400/768/1024/1440 sem overflow
  na central; inspeção visual de 400/768. Tokens/fonte existentes preservados.
  Novo componente: 92,85% de linhas e 91,66% de branches na medição local.
- Localhost `127.0.0.1:5181` usa backend `8001` e banco próprio de demonstração,
  com dois candidatos explicitamente sintéticos, sem chave de fonte ou e-mail.
  Login e consulta autenticada da API local confirmados com resposta 200.
- Aprovação, trilha de decisões e aviso de descoberta permanecem pendentes;
  fontes reais, operação diária e CI remoto não foram validados neste bloco.
- Rollout futuro: migration → backend → frontend. Downgrade elimina só o
  histórico novo de candidatos; exige backup se já houver dados compartilhados.

## Ajuste — central flutuante e servidores locais

- A central deixa de ser página completa: `Dialog` do mesmo padrão das
  notificações, foco contido, Escape/fechar e retorno de foco ao ícone.
- Conteúdo carregado sob demanda com lazy/Suspense; consulta só enquanto
  a central está montada. O link de financiamento foi removido por decisão
  do usuário; o acesso permanece na navegação própria do módulo.
- URL antiga `/monitoramento-equipamentos/entradas` redireciona à página
  operacional, sem manter uma segunda apresentação da central.
- Rolagem vertical interna e margens da janela verificadas em 400/768;
  E2E em 320/375/400/768/1024/1440, sem navegação ao abrir ou overflow.
- Abas da página de fundo passam a permitir quebra em 320 px, corrigindo
  overflow comprovado no teste. Sem alteração de filtro ou regra de negócio.
- Servidores locais estavam desligados e foram reiniciados: Vite 5181,
  API 8001, PostgreSQL 5432. Banco sintético e serviços externos desabilitados.
- Validação ponta a ponta sem mock: login sintético → consulta autenticada
  local → dois candidatos do banco → janela → Escape; sem erro JavaScript.
- 144 testes frontend, lint/tipos/build e dois E2E passaram; revisão React
  confirma reutilização de componentes, hooks de consulta e lazy loading.
- Nenhum backend/schema alterado neste ajuste; produção permanece intocada.

## Integração da base de produção na homologação local — 06/10/2026

- Ajustes pendentes de UI preservados no commit local `e6da763`: Radar de
  instrumentos, cards por convênio, monitor de capturas e central de
  notificações no mesmo padrão. O monitor consulta histórico, não dispara job.
- Integração de `origin/master` (`45126f3`) na branch local `homologacao`:
  layout responsivo, menu, filtros, dashboards, métricas e correções de sessão.
  Sem push, deploy, job remoto ou alteração em banco de produção.
- Conflitos conciliados preservando a UI da master, o Radar e a central nova,
  além dos filtros/paginação na URL e do retorno ao recorte de origem.
  Sino único no cabeçalho; Radar permanece acessível no desktop e no celular.
- Migration de merge `a4b5c6d7e8f9` une as duas pontas de histórico, sem DDL
  próprio; não reescreve migrations já existentes. Validada desde banco vazio
  no PostgreSQL local descartável `sigeo_test_integracao_master_20261006`.
- Backend: 484 testes passaram no banco exclusivo, Ruff e mypy passaram.
  Ambiente HTTP local usa COOKIE_SECURE=false e REFRESH_COOKIE_PATH=/auth;
  os defaults de produção permanecem intactos.
- Frontend: 205 testes, lint, tipagem e build passaram; dois E2E de Radar e
  notificações passaram. Banco demo local atualizado, backend reiniciado.
- Dois E2E autenticados adicionais passaram: ausência de overflow nas rotas
  críticas em 320/375/400/768/1024/1440 e mesa/detalhe no celular. São testes
  de layout com dados sintéticos, não validação de frescor de fontes reais.
- Revisão de metodologia não identificou mudança nas regras de cálculo.
- Aprovação de convênios permanece na próxima etapa do plano. A aba exclusiva
  de propostas novas aguarda definição do critério de novidade; não exibe
  silenciosamente todo o histórico como se fosse novo.

## Padronização visual das centrais — 06/10/2026

- Notificações apresentadas em cards no mesmo nível/contorno do Radar,
  com destaque de não lida, tipo/data e mensagem integral sempre visível,
  sem botão de expansão, conforme ajuste solicitado pelo usuário.
  Ações de leitura, abertura, arquivo/restauração e paginação preservadas.
- Bloco "Atualização das fontes oficiais" removido da central de notificações
  por solicitação do usuário; monitor de consultas permanece no Radar.
- Abas das duas centrais usam a forma pill, tipografia, foco e cor do nav
  principal. Classe base compartilhada em `lib/navigation-styles.ts`, sem
  alterar a navegação, o indicador animado ou as permissões do cabeçalho.
- 209 testes frontend, lint/tipagem/build e dois E2E passaram. Inspeção visual
  em 400/768; E2E das duas janelas em 320/375/400/768/1024/1440 sem overflow.
- Apenas frontend e documentação da homologação local; sem mudança de API,
  banco, regra de notificação, push ou deploy em produção.
- Rótulos de confirmação do Radar simplificados no card e no filtro:
  Aguardando verificação / Não localizado no Portal / Publicação pendente de
  confirmação / Publicação confirmada. Cores neutra/âmbar/verde representam
  apenas confirmação da fonte, nunca aprovação para entrada na carteira.
  "Ver evidências" passa a "Mais detalhes", preservando o texto original.

## Revisão de produto — origem e situação do Radar

- Decisão posterior do usuário substitui a apresentação de confirmação do
  Portal como situação do Radar: usar Novo, Em análise, Aprovado e Rejeitado,
  com responsável/data/histórico reais na etapa de decisão append-only.
  Não renomear confirmação de fonte como aprovação, nem simular o fluxo na UI.
- Radar recebe exclusivamente descobertas das APIs. Ingestão manual deve ir
  diretamente para Em tramitação de Linhas de financiamento; não ingressa
  na fila de aprovação do Radar. O GET da fila agora exclui snapshots locais;
  o filtro de situação humana foi implementado no bloco de triagem abaixo.
- Confirmação no Portal não é situação operacional nem filtro futuro do
  Radar. Preservar capturas/evidências técnicas no backend para auditoria,
  sem transformar esse controle interno em etapa manual de aprovação.
- Os dois campos atuais juntos ocupam a largura integral dos cards: lado a
  lado a partir de 640px, empilhados no celular, sem alterar o seletor
  compartilhado. E2E confirma a
  largura em 320/375/400/768/1024/1440; lint e tipagem passaram.

## Contador no ícone do Radar

- Badge no mesmo padrão do sino, oculto com zero e abreviado para 99+.
  Número completo disponível no nome acessível do botão.
- Implementação inicial (substituída no bloco de triagem abaixo) usou `total` da fila retornado pela API existente,
  nunca tamanho da página. Consulta autenticada e cache por usuário; refresh
  a cada 60s enquanto a aba está ativa. Abrir a janela não zera o contador.
- Até implementar as decisões, representa convênios na fila, não um contador
  exclusivo do estado Novo ou de propostas novas. Na próxima etapa deve usar
  contagem backend de Novo, excluindo Em análise/Aprovado/Rejeitado e manual.
- 213 testes frontend, lint/tipagem/build passaram; E2E do Radar validou
  contador com 0/1/120, 99+, preservação ao abrir e responsividade.

## Triagem humana do Radar — implementada na homologação local

- Migração aditiva `b5c6d7e8f9a0`: decisões relacionais append-only, FK para
  candidato/captura/usuário, vínculo composto impede captura de outro candidato,
  chave de replay única e trigger rejeita UPDATE/DELETE do histórico.
  Situação deriva da última decisão; confirmação da fonte nunca vira aprovação.
- POST `/candidatos-legados/{id}/decisoes`: iniciar análise ou rejeitar,
  somente gestor/admin ativos no Service, justificativa obrigatória, CSRF,
  lock por candidato e comparação da captura/versão mostradas ao usuário.
  Replay retorna a mesma decisão; chave reutilizada com outros dados é conflito.
- GET de histórico autenticado, paginado, com responsável, instante,
  justificativa e captura utilizada. Cards e filtro usam situação humana;
  confirmação do Portal fica exclusivamente em Mais detalhes na UI.
- GET da fila aceita somente descoberta `siconv_oficial`; consulta diagnóstica
  interna ainda pode ler snapshots. Nenhuma carga manual é transferida ou
  reinterpretada como descoberta oficial. Badge usa `novos` calculado no
  backend, sem depender da página, busca ou filtro, e não conta Em análise/Rejeitado.
- Aprovação **não foi implementada neste bloco**. Não há botão nem comando
  `aprovar` aceito; o rótulo/filtro Aprovado está preparado para o próximo bloco.
  Recaptura íntegra, promoção à carteira e avisos gerenciais continuam pendentes.
  Não houve escrita em Convenio ou InstrumentoEquipamento pela triagem.
- 497 testes backend e 220 frontend passaram; lint, mypy, tipagem e build
  passaram. Gates backend: services 93,8% linhas/85,8% branches;
  repositories 94,2%/81,0%; routes 92,1%/63,0%. Gates frontend existentes passaram.
  Nova triagem React: componente 100% linhas/95% branches; hook 92,3%/87,5%.
- Migração up/down/up validada no banco local exclusivo de testes, sem
  decisões persistidas; up aplicado também ao demo local. Reversão com
  decisões reais exige exportar o histórico antes, pois o down remove a tabela.
- Testes HTTP exercitam autenticação, CSRF, 403/404/409/422, replay, captura
  desatualizada, estado encerrado, rollback e integridade contra PostgreSQL.
  Bloqueio concorrente usa row lock; falta prova de duas decisões simultâneas
  em sessões independentes com commit, a incluir antes da aprovação/rollout.
- E2E de UI usa respostas sintéticas, não recaptura federal real. Verificação
  visual em 400/768 e overflow em 320/375/400/768/1024/1440. Corrigido foco ao
  fechar após troca desktop→celular; formulário declara JSON explicitamente.
  Servidores locais: frontend 5181, backend 8001, banco demo local.
- A skill React orientou histórico carregado sob demanda, cache por usuário
  e validação RHF/Zod; a skill de verificação orientou o teste das fronteiras.
  Auditoria metodológica confirmou ausência de alterações nos cálculos.
  Produção, workflows recorrentes e APIs federais não foram acionados.
