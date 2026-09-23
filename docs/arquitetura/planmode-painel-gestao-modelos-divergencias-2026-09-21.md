# Plan Mode — Painel de Gestão: modelos visuais e divergências de conclusão — executado

## Objetivo

Evoluir o painel de gestão do monitoramento interno com modelos inspirados nos
painéis fornecidos pela equipe e com um radar operacional para identificar
instrumentos concluídos internamente cujo status externo ainda não foi
concluído.

O plano foi executado em 2026-09-21. A implementação preservou o mapa fora do
escopo e não alterou dados existentes.

## Evidências avaliadas

Foram avaliadas as imagens em `data/`:

- `PHOTO-2026-09-10-15-25-52.jpg`: visão executiva com investimento,
  repasse, municípios, instrumentos, equipamentos, filtros e distribuição
  geográfica.
- `PHOTO-2026-09-10-15-25-52 2.jpg`: visão geral com cronograma de entregas,
  licenciamento CNEN, evolução anual e tipo de contratação.
- `PHOTO-2026-09-10-15-25-52 3.jpg`: recorte PERSUS com concluídos, previstos,
  execução, PAC e ranking de execução.
- `PHOTO-2026-09-10-15-25-52 4.jpg`: recorte Convênios com licenciamento,
  evolução anual, situação e tabela de instrumentos.
- `PHOTO-2026-09-10-15-25-52 5.jpeg`: visão financeira/detalhe de itens,
  pagamentos, restituições e saldo.
- `Monitoramento Base de Dados - Convênio FAF TED.jpeg`: recorte de
  entrega/inauguração por contratação e previsão/conclusão.

## Modelo recomendado para o painel SIGEO

### 1. Cabeçalho executivo

Manter uma faixa compacta de indicadores, com origem e data de atualização:

- instrumentos monitorados;
- equipamentos monitorados;
- municípios assistidos;
- valor global monitorado;
- valor desembolsado/pago, respeitando a regra de 100% para FAF, TED e
  PERSUS;
- concluídos internamente;
- divergências de conclusão externa.

O valor deve continuar separado por origem. Não misturar valores da API com
instrumentos manuais sem expor a fonte e a regra de desembolso.

### 2. Filtros de gestão

Adicionar filtros que alterem todos os blocos do painel:

- tipo de contratação;
- família do equipamento, usando o catálogo canônico de marcadores;
- UF e município;
- técnico titular;
- fase interna;
- situação externa normalizada;
- somente divergências de conclusão;
- ano do instrumento.

O filtro de equipamento não deve repetir o problema já corrigido dos
prioritários: alias de Acelerador Linear/LINAC deve ser classificado no
catálogo prioritário e nunca reaparecer como “outro”.

### 3. Blocos visuais

Implementar em etapas, reutilizando os componentes atuais do painel:

1. distribuição por fase interna, tipo de contratação, UF e equipamento;
2. cronograma de entrega, instalação e inauguração prevista, com contagem de
   atrasados;
3. situação de licenciamento CNEN: deferido, em análise, pendente e vencendo;
4. série anual de equipamentos entregues, licenciados e inaugurados;
5. tabela operacional dos casos prioritários, ordenada por risco;
6. bloco de divergências de conclusão descrito abaixo.

O mapa dos PNGs não deve ser copiado nesta rodada. O projeto registra que
`municipio` é texto livre e que ainda não há join confiável com macrorregião;
quando o mapa voltar ao escopo, ele deverá usar CNES/UF validado, não nome de
município como chave.

## Regra de negócio: concluído internamente versus aberto na fonte externa

### Concluído internamente

Considerar concluído somente quando houver evento vigente do marco de fase
`fase_concluido` com `data_ocorrencia` preenchida. Não usar somente percentual,
previsão de inauguração ou texto de observação.

### Concluído externamente

Criar um adaptador de status por fonte, sem comparar strings diretamente na
UI:

- Convênio legado: `situacao_prestacao_contas` normalizada para o estado
  “Prestação de contas concluída”. O campo `situacao` do Portal é outra coisa
  e não deve ser usado para esta regra.
- Proposta/linha de financiamento: o estado `Pago` é o estado externo
  conclusivo informado pela equipe. Preservar o texto original e registrar a
  normalização aplicada.
- Parceria TransfereGov nova: separar situação da parceria de situação da
  ordem de pagamento. A ordem `Paga` é evidência financeira, mas não inventar
  um estado de prestação de contas que a API não publica.
- FAF, TED, PERSUS e demais cargas manuais: não gerar divergência de API que
  não existe. Exibir somente a conclusão interna e a fonte manual.

### Caso divergente

Gerar divergência quando:

```text
concluído_internamente = true
e existe_fonte_externa = true
e status_externo_conclusivo = false
```

O registro precisa conter `nr_convenio`, tipo de contratação, fase interna,
status externo original, status normalizado, fonte, data da última atualização
da fonte e link para o detalhe do instrumento.

O rótulo visual será “Concluído internamente, pendente na fonte externa”. A
mensagem não deve dizer que a API está errada: trata-se de uma divergência a
ser analisada pela equipe.

## Contrato de dados proposto

Adicionar ao resumo do painel um bloco tipado, por exemplo:

```text
divergencias_conclusao: {
  total: number,
  por_fonte: [{ rotulo, quantidade }],
  itens: [{
    nr_convenio,
    nome_convenente,
    tipo_contratacao,
    fase_interna,
    fonte_externa,
    status_externo_original,
    status_externo_normalizado,
    atualizado_em,
    risco
  }]
}
```

O endpoint deve calcular a regra no backend, com paginação/teto, e a camada
Zod do frontend deve validar o novo shape. A UI não deve acessar
`siconv_raw`, `transferegov_raw` ou `metas_resumo` para decidir conclusão.

## Plano de execução

### Bloco 1 — fonte única e normalização

- Criar helper backend para normalizar status externos, com testes de acentos,
  caixa, espaços, singular/plural e valores nulos.
- Reusar o resolver de fase atual por instrumento.
- Documentar em `docs/metodologia-parametros.md` somente se a regra tocar
  cálculo existente; caso contrário, atualizar `docs/arquitetura/fluxo_requisicao.md`
  e o modelo ER.

### Bloco 2 — resumo e consulta operacional

- Estender `/monitoramento/resumo` com o bloco de divergências.
- Garantir que a consulta não faça N+1 por instrumento.
- Ordenar por risco: status externo ausente, fonte desatualizada, prazo de
  inauguração vencido e demais sinais já existentes.
- Cobrir Convênio legado, proposta e parceria nova com testes separados.

### Bloco 3 — painel

- Adicionar KPI “Divergências de conclusão”.
- Adicionar seção/tabela com filtros e link para detalhe.
- Reaproveitar `PainelSecao`, `MetricasExecutivas` e componentes de
  distribuição antes de criar novos componentes.
- Adicionar estados de carregamento, vazio e erro específicos.

### Bloco 4 — visual e responsividade

- Manter o padrão visual atual do SIGEO; usar os PNGs como referência de
  hierarquia, não como cópia literal de Power BI.
- Validar em desktop e largura móvel, sem mapa nesta entrega.
- Evitar gráficos que escondam o número absoluto: todo donut/barras deve ter
  contagem acessível e legenda textual.

### Bloco 5 — saneamento obrigatório

- Procurar comentários que ainda descrevam “situação externa” sem distinguir
  Portal, SICONV legado e TransfereGov novo.
- Remover helpers, campos de UI e componentes mortos que sobrarem após a
  migração do resumo.
- Procurar arquivos de contexto que afirmem que a API nova possui estado de
  prestação de contas concluída; atualizar ou remover a afirmação conforme a
  fonte real.
- Atualizar `AGENTS.md` e os documentos de arquitetura afetados somente após
  a implementação, com arquivo/linha verificável.

## Verificação de aceite

- Um convênio com fase interna concluída e prestação de contas aberta aparece
  na divergência.
- Um convênio com fase interna concluída e prestação de contas concluída não
  aparece.
- Uma proposta com status `Pago` não aparece como pendente.
- Carga manual sem API não aparece como divergência externa.
- Filtros alteram KPI, distribuição e tabela de forma consistente.
- Testes backend, lint, testes frontend e build passam.
- Não há referências mortas aos componentes removidos nem documentação que
  contradiga o contrato final.

## Resultado da execução

- O backend passou a normalizar os estados externos e a expor
  `divergencias_conclusao` em `GET /monitoramento/resumo`.
- O painel ganhou o KPI e a lista operacional de divergências, com link para o
  detalhe de cada instrumento.
- Convênios, propostas TransfereGov e cargas manuais ficaram com regras de
  fonte distintas; cargas manuais não são tratadas como divergência de API.
- Foram adicionados testes unitários para acentuação, prestação concluída,
  proposta paga e fonte inexistente.
