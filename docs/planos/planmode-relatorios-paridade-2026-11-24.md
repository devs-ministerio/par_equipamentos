# Plan Mode: relatórios que batem com as telas (24/11/2026)

Estado: **aprovado o desenho; nada implementado.** Sem push, PR ou merge sem autorização. Produção só leitura. Cada fase fecha com testes, atualização da documentação e um commit local.

## 1. Por que este plano existe

A página de Relatórios (`frontend/src/pages/monitoramento-relatorios-page.tsx`, 869 linhas) e o backend de relatórios (cerca de 3.000 linhas em `app/services/relatorios*.py` e `app/reports/*`) calculam a situação do instrumento por conta própria. Os números do relatório não batem com os cards da Mesa, de Dados oficiais e do Painel. O defeito de método é um só: **a regra de negócio existe em dois lugares.**

## 2. Diagnóstico (leitura, 24/11/2026)

| Indicador | Telas | Relatório |
| --- | --- | --- |
| Concluído | Fase calculada do monitoramento (`calcular_fase_acompanhamento`): conclusão confirmada pela equipe (`conclusao_instrumento`). Dados oficiais mostra a fase do monitoramento e, sem ela, a situação do convênio; o card conta só instrumento monitorado. | `relatorios_encerrados.py` une quatro critérios com precedência e reconciliação próprias: conclusão no monitoramento; prestação de contas concluída em qualquer fonte (carteira, monitoramento, SICONV); conclusão sem data; parceria com ordem de pagamento paga. |
| Entregue | Unidades entregues por item do plano (`entrega_equipamento`, `unidade_equipamento`), via `resumo`. | `relatorios_entregues.py`, serviço e filtro próprios, uma linha por unidade. |
| Em operação, valor, equipamentos | Calculados no `resumo` e em `derivarPainel`. | `relatorios_tabelas.py` e `relatorios_recorte.py`, com extração própria por visão. |

Por consequência, o relatório de Concluídos traz mais instrumentos que as telas, inclusive os não monitorados. Em Entregues, Em operação, valor e equipamentos, a estrutura é a mesma (motor paralelo por visão), mas a comparação linha a linha ainda não foi feita: é a Fase 0.

## 3. Decisões já tomadas (usuário, 24/11/2026)

1. **Caminho A**: uma camada única de fatos do instrumento no backend. Telas e relatórios consomem a mesma fonte; o relatório só formata.
2. **Concluído = o das telas**: conclusão confirmada pela equipe no monitoramento (fase Concluído). "Prestação de contas SICONV" e "Parceria paga" continuam no arquivo como **colunas informativas** e na lista de divergências, mas não definem Concluído.
3. **Entregue e Em operação seguem as telas**, sem regra própria do relatório (premissa a reconfirmar na Fase 0 se a comparação achar divergência).

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

**Relatório como formatador.** Todos, Concluídos e Equipamento entregue passam a ser três recortes da mesma extração. O motor de precedência e reconciliação de `relatorios_encerrados.py` sai. Os geradores Word e Excel e o visual dos arquivos ficam como estão.

**Página de Relatórios.** Dividida por visão (regra das 200 linhas). A prévia mostra o mesmo número do card da tela correspondente. Mudança de interface pequena.

**Garantia.** Teste de paridade por indicador: com o mesmo filtro, o total do card, da prévia e do arquivo gerado são iguais.

## 6. Fases

| Fase | Entrega | Critério de pronto |
| --- | --- | --- |
| 0 | Matriz completa de divergências (Concluídos, Entregues, Em operação, Situação, Valor, Equipamentos), com um instrumento real de exemplo por divergência. Leitura em produção e no clone. | Tabela revisada pelo usuário. |
| 1 | Camada única + Concluídos. Colunas informativas de prestação de contas e parceria paga. | Paridade Concluídos: card = prévia = arquivo, na Mesa, em Dados oficiais e no Painel. |
| 2 | Equipamento entregue pela camada única. | Paridade de unidades entregues. |
| 3 | Todos, valor e equipamentos; remoção do código morto dos motores antigos. | Paridade de valor e quantidade. |
| 4 | Página dividida por visão, prévia igual ao card. | Arquivos abaixo de 200 linhas; testes de componente. |

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

O nível Completo hoje é a timeline inteira de eventos: no Word, um bloco por instrumento; no Excel, tabela. **O desenho dos relatórios completos ainda não existe e é a próxima etapa deste plano**, depois da paridade da Fase 1. O que precisa ser decidido:

- Estrutura do documento completo (seções e ordem) por tipo de pedido: por UF, por estabelecimento, por programa.
- Quais campos de cada instrumento entram (cadastro, itens e unidades, cronograma físico, regulatório, ações, documentos).
- Como o completo se relaciona com o simplificado: o simplificado é o resumo do completo, com as mesmas linhas e o mesmo critério.
- Acréscimos do Word (narrativa) frente ao Excel (tabela).

## 8. Riscos

| Risco | Mitigação |
| --- | --- |
| Mudar a definição de Concluído reduz o número que o usuário vê hoje no relatório | A diferença é listada na Fase 0 e as colunas informativas preservam a evidência de prestação de contas e parceria paga. |
| Fatos em lote ficam lentos em carteira grande | Reaproveitar as consultas em lote do `resumo`; teto de consulta já existente (`limites_relatorio`). |
| Regressão nos arquivos Word/Excel já aprovados | Os geradores não mudam; testes de caracterização dos arquivos antes de trocar a origem dos dados. |
| Divergência de entrega por unidade (entregue por unidade vs por instrumento) | Reconfirmar a premissa na Fase 0. |

## 9. Fora de escopo

Regra de cobertura e relatório de mérito, mudança de schema, gravação em produção, redesenho visual dos arquivos, relatório completo (seção 7.2, etapa posterior).

## 10. Documentação a atualizar ao fechar cada fase

`CLAUDE.md` (seção de relatórios), `docs/mermaid` (mapa do monitoramento, quando mudar fluxo) e este plano (estado de cada fase).
