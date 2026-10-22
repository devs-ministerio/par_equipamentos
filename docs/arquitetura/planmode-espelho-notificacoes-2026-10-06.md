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


## Histórico

Os blocos cronológicos (retomada local, capacidade, aceite, Radar, recuperação e recaptura) foram movidos, sem alteração de texto, para [planmode-espelho-notificacoes-historico-2026-10.md](planmode-espelho-notificacoes-historico-2026-10.md). Consulte-o para a evidência de cada decisão; as pendências vigentes estão no checklist acima e em "Etapas e estado".

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
4. **Em homologação — implementado (revisado em 22/10):** descoberta de convênios
   legados (dump SICONV e API nova), confirmação de assinatura no Portal da
   Transparência, apresentação no Radar (`central-entradas`, triagem e aprovação)
   e aviso gerencial quando convênio ou proposta entra no monitoramento. **Falta:**
   ciclo oficial nacional persistente com candidato elegível real (ver checklist).
5. **Em homologação — implementado (revisado em 22/10):** histórico e frescor via
   `GET /fontes/capturas` com UI (`situacao-fontes`), alerta gerencial de fonte
   indisponível com deduplicação de 24 h, e Central de notificações com busca,
   caixas (recebidas, não lidas, arquivadas), arquivar e “marcar todas como lidas”,
   mantendo a autorização por destinatário. Validar com usuários reais na janela
   de observação.
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

