# Plan Mode: relatórios que batem com as telas (24/11/2026)

## Entrega parcial de Equipamentos em 26/11/2026

O modelo de Equipamentos usa a mesma extração na prévia e nos arquivos. O Excel tem abas Resumo e Registros, valores em R$ e legenda fora do filtro. O Word Simplificado traz a nota informativa. O Completo inclui os registros. O nome do arquivo identifica o recorte.

Os quatro arquivos para validação estão em `outputs/relatorios-equipamentos-2026-11-26/`. Os dois níveis de MG representam 95 unidades. O Excel Brasil soma 533 unidades de quatro tipos de contratação. Instrumentos (Task 7), Propostas (Task 8) e a conferência dos 12 arquivos ficam para depois da validação de Equipamentos.

Estado: **Fase 0 concluída localmente; Fase 1 em diagnóstico.** A página ganhou prévia única, filtros e KPIs. As visões legadas “Concluídos” e “Entregas” e seus consumidores frontend foram removidos. As rotas e as regras da geração Word/Excel seguem disponíveis. As visões voltam como recortes da camada única nas Fases 2 a 4, após revisão da matriz. Produção só leitura. Cada fase fecha com testes, atualização da documentação e um commit local.

## 1. Por que este plano existe

A página de Relatórios (`frontend/src/pages/monitoramento-relatorios-page.tsx`, 869 linhas) e o backend de relatórios (cerca de 3.000 linhas em `app/services/relatorios*.py` e `app/reports/*`) calculam a situação do instrumento por conta própria. Os números do relatório não batem com os cards da Mesa, de Dados oficiais e do Painel. O defeito de método é um só: **a regra de negócio existe em dois lugares.**

## 2. Diagnóstico (leitura, 24/11/2026)

| Indicador | Telas | Relatório |
| --- | --- | --- |
| Concluído | Fase calculada do monitoramento (`calcular_fase_acompanhamento`): conclusão confirmada pela equipe (`conclusao_instrumento`). Dados oficiais mostra a fase do monitoramento e, sem ela, a situação do convênio; o card conta só instrumento monitorado. | `relatorios_encerrados.py` une quatro critérios com precedência e reconciliação próprias: conclusão no monitoramento; prestação de contas concluída em qualquer fonte (carteira, monitoramento, SICONV); conclusão sem data; parceria com ordem de pagamento paga. |
| Entregue | Unidades entregues por item do plano (`entrega_equipamento`, `unidade_equipamento`), via `resumo`. | `relatorios_entregues.py`, serviço e filtro próprios, uma linha por unidade. |
| Em operação, valor, equipamentos | Calculados no `resumo` e em `derivarPainel`. | `relatorios_tabelas.py` e `relatorios_recorte.py`, com extração própria por visão. |

Por consequência, o relatório de Concluídos traz mais instrumentos que as telas, inclusive os não monitorados. Em Entregues, Em operação, valor e equipamentos, a estrutura é a mesma (motor paralelo por visão), mas a comparação linha a linha ainda não foi feita: é a Fase 1.

## 3. Decisões já tomadas (usuário, 24/11/2026)

1. **Caminho A**: uma camada única de fatos do instrumento no backend. Telas e relatórios consomem a mesma fonte; o relatório só formata.
2. **Concluído = o das telas**: conclusão confirmada pela equipe no monitoramento (fase Concluído). "Prestação de contas SICONV" e "Parceria paga" continuam no arquivo como **colunas informativas** e na lista de divergências, mas não definem Concluído.
3. **Equipamentos têm a mesma classificação no Painel, na prévia e nos arquivos.** Uma unidade entregue conta como **Em operação** quando a inauguração do instrumento está confirmada, mesmo que o instrumento ainda não tenha conclusão integral.

## 3.1 Nomenclatura e etapas (decisões do usuário, 24/11/2026)

O fluxo do instrumento é **Proposta → Celebrado → Em monitoramento**. Cada registro está em uma só etapa. Os nomes abaixo valem para tela, prévia, Word e Excel.

| Conceito | Nome | Conteúdo |
| --- | --- | --- |
| Grupo | Instrumentos e programas | Convênio, **TED**, PERSUS I, PERSUS II |
| Grupo | Linhas de financiamento | **FAF** confirmado (parceria confirmada do TransfereGov e FAF firmado; o que é as duas coisas conta uma vez) |
| Grupo | Propostas | Solicitações em tramitação |
| Filtro | **Etapa** (primeiro da barra) | opções **Proposta**, **Celebrado**, **Em monitoramento**; "Todas as etapas" limpa |
| Etapa | Proposta | só o grupo Propostas |
| Etapa | Celebrado | firmado (instrumento ou linha confirmada) sem fase no monitoramento interno; não inclui proposta |
| Etapa | Em monitoramento | firmado com fase no monitoramento interno |

**Enquadramento normativo (de memória, a confirmar em fonte oficial).** TED é instrumento (Decreto 10.426/2020); convênio é instrumento (Decreto 11.531/2023 e Portaria Conjunta MGI/MF/CGU 33/2023); FAF é transferência fundo a fundo do SUS (Lei 8.142/1990, LC 141/2012, Portaria de Consolidação GM/MS nº 6/2017), sem instrumento. Enquadramento do PERSUS não conhecido. "Celebrado" é impreciso para FAF e PERSUS; decidir se saem da etapa ou ganham etapa própria. Confirmar com o `pesquisador-normativo`.

**Regra única no código:** `TIPOS_LINHA_FINANCIAMENTO = {FAF}` (`lib/financiamento-manual.ts`) alimenta Dados oficiais e Relatórios. Mudou o agrupamento, muda lá.

**Etapa no backend:** na Fase 2 o filtro vira parâmetro de `GET /relatorios` com a mesma regra da prévia (função de recorte única), para o arquivo trazer o mesmo recorte.

## 3.2 Relatórios por unidade e por instrumento

- **Equipamentos** conta unidades em quatro situações: **Planejado**, **Entregue, a inaugurar**, **Em operação** e **Cancelado**. A unidade entregue pode entrar em operação por inauguração confirmada ou dispensada. Se houver apenas previsão, a unidade entregue fica **Entregue, a inaugurar**. A quantidade com cancelamento vigente no checklist integra **Cancelado** e sai do saldo de entrega.
- **Instrumentos** conta um registro por instrumento e usa as fases do Monitoramento Interno, inclusive **Concluído**. O vínculo de um equipamento com a operação e a fase de um instrumento são fatos distintos.
- **Propostas** e **Celebrados** são relatórios secundários de carteira. O enquadramento de FAF e PERSUS em **Celebrados** segue pendente.

## 4. Princípios

1. Uma regra, um lugar. Mudou a regra, muda na fonte única; relatório e tela mudam juntos.
2. A camada única só **reaproveita** repositórios e serviços que as telas já usam (`fases_calculadas_em_lote`, `conclusoes_repo`, `etapas_repo`, `itens_repo`, `instrumento_no_escopo`). Não inventa regra nem muda schema.
3. Fora de escopo some de todo lugar (`fora_escopo_equipamentos`), como nas telas.
4. Sempre SUS e em uso nos cálculos de cobertura. **Cobertura fica fora deste plano**; o relatório de mérito não é tocado.
5. Sem fonte, não há seção: não fabricar Habilitação, Produção assistencial, Situação PAC nem Modalidade do PERSUS II (ver seção 7).
6. Arquitetura da constituição: Router → Service → Repository; repositório com `db` posicional e sem commit; serviço com `db` keyword-only; erros de domínio, nunca `HTTPException` no serviço.
7. Teste de paridade antes do conserto, com o caso real que diverge.

## 5. Desenho

**Camada única (`app/services/fatos_instrumento.py`).** Devolve, por instrumento: escopo, tipo de contratação, UF/município/CNES, situação oficial, fase, conclusão e data, itens planejados e entregues por unidade, valor. Consumidores: o `resumo` (telas) e os relatórios.

**Relatório como formatador.** Equipamentos e Instrumentos são as visões principais. A seleção de situação das unidades ou de fase dos instrumentos define o recorte de prévia, Word e Excel. A camada única reaproveita os fatos do monitoramento. Propostas e Celebrados são visões secundárias. Os modelos de saída seguem em revisão na seção 7.

**Página de Relatórios.** Primeiro passo do plano (Fase 0): upgrade de UI no padrão do Painel de gestão e divisão por responsabilidade (regra das 200 linhas), antes de qualquer mudança de regra. Na Fase 4 a prévia passa a mostrar o mesmo número do card da tela correspondente.

**Garantia.** Teste de paridade por indicador: com o mesmo filtro, o total do card, da prévia e do arquivo gerado são iguais.

## 6. Fases

| Fase | Entrega | Critério de pronto |
| --- | --- | --- |
| 0 | **Upgrade de UI da página de Relatórios** (primeiro passo, sem mexer em regra de dado): filtros no padrão do Painel de gestão (`BarraFiltros`, popovers, chips removíveis, "Limpar filtros", Sheet no celular), seletor de visão e de nível em pílulas, geração (Word/Excel) em uma barra de ação clara, e a página dividida por responsabilidade em arquivos de até 200 linhas. Todos os filtros e visões atuais continuam. | Nenhum filtro ou botão a menos; página e componentes abaixo de 200 linhas; testes de componente; verificação no navegador em desktop e celular. |
| 1 | Matriz completa de divergências (Concluídos, Entregues, Em operação, Situação, Valor, Equipamentos), com um instrumento real de exemplo por divergência. Leitura em produção e no clone. | Tabela revisada pelo usuário. |
| 2 | Camada única + Concluídos. Colunas informativas de prestação de contas e parceria paga. | Paridade Concluídos: card = prévia = arquivo, na Mesa, em Dados oficiais e no Painel. |
| 3 | Equipamento entregue pela camada única. | Paridade de unidades entregues. |
| 4 | Todos, valor e equipamentos; remoção do código morto dos motores antigos; a prévia da página passa a mostrar o mesmo número do card da tela correspondente. | Paridade de valor e quantidade. |

### Verificação da Fase 0 (24/11/2026)

A página real foi aberta no Chromium com respostas HTTP sintéticas. Em desktop (1470 px), os filtros aparecem em linha e a prévia usa tabela. Em 375 px, os filtros abrem em painel inferior e a prévia usa cartões. Em ambos os tamanhos, Etapa → Proposta exibiu só a proposta e Limpar filtros restaurou a carteira. No desktop, o filtro abriu pelo teclado e a opção Completo ativou a seleção com os dois botões de formato disponíveis. O download com dados reais não integrou essa verificação.

## 7. Relatórios: modelos

### 7.1 Simplificado (modelos dados pelo usuário em 24/11/2026)

Formato de **Nota Informativa** em `.docx` ou Excel, com os dados em tabelas e "Fonte: CGPCAN/DECAN/SAES/MS" no rodapé de cada uma. Dois pedidos reais servem de modelo.

**Pedido 1, Nota Informativa GAB/SAES: Radioterapia em Pernambuco (habilitações e investimentos).** Seções por programa:

- **Transferências voluntárias para radioterapia (Convênio).** Colunas: Município, Entidade, Convênio, Valor global, Valor pago, Ano, Equipamentos, Situação (frase descritiva, por exemplo "Em execução: obra do bunker em andamento. Não inaugurado").
- **PERSUS I.** Colunas: Município, Estabelecimento, CNES, Licença de Operação, Investimento total, Situação PAC, Situação (Inaugurada).
- **PERSUS II.** Colunas: Município, Unidade hospitalar, CNES, Modalidade (equipamento obsoleto, casamata vazia).

**Pedido 2, levantamento por estabelecimento (Fundação Pio XII, Barretos/SP, CNES 2090236).** Texto de abertura por programa, seguido de tabela:

- PERSUS I: frase quando não há instrumento celebrado para o CNES.
- PERSUS II: frase com a modalidade (por exemplo, substituição de equipamento obsoleto).
- Convênios, TED e FAF no período (2022 a 2026). Colunas: Município, Convênio, Ano, Equipamento (com quantidades, por exemplo "3 Mamógrafo, 3 Ultrassom"), Status, Valor total, Desembolsado.

**Lacunas de fonte (não fabricar):**

- **Situação PAC** (Novo PAC / Não PAC) e **Modalidade do PERSUS II** (equipamento obsoleto, casamata vazia): não encontrei campo correspondente no modelo de dados nem nos scripts. Precisam de fonte antes de entrar no relatório.
- A regra atual do Word diz **sem parágrafos de nota sob tabelas**; os modelos trazem "Fonte:" sob cada tabela. Decidir se o rodapé de fonte é exceção.
- A frase de abertura por programa ("Não há instrumento celebrado…") é um texto gerado por regra; definir os gabaritos.

### 7.2 Completo (a desenhar)

O nível Completo hoje é a timeline inteira de eventos: no Word, um bloco por instrumento; no Excel, tabela. **O desenho dos relatórios completos ainda não existe e é a próxima etapa deste plano**, depois da paridade da Fase 2. O que precisa ser decidido:

- Estrutura do documento completo (seções e ordem) por tipo de pedido: por UF, por estabelecimento, por programa.
- Quais campos de cada instrumento entram (cadastro, itens e unidades, cronograma físico, regulatório, ações, documentos).
- Como o completo se relaciona com o simplificado: o simplificado é o resumo do completo, com as mesmas linhas e o mesmo critério.
- Acréscimos do Word (narrativa) frente ao Excel (tabela).

## 8. Riscos

| Risco | Mitigação |
| --- | --- |
| Mudar a definição de Concluído reduz o número que o usuário vê hoje no relatório | A diferença é listada na Fase 1 e as colunas informativas preservam a evidência de prestação de contas e parceria paga. |
| Fatos em lote ficam lentos em carteira grande | Reaproveitar as consultas em lote do `resumo`; teto de consulta já existente (`limites_relatorio`). |
| Regressão nos arquivos Word/Excel já aprovados | Os geradores não mudam; testes de caracterização dos arquivos antes de trocar a origem dos dados. |
| Divergência de entrega por unidade (entregue por unidade vs por instrumento) | Reconfirmar a premissa na Fase 1. |

## 9. Fora de escopo

Regra de cobertura e relatório de mérito, mudança de schema, gravação em produção, redesenho visual dos arquivos Word e Excel (o upgrade de UI da Fase 0 é só da página), relatório completo (seção 7.2, etapa posterior).

## 10. Documentação a atualizar ao fechar cada fase

`CLAUDE.md` (seção de relatórios), `docs/mermaid` (mapa do monitoramento, quando mudar fluxo) e este plano (estado de cada fase).
