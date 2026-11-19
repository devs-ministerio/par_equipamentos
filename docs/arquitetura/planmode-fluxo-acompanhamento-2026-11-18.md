# Plan Mode: fluxo comum de acompanhamento (18/11/2026)

Estado: **plano, sem código do fluxo novo**. Nasce de `docs/arquitetura/` + diagnóstico de leitura em produção de 18/11/2026 e das decisões do usuário abaixo. Nada vai ao remoto sem autorização; gravação em produção só com "pode gravar" e backup.

## 1. Decisões já tomadas

- Fluxo: Acompanhamento iniciado → Aguardando repasse → Valor repassado → Equipamento entregue → Pós-entrega → Concluído. Validado pela equipe técnica.
- Repasse não bloqueia a entrega. No check, se o repasse não estiver confirmado, pede a confirmação **Integral ou Parcial** (automática, sem data; a data do registro é só histórico). "Pago" do TransfereGov conta como repasse confirmado.
- Cancelamento por unidade. Conclusão calculada (integral, parcial, sem entregas) e confirmada pela equipe.
- Itens fora das 16 famílias e abaixo de R$ 300 mil não exigem check nem validação na conclusão, exceto instrumento sem item prioritário, relacionado pelo componente.
- **Previsão de inauguração ≠ previsão de entrega.** Inauguração é do instrumento/programa e se liga à conclusão; previsão de entrega é por item (calendário). Previsões ambíguas (vários equipamentos) são descartadas. O relatório de Previsões deixa de existir (revisão geral dos relatórios fica para depois).
- **PERSUS I:** a data de entrega de todo item é a data de inauguração (só no PERSUS I).
- **PERSUS II:** os 24 instrumentos hoje monitorados saem do monitoramento interno e a inclusão fica desabilitada por enquanto (código já travado: `criar_instrumento_monitorado` e o botão).
- Ingestão manual (PERSUS, FAF, TED): o técnico precisa poder confirmar repasse, entrega, pós-entrega e conclusão pelas mesmas ações do fluxo, com autor, justificativa e histórico.
- Concluídos atuais passam por revisão: sem pendência continuam concluídos; com pendência saem. Ações abertas dos concluídos corretos são concluídas.
- NF e documentos (CNEN, OS, TRP, TRD) independentes, sem alterar fase.

## 2. Diagnóstico (produção, 18/11/2026)

- 404 instrumentos monitorados (4 fora de escopo): 295 "Convênio" (24 são PERSUS II tipados errado), 92 PERSUS I, 14 FAF, 3 TED.
- Fase hoje: 124 sem fase, 4 em licitação, 12 aguardando repasse, 11 em aquisição, 2 contratados, 18 em andamento, 15 em comissionamento, 11 entregues, 203 concluídos.
- Repasse (267 convênios SICONV): 223 com desembolso (115 parciais, 108 integrais); 44 só com repasse previsto. PERSUS, FAF e TED não têm fonte de desembolso.
- Concluídos (204): 153 com entrega igual ao planejado (124 sem pendência, 28 com ação aberta, 1 com item na fila de revisão), 46 sem entrega (41 PERSUS I), 3 parciais, 2 só com itens sem controle.
- Itens: 1.747 de aquisição sem controle de unidade (95 instrumentos também têm item controlado; 15 não têm nenhum, a exceção). 36 instrumentos criados após 28/10 têm itens sem vínculo (`item_plano.instrumento_id` nulo), por isso a tela diz que não há itens controlados (ex.: 985638).
- Inauguração: 170 registros (149 reais, 13 futuras, 4 vencidas, 6 sem data); 87 PERSUS I concluídos têm inauguração real, mas só 9 das 52 entregas lançadas coincidem com ela.
- 234 de 245 unidades lançadas não têm marca, modelo nem série (legado vinculado).
- Propostas: 31, 16 aprovadas; 2 viraram FAF monitorado (código da parceria = `nr_convenio`); 14 aguardam inclusão.

## 3. Modelo alvo

**A fase é calculada a partir de fatos append-only**, nunca escolhida de uma lista: repasse confirmado (tipo integral/parcial, origem fonte ou manual), primeira entrega, início do pós-entrega e conclusão confirmada. Assim atualização externa não regride a fase e correção incompatível gera revisão explícita.

Proposta (a validar): nova fase **Em aquisição** entre Valor repassado e Equipamento entregue, absorvendo licitação, aquisição, contratado e em andamento. Mapeamento da carga: Comissionamento vira Pós-entrega só com entrega lançada e confirmação do técnico; sem entrega, Em aquisição.

Inauguração: campo do instrumento com histórico de revisões e data real preenchida na conclusão (proposta; alternativas: manter como marco renomeado ou só na conclusão). Alertas D-1/D0/D+1 migram para a previsão de entrega por item.

## 4. Entregas

0. **Pré-requisitos (antes de qualquer código):** Manual Deploy do Render com o motor de complementos (#61/#66); projeção de itens (`projetar_itens_plano.py --aplicar`) para ligar os itens soltos; vínculo definitivo (tela busca itens pelo convênio, ou criar instrumento projeta os itens).
1. **Unificar o acompanhamento:** vínculo proposta → instrumento sem duplicar (FAF já usa o código da parceria; falta a origem SICONV antiga); regra de identidade.
2. **Fases e repasse:** fatos, cálculo da fase, confirmação Integral/Parcial no check, ações do técnico para cargas manuais, "registrar situação já existente".
3. **Equipamentos e documentos:** previsão de entrega por item (calendário), cancelamento por unidade com motivo, NF e documentos opcionais, migração dos marcos CNEN/TRP/TRD/OS para "Documentos".
4. **Pós-entrega e conclusão:** botão visível, validação no backend, impedimentos listados, três resultados calculados, reabertura para alterar entregas ou cancelamentos após concluir.
5. **Migrar e homologar:** regras abaixo, painel e relatórios, teste em clone local.

## 5. Regras de migração

1. Remover os 24 PERSUS II do monitoramento (sem eventos, ações nem entregas; cada um tem 1 responsável e 1 item vinculado). `AuditLog` antes do delete, como no precedente do 877881.
2. PERSUS I: corrigir as datas de entrega para a data de inauguração (43 divergem hoje) e criar a entrega com a data de inauguração nos 41 concluídos sem entrega. Não há "corrigir data" no código: o caminho é excluir a entrega (motivo) e registrar de novo pelo serviço, idempotente.
3. Concluídos: 124 sem pendência continuam; 28 com ação aberta têm a ação concluída pelo serviço (arquiva avisos) e continuam concluídos; o 777446 (item na fila) sai de concluído. Os demais concluídos (46 sem entrega, 3 parciais, 2 da exceção) vão à fila de revisão. Das 28 ações, **311 (parecer de descomissionamento, prazo 26/12) e 948684 (SCRA aguardando deferimento da CNEN)** parecem pendências reais, o resto são notas ("Relatório fotográfico OK"): confirmar antes.
4. Convênios SICONV: repasse automático pelo desembolso (parcial se menor que o repasse previsto). 44 só com previsão ficam em Aguardando repasse.
5. Inauguração: 139 reais vinculáveis viram entrega com a data quando não existir; 12 futuras e 4 vencidas viram previsão de entrega do item; ambíguas e sem data são descartadas; histórico preservado.

## 6. Riscos

- Dados de produção mudam durante o trabalho (126 entregas criadas em 24 h em 18/11): refazer as contagens na véspera da migração.
- Scripts de migração com simulação por padrão e `--aplicar --confirmo-host`; backup antes (`backup_banco.yml`); nenhuma gravação via SQL cru em tabelas append-only.
- Relatório de Concluídos passa a depender só da confirmação da equipe: esvazia até a revisão terminar, por isso a ordem da carga importa.
- Neon de homologação tem histórico de `alembic_version` atrasada: conferir antes de assumir migration aplicada.

## 7. Homologação

Fluxo completo nas três origens (SICONV, TransfereGov/FAF, manual), com: repasse parcial e integral, entrada tardia, entrega parcelada, cancelamento antes do repasse, conclusão parcial, encerramento sem entregas, proposta que vira convênio, PERSUS I (entrega = inauguração), atualização externa que não regride fase, reabertura.

## 7b. Itens de exceção e regra de conclusão

Instrumento monitorado sem nenhum item controlado entrou pelo componente. Para ele: itens com unidade a partir de R$ 100 mil viram unidade; se nenhum chega, os 3 de maior valor unitário viram unidade (limites por variável de ambiente, projeção `projetar_itens_plano.py`). **Regra de conclusão (Entrega 4):** nesses instrumentos só os itens com unidade exigem entrega; os demais itens de aquisição não bloqueiam a conclusão. Em produção são 30 instrumentos (21 itens pela regra de R$ 100 mil e 36 pela exceção da exceção, nos 12 restantes).

**Regra de conclusão (decidida em 19/11/2026):** só conclui quando todo item controlado está entregue ou cancelado, sem unidade pendente. Resultado: `integral` (tudo entregue, nada cancelado), `parcial` (há entrega e há unidade cancelada) e `sem_entregas` (tudo cancelado). Parcial e sem entregas exigem justificativa. Sem item controlado, não conclui. Ação aberta, entrega antiga a vincular e item na fila de revisão também impedem. Datas de inauguração e de previsão são opcionais em todos os casos.

## 8. Ajuste de identidade: logotipo do cabeçalho

O ajuste de 13/11 (`1f0c285`) trocou o logotipo completo por marca + legenda em texto e ficou desproporcional. O pedido era só aumentar um pouco a legenda "Gestão de Equipamentos em Oncologia". Correção: voltar ao logotipo completo no cabeçalho (como em `5d0e711`) e subir a altura de `h-10` para `h-11`, sem texto separado. Validar no localhost em 1024, 1440 e 1920 px.

## 8b. Enxugar informação excessiva na tela do instrumento

Pedido do usuário em 19/11/2026: tirar texto que só explica a tela, seguindo a regra de rótulos curtos. Exemplo dado: instrumento 780603, linha "Rendimento da aplicação: R$ 617.878,43 · não soma unidade" abaixo do equipamento. Entra como passo transversal, junto da Entrega 5, com revisão tela a tela e validação do usuário antes de remover.

Candidatos levantados (a validar):

- `equipamentos-instrumento-lista.tsx`: linha de rendimento da aplicação (o valor não soma unidade nem valor, então não precisa aparecer).
- `equipamentos-instrumento.tsx`: "+ N outro(s) item(ns) do plano sem controle por unidade" e "Este instrumento não tem itens do plano controlados por unidade".
- `equipamentos-instrumento.tsx`: aviso "Entrega registrada antes do controle por unidade" (manter só o essencial: vincular).
- Cabeçalho do instrumento e cartões: legendas secundárias em 11 px que repetem o dado principal.

Ajuste de botão (pedido em 19/11/2026): o "Editar cadastro" do cartão Cadastro interno passa a usar o mesmo botão do "Concluir acompanhamento" (`Button` pequeno, no cabeçalho do cartão), no lugar do botão artesanal com borda azul que hoje alterna o formulário no próprio cartão. A forma de abrir o formulário (janela, como as demais ações, ou inline) está em validação.

Critério: o dado fica se a equipe age sobre ele; texto que só explica regra interna sai.

## 8c. Pergunta de inauguração ao confirmar a entrega (pedido de 19/11/2026)

Depois do check de entrega, o sistema pergunta se o equipamento precisa de inauguração. Se sim, pede a previsão;
se já houver data registrada antes (evento `cronograma_previsao_inauguracao` ou data migrada), pede só a confirmação
dela. Se não, nada é registrado. Desenho e persistência da resposta ("precisa de inauguração") ainda a aprovar.

## 8d. Licença ANSN por item (decisão de 19/11/2026, a implementar)

"Licença CNEN" passa a "Licença ANSN" nos textos (identificadores `cnen_*` ficam). A licença é da unidade, e só estas
famílias a exigem (catálogo `equipamento_catalogo`): Acelerador Linear (inclui "Básico - Intermediário"), Braquiterapia
(com fonte radioativa), Cobalto (cobaltoterapia), Radioterapia (genérico: detalhar pela tecnologia), PET/CT e
Gama-câmara/SPECT. Marca "exige licença" por família; documento ligado ao item (a licença sai antes da unidade existir)
e, opcionalmente, à unidade. Pendente: detalhar "Radioterapia" e "Braquiterapia" (fonte radioativa) por item.

## 8e. Uma inauguração por instrumento (19/11/2026)

Previsão/realizada e "Inauguração dispensada" são excludentes: no máximo um evento ativo no conjunto. Regra no serviço
(409) e seletor sem a opção quando já existe. Duplicados existentes: `consolidar_eventos_marco_duplicados --inauguracao`
(simulação por padrão), a rodar na 5b; depois disso, índice único parcial.

## 8f. Scripts da 5b e ordem de execução (19/11/2026)

Todos com simulação por padrão e `--aplicar --confirmo-host`; backup (`backup_banco.yml`) antes.

1. Migrations até `a8b9c0d1e2f3` (catálogo Cronograma e ANSN) e deploy do backend.
2. `projetar_itens_plano --aplicar` (liga itens soltos) e `derivar_repasses_siconv --aplicar` (repasse integral/parcial).
3. `migrar_marcos_para_documentos --aplicar` (OS, TRP, TRD, SCRA e licença viram documentos).
4. `remover_persus_ii_do_monitoramento --aplicar`: só remove instrumento sem lançamento; `AuditLog` antes; itens perdem o vínculo.
5. `vincular_entregas_legadas --aplicar`, depois `corrigir_entregas_persus_i --aplicar`: a data de entrega vira a da
   inauguração por correção auditada (não por exclusão e novo lançamento, porque a série da unidade é única no item,
   inclusive entre entregas excluídas) e cria a entrega dos que não têm.
6. `migrar_concluidos_para_conclusao --pendencia-real 948684 --pendencia-real 25000185040202348 --aplicar`: sem pendência vira conclusão
   integral; só ação aberta fecha a ação e conclui; o resto tem o evento antigo excluído (sai de Concluído) e é listado.
7. `consolidar_eventos_marco_duplicados --inauguracao --aplicar`, depois a migration `b9c0d1e2f3a4` (índice único da
   inauguração; para com mensagem se ainda houver duplicado).
8. **Depois** de conferir a produção: remover a leitura do evento `fase_concluido` em `fatos_do_instrumento` e
   `fases_calculadas_em_lote` (hoje soma o evento antigo e a conclusão confirmada, o que protege o intervalo entre o
   deploy e o passo 6).

Rodada local de 19/11 (clone): 51 entregas criadas e 36 datas corrigidas no PERSUS I; 96 conclusões migradas e 15
instrumentos enviados à revisão (8 por entrega, 7 sem data de conclusão); 23 grupos de inauguração consolidados.

## 8g. Marcos do cronograma por fase (19/11/2026)

O lançamento de evento oferece só o cronograma, sem previsão nem dispensa de inauguração (estas ficam na entrega). A disponibilidade de cada marco depende da **fase calculada** (`backend/app/services/marcos_por_fase.py`, espelhada em `frontend/src/lib/marcos-por-fase.ts`):

| Marco | Disponível de | Até |
|---|---|---|
| Início da fabricação, Fabricação concluída, Chegada ao Brasil, Desembaraço aduaneiro | Valor repassado | Em aquisição |
| Início/Infraestrutura/Conclusão da reforma-obra | Acompanhamento iniciado | Equipamento entregue |
| Instalação (início e fim), Comissionamento, Treinamento, Início da operação | Equipamento entregue | Pós-entrega |

Em Concluído não se lança nada (reabrir antes). Fora da janela, a tela mostra a opção desabilitada com o motivo e o backend recusa com 422; a regra vale só para lançamento novo, não para correção de evento existente. Marcos fora da tabela (entrega, inauguração, documentos, legados) não são afetados.

**Gatilho de Em aquisição:** além dos eventos antigos de fase, o primeiro marco de fabricação/porto/desembaraço **realizado** (com data) passa a indicar aquisição em curso (`CODIGOS_AQUISICAO_REALIZADA` em `repositories/repasses.py`). Custo: +1 consulta em `fases_calculadas_em_lote`.

## 9. Em aberto

- Forma da previsão de inauguração (campo do instrumento recomendado).
- Fase "Em aquisição" e o mapeamento do comissionamento.
- Pós-entrega dos concluídos corretos: automático na carga ou confirmação da equipe.
- Regra de conclusão para os instrumentos sem itens cadastrados (4 FAF) e para os 31 só com itens sem controle.
