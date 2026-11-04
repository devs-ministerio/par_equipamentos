# Plano — ajustes visuais pontuais em produção

- Estado: aprovado explicitamente pelo usuário em 27/10; execução autorizada.
- Encerramento batch e matriz ficam em segundo plano.
- Objetivo: corrigir expansão de detalhes, apresentar SCRA/data da licença,
  representar a fase concluída com check verde e ampliar o rótulo documental.
- Diagnóstico: animação de abertura em `frontend/src/index.css` usa `both`,
  mantendo a altura medida mesmo quando o conteúdo assíncrono cresce.
- Diagnóstico: `monitoramento-interno-fase-geral.tsx` marca como feitas somente
  fases anteriores; a fase atual `fase_concluido` permanece azul e sem check.
- Diagnóstico: cabeçalho CNEN apresenta status; o número documental e a data
  já existem nos eventos. Não inferir número SCRA da matrícula ou de outro marco.
- Arquivos: `index.css`, `monitoramento-interno-cabecalho.tsx`,
  `monitoramento-interno-fase-geral.tsx`, `monitoramento-interno-form-evento.tsx`,
  composição/derivação de monitoramento se necessária e testes relacionados.
- Estratégia: liberar altura natural depois da abertura; preservar fechamento,
  cliques rápidos, carregamento assíncrono e preferência por movimento reduzido.
- CNEN: usar o evento vigente de licença de operação/alteração; apresentar número
  documental/SCRA e data de ocorrência/emissão, conforme resposta do usuário. Dado ausente recebe
  indicação explícita, sem reaproveitar valor de outro evento.
- Preservar status e alertas de validade, separados da data de emissão.
- Fase: check e verde quando a fase atual for `fase_concluido`; demais fases
  mantêm comportamento atual e identificação acessível da etapa vigente.
- Rótulo: `Nº matrícula/licença/processo/SCRA`; payload e campo persistido iguais.
- Identidade: tokens existentes, Public Sans, indicadores sem nova decoração,
  densidade operacional atual; sem redesenho de tela.
- Estado: props e derivação existentes; sem novas consultas ou estado global.
- Testes: expansão com conteúdo que cresce após animação, reabertura/cliques
  rápidos, fase concluída e intermediária, licença vigente e dados ausentes.
- Verificar navegador em 400px e 768px, teclado e movimento reduzido.
- Rodar testes frontend pertinentes, lint, tipos/build e gates do PR.
- Publicar frontend somente após CI aprovado e conferir resultado em produção.
- Riscos: CSS compartilhado afeta todos os consumidores de DetalhesAnimados;
  validar os cards de Dados Oficiais e o Radar. Não prometer risco zero.
- Rollback: reverter a alteração e republicar a revisão anterior do frontend.
- Sem migrations, escrita de dados reais, mudança de regra de negócio, backend,
  agendamentos ou incorporação de frentes futuras.
