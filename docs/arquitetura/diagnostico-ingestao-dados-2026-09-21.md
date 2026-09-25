# Diagnóstico sênior — ingestão de dados (rodada 2, 2026-09-21)

## Papel no fluxo de constituição

Ingestão é etapa obrigatória do diagnóstico de Database. Esta revisão sucede o diagnóstico de 18/09 e executa a política transversal da rodada 2:

`Database → Segurança → Backend → Frontend → DevOps → Qualidade`.

Em ingestão, a limpeza exige evidência adicional: script, fonte ou coluna só é removido após classificar leitores/escritores, preservar o histórico necessário e reconciliar os dados que ainda dependem dele. Documentação de fonte, contagem e destino deve ser atualizada na mesma mudança que alterar o fluxo.

## Evidências verificadas

Foram auditados importadores, scripts de correção/backfill, dados de entrada versionados, contratos de identidade, o diagnóstico anterior, testes unitários e contagens agregadas somente de leitura na base configurada.

- Planilha operacional FAF/TED: 133 linhas, 126 com identidade utilizável e 7 rejeições explícitas; distribuição: 105 Convênio, 23 FAF, 3 TED e 2 `NA`.
- PERSUS I: 92 registros válidos; PERSUS II: 50 linhas CSV.
- Base atual: 403 Convênio, 12 FAF, 3 TED, 92 PERSUS I e 50 PERSUS II em `convenio`; **0 PRONON** nesse destino.
- Radar: 18 propostas PRONON (11 pendentes, 7 rejeitadas), entidades distintas de instrumentos firmados.
- Testes unitários do classificador e do auditor de integridade: 10 aprovados.

As simulações com rollback dos importadores FAF/TED e PERSUS foram disparadas contra a base configurada, mas não emitiram o resumo esperado neste ambiente; por isso elas não são aceitas como evidência de idempotência nesta rodada. A validação precisa ser reproduzida em PostgreSQL dedicado, com saída arquivada.

## Achados

### Limpeza concluída — CSV PRONON morto removido

O diagnóstico de 18/09 registra uma carga histórica de 21 PRONON em `convenio`, mas o usuário confirmou em 21/09 que o CSV não é mais utilizado. A base atual tem corretamente zero PRONON em Instrumentos Firmados; o script `importar_propostas_pronon_radar.py` mantém somente as 18 propostas candidatas do Radar.

O CSV `backend/scripts/data/pronon.csv` e sua constante de caminho foram removidos. O contexto do importador e do diagnóstico anterior foi corrigido para não sugerir reingestão de PRONON em Instrumentos Firmados.

### P1 — controles de simulação não são uniformes nos scripts que escrevem

`importar_planilha_monitoramento.run()` implementa `dry_run`, mas não oferece `--dry-run` na CLI descrita pelo próprio arquivo. `preencher_marcadores_itens_plano.py` e `importar_batimento_b8131710.py` fazem `commit()` direto, sem simulação nem relatório de rejeições equivalente. Isso viola o contrato operacional da ingestão para cargas potencialmente repetidas.

**Encaminhamento:** padronizar uma interface única (`--dry-run`, resumo estruturado, rollback e código de saída) para todo escritor ativo. Até isso, scripts sem simulação devem ser classificados como one-shot e bloqueados de uso operacional recorrente.

### P1 — idempotência ainda não possui teste de integração dedicado

Os testes atuais cobrem o classificador de equipamentos e integridade de banco, mas não uma carga completa seguida de reexecução para FAF/TED, PERSUS e PRONON. O diagnóstico de 18/09 registrava essa evidência, porém ela não substitui teste repetível contra uma base efêmera.

**Encaminhamento:** criar fixtures mínimas das três fontes e testes em PostgreSQL dedicado que verifiquem primeira carga, reexecução sem criação de linhas/eventos, rejeições, rollback de dry-run e não sobrescrita de campos manuais.

### P2 — fontes duplicadas e scripts B813 exigem classificação antes de limpeza

A cópia duplicada da planilha `Monitoramento Base de Dados - Convênio FAF TED.xlsx` em `docs/monitoramento-equipamentos/` tinha o mesmo SHA-256 da fonte canônica em `data/`, não possuía consumidor e foi removida. As duas cópias de `B8131710.xlsx` possuem SHA-256 diferentes; os scripts usam somente `data/B8131710.xlsx`, cuja própria documentação diz estar defasada para parte das cargas.

`importar_batimento_b8131710.py`, `atualizar_equipamento_b8131710.py` e `validar_dados_tres_fontes.py` tratam esse batimento como fonte histórica ou de validação. Eles não podem ser apagados ainda: há relatórios, decisões e possível valor de auditoria. Mas tampouco devem ser oferecidos como pipeline atual sem dono, data de validade e modo seguro de execução.

**Execução:** a fonte FAF/TED ficou canônica em `data/`; B813 foi inventariado em `fontes-ingestao.md` e seus scripts foram marcados como `one-shot`/históricos. A retenção ou remoção futura do B813 depende da confirmação de necessidade de auditoria.

### P2 — `equipamentos_tags` segue legado vivo, não passível de remoção

O backfill centralizado preserva a coluna, mas a auditoria de 21/09 encontrou
zero tags sem evidência centralizada. Os importadores e backfills deixaram de
escrever o JSON legado; a centralização já é a fonte exclusiva da interface.

**Encaminhamento:** manter a coluna apenas para observação durante uma janela
de reexecução das fontes ativas e removê-la numa migration expand-contract
posterior, com o auditor de compatibilidade.

## Contexto atualizado nesta revisão

O docstring do importador de programas e o diagnóstico de 18/09 foram atualizados: PRONON não é reingerido pelo fluxo atual e o CSV morto foi removido. O registro histórico da carga de 18/09 foi preservado.

## Critérios de fechamento

- [x] CSV PRONON morto removido; Radar é o único destino vigente.
- [ ] Dry-run e resumo estruturado em todos os escritores ativos.
- [ ] Testes de integração idempotentes em PostgreSQL dedicado.
- [ ] Classificação e tratamento das cópias/scripts B813.
- [x] Auditoria de tags: zero pendências e novos escritores removidos.
- [ ] Evidência arquivada de dry-run, aplicação e reexecução de cada fonte.

## Atualização de fonte complementar — PERSUS, 2026-09-24

`data/Controle PERSUS.xlsx` não substitui a apresentação canônica PERSUS I,
nem cria uma segunda origem de instrumentos. É fonte complementar, controlada
por hash, para preencher dados operacionais de PERSUS já existentes. O CNES
definitivo continua sendo o do registro PERSUS no banco; um CNES informado na
planilha é evidência de conciliação e não pode sobrescrever a referência.

A aplicação aprovada conciliou as 34 linhas após quatro validações explícitas
da equipe. O escopo foi deliberadamente seletivo: 29 monitoramentos foram
criados e 5 existentes foram complementados, totalizando 34; os outros 58
PERSUS I permanecem em Instrumentos Firmados sem monitoramento interno. Foram
adicionados 185 eventos detalhados e 102 ações concluídas, além de 21 anos e
22 NUPs ausentes. Em 2026-09-25, uma verificação do resumo identificou que
`fase_geral_id` é somente o vínculo contextual do marco, não uma transição de
fase. Foram materializados em lote 110 eventos diretos de fase geral
(append-only, idempotente), fazendo o painel reconhecer as etapas já
comprovadas sem alterar os marcos ou dados de origem. A rotina preserva conflito de ano, NUP ou inauguração como relatório
e nunca faz sobrescrita silenciosa.

Esse fluxo não muda a regra de reconstrução: um novo servidor deve receber
clone lógico integral do Neon. A planilha e a rotina complementar não são
substituto de `pg_dump`/`pg_restore` nem devem ser reexecutadas para reconstruir
dados manuais de uma base clonada.

### Evidência complementar — 2026-09-25

O reparo `--fases-gerais` foi executado primeiro em simulação e informou 110
inserções para as 34 linhas conciliadas, sem pendência de vínculo. Após a
aplicação, a simulação retornou zero novas inserções. Essa evidência cobre a
idempotência do reparo de fases; não substitui os testes de integração
dedicados que ainda faltam para os importadores históricos.

## Revalidação PERSUS I e monitoramento interno — 2026-09-25

Esta rodada foi estritamente de leitura: não criou, atualizou nem apagou
registros no Neon. Foram reconciliadas a fonte inicial
`docs/monitoramento-equipamentos/Apresentação PER-SUS.xlsx` (92 PERSUS I),
`data/Controle PERSUS.xlsx` (34 complementos) e
`data/Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx` (aba PERSUS-I,
40 entregas). A fonte inicial continua completa no banco: 92/92 identidades
(CNES, tipologia, UF, município e situação) foram encontradas, sem novo
instrumento a criar. As 34 linhas do Controle também pertencem a PERSUS já
existente; o Controle é complemento, não fonte de CNES.

### P1 — dois PERSUS com marcos existentes continuam sem fase geral direta

Os PERSUS `PS1-135842` (CNES 2576341) e `PS1-987594` (CNES 0009725) têm
marcos operacionais, mas nenhum evento direto de `fase_geral`. O resumo deriva
a etapa exclusivamente desses eventos diretos; portanto ambos aparecem como
“Não iniciado” apesar de haver histórico. Isso corrige a afirmação anterior
de que a materialização havia coberto todo o escopo de 34: os 110 eventos
foram idempotentes para os vínculos que a rotina reconheceu, mas não resolvem
os dois casos cujo marco detalhado ficou sem `fase_geral_id`.

O CNES **2576341** é `PERSUS1-2576341-C`, Hospital Norte Paranaense HONPAR,
Arapongas/PR. O Controle registra situação **“3. EM ANÁLISE CNEN”**, previsão
CNEN em 2026-09-26, e os marcos de equipamento/recebimento evidenciam término
de instalação em 2025-09-24, comissionamento em 2025-10-10 e termo de aceite
em 2025-09-23. A aba PERSUS-I de Entregas o classifica como apto à inauguração,
com licença pendente e sem inauguração efetiva. A correção segura é registrar
o estágio de comissionamento e a pendência regulatória; não concluir ou
inventar data de inauguração.

O motivo técnico é a conciliação antiga por UF/município/nome da unidade: a
fonte também contém a denominação Hospital Regional João de Freitas para esse
CNES. Ela não pode escolher silenciosamente entre nomes alternativos. O CNES
já persistido no PERSUS é a referência definitiva; como fallback, a rotina
deve usar CNES somente quando houver uma única linha de equipamento na fonte.
CNES repetido exige chave adicional (NUP, código de obra, ano ou vínculo
confirmado), nunca a primeira ocorrência encontrada.

### P1 — datas de inauguração da planilha de entregas exigem conciliação

Dos 40 registros PERSUS-I da planilha de entregas, o cruzamento estrito por
CNES + unidade/localidade encontrou 22 correspondências sem ambiguidade. Oito
já coincidem com a data armazenada; seis possuem data de entrega sem data
equivalente no banco (`2273462`, `4028155`, `2165058`, `2560771`, `2611686`,
`2384299`); e três divergem e não podem ser sobrescritos automaticamente:
`2244306` (2024-02-08 no Controle/banco versus 2024-08-02 em Entregas),
`2111640` e `2338424` (2025-12-11 no Controle/banco versus 2025-11-12 em
Entregas). Dezoito linhas têm variação de nome/alias que impede associação
estrita. A data de Entregas somente poderá alimentar `data_conclusao` após
definir sua precedência sobre a fonte Controle e validar cada divergência.

As 29 inaugurações efetivas existentes no Controle, por outro lado, já
coincidem integralmente com `Convenio.data_conclusao` e com o marco de
inauguração no banco. Não há correção a fazer para elas.

### P1 — integridade operacional do universo monitorado

O banco tem 120 instrumentos no monitoramento interno: 71 Convênios, 12 FAF,
3 TED e 34 PERSUS I. A varredura encontrou 85 sem fase geral direta, 141
eventos físico/regulatórios sem vínculo `fase_geral_id`, seis eventos com
`data_ocorrencia` futura e 16 instrumentos com marco de inauguração sem uma
conclusão direta correspondente. Há ainda quatro previsões de inauguração
vencidas sem data real (três Convênios e um FAF). Esses são problemas de
qualidade do histórico e do resumo, não de schema ou de cálculo de cobertura.

**Encaminhamento obrigatório antes de mutar dados:** (1) criar uma tabela ou
relatório versionado de conciliação de fontes; (2) completar os dois PERSUS
apenas por fallback CNES inequívoco; (3) reaplicar fases por evento direto,
append-only e idempotente; (4) tratar ocorrência futura como erro de cadastro,
preservando a evidência e registrando a previsão no campo próprio, nunca
alterando silenciosamente o evento histórico; e (5) exigir confirmação de
inauguração e fonte para cada uma das 16 conclusões candidatas. Nenhuma dessas
ações autoriza sobrescrever CNES, NUP ou data efetiva.
