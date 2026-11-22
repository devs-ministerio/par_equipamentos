# Diagnóstico funcional do SISGEO — versão de avaliação 5180

Data: 29/10/2026. Inclui validação autenticada de Relatórios, Dados Oficiais, Monitoramento Interno, Análise de Mérito, Painel de Gestão, Radar de Instrumentos e Notificações na porta 5180. Natureza: diagnóstico e sugestões para decisão de produto; nenhuma implementação ou migração autorizada por este documento.

**Status: diagnóstico finalizado em 29/10/2026**, incluindo a verificação de Renovar sessão. Reúne 57 registros de avaliação — achados, constatações e recomendações — com evidências e limites por módulo. Finalização do documento não significa correção dos problemas nem aprovação da aplicação para produção.

## 1. Síntese e referência da avaliação

As seções 9 a 15 registram a validação autenticada dos módulos e da renovação de sessão. A seção 11 inclui criação, correção, conclusão e exclusão lógica de registros de teste no clone local. A seção 12 inclui o corte dos tooltips informado pelo usuário e uma inconsistência relevante nos resultados macrorregionais publicados de PET-CT no clone: 59 classificações divergem da fórmula atual. A seção 13 avalia a leitura executiva do painel, seus filtros, mapa, indicadores e pendências. A seção 14 investiga o Radar e a Central de Notificações, incluindo o alcance da leitura em lote. A seção 16 consolida o encerramento e a ordem sugerida de correção. Essas constatações locais não certificam o estado de produção.

A prioridade definida pelo usuário é saber **o que foi concluído, quando foi concluído e qual é a previsão de conclusão do que continua em andamento**. Entrega é uma informação operacional relevante, mas deve ocupar um segundo nível nessa leitura.

Recomendações principais:

1. Organizar a página e o relatório executivo por conclusão física e datas, com entrega em uma visão operacional própria.
2. Separar conclusão física, prestação de contas, pagamento e entrega; cada fato deve ter rótulo e evidência próprios.
3. Oferecer período por data de conclusão ou previsão, mantendo ano de origem como filtro distinto.
4. Reunir FAF de carga manual e FAF da API em Linhas de financiamento, preservando origem e identidade.
5. Incluir também TED nessa organização, com categoria própria. O grupo confirmado precisa de um nome que comporte registros manuais e instrumentos de módulos diferentes.
6. Corrigir as diferenças remanescentes entre opções de filtro, prévia e exportação, aproveitando os ajustes já existentes na versão avaliada.
7. Dar efeito real ao seletor Simplificado/Completo onde hoje ele é ignorado, ou retirá-lo dessas visões até que exista uma diferença útil.

**Versão de referência:** frontend em `http://localhost:5180`, processo identificado com diretório de trabalho em `.codex-work/teste-integrado/frontend`; `.env.local` aponta para `http://localhost:8010`, cujo processo trabalha em `.codex-work/teste-integrado/backend`. A revisão Git dessa cópia foi `3906761`. Os caminhos de código abaixo se referem a essa cópia, e não ao checkout principal.

A avaliação inicial de código foi complementada por **sessão autenticada na porta 5180, usando a conta local fornecida pelo usuário**, seleção de filtros e downloads pelos botões normais da página. Foram comparados os arquivos Word e Excel dos dois níveis nos modos geral, concluídos e entregues. O Word completo do recorte TED e o Word completo de concluídos da Paraíba foram também renderizados e inspecionados visualmente. A seção 9 registra os cenários e seus limites. As credenciais não integram o documento.

Para contexto da carteira, foram usadas as consultas de produção de 29/10: identidade confirmada como `neondb` / `sigeo_runtime`, transações somente leitura. Esses números descrevem produção, não certificam a atualização do clone usado pela API 8010.

## 2. Ajustes já existentes na porta 5180

A versão avaliada já tem avanços que devem ser preservados:

- Extração específica de equipamentos entregues, com uma linha por unidade, dados físicos e data da entrega.
- Extração específica de concluídos, com prévia paginada e relação de pendências.
- Filtro de situação agrupado por origem: Instrumento, Monitoramento e Proposta. A origem acompanha a solicitação ao backend no relatório geral.
- Aplicação de programa e equipamento às propostas no backend do relatório geral; o diagnóstico não deve repetir que esses filtros nunca chegam à exportação.
- Aviso de que a prévia geral é parcial e de que o arquivo consulta novamente os dados.
- Data de inauguração/previsão no bloco narrativo simplificado do Word.

Referências: `frontend/src/pages/monitoramento-relatorios-page.tsx:284`, `frontend/src/lib/situacao-relatorio.ts:1`, `backend/app/services/relatorios.py:504`, `backend/app/services/relatorios_entregues.py:1`, `backend/app/reports/entregues.py:1`.

## 3. Diagnóstico dos filtros

### D01 — O seletor “Conclusão” mistura finalidade de relatório e fatos diferentes

**Confirmado:** o seletor oferece “Concluídos” e “Equipamento entregue” como alternativas. Uma opção muda para uma extração por instrumento/parceria; a outra muda para uma extração por unidade física. O total de “registros” passa, assim, a representar entidades diferentes.

**Impacto:** entrega parece uma categoria de conclusão. Um instrumento concluído pode ter entrega registrada; as duas condições podem coexistir. Também não se pode comparar o número de unidades entregues com o de instrumentos concluídos.

**Sugestão:** separar a escolha de visão do filtro de situação. Propor as visões “Conclusão e previsões” como principal, “Carteira e financiamento” e “Entregas por equipamento” como complementar. Dentro da visão principal, oferecer concluídos, em andamento com previsão, previsão vencida, sem previsão e conclusão registrada sem data. Contar instrumentos/financiamentos nessa visão; contar unidades na visão de entregas.

Referências: `frontend/src/pages/monitoramento-relatorios-page.tsx:507`, `backend/app/services/relatorios.py:1504`, `backend/app/services/relatorios_entregues.py:44`.

### D02 — O período atual não responde “o que concluímos neste período?”

**Confirmado:** os filtros usam ano do instrumento ou da proposta. No monitoramento, há ainda uma regra de inclusão de instrumentos não concluídos quando o intervalo contém o ano corrente. As extrações de concluídos e entregues também comparam o intervalo com o ano de origem; a data de entrega não determina esse recorte.

**Impacto:** um instrumento de 2023 concluído em 2026 pode ficar fora de um relatório selecionado como 2026. Uma entrega ocorrida em 2026 também pode ficar fora por pertencer a instrumento mais antigo.

**Sugestão:** tornar explícita a “Referência do período”: conclusão efetiva, previsão de conclusão/inauguração, entrega ou ano de origem. Na visão principal, usar conclusão para realizados e previsão para a agenda futura, em recortes identificados separadamente. Usar data inicial e final completas quando a referência for um evento; manter ano inicial/final apenas para ano de origem. Registros sem data precisam de um recorte próprio, e não de uma data inferida.

Referências: `frontend/src/pages/monitoramento-relatorios-page.tsx:158`, `backend/app/services/monitoramento_instrumentos.py:241`, `backend/app/services/relatorios_encerrados.py:28`, `backend/app/services/relatorios_entregues.py:25`.

### D03 — A classificação de contratação ainda impede a visão conjunta de FAF

**Confirmado:** propostas são tratadas como “Parceria TransfereGov” para o filtro de contratação. Selecionar FAF exclui essas propostas, mesmo quando o programa oficial é FAF. Isso afeta a prévia e o backend geral.

**Sugestão:** resolver o tipo no backend, por evidência oficial ou pela classificação documentada da carga, e devolvê-lo em campo próprio. A categoria deve atravessar filtros, cartões, prévias, exportações e inclusão no monitoramento. Separar “Tipo” (FAF, TED, PRONON etc.), “Origem” (API/carga manual) e “Estágio” (proposta/confirmado). Não tornar o frontend responsável por interpretar JSON cru para decidir a categoria.

Referências: `frontend/src/pages/monitoramento-relatorios-page.tsx:35`, `frontend/src/pages/monitoramento-relatorios-page.tsx:304`, `backend/app/services/relatorios.py:512`, `frontend/src/components/features/proposta-card.tsx:148`.

### D04 — Ainda há diferenças entre opções, prévia e arquivo

**Confirmado na leitura do código:**

- As opções de contratação, programa, equipamento e território continuam sendo derivadas, nessa página, da base de instrumentos/programas. Valores exclusivos das propostas podem faltar nas opções.
- O filtro de propostas da prévia considera geografia, período, contratação e situação, mas não aplica programa nem equipamento; o backend geral já aplica ambos. Logo, selecionar esses filtros pode deixar a prévia mais ampla que o arquivo.
- A tradução para o filtro das extrações especiais retira a situação quando sua origem é Monitoramento. Na extração de entregues, o serviço também não consulta `filtro.situacao`. Há filtros visíveis cujo significado não é preservado nesses modos.

**Sugestão:** opções e resultados devem sair do universo pertinente à visão selecionada. Adotar o mesmo contrato de recorte para prévia e exportação. Quando um filtro não se aplica, ocultá-lo ou explicar sua indisponibilidade; não mantê-lo selecionado sem efeito. Preservar o agrupamento por origem já implementado para as situações que continuarem específicas de cada fonte.

Referências: `frontend/src/pages/monitoramento-relatorios-page.tsx:229`, `frontend/src/pages/monitoramento-relatorios-page.tsx:296`, `frontend/src/hooks/use-dados-oficiais-opcoes.ts:128`, `backend/app/services/relatorios.py:139`, `backend/app/services/relatorios_entregues.py:25`.

## 4. Diagnóstico dos documentos Word e Excel

### D05 — O resumo privilegia carteira, valores e entregas; conclusão e agenda não abrem a leitura

**Confirmado:** o resumo executivo reúne instrumentos/programas, propostas e equipamentos; a tabela de equipamentos pode incluir “Entregues”. Não há um resumo equivalente de conclusão física e previsões. No Excel simplificado, a tabela de monitoramento traz fase atual, mas não as datas principais. A prévia geral de instrumentos também não oferece essas datas.

No Word simplificado a inauguração/previsão já existe, mas fica depois de “Última Ação” e “Último Evento”. No nível completo, o bloco passa a mostrar histórico e ações, sem preservar o mesmo destaque resumido para essa data.

**Sugestão:** abrir todo relatório executivo, simplificado ou completo, com situação de conclusão e agenda. Detalhamento deve acrescentar histórico, mantendo o resumo principal. Entregas, valores e dados físicos entram depois.

Referências: `backend/app/services/relatorios.py:737`, `backend/app/services/relatorios.py:991`, `backend/app/services/relatorios.py:1173`, `backend/app/services/relatorios.py:1403`, `frontend/src/components/features/relatorio-instrumentos-tabela.tsx:92`.

### D06 — “Concluídos” reúne encerramento administrativo, conclusão interna e parceria paga

**Confirmado:** a extração admite prestação de contas concluída, evento interno de conclusão com data e parceria confirmada com ordem paga. O próprio código explica que ordem paga não comprova conclusão física. Uma divergência de prestação de contas pode ainda enviar o registro para pendências, mesmo havendo conclusão interna.

**Impacto:** a lista não responde de forma única à pergunta sobre equipamentos/instrumentos fisicamente concluídos. Um pagamento pode entrar sem comprovação de conclusão; uma conclusão física pode perder destaque por pendência administrativa.

**Sugestão:** manter duas dimensões visíveis: “Conclusão física/inauguração” e “Situação administrativa/financeira”. No relatório gerencial, o evento interno válido de conclusão e sua data devem ter precedência editorial. Prestação de contas aberta ou divergente permanece como pendência administrativa, sem apagar a conclusão física registrada. Pagamento deve aparecer como pagamento. Prestação de contas encerrada sem conclusão física conhecida deve ter essa limitação expressa.

Isso é uma **proposta de mudança da classificação do relatório**. Não altera automaticamente as regras atuais de divergência do painel, nem permite concluir um instrumento sem evidência.

Referências: `backend/app/services/relatorios_encerrados.py:47`, `backend/app/services/relatorios_encerrados.py:141`, `backend/app/reports/encerrados.py:57`.

### D07 — Fim de vigência ocupa uma coluna chamada “Data de conclusão”

**Confirmado:** na ausência da data interna, a extração usa o fim da vigência como `data_referencia`. A origem é indicada, mas a coluna principal continua chamada “Data de conclusão”.

**Sugestão:** separar “Conclusão efetiva”, “Previsão de conclusão/inauguração” e “Fim da vigência”. Na ausência da data real, mostrar “Não informada”. A vigência pode continuar como informação contratual, em campo próprio. Não usá-la para recortar, ordenar ou contar conclusões efetivas.

A previsão deve vir do marco físico de inauguração já existente; não criar `data_prevista` em `fase_concluido`, pois fases gerais não aceitam esse campo. Quando uma previsão é substituída pela inauguração real, o histórico append-only precisa ser consultado para recuperar a última previsão válida anterior. Comparar previsão com realização exige explicitar qual previsão foi usada.

Referências: `backend/app/services/relatorios_encerrados.py:108`, `backend/app/reports/encerrados.py:12`, `backend/app/services/monitoramento_eventos.py:271`, `backend/app/services/monitoramento_eventos.py:304`.

### D08 — Nomes e notas precisam acompanhar a organização atual

O relatório de concluídos usa “Nº do convênio” inclusive para outros tipos. A narrativa geral ainda apresenta filtros como “exclusivos de convênios”, embora o backend já os aplique a outras seções. O seletor Simplificado/Completo permanece disponível para as extrações especiais, cujos geradores não recebem esse nível como argumento.

**Sugestão:** usar “Identificador do financiamento/instrumento”, acompanhado do tipo do identificador; revisar notas de filtros; disponibilizar nível de detalhamento apenas quando houver diferença real no arquivo. Corrigir comentários antigos que descrevem comportamento anterior aos ajustes da porta 5180.

Referências: `backend/app/reports/encerrados.py:17`, `backend/app/services/relatorios.py:1392`, `backend/app/reports/entregues.py:94`, `frontend/src/components/features/relatorio-botoes-gerar.tsx:65`.

## 5. Organização sugerida para página e documentos

### Filtros em ordem de decisão

1. **Visão:** conclusão e previsões; carteira e financiamento; entregas por equipamento.
2. **Recorte principal:** situação de conclusão, referência temporal, início e fim do período.
3. **Financiamento:** tipo, estágio, programa e origem.
4. **Local e objeto:** UF, município, estabelecimento/CNES e equipamento.
5. **Filtros específicos:** situação administrativa, situação da proposta ou entrega, conforme a visão.

A faixa de resumo deve informar a unidade da contagem e a referência temporal. Usar indicadores como instrumentos com conclusão física registrada, com previsão vigente, com previsão vencida e sem previsão. Conclusão registrada sem data deve aparecer como problema de qualidade, separado dos concluídos com data comprovada. Percentuais precisam explicitar denominador e restringir-se à carteira com informação aplicável.

### Ordem sugerida do Word executivo

1. Recorte, data de emissão e fontes.
2. Síntese de conclusões e próximas previsões.
3. Relação principal: instituição, município/UF, CNES, identificação/tipo, equipamento, situação de conclusão, data efetiva e previsão identificada.
4. Pendências de dados e divergências administrativas.
5. Entregas e dados financeiros, em caráter complementar.
6. Histórico de marcos, ações e evidências no nível completo.

No documento de gestão, marca, modelo, série e vida útil ficam no detalhamento de entregas. A coluna “Quantidade entregue” pode permanecer, mas não deve anteceder conclusão e datas na relação principal. Não transformar a conclusão de um instrumento em quantidade de equipamentos em operação sem evidência por item/unidade.

### Ordem sugerida do Excel

“Resumo gerencial”, “Conclusões”, “Previsões”, “Pendências”, “Carteira”, “Entregas” e “Critérios e fontes”. As abas devem compartilhar identificadores para conciliação. Em cada uma, indicar se a linha representa instrumento/financiamento, item ou unidade física. Dados ausentes devem continuar ausentes; evitar zero como substituto de informação desconhecida.

## 6. FAF manual e TED em Linhas de financiamento

### Base factual disponível

Na produção consultada em 29/10, existem **12 FAF e 3 TED de carga manual** em `convenio`, todos com `chave_origem` e todos ligados ao monitoramento. Nenhum desses 15 está marcado como fora de escopo.

A investigação anterior, nesta mesma data, confirmou **10 propostas FAF e 18 PRONON** na base de propostas, confrontadas com a API oficial. Nas FAF, o programa retorna `FAF SAUDE`; nos três programas PRONON, retorna `RENUNCIA SAUDE`. Essas 28 propostas pertencem ao universo atual de Linhas de financiamento.

Foi encontrado um par candidato manual/API pelo mesmo CNES. Isso é apenas um indício para conciliação: **CNES não comprova que os dois registros representam o mesmo financiamento**. Portanto, somar 12 e 10 e anunciar 22 financiamentos FAF únicos ainda não é justificável.

### FAF — recomendação favorável

FAF manual e FAF da API devem poder aparecer na mesma seção e responder ao mesmo filtro de tipo. A origem da informação não deve determinar sua localização na navegação.

A inclusão no grupo confirmado deve respeitar a evidência da carga: identificar o documento/processo que sustenta a confirmação e preservar sua origem. A ausência de `cd_parceria` não deve impedir a exibição de um financiamento manual comprovado, nem autorizar inventar esse código. O FNS reconhece Fundo a Fundo como modalidade própria de transferência, distinta de convênio ([fonte oficial](https://portalfns.saude.gov.br/sobre-o-fns/)).

### TED — recomendação também favorável, com categoria própria

**Os TEDs se enquadram melhor em Linhas de financiamento quando a finalidade dessa aba é reunir as formas de financiamento da carteira.** O TED formaliza descentralização de créditos entre órgãos e entidades federais e possui módulo próprio no TransfereGov ([descrição oficial e API TED](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/dados-abertos/api-modulo-ted/transferencias-ted/api-modulo-de-transferencias-ted)). Essa natureza justifica o agrupamento funcional, preservando o tipo TED.

Isso não significa que TED seja FAF, PRONON ou registro da API de Parcerias. Os três TEDs manuais não tiveram seu vínculo individual com a API TED certificado nesta avaliação. Esse vínculo deve ser demonstrado por identificadores oficiais antes de qualquer conciliação automatizada.

### Nome e limites da seção

Recomenda-se “**Financiamentos confirmados**” e “**Propostas e solicitações**” como subabas de Linhas de financiamento. O primeiro nome comporta FAF, TED e futuras propostas PRONON confirmadas sem depender da existência de um objeto chamado parceria na API. A confirmação precisa ter critério e fonte próprios por modalidade; para PRONON, a classificação como incentivo fiscal não comprova captação, contratação ou pagamento.

Se o nome “Confirmada (parceria)” for mantido, explicar que o agrupamento é funcional e apresentar a confirmação manual separadamente. A primeira alternativa é mais clara.

Sugestão de navegação: manter Convênios e programas PERSUS na seção atual; reunir FAF, TED e PRONON em Linhas de financiamento; manter Monitoramento como camada de acompanhamento transversal. Isso é uma escolha de organização do produto, não uma nova regra normativa ou mudança de modalidade dos registros.

### Mover a apresentação, preservando os cadastros

A primeira mudança deve ser de classificação e composição das listas, sem excluir e recriar os 15 registros manuais. A carga atual gera espelhos em `convenio`; apagar esses espelhos ou copiá-los para `proposta_candidata` como se fossem propostas da API arrisca perder vínculos e duplicar a carteira.

Preservar identificadores, chave de origem, processo SEI, itens, entregas, eventos, ações, responsáveis e histórico. Uma referência de financiamento deve relacionar origem manual, evidência oficial e monitoramento sem confundir número de processo, número de instrumento, ID de proposta e código de parceria. Não renumerar registros apenas para encaixá-los na nova aba.

Conciliação deve comparar modalidade, identificadores oficiais/processo, proponente, objeto e contexto do financiamento. CNPJ, CNES ou nome do município isoladamente não bastam. Havendo dúvida, manter os registros identificados como candidatos à conciliação. Quando o mesmo financiamento tiver duas fontes comprovadas, mostrá-lo e contá-lo uma vez, com ambas as fontes preservadas.

Os relatórios devem refletir a mesma organização: o FAF ou TED sai da seção anterior sem reaparecer em duplicidade nos totais. A futura reorganização deve manter as páginas de detalhe e os vínculos de monitoramento acessíveis. Carga manual continua exibindo apenas os dados que possui; a nova posição não habilita subabas SICONV nem transforma valor informado na carga em pagamento oficial comprovado.

Referências: `backend/scripts/importar_planilha_monitoramento.py:466`, `backend/app/services/monitoramento_instrumentos.py:65`, `frontend/src/components/features/secao-propostas-candidatas.tsx:35`.

## 7. Prioridades sugeridas e critérios para futura implementação

**Prioridade 1 — sentido gerencial:** separar conclusão física de pagamento/prestação de contas; colocar conclusão e datas na abertura da página e dos arquivos; retirar entrega do seletor de conclusão; distinguir data efetiva, previsão e vigência.

**Prioridade 2 — consistência do recorte:** alinhar filtros e opções entre prévia e arquivo, incluindo as extrações especiais; oferecer referência temporal explícita; preservar os ajustes de situação por origem já existentes na porta 5180.

**Prioridade 3 — organização da carteira:** classificar propostas como FAF/PRONON, acrescentar TED como categoria e reunir cargas manuais e API em Linhas de financiamento, após conciliação e com contagem única.

**Prioridade 4 — detalhamento:** manter relatórios de entregas e histórico como apoio, revisar títulos/legendas, definir a diferença entre os níveis e ampliar a validação visual para outros recortes. As amostras autenticadas já verificadas estão na seção 9.

Cenários de aceite recomendados:

- Instrumento de 2023 concluído em 2026 entra no recorte por conclusão de 2026.
- Entrega registrada sem conclusão não aparece como conclusão física.
- Conclusão física com prestação de contas aberta continua visível como concluída fisicamente, com a pendência administrativa identificada.
- Ordem paga sem evidência física permanece pagamento, sem conclusão física presumida.
- Fim de vigência nunca substitui a data real na coluna de conclusão.
- Previsão vencida é calculada apenas para instrumento ainda não concluído e com previsão válida; sem previsão forma grupo distinto.
- Conclusão sem controle por unidade não desaparece do relatório gerencial por falta de série/marca/modelo.
- Filtros de tipo, programa, equipamento, território e situação produzem o mesmo recorte lógico na prévia e nos arquivos, sem efeito silenciosamente ignorado.
- FAF manual e FAF da API respondem ao filtro FAF; TED responde ao filtro TED; PRONON responde ao filtro PRONON.
- Um financiamento conciliado entre fontes não duplica quantidade ou valor e conserva todos os vínculos de monitoramento.

## 8. Limites e decisões pendentes

Este documento não certifica identidade entre FAF manual e FAF da API, nem vínculo dos três TEDs manuais com o módulo TED. Não foram feitas escritas no banco, chamadas de migração, mudanças de código ou alterações na configuração das portas 5180/8010.

Antes de implementar, validar a composição exata do grupo confirmado por modalidade, a evidência de confirmação das cargas manuais e a escolha de previsão para comparações históricas. A referência funcional permanece a versão da porta 5180. Contagens de produção servem como contexto e não devem ser apresentadas como resultado de uma exportação dessa instância local.


## 9. Complemento com uso autenticado da versão 5180

### 9.1. Método e carteira efetivamente exibida

A validação foi realizada pela interface: login normal, abertura de filtros, seleção de opções e botões Baixar Excel/Baixar Word. Não foram criados nem editados instrumentos, eventos ou entregas. O login e a geração dos arquivos podem produzir os registros operacionais de sessão/auditoria previstos pelo sistema; a atividade não incluiu alteração de cadastro ou regra de negócio.

A tela carregada sem filtros mostrou **570 registros: 542 instrumentos/programas, 10 parcerias confirmadas e 18 propostas em tramitação**. São números da instância local, não uma nova contagem de produção. O relatório de concluídos sem filtros mostrou **283 registros principais e 7 pendências**. A visão de entregues mostrou **58 unidades**. A própria prévia contém dados de teste, como uma marca e uma série local; seus números e amostras não devem ser usados como retrato oficial da produção.

Foram baixados 17 arquivos: quatro do relatório geral TED, quatro de concluídos TED, quatro de concluídos PB, quatro de entregues Brasil e um Excel adicional de PERSUS I. A comparação principal usa recortes com conteúdo: geral TED, concluídos PB e entregues Brasil. Nos pares, preservaram-se os mesmos filtros e mudou-se apenas o nível de detalhamento.

A comparação do conteúdo leu as células de todas as abas Excel e os textos/tabelas do Word. Não se usou igualdade de tamanho, nome ou hash do arquivo como prova de equivalência: o horário e metadados de geração podem variar. A prévia continuar igual ao mudar o nível, isoladamente, também não comprova que os arquivos são iguais.

### D09 — Simplificado e Completo são equivalentes nos modos especiais

**Concluídos, UF PB:** a interface mostrou 5 concluídos e 1 pendência. Os dois Excel têm as mesmas células nas abas Critérios, Concluídos e Pendências. A tabela principal tem 17 colunas e 5 linhas de dados; a de pendências, 1 linha de dados. Nos dois Word, as tabelas são idênticas: 11 colunas na relação principal e 3 na relação de pendências. A única diferença textual foi o horário de geração, de 10:39 para 10:40, horário de Brasília.

**Entregues, Brasil:** os dois Excel têm conteúdo idêntico, com 58 linhas de unidades e 13 colunas na aba Equipamentos entregues. Os dois Word têm os mesmos textos e a mesma tabela com 10 colunas e 58 unidades.

**Causa confirmada no código:** a seleção de nível é enviada pela interface, mas os caminhos `encerramento=encerrados` e `encerramento=entregues` chamam geradores que recebem extração, formato e recorte, sem receber o nível. O nome do arquivo muda para simplificado/completo sem mudar o conteúdo correspondente. Referência: `backend/app/services/relatorios.py:1492` e geradores em `backend/app/reports/encerrados.py` e `backend/app/reports/entregues.py`.

**Recomendação imediata de produto:** nesses dois modos, ocultar o seletor ou informar “Formato único” enquanto o nível não tiver efeito real. Não oferecer uma escolha que altera apenas o nome do arquivo.

**Se forem mantidos dois níveis, sugerir uma diferença útil:**

- **Concluídos simplificado:** síntese por financiamento/instrumento, conclusão física em destaque, data real, previsão quando pertinente e identificação mínima. A pendência administrativa deve continuar visível quando material; simplificar não pode remover ressalvas necessárias para interpretar a conclusão.
- **Concluídos completo:** a mesma síntese, acrescida de origem/evidência das datas, situação administrativa e financeira, divergências, histórico e detalhamento dos equipamentos.
- **Entregues simplificado:** instituição, equipamento, instrumento, município/UF e data da entrega, com contagem de unidades clara.
- **Entregues completo:** acrescentar marca, modelo, série, vida útil e dados de rastreabilidade existentes. Não inventar dados físicos ausentes.

Essa diferenciação é sugestão, não definição já implementada. Os dois níveis devem conservar os mesmos filtros e universo, mudando o detalhamento, e não os critérios de conclusão.

### D10 — No relatório geral os níveis já são diferentes

No recorte TED, com os três registros manuais:

- O Excel simplificado traz a aba Convênios com 8 colunas e Monitoramento com 6 colunas e 3 registros.
- O Excel completo traz Convênios com 24 colunas e Monitoramento (timeline) com 11 colunas e 10 registros de histórico, incluindo as linhas de ausência de evento previstas pelo gerador.
- O Word simplificado contém 9 tabelas; o completo, 10. O completo acrescenta a tabela de histórico do TED do Hospital de Clínicas de Porto Alegre e a seção de ações. Seu conteúdo não é igual ao simplificado.

Portanto, a afirmação “Simplificado e Completo são iguais” foi **confirmada para Concluídos e Entregues**, e não para todo o relatório geral. O problema de hierarquia permanece nos dois níveis do geral: os resumos iniciais não dão o destaque desejado à conclusão e às suas datas.

### D11 — Diferença entre prévia e exportação reproduzida com PERSUS I

Passos: limpar filtros, selecionar Programas → Plano de Expansão da Radioterapia no SUS - PERSUS I e exportar Excel completo.

**Na tela:** 120 registros, compostos por 92 instrumentos, 10 parcerias e 18 propostas. As propostas continuam exibindo programas FAF/PRONON alheios ao programa selecionado.

**No arquivo:** 92 instrumentos, aba Propostas apenas com cabeçalho e contagem de propostas igual a zero na aba Leitura. O backend já aplica o programa; a prévia não acompanha essa aplicação nas propostas.

**Efeito para o usuário:** a tela promete conferir o recorte antes da exportação, mas oferece contagens e linhas que não estarão no arquivo. Esse caso não decorre do teto de paginação nem de comparar instâncias diferentes: filtro e download foram feitos na mesma sessão local.

**Sugestão:** dar prioridade a corrigir essa paridade e calcular o resumo a partir do mesmo contrato de consulta. O aviso de prévia parcial não resolve diferenças de interpretação dos filtros.

### D12 — Situação sem efeito reproduzida em Entregues

Passos: limpar filtros, selecionar Conclusão → Equipamento entregue, abrir Situação e selecionar Rejeitada, do grupo Proposta.

**Resultado observado:** o seletor exibe Rejeitada, mas a relação permanece com as mesmas 58 unidades, incluindo registros TED e FAF. Não há explicação de que a situação de proposta não se aplica a essa extração.

**Sugestão:** a lista de situações deve ser pertinente à visão. Se o objetivo for filtrar a fase do instrumento que recebeu a entrega, esse vínculo deve ser explícito e aplicado no backend. Caso contrário, retirar esse filtro da visão de entregas. A conclusão da ação de uma tarefa também não deve ser confundida com a conclusão do instrumento.

### D13 — Exemplos concretos de datas e conclusão reforçam a prioridade gerencial

Na lista Concluídos, o convênio **710615** aparece com “Conclusão: 26/11/2014 (fim da vigência)”. Isso confirma na tela e no Word que o fim da vigência ocupa o lugar principal da data de conclusão, ainda que exista o aviso entre parênteses.

No geral TED, o instrumento **25000185040202348**, do Hospital de Clínicas de Porto Alegre, aparece como “Concluído” no monitoramento. Ao selecionar Concluídos e TED, a relação principal fica vazia e o mesmo instrumento aparece em pendências como “Conclusão interna sem data”. Essa separação por qualidade do dado tem justificativa, mas precisa de um resumo que diga “1 conclusão registrada sem data”, para que não pareça inexistência de conclusão registrada.

No Word de concluídos PB, o PERSUS I **PS1-640379** aparece com conclusão em **18/11/2016** e quantidade entregue **0**. O documento não explica junto à linha se o zero é ausência de registro por unidade ou comprovação de nenhuma entrega. O contraste reforça a necessidade de qualificar a cobertura do controle por unidade e manter o dado de conclusão acima do inventário de entregas.

Nenhum desses exemplos autoriza preencher uma data faltante com a data da entrega, com o fim da vigência ou com a data de geração do relatório.

### D14 — Notas, nomes e apresentação observados nos arquivos

O Excel de PERSUS I traz na aba Leitura a nota de que situação, programa, equipamento e busca não filtram propostas nem monitoramento. Porém, no próprio arquivo o programa retirou as propostas e restringiu o monitoramento a PERSUS I. A nota ficou desatualizada em relação aos ajustes do backend.

O filtro de programas também expõe grafias com problemas de codificação, como “ATEN??O” e caracteres de substituição. Sugere-se separar nome oficial bruto de rótulo de consulta revisado, preservar a origem e evitar correções automáticas que juntem programas distintos por semelhança textual.

Foram inspecionadas as três páginas renderizadas do Word geral TED completo e a página do Word de concluídos PB completo. Nessas amostras não se observaram textos sobrepostos ou tabelas cortadas. Os problemas identificados são de hierarquia e conteúdo:

- O Word geral abre espaço para uma tabela de propostas inteiramente zerada, mesmo no recorte TED. Sugere-se omitir essa seção quando ela não se aplica, com uma nota curta de escopo.
- No Word de concluídos, quantidade planejada/entregue antecede a data, que fica perto do final de uma tabela com 11 colunas. A data pode ganhar destaque com a retirada dos dados de entrega da relação executiva principal.
- O termo “Nº do convênio” continua acima de identificador PERSUS. Usar identificador do instrumento/financiamento e tipo.
- O relatório geral TED contém um bloco sem nome de instituição, cujo título se reduz ao tipo e identificador. Sugerir “Instituição não informada” e uma pendência de cadastro, sem interromper a consulta dos demais campos.

A inspeção visual abrangeu essas duas amostras Word. A comparação dos Excel e dos Word de entregues foi estrutural e de conteúdo; não certifica a aparência de todas as páginas ou planilhas em Microsoft Word/Excel.

### 9.2. Arquivos usados para conferência

Amostras baixadas pela interface, sem edição posterior:

- Concluídos PB: [Excel simplificado](/Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-uf-simplificado.xlsx), [Excel completo](/Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-uf-completo.xlsx), [Word simplificado](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-uf-simplificado (1).docx>) e [Word completo](/Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-uf-completo.docx).
- Entregues Brasil: [Excel simplificado](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-simplificado (5).xlsx>), [Excel completo](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-completo (2).xlsx>), [Word simplificado](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-simplificado (4).docx>) e [Word completo](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-completo (2).docx>).
- Geral TED: [Excel simplificado](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-simplificado (3).xlsx>), [Excel completo](/Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-completo.xlsx), [Word simplificado](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-simplificado (2).docx>) e [Word completo](/Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-completo.docx).
- Paridade do filtro PERSUS I: [Excel completo](</Users/gustavoleite/Downloads/relatorio-instrumentos_repasse-brasil-completo (3).xlsx>).

Os nomes genéricos dos downloads não identificam a visão nem os filtros e dependem de sufixos do navegador para distinguir arquivos. Sugestão adicional: incluir finalidade, recorte, nível quando aplicável e data/hora no nome do arquivo. Isso reduz a chance de confundir Concluídos, Entregues e Carteira ao compartilhar um relatório.

## 10. Validação de Dados Oficiais como usuário

A validação foi ampliada para Dados Oficiais, na mesma sessão local da porta 5180. Foram percorridas Instrumentos/Programas, Linhas de financiamento → Confirmada (parceria) e Linhas de financiamento → Em tramitação (proposta), além dos detalhes e das seis subabas SICONV. Todos os achados desta seção são da instância local; não representam uma auditoria de dados atuais de produção.

### 10.1. Cobertura e comportamentos que funcionaram

- A carteira sem filtros mostrou 542 instrumentos/programas, 245 monitorados e 297 não monitorados. O filtro Monitorado → Não retornou 297 e o indicador Monitorados passou a zero, coerentemente.
- Buscar o número 825374 retornou um instrumento. O detalhe carregou identificação, vigência, financeiro e itens do plano.
- Nesse convênio, Itens do plano, Empenhos, Desembolsos, Licitações e Fornecedores alternaram corretamente. Os dois empenhos de R$ 42.963 e R$ 100.000 são coerentes com o valor global exibido de R$ 142.963; desembolso e pagamento ao fornecedor também exibem R$ 142.963.
- Termos aditivos ficou desabilitado quando a contagem era zero. Em uma segunda amostra, o convênio 780603, a subaba abriu os seis termos existentes. Assim, as seis subabas foram efetivamente percorridas, incluindo uma amostra com termos.
- O link de monitoramento do 825374 abriu o instrumento correto, e o retorno preservou a busca na página de origem. A seção profunda voltou fechada, sem perder o recorte.
- O filtro SC retornou 23 instrumentos e sobreviveu à recarga da página. A paginação de PERSUS I passou de 1–20 para 21–40, na página 2 de 5. Ao mudar o recorte, a lista voltou à primeira página.
- Em Outros identificados, Aparelho de Anestesia permaneceu selecionável e retornou os cinco instrumentos indicados na opção.
- Foram abertos os detalhes de FAF manual 25000198305202459, TED manual 25000185040202348, PERSUS I PS1-103845 e PERSUS II PS2-168997. Esses detalhes não exibiram subabas SICONV como se fossem fontes oficiais disponíveis. Essa distinção de origem deve ser preservada.
- Na subaba confirmada, buscar o código 202500044035 encontrou a proposta 44942. Foram lidas suas metas, itens, parecer, cronograma previsto, origem de recurso e execução financeira. A proposta PRONON 1294 também teve suas metas abertas.

Não foram acionados os botões de adicionar ao monitoramento, editar cadastro ou registrar entrega. O teste não certifica essas operações mutáveis, permissões de outros perfis, comportamento mobile ou navegação completa por leitor de tela.

### D15 — P1 — O indicador Concluídos contradiz cartões e filtro de situação

**Reprodução:** buscar 825374 em Instrumentos/Programas. A lista fica com um instrumento e o cartão mostra Concluído, mas o indicador Concluídos exibe zero. O filtro Situação oferece Concluído (1), confirmando que o estado é reconhecido na lista.

O mesmo problema aparece no recorte PERSUS I: 92 instrumentos e 92 monitorados, vários cartões com Concluído e o indicador Concluídos igual a zero. Em contrapartida, o recorte Não monitorados mantém os 139 concluídos observados no total da página.

**Causa no código:** a situação exibida prioriza a fase interna; o contador compara essa situação com um conjunto que contém apenas Prestação de Contas Concluída e Em operação, sem Concluído. Portanto, cartão e filtro já incorporam a fase, mas o contador não reconhece seu valor conclusivo.

**Sugestão:** usar uma classificação comum e explícita para indicador, filtro e cartão. Pela prioridade gerencial deste diagnóstico, separar conclusões físicas registradas de encerramentos administrativos. Apenas acrescentar uma palavra ao conjunto resolveria parte da divergência numérica, mas manteria a mistura de conceitos. Definir também o tratamento de conclusão sem data, sem ocultá-la nem contá-la como conclusão datada comprovada.

Referências: `frontend/src/pages/monitoramento-equipamentos-page.tsx:163`, `frontend/src/hooks/use-dados-oficiais-resumo.ts:45`, `frontend/src/lib/equipamento-catalogo.ts:3`.

### D16 — P1 — Um filtro ativo pode desaparecer visualmente quando a combinação não tem resultados

**Reprodução com ações separadas e resultados estabilizados:** limpar filtros; selecionar UF → SC, obtendo 23 instrumentos; buscar Varginha. O resultado correto da interseção é vazio. Porém, o seletor deixa de mostrar SC e passa a mostrar apenas UF, embora o endereço continue com `uf=SC&busca=Varginha` e SC continue restringindo a consulta.

**Impacto:** o usuário vê uma busca sem resultados e pode não perceber a restrição territorial ainda aplicada. Limpar todos os filtros funciona, mas não torna a causa do vazio compreensível nem permite reconhecer facilmente qual seleção corrigir.

**Causa no código:** o rótulo do seletor depende de localizar o valor atual nas opções disponíveis; se a cascata remove essa opção, o componente usa o placeholder mesmo com o valor ainda selecionado.

**Sugestão:** preservar visualmente todo filtro ativo, mesmo sem correspondência nas opções atuais. Mostrar SC com indicação de combinação sem resultados e permitir remoção individual; acrescentar um resumo de filtros ativos. Não remover automaticamente o filtro sem informar o usuário.

Referência: `frontend/src/components/common/single-select-filter.tsx:75` e `frontend/src/components/common/single-select-filter.tsx:115`.

### D17 — P1 — Dados de conclusão e inauguração têm significados diferentes, sem distinção suficiente

No detalhe oficial do 825374, a seção Vigência exibe Conclusão em 27/06/2017, igual ao fim da vigência. No monitoramento vinculado, o cabeçalho informa Inaugurado em 17/03/2022, fase Concluído, e a entrega consta como 29/04/2022.

Essas datas foram observadas na interface; não se confirmou aqui qual documento de origem sustenta cada uma. A diferença não deve ser corrigida por substituição automática. Além de distinguir conclusão administrativa/contratual e inauguração, a entrega posterior à inauguração é um caso para conferência da qualidade da carga.

**Sugestão:** na camada principal, mostrar conclusão física/inauguração e sua data real ou previsão, acompanhadas da origem. Reservar vigência e datas administrativas a campos próprios. Criar pendência de conferência para sequências cronológicas incompatíveis, sem reescrever o histórico nem presumir que uma data importada é a correta.

A falta de data de inauguração no cartão de Dados Oficiais obriga o gestor a abrir outra página para obter a informação mais importante. O resumo do acompanhamento pode ser apresentado ali em leitura, mantendo o cadastro e a edição no monitoramento.

Referência: `frontend/src/components/features/convenio-card-detalhes.tsx:66`.

### D18 — P1 — Totais financeiros convertem ausência de valor em R$ 0

**Reprodução:** selecionar Contratação → PERSUS II. A lista retorna 50 instrumentos. Os cartões exibem Valor global como ausente, mas os indicadores Valor global e Desembolsado mostram R$ 0.

**Impacto:** o resumo sugere conhecimento de um valor financeiro nulo quando os próprios registros indicam falta de informação. A situação Em contratação ajuda a interpretar a carteira, mas não elimina a ambiguidade do total.

**Sugestão:** apresentar Sem valor informado quando todos os registros estiverem sem valor. Nos recortes mistos, informar soma dos valores conhecidos e cobertura, por exemplo “valor conhecido de X de Y instrumentos”. Manter zero apenas quando for um valor informado e válido.

As cargas manuais FAF, TED e PERSUS I também mostram “100% desembolsado · conforme carga interna”. Essa nota já é uma distinção útil e deve ser preservada. No total consolidado, recomendar separação ou explicitação da parcela informada pela carga e da parcela sustentada por execução financeira oficial, sem transformar a convenção da carga em comprovação de pagamento.

Referência: `frontend/src/hooks/use-dados-oficiais-resumo.ts:30`.

### D19 — P2 — As propostas perdem o recorte ao recarregar, ao contrário dos instrumentos

**Reprodução:** em Linhas de financiamento → Em tramitação, selecionar UF → SP. A lista passa para 7 de 18 propostas. Recarregar a página remove a seleção de SP e volta às 18 propostas. O comportamento contrasta com Instrumentos/Programas, onde SC permaneceu selecionado após recarga.

A troca entre as abas também usa estados separados: selecionar SC em Instrumentos/Programas e abrir Linhas de financiamento mostra propostas de todo o país. A seleção territorial anterior pode continuar no endereço sem representar o recorte visível das propostas.

**Sugestão:** definir um contrato consistente de navegação. Preferir filtros compartilháveis na URL, com parâmetros próprios por visão quando os significados divergirem. Se território e busca forem compartilhados entre abas, aplicá-los de fato; se forem independentes, mostrar explicitamente o escopo da aba atual. O endereço copiado deve reproduzir o recorte visível, inclusive em financiamento.

Referências: `frontend/src/hooks/use-dados-oficiais-filtros.ts:34`, `frontend/src/components/features/secao-propostas-candidatas.tsx:65`.

### D20 — P2 — “Em tramitação” inclui propostas com decisão negativa

A subaba reúne as 18 propostas PRONON sem parceria: uma em análise, quatro em elaboração, seis aprovadas e sete rejeitadas. Portanto, não representa somente propostas em tramitação administrativa.

**Sugestão:** preferir “Propostas e solicitações” ou “Sem financiamento confirmado” como agrupamento amplo e separar os desfechos em filtros/indicadores: elaboração, análise, aprovada e rejeitada. Manter histórico de rejeitadas disponível, com um recorte padrão explícito se a gestão preferir acompanhar somente ativas. Não tratar aprovação PRONON, por si só, como prova de captação ou financiamento confirmado.

O cadastro da proposta 1294 mostra Valor planejado ausente no cabeçalho, embora a meta contenha um item de upgrade de R$ 4.590.260. Não é adequado preencher o total da proposta automaticamente com esse item sem conciliação. Recomenda-se distinguir total informado pela fonte e valor conhecido dos itens, deixando clara a disponibilidade parcial.

Referência: `frontend/src/lib/proposta-status.ts:50` e detalhe autenticado da proposta 1294.

### D21 — P1 — A separação manual/API expõe uma nova inclusão sem sinalizar candidato de conciliação

A parceria confirmada 202500044035, proposta 44942, mostra CEPONSC, CNES 0019445, valor planejado de R$ 2.200.000 e situação Paga. O detalhe oferece Adicionar ao monitoramento interno.

Em Instrumentos/Programas, o registro manual 25000087502202613 já aparece como monitorado para CEPONSC, no mesmo CNES e com valor global de R$ 2.200.000. Os CNPJs exibidos nas duas origens são diferentes. **Essa combinação é um candidato à conciliação, não prova de identidade ou duplicidade**, e o botão não foi acionado.

**Sugestão:** antes de uma nova inclusão, apresentar candidatos relacionados por instituição/CNES, modalidade, objeto e contexto do financiamento. A confirmação da identidade exige documentos ou identificadores oficiais. Se corresponder ao mesmo financiamento, relacionar a evidência da API ao cadastro existente e preservar seu histórico; se forem financiamentos distintos, permitir separação justificada. A interface deve reconhecer incerteza e não fundir registros apenas por CNES ou valor.

Essa observação reforça a recomendação de reunir FAF manual e FAF da API na mesma aba com classificação própria. O cartão confirmado também deve destacar seu código de parceria: hoje, a primeira identificação continua sendo Proposta #44942, enquanto o código confirmado fica no detalhe. Mostrar ambos, com seus rótulos, facilita conciliação e busca.

Referência: `frontend/src/components/features/secao-propostas-candidatas.tsx:55`, `frontend/src/components/features/proposta-card.tsx:142`.

### D22 — P2 — Termos aditivos têm justificativas cortadas sem acesso ao conteúdo integral

No convênio 780603, as seis justificativas da subaba Termos aditivos terminam no meio da frase. A inspeção do componente confirmou o corte por `slice(0, 200)`, sem ação para ler a justificativa integral naquela célula.

**Sugestão:** apresentar uma síntese com indicação de corte e ação Mostrar texto completo, preservando o conteúdo da fonte. Se número, datas e vínculo do termo estiverem disponíveis no payload, incluí-los na identificação para distinguir prorrogações semelhantes. A existência desses campos precisa ser conferida antes de prometê-los na interface.

Os dados importados também aparecem em tabelas e parágrafos com diferentes níveis de normalização textual. Recomenda-se um rótulo de leitura consistente para programas, instituições e município, conservando o texto original como evidência consultável.

Referência: `frontend/src/components/features/siconv-sub-abas.tsx:228`.

### 10.2. Organização sugerida e prioridades específicas

**Primeira prioridade:** alinhar significado e contagem de conclusão; impedir que valores desconhecidos pareçam zero; preservar a visibilidade de filtros ativos. São problemas que mudam a interpretação do resultado, mesmo quando o carregamento e a navegação funcionam.

**Segunda prioridade:** reorganizar Linhas de financiamento com os tipos FAF, TED e PRONON e confirmação sustentada por evidência; incluir conciliação entre origens; estabilizar a persistência de filtros entre recarga, retorno e troca de aba.

**Terceira prioridade:** melhorar a leitura dos detalhes. Cada cartão deve apresentar identificação e tipo, instituição/CNES, conclusão física ou previsão e data com origem, além de resumo financeiro qualificado. No aprofundamento, separar situação administrativa, acompanhamento interno, itens e execução financeira. Pareceres extensos e evidências brutas devem continuar acessíveis, com navegação que não obrigue a atravessar todo o texto para chegar à execução financeira.

**Critérios de aceite adicionais:**

- O recorte com um cartão Concluído não pode exibir zero conclusões sem uma distinção explícita de critério e data.
- Um filtro ativo continua legível mesmo quando sua opção sai da lista em cascata.
- O recorte de propostas em SP sobrevive à recarga e ao compartilhamento do endereço.
- As subabas informam se suas contagens são totais da fonte ou resultados do recorte atual; números de propostas rejeitadas não são apresentados como carteira ativa sem ressalva.
- A soma de registros sem valores não se apresenta como valor financeiro conhecido igual a zero.
- Toda conclusão/inauguração exibida identifica a natureza e a origem da data.
- Uma relação candidata manual/API é conferida antes de criar um novo monitoramento ou consolidar totais.
- As seis subabas SICONV continuam disponíveis conforme os dados e o texto integral de justificativas permanece consultável.

### 10.3. Limites desta ampliação

A validação percorreu amostras reais do clone local e seus estados de consulta, incluindo resultado vazio e recarga. Não foi uma varredura de todos os instrumentos, nem um teste de carga, segurança, todos os tamanhos de tela ou conformidade de acessibilidade. Não se provocaram falhas de rede ou alteração de permissões. Os problemas de apresentação e navegação descritos foram observados na interface e relacionados ao código, sem implementar correções.

## 11. Validação funcional do Monitoramento Interno

A avaliação foi ampliada para a Mesa de trabalho e o detalhe do instrumento, incluindo operações de escrita pela interface. O usuário autorizou testes de eventos, ações e funcionalidades internas na versão 5180. Não houve implementação de correções.

### 11.1. Ambiente confirmado e preservação dos dados

Antes das escritas, confirmou-se que o processo da API 8010 usa PostgreSQL em `127.0.0.1`, banco **sigeo_local_integrado**, e não produção. Consultas de conferência e snapshots usaram transação somente leitura. As criações, correções, conclusões e exclusões lógicas foram realizadas pelos controles da interface, com a conta local fornecida.

O instrumento escolhido para os testes mutáveis foi o TED **25000175998202088**, ID interno 79. Antes da validação, tinha um item planejado, nenhum evento, nenhuma ação e nenhuma entrega. Os registros manuais de teste receberam prefixo **QA-20261029**. O evento de inauguração gerado automaticamente pelo sistema também foi acompanhado na limpeza.

O convênio **825374** foi consultado para reproduzir a questão de Situação do programa; seu cadastro não foi alterado.

### 11.2. Operações efetivamente exercitadas

**Ações:**

- Tentativa de criação sem descrição: rejeitada com mensagem no campo.
- Criação com descrição, prazo de 28/10/2026 e responsável CGPCAN: a ação ficou aberta e foi identificada como atrasada em um dia.
- Correção da descrição e do prazo para 30/10/2026: o indicador de atraso voltou a zero, mantendo uma ação aberta.
- Conclusão: a ação recebeu a data de 29/10/2026 e o indicador de ações abertas voltou a zero.
- Edição de uma ação já concluída: executada para conferir se o estado de conclusão seria preservado; o resultado está em D25.
- Exclusão sem motivo: rejeitada com indicação do mínimo de três caracteres.
- Exclusão com justificativa: a ação deixou a lista ativa; o histórico foi preservado.

**Eventos:**

- Tentativa de lançamento sem marco: rejeitada.
- Ocorrência futura em fase geral: rejeitada pelo backend, com preservação dos dados preenchidos no formulário.
- Lançamento da fase Em andamento com ocorrência em 27/10/2026 e correção para 28/10/2026: fase e histórico foram atualizados.
- Verificação de que Data prevista deixa de ser oferecida para fase geral.
- Previsão de inauguração sem fase geral correspondente: rejeitada no formulário. Com a fase informada e previsão em 15/11/2026, o cabeçalho passou a mostrar a previsão e os dias restantes.
- Lançamento de licença CNEN, incluindo status, documento, data e validade: exercitado com combinação incoerente para verificar as validações, descrita em D26.
- Lançamento de marco físico sem datas: aceito, com os efeitos de apresentação descritos em D29. Associar esse marco à fase Concluído **não** concluiu automaticamente o instrumento no teste; não se confirmou um desvio de conclusão por esse caminho.
- Criação de Concluído: o fluxo pediu data e abriu a confirmação de inauguração. Voltar fechou a confirmação sem concluir; confirmar registrou conclusão e inauguração em 28/10/2026, substituindo a previsão vigente.
- Correção da data da conclusão, retirada da data e exclusão da conclusão: exercitadas e descritas em D27.
- Exclusões lógicas dos eventos de teste: concluídas com justificativa.

**Entrega e unidade física:**

- Abertura de Registrar entrega pelo item de braquiterapia: foi apresentada uma unidade, correspondente à quantidade pendente, sem permitir adicionar outra.
- Vida útil negativa: rejeitada com mensagem sobre o intervalo de 0 a 100 anos.
- Data futura de entrega: o formulário permaneceu aberto e a tentativa não criou entrega. Não se afirma aqui qual camada rejeitaria uma chamada direta à API com essa data.
- Registro válido de uma unidade em 28/10/2026, com marca, modelo, série e vida útil identificados como teste: o item passou a 1/1 entregue e apareceu o marco físico da entrega.
- Correção do número de série: o valor corrigido foi conferido na lista de unidades. Esse formulário possui Cancelar, ao contrário das edições de evento e ação.
- Exclusão justificada da entrega: a lista voltou a zero unidades e o marco de entrega deixou de aparecer no cronograma ativo.

A fase geral permaneceu independente da quantidade entregue durante esse fluxo. Não se propõe transformá-la automaticamente em Concluído por existir uma entrega.

### D23 — P2 — Editar evento ou ação não oferece Cancelar

**Confirmado a partir da observação do usuário:** clicar Editar em um evento abre o formulário pré-preenchido, com marco fixo e botão Salvar correção, sem botão para desistir da edição. O mesmo ocorre em ações. Não é o mesmo controle Cancelar que aparece ao abrir um evento novo; esse último não resolve a edição já aberta.

**Impacto:** o usuário não tem uma saída local clara e pode recorrer a recarga ou navegação para descartar a alteração. No caso de ação, o formulário de correção ainda conserva o rótulo Nova ação, aumentando a ambiguidade.

**Sugestão:** oferecer Salvar correção e Cancelar juntos nas duas edições. Cancelar deve descartar apenas os campos não salvos, fechar aquela edição e devolver foco ao botão Editar do registro, sem requisição mutável, alteração de fase ou modificação do histórico. A confirmação de exclusão já oferece uma saída explícita e pode servir de referência de consistência.

Referências: `frontend/src/components/features/monitoramento-interno-eventos.tsx:220`, `frontend/src/components/features/monitoramento-interno-acoes.tsx:171`.

### D24 — P1 — Situação do programa aparece em Convênio

**Reprodução:** abrir o instrumento 825374. O cabeçalho mostra Prestação de contas (SICONV) e, adicionalmente, Situação do programa, ambos com Prestação de Contas Concluída. O segundo indicador inclui uma referência de ingestão da planilha Controle PERSUS.xlsx.

**Regra de produto definida pelo usuário nesta validação:** o indicador **Situação do programa deve aparecer apenas em PERSUS I**. Essa restrição não se aplica ao nome do programa de financiamento de um convênio, que continua sendo uma informação legítima em Componente/Programa.

**Causa:** a inclusão do indicador verifica somente se `inst.situacao_programa` está preenchido, sem verificar o tipo do instrumento. A origem da carga ou a existência de um valor não demonstram que aquele indicador se aplica ao registro.

**Sugestão:** condicionar a apresentação à modalidade PERSUS I e à disponibilidade do valor. Convênio deve manter sua prestação de contas no bloco próprio. Preservar os dados e a proveniência para conferência; não apagar campos de outros tipos em massa como consequência de uma correção de apresentação. Verificar também filtros, relatórios e outras apresentações que reutilizem a informação.

Referência: `frontend/src/components/features/monitoramento-interno-cabecalho.tsx:103`.

### D25 — P1 — Corrigir o texto de uma ação concluída a reabre silenciosamente

**Reprodução:** criar a ação, corrigir seu prazo, concluí-la e abrir Editar. Alterar apenas a descrição e salvar a correção. A data de conclusão deixa de aparecer, volta o botão Concluir e o indicador Ações abertas muda de zero para um.

**Causa:** a correção cria uma nova ação sem copiar o estado de conclusão. O comportamento é explícito na implementação, mas não é explicado ao usuário no fluxo de edição.

**Sugestão:** distinguir correção cadastral de reabertura da tarefa. Uma correção de texto ou responsável deve preservar a conclusão, salvo uma escolha explícita de reabrir. Se o produto decidir que toda correção reabre, o formulário deve informar esse efeito e solicitar uma confirmação específica antes de salvar. O histórico original deve continuar preservado em ambas as alternativas.

Ao concluir a última ação aberta, a seção Ações se recolheu automaticamente porque seu estado inicial depende da existência de ações abertas. Recomenda-se preservar a seção que o usuário está manipulando e apresentar o resultado da operação, evitando que a tarefa recém-concluída desapareça da área visível sem explicação.

Referências: `backend/app/services/monitoramento_eventos.py:611`, `frontend/src/components/features/monitoramento-interno.tsx:228`.

### D26 — P1 — Licença aceita cronologia incoerente e é apresentada como emitida mesmo indeferida

**Reprodução:** lançar Licença de operação/alteração com status Indeferido, data da licença em 28/10/2026 e validade em 27/10/2026. O registro foi aceito. O cronograma exibiu simultaneamente Indeferido, Emitida em 28/10/2026 e Vencida há 2 dias. O cabeçalho passou a mostrar o documento como Licença CNEN.

**Causa:** a validação geral do evento rejeita ocorrência futura, mas não impede a combinação validade anterior à emissão. A apresentação de emissão e vencimento usa a presença das datas, independentemente do desfecho regulatório.

**Sugestão:** esclarecer o significado das datas e validar sua relação onde representarem emissão e validade. Processo indeferido ou em análise deve ser apresentado como tal, sem inferir licença emitida apenas porque existe uma data. Contadores e alertas de vencimento devem considerar o estado do registro, distinguindo licença vigente de andamento de processo. O conjunto de estados que qualifica emissão deve ser definido pelo domínio e aplicado de modo consistente.

A correção não deve simplesmente esconder a linha incoerente: manter evidência e permitir saneamento auditável do cadastro.

Referências: `backend/app/services/monitoramento_eventos.py:271`, `frontend/src/components/features/monitoramento-interno-fase-cronograma.tsx:123`, `frontend/src/components/features/monitoramento-interno-cabecalho.tsx:54`.

### D27 — P1 — Correção de conclusão permite retirar a data e diverge da inauguração vinculada

**Reprodução em três passos, após concluir normalmente em 28/10/2026:**

1. Editar o evento Concluído e mudar a ocorrência para 27/10/2026. A correção foi aceita, mas o evento de inauguração e o cabeçalho continuaram em 28/10/2026.
2. Editar novamente e apagar a ocorrência. A correção foi aceita; a fase continuou Concluído, enquanto a inauguração permaneceu realizada em 28/10/2026. A exigência de data na criação não protege a edição.
3. Excluir o evento Concluído. A fase voltou a Em andamento, mas o cabeçalho continuou Inaugurado em 28/10/2026 e Inauguração realizada.

**Causa:** o fluxo de criação chama a validação específica de conclusão e gera a inauguração na mesma transação. O fluxo de correção faz validações próprias mais restritas em escopo, sem reaplicar a exigência de data nem sincronizar o evento de inauguração. A exclusão também não explicita ao usuário o destino da inauguração gerada na conclusão.

**Sugestão:** tratar a conclusão e a confirmação de inauguração como fatos relacionados em todas as operações pertinentes, com as mesmas invariantes de data em criação e correção. Uma correção da data precisa declarar e aplicar o efeito no fato vinculado ou exigir conciliação explícita. Na exclusão, informar se a inauguração continuará válida ou se a operação representa anulação conjunta, preservando a trilha de ambos. Não apagar automaticamente uma inauguração independente que tenha outra evidência; o vínculo e a intenção da correção precisam ser identificáveis.

Este achado é prioritário para o relatório gerencial: duas datas divergentes ou conclusão sem data podem chegar às visões de acompanhamento e exportação, apesar de a criação original ter sido válida.

Referências: `backend/app/services/monitoramento_eventos.py:271`, `backend/app/services/monitoramento_eventos.py:304`, `backend/app/services/monitoramento_eventos.py:448`, `backend/app/services/monitoramento_eventos.py:511`.

### D28 — P2 — Correções repetem o nome do autor dentro da observação

Ao corrigir apenas a data de um evento, sem alterar a observação, o texto passou de um prefixo [Teste Local] para dois. Na segunda correção, apareceu um terceiro prefixo. A autoria também é exibida separadamente na linha Lançado por.

**Causa:** o formulário reaproveita a observação já prefixada e o backend acrescenta o autor novamente ao criar a versão corrigida.

**Sugestão:** separar conteúdo da observação e metadados de autoria na apresentação e no contrato de correção. Não acrescentar automaticamente nova assinatura ao conteúdo anterior. A autoria de cada versão deve continuar disponível no histórico; não remover textos de origem indiscriminadamente por substituição de strings.

Referências: `backend/app/services/monitoramento_eventos.py:76`, `frontend/src/components/features/monitoramento-interno-eventos.tsx:28`.

### D29 — P2 — Evento físico sem datas recebe uma data visual de registro e um rótulo de previsão vazio

**Reprodução:** lançar Comissionamento (teste de aceite) sem ocorrência e sem previsão. O sistema aceitou o registro. No histórico, a primeira data mostrada foi 29/10/2026, a data de criação; no cronograma, a linha apareceu como previsão sem data, “prev. —”.

**Sugestão:** distinguir sem data, previsto e ocorrido. Se eventos físicos novos precisarem representar um fato ou um compromisso temporal, exigir pelo menos a data pertinente. Se registros sem data forem permitidos para indicar acompanhamento ou preservar carga legada, apresentar Sem data de ocorrência/previsão e separar Registrado em da data do fato.

Após a conclusão explícita, o marco que contém a inauguração real continua denominado Previsão de inauguração no cronograma. Recomenda-se um rótulo de apresentação Realizada em quando existir ocorrência, preservando o código fixo do catálogo e sua utilização histórica.

Referências: `frontend/src/components/features/monitoramento-interno-eventos.tsx:153`, `frontend/src/components/features/monitoramento-interno-fase-cronograma.tsx:89`.

### D30 — P2 — Erro de validação de escrita recebe título de falha de carregamento

A tentativa de registrar uma ocorrência futura foi rejeitada corretamente, mas o banner exibiu Não foi possível carregar os dados antes da explicação de que a data realizada não pode estar no futuro.

**Sugestão:** usar contexto de escrita, como Não foi possível registrar o evento, e, quando possível, associar a mensagem ao campo correspondente. Manter os valores digitados para correção. A regra de rejeição funcionou; o problema é a orientação de recuperação e a nomenclatura do erro.

Referência: `frontend/src/components/features/monitoramento-interno.tsx:74` e componente compartilhado ErrorAlert.

### 11.3. Encerramento e conferência do estado local

A limpeza foi feita pelos comandos de exclusão lógica da própria interface, com justificativas identificadas como QA-20261029. Não se eliminaram fisicamente registros nem se alterou histórico preexistente.

A conferência final por SELECT no clone local confirmou:

- **Cadastro do instrumento idêntico ao snapshot inicial**, incluindo seus campos físicos legados.
- **Item planejado idêntico ao snapshot inicial.**
- Zero eventos ativos, zero ações ativas e zero entregas ativas.
- Histórico de teste preservado: dez registros de evento, três registros de ação e uma entrega, incluindo versões corrigidas e registros excluídos/substituídos.
- Interface novamente com fase Não iniciado, inauguração Sem previsão, licença Sem registro, zero ações abertas e item em 0/1 entregue.

As operações também geraram registros de auditoria e notificações locais. Esses rastros não foram apagados nem se afirma que o banco voltou a ser byte a byte igual ao estado anterior. O estado operacional do instrumento e os cadastros originais foram preservados/restabelecidos; permanecem os rastros legítimos da validação no clone.

### 11.4. Ordem sugerida para futura correção e critérios de aceite

**Primeiro:** integridade de conclusão e inauguração na criação, correção e exclusão; preservação explícita do estado de conclusão das ações; coerência de licença e datas. Esses problemas alteram o estado que alimenta o acompanhamento.

**Depois:** restringir Situação do programa a PERSUS I, como definido pelo usuário; acrescentar Cancelar às duas edições; corrigir mensagens, autoria repetida e rótulos das datas. A ausência de Cancelar deve ser tratada como correção simples e independente, sem aguardar a revisão de todo o modelo.

Critérios de aceite adicionais:

- Editar evento e ação sempre oferece Cancelar, que não grava nem muda o estado do registro.
- Situação do programa só aparece em PERSUS I; convênio 825374 mantém a prestação de contas no indicador próprio.
- Corrigir uma ação concluída preserva sua conclusão ou solicita uma reabertura explícita e auditável.
- Conclusão não perde sua data em nenhuma operação de correção.
- Corrigir ou excluir uma conclusão explica e preserva a coerência com sua inauguração relacionada.
- Status regulatório e datas não produzem uma licença simultaneamente indeferida, emitida e vencida por inferências incompatíveis.
- Ocorrência futura e vida útil fora do intervalo são rejeitadas sem gravação parcial e com indicação útil para corrigir o campo.
- Corrigir observação ou data não acumula assinaturas no texto.
- Cadastro físico, item planejado, quantidade entregue e marco de entrega permanecem coerentes após correção e cancelamento de uma entrega.
- Recarregar o detalhe confirma o resultado persistido, com autoria e trilha de correção disponíveis.

Esta rodada não incluiu testes de concorrência, simulação de expiração de sessão durante uma gravação, alteração de permissões nem teste exaustivo de entregas com vários itens/unidades no mesmo lote. O cadastro interno foi inspecionado em leitura; não se declara validação completa de seu formulário de edição. As conclusões de qualidade se limitam aos cenários descritos, efetivamente exercitados pela interface.

## 12. Validação da Análise de Mérito e suas abas

### 12.1. Escopo e evidência

Validação autenticada na mesma versão da porta **5180**, nas abas **Visão geral**, **Mapa** e **Relatórios e metodologia**. Foram exercitados seleção de família, filtros geográficos e de CNES, abertura de macrorregião → região de saúde → município, indicadores clicáveis, ajuda contextual, seleção territorial do mapa, consulta de distância e downloads pelos botões da interface.

Também foram consultados o código dessa cópia e `docs/metodologia-parametros.md`. Para investigar uma contradição efetivamente exibida, foram feitos SELECTs no **clone local** usado pela API 8010: identidade confirmada como banco `sigeo_local_integrado`, usuário `gustavoleite`, com `transaction_read_only=on`. Não houve consulta nova a produção, execução de pipeline, alteração de cadastro ou correção de resultados nesta ampliação.

A conferência das fórmulas usou população e oferta já gravadas, comparando necessidade, saldo e classificação com a função atual. Não revalidou os quantitativos de origem no CNES, IBGE ou ANS, nem a vigência das normas citadas.

**Comportamentos positivos observados:**

- Tomógrafo, Ressonância Magnética e PET-CT carregam conjuntos próprios. Acelerador Linear, Ultrassom e Mamógrafo estão desabilitados no seletor, evitando oferecer os placeholders como parâmetros prontos.
- Tomógrafo nacional mostrou 9.113 existentes e 4.381 em uso SUS; Ressonância, 4.482 e 2.022; PET-CT, 202 e 112. A distinção entre total informativo e oferta SUS está presente.
- No DF, Tomógrafo mostrou 321 existentes, 98 em uso SUS, população SUS-dependente de 2.049.423 e coeficiente 4,78x. O detalhamento até Brasília manteve esses valores.
- Selecionar o CNES privado 3494640 restringiu corretamente a tabela de estabelecimentos e os totais do estabelecimento para 2 existentes e zero em uso SUS. A ressalva de apresentação do restante da página está no D35.
- O mapa carregou a base rodoviária e o contorno de Brasília. Em PET-CT, Rio Branco/AC apresentou zero equipamentos locais e o município com oferta SUS mais próxima em Porto Velho/RO, a aproximadamente 451 km. O resultado ultrapassa corretamente o raio visual de 75 km; a diferença precisa ser melhor explicada ao usuário, conforme D39.
- As execuções publicadas foram resolvidas por família: Tomógrafo id 5, Ressonância id 6 e PET-CT id 11, todas com competência 2026-07. A conferência aritmética não encontrou divergências nos 121 resultados macrorregionais e 5.570 municipais de Tomógrafo, nem nos mesmos volumes de Ressonância. Os 5.570 resultados municipais de PET-CT também coincidiram com a fórmula atual. Isso não certifica suas fontes nem os demais fluxos.

### D31 — P2 — A ajuda é cortada e o clique no ícone pode acionar o indicador

**Confirmado:** ao abrir a ajuda de Total de Equipamentos, parte inferior da caixa ficou escondida pelo limite da faixa dos indicadores. Na medição do DOM, a caixa terminava aproximadamente na coordenada vertical 420, enquanto o contêiner com `overflow: hidden` terminava em 408. A ajuda de Municípios Hipossuficientes sofreu corte ainda maior.

**Efeito adicional reproduzido:** clicar no ícone Mais informações de Municípios Hipossuficientes também ativou a visão Hipo e substituiu a tabela por municípios, porque o evento de clique alcançou o botão do indicador. Consultar a explicação produz uma mudança de filtro sem uma intenção clara do usuário.

**Causa identificada:** o popup é posicionado absolutamente dentro do indicador, e a faixa compartilhada usa `overflow-hidden`. Aumentar apenas o `z-index` não remove esse recorte. O InfoIcon usa um span com papel de botão dentro de um indicador que já é botão, sem isolamento do clique. Há abertura por foco e mouse, mas não há vínculo explícito por `aria-describedby` nem comportamento próprio de abertura/fechamento por clique e teclado no componente.

**Sugestão:** usar tooltip/popover compartilhado renderizado fora dos contêineres de recorte, com reposicionamento conforme o espaço disponível. Separar a ação de ajuda da ação de filtrar, associar o texto acessível ao disparador e garantir leitura por teclado e toque. Definir fechamento por Escape e manter o conteúdo legível enquanto estiver sendo consultado.

**Aceite:** texto integral nos indicadores e cabeçalhos, inclusive junto às bordas e em tabelas roláveis; abrir ajuda não altera filtro, seleção, ordenação ou página. O tooltip de Cobertura ficou integralmente visível no cenário de tabela observado: não se afirma que todos os ícones estejam sempre cortados. O componente compartilhado e seus contextos precisam ser revisados.

Referências: `frontend/src/components/common/metric-strip.tsx:34`, `frontend/src/components/common/metric-strip.tsx:56`, `frontend/src/components/features/info-icon.tsx:19`, `frontend/src/components/features/info-icon.tsx:51`, `frontend/src/components/features/dashboard-conteudo.tsx:184`.

### D32 — P1 — Resultados macrorregionais de PET-CT contradizem a fórmula atual

**Reprodução visível:** selecionar PET-CT e observar a macro 2703, 2ª Macrorregião de Saúde/AL: população SUS-dependente de 1.016.411, zero equipamentos em uso SUS, coeficiente 0,00x e status Hiperssuficiente. No Mapa, Macro Única/AC apresentou 843.163 habitantes, zero oferta, 0,00x e também Hiperssuficiente.

**Confirmação no clone:** a execução publicada de PET-CT, id 11, tem 121 registros macrorregionais. Em **87**, ao menos um dos campos necessidade, saldo ou classificação diverge da função atual; em **59**, a classificação diverge. A base registra 18 macros hipossuficientes; aplicar a fórmula atual às mesmas populações e ofertas resulta em 77. Essa comparação não representa uma nova contagem validada para produção.

No Acre, estão gravados necessário 0, disponível 0, saldo 0 e `not_deficient`. A fórmula atual determina `ceil(843.163 / 1.500.000) = 1`, saldo -1 e Hipossuficiente. O **Excel simplificado do Acre também exportou necessário 0 e saldo 0**. Portanto, o problema afeta a informação disponibilizada ao usuário e ao documento, não apenas a cor de um componente.

**Causa delimitada:** o serviço lê os resultados macrorregionais persistidos e a interface preserva o status recebido. O código atual de cálculo usa arredondamento para cima. A divergência está comprovada entre a carga publicada local e essa regra; não se comprovou nesta rodada qual versão ou operação produziu a carga inconsistente.

**Sugestão:** investigar a geração da execução, conferir se a mesma divergência existe no ambiente de produção por procedimento somente leitura e planejar eventual recomposição controlada, preservando rastreabilidade. Antes de publicar resultados, validar coerência entre população, necessidade, oferta, saldo e status. Evitar corrigir somente a cor na interface, deixando exportações e indicadores apoiados nos dados incompatíveis.

**Aceite:** mapa, tabela, indicadores e exportação usam a mesma execução válida por família; uma macro com população positiva e oferta zero não recebe Hiperssuficiente sob a fórmula atual. Preservar Dados indisponíveis para ausência de população e manter os diferentes níveis de agregação.

Referências: `backend/app/pipeline/cobertura.py:74`, `backend/app/services/cobertura_assistencial.py:24`, `backend/app/repositories/execucoes.py:21`, `frontend/src/services/api.ts:37`, `backend/app/services/relatorios.py:334`.

### D33 — P1 — PET-CT recebe a metodologia de Tomógrafo

**Reprodução:** manter PET-CT no seletor do cabeçalho e abrir Relatórios. A seção metodológica informa 1 tomógrafo por 100 mil habitantes ou raio de 75 km, com fórmula dividindo a população por 100.000 e fonte de equipamentos com os códigos de tomógrafos.

**Causa:** o catálogo da página metodológica contém Tomógrafo e Ressonância. Quando a família não é encontrada, assume Tomógrafo silenciosamente. PET-CT é uma família selecionável e possui parâmetro próprio documentado de 1.500.000 habitantes.

**Sugestão:** apresentar metodologia explícita para PET-CT e impedir substituição silenciosa por outra família. Usar nome da família no título da seção, unidade do parâmetro e indicação clara dos critérios que efetivamente alteram a classificação. Se faltar documentação de uma família, mostrar indisponibilidade identificada.

Também explicar, no texto de Tomógrafo, que a distância exibida atualmente é **informativa e não altera o status populacional**. O texto “ou raio de 75 km, o que for atingido primeiro”, sem essa ressalva, permite inferir uma regra que o app ainda não executa. O acesso ao radiofármaco PET deve ter sua natureza e limitações próprias, sem herdar o raio de Tomógrafo.

**Aceite:** trocar de família atualiza nomes, fórmula, produtividade, códigos de origem e ressalvas. Um usuário consegue distinguir o parâmetro adotado da informação de acesso geográfico. Esta sugestão se apoia na metodologia do projeto; não constitui revisão normativa externa.

Referências: `frontend/src/pages/relatorios-page.tsx:35`, `frontend/src/pages/metodologia-page.tsx:51`, `frontend/src/pages/metodologia-page.tsx:104`.

### D34 — P1 — Filtros territoriais excluem localidades sem equipamentos

**Reprodução em PET-CT:** o filtro Estado (UF) não oferece AC, embora o Acre tenha dados no mapa e seja exportável pelo relatório. Pesquisar ALTO ACRE em Região de Saúde retorna Nenhum resultado, enquanto a região está disponível no detalhe da macro no Mapa.

**Causa:** as opções geográficas da Visão geral são derivadas da lista de estabelecimentos da família. Um território sem estabelecimentos com aquele equipamento desaparece das opções, justamente quando sua falta de oferta é relevante para a análise de necessidade.

**Sugestão:** formar o catálogo territorial a partir das referências geográficas e dos resultados de cobertura, preservando os territórios com oferta zero. O filtro CNES pode continuar dependente de estabelecimentos. A cascata deve restringir por pertencimento territorial, sem exigir a existência de equipamento.

**Aceite:** AC, Alto Acre e seus municípios são pesquisáveis em PET-CT; ausência de oferta gera resultado com zero, ou ausência de dados identificada quando for o caso. Não converter a ausência de estabelecimento em inexistência do território.

Referência: `frontend/src/hooks/useFiltrosMacro.ts:122`, `frontend/src/hooks/useFiltrosMacro.ts:172`, `frontend/src/hooks/useFiltrosMacro.ts:195`.

### D35 — P2 — Selecionar CNES mistura totais do estabelecimento com cobertura territorial

Com o CNES **3494640 — 3 DIMENSAO DIAGNOSTICO/DF** selecionado em Tomógrafo, os indicadores mostram 2 existentes e zero em uso SUS, enquanto a cobertura de Brasília mostra 98 em uso SUS de 321 existentes e status Hiperssuficiente. Esses valores têm escopos diferentes e podem ser válidos simultaneamente, mas a página não apresenta essa distinção com destaque suficiente.

Não se recomenda calcular cobertura do CNES por extrapolação. A cobertura é territorial e a seleção de um estabelecimento não representa a oferta de toda a rede. O problema é de organização e explicação do recorte.

**Sugestão:** separar “Estabelecimento selecionado” de “Cobertura do território de referência”, mostrando Brasília/DF e o nível territorial junto da tabela. Exibir chips com os nomes das seleções; na reprodução, os seis filtros passaram a mostrar apenas “1 selecionado(s)”, ocultando visualmente seus significados até que fossem abertos.

**Aceite:** fica explícito quais números pertencem ao CNES e quais à rede territorial; a oferta privada do estabelecimento não entra no cálculo da cobertura SUS. Nomes e rótulos dos filtros permanecem identificáveis após a seleção.

Referências: `frontend/src/hooks/useDashboardTotais.ts:47`, `frontend/src/hooks/useFiltrosMacro.ts:217`, `frontend/src/components/features/dashboard-conteudo.tsx:165`.

### D36 — P2 — Corte de 100 mil habitantes aparece também nas outras famílias sem distinção de universo

**Observado:** os indicadores nacionais mostraram 32 municípios hipossuficientes em Tomógrafo, 51 em Ressonância e 207 em PET-CT. A ajuda de Municípios Hipossuficientes usa o mesmo texto de municípios com mais de 100 mil habitantes nas famílias.

**Confirmado no código:** a consulta desse indicador e a listagem municipal geral recebem `minPopulation=100_000` sem condição de família, apesar dos comentários identificarem o corte como específico do Tomógrafo. A metodologia documenta a regra específica de Tomógrafo no detalhamento, sem generalizá-la às outras famílias.

A consulta dos resultados municipais locais encontrou 5.503 registros PET-CT classificados como hipossuficientes antes do corte populacional. Isso explica por que 207 não pode ser apresentado como se fosse o total irrestrito de municípios nessa condição. A contagem irrestrita também não deve ser interpretada como recomendação de instalar um equipamento em cada município pequeno.

**Sugestão:** explicitar o universo do indicador e revisar a aplicação do corte por família com a regra de negócio. Separar a classificação aritmética da leitura de planejamento regional e do filtro opcional de população. Se o indicador continuar sendo uma lista de municípios maiores, nomeá-lo dessa forma e manter acesso aos demais territórios.

**Aceite:** indicador, ajuda e lista usam o mesmo universo, identificado antes de abrir o tooltip. Alterar o corte não modifica a fórmula de cobertura nem transforma distâncias em critérios classificatórios.

Referências: `frontend/src/hooks/useDashboardHipo.ts:19`, `frontend/src/hooks/useDashboardHipo.ts:60`, `frontend/src/hooks/useNivelCobertura.ts:65`, `frontend/src/components/features/dashboard-conteudo.tsx:191`.

### D37 — P2 — Exportação precisa explicar famílias incluídas e a diferença entre os níveis

**Confirmado:** com PET-CT selecionado no cabeçalho, o relatório do DF incluiu **as três famílias publicadas** em Excel e Word. Essa é a regra atual do backend; a seleção global não é enviada como filtro do relatório.

Os níveis da Análise de Mérito **não são genericamente iguais**: no DF, as três tabelas têm os mesmos números porque cada família se resume ao mesmo território, mas Simplificado usa Macrorregião/Distrito Federal e Completo usa Município/Brasília. No Acre, o Excel simplificado trouxe uma linha macrorregional por família e o completo, 22 linhas municipais por família. As seis colunas de dados permanecem iguais; muda o nível territorial.

No escopo Município, o código usa a mesma granularidade municipal nos dois níveis. Portanto, há um caso em que o seletor não acrescenta detalhamento útil. Não confundir essa regra com a equivalência dos relatórios especiais de concluídos e entregues registrada no D09.

**Sugestão:** mostrar antes do download “Famílias incluídas: todas as publicadas” ou oferecer seleção explícita, com opção Todas. Renomear as alternativas para “Resumo por macrorregião” e “Detalhamento por município”, explicando que a necessidade é calculada em cada nível, não somada entre municípios. No escopo Município, ocultar a escolha redundante ou explicar sua equivalência.

Melhorias editoriais nos arquivos: nomes legíveis Tomógrafo, Ressonância Magnética e PET-CT; cabeçalho População SUS-dependente; oferta Em uso SUS; legenda para Necessário e Saldo; classificação e coeficiente acompanhados da fórmula pertinente. Os arquivos já informam competência por família: preservar isso e acrescentar identificação da execução quando necessário à rastreabilidade. Não comparar nem somar populações de famílias como se fossem a mesma fotografia temporal: no DF, PET-CT usa 2.062.520 habitantes e as outras duas famílias, 2.049.423.

**Aceite:** a página antecipa famílias, recorte, competência e granularidade do arquivo. Diferenças entre níveis são demonstráveis e a seleção de PET-CT não induz a expectativa de um documento exclusivo dessa família quando o resultado inclui todas.

Referências: `frontend/src/components/features/relatorio-gerador-form.tsx:40`, `frontend/src/components/features/relatorio-gerador-form.tsx:124`, `backend/app/services/relatorios.py:334`, `backend/app/services/relatorios.py:373`.

### D38 — P2 — Trocar de aba perde o recorte e muda o território sem explicação

**Reprodução:** selecionar DF na Visão geral, abrir Mapa e retornar. O Mapa inicia em Macro Única/AC; ao retornar, a Visão geral volta ao Brasil, com 202 equipamentos PET-CT e 112 em uso SUS. O relatório também tem seleção geográfica própria.

**Causa:** as abas mantêm estados independentes; o mapa preseleciona a primeira macro ordenada por UF/nome. A família permanece selecionada, mas o território não acompanha a navegação.

**Sugestão:** persistir um contexto territorial compartilhável na URL, adaptando o recorte aos níveis aceitos por cada aba. Oferecer “Ver no mapa” e “Gerar relatório deste recorte”. Quando houver ampliação do recorte ou necessidade de selecionar uma macro dentro de uma UF, explicar a mudança e permitir a escolha. Informar competência e execução junto da família para contextualizar a atualidade dos dados.

**Aceite:** ir da tabela para o mapa e para a exportação mantém o território escolhido ou comunica claramente sua adaptação. Voltar não elimina o trabalho de seleção do usuário.

Referências: `frontend/src/hooks/useMapaFiltros.ts:23`, `frontend/src/hooks/useMapaFiltros.ts:47`, `frontend/src/hooks/useFiltrosMacro.ts:61`, `frontend/src/components/features/relatorio-gerador-form.tsx:40`.

### D39 — P2 — O mapa rodoviário precisa distinguir distância, raio visual e oferta SUS

Em PET-CT, o DF mostrou **11** no indicador Total de equipamentos, enquanto o detalhe da macro informa **1 SUS de 11 no total**. Ao selecionar Brasília, Distância mais próxima e Equipamento mais próximo ficaram “—”, pois há oferta SUS no próprio município. Em Rio Branco, o resultado mudou para **451 km / Porto Velho - RO**, enquanto o texto do mapa dizia mostrar estabelecimentos num raio de **75 km** e o recorte visual não tinha estabelecimentos geocodificados.

Os cenários são compatíveis com o código: total inclui existentes; o mapa pode exibir oferta SUS e privada; o mais próximo busca oferta SUS em uso, inclusive além do raio visual, e só é calculado quando o município selecionado não tem oferta SUS. A interface, porém, não explica satisfatoriamente essas condições. O nome Mapa Rodoviário pode ainda levar a interpretar os 451 km como percurso por estrada, embora o cálculo use Haversine.

**Sugestão:** mostrar em conjunto total existente e oferta em uso SUS, com legenda visual clara. Usar “Município com oferta SUS mais próxima”, “Distância em linha reta entre coordenadas de referência” e “Raio exibido no mapa”. Quando já há oferta local, substituir o traço por “Há oferta SUS no município; busca externa não necessária”. Explicar quando o equipamento mais próximo fica fora da área visualizada. O raio de visualização de 75 km em PET-CT não deve parecer seu parâmetro normativo de suficiência.

**Aceite:** o usuário distingue base rodoviária de distância calculada, oferta privada de oferta SUS, raio de exibição de raio classificatório, e ausência de busca de ausência de dados. A distância continua informativa, sem alterar a classificação.

Referências: `frontend/src/components/features/mapa-rodoviario-secao.tsx:119`, `frontend/src/components/features/mapa-rodoviario-secao.tsx:127`, `frontend/src/components/features/mapa-rodoviario-secao.tsx:187`, `frontend/src/hooks/useEquipamentoMaisProximo.ts:58`, `frontend/src/hooks/useEquipamentoMaisProximo.ts:126`.

### 12.2. Organização e prioridades sugeridas

**Primeiro, confiabilidade:** investigar e corrigir pelo fluxo de publicação a carga macrorregional de PET-CT; alinhar a metodologia exibida à família; permitir analisar territórios sem equipamentos. São problemas que podem distorcer a conclusão do usuário sobre necessidade e suficiência.

**Depois, leitura e continuidade:** corrigir tooltip e acionamento indevido, distinguir escopo de CNES e cobertura territorial, explicitar corte populacional, preservar contexto entre abas e antecipar o conteúdo do relatório.

Organização sugerida para as três abas:

1. Um contexto comum visível: família, território, competência e filtros ativos identificados pelo nome.
2. Visão geral começando por oferta em uso SUS, necessidade, saldo e classificação territorial. Total existente como informação complementar; municípios fora do corte explicitados.
3. Detalhamento progressivo por macrorregião, região e município, com acesso aos territórios de oferta zero e indicação clara do nível atual.
4. Mapa com o mesmo contexto e legenda de acesso/oferta, destacando limitações de geocodificação e distância.
5. Relatórios mostrando uma síntese do conteúdo antes do download: famílias, granularidade, território e competências. Metodologia identificada por família e separada visualmente da ação de exportar.

Essas sugestões não propõem usar dados manuais do Monitoramento Interno no cálculo de cobertura, nem misturar análise de necessidade com entrega ou conclusão de instrumento.

### 12.3. Arquivos e limites da rodada

Foram conferidos sete downloads adicionais:

- DF: Excel Simplificado `relatorio-analise_merito-uf-simplificado (1).xlsx` e Completo `relatorio-analise_merito-uf-completo.xlsx`.
- DF: Word Simplificado `relatorio-analise_merito-uf-simplificado (1).docx` e Completo `relatorio-analise_merito-uf-completo.docx`.
- AC: Excel Simplificado `relatorio-analise_merito-uf-simplificado (2).xlsx` e Completo `relatorio-analise_merito-uf-completo (1).xlsx`.
- Brasília/DF: Excel `relatorio-analise_merito-municipio-completo.xlsx`; a busca digitada com acento encontrou corretamente BRASILIA.

Os nomes refletem os downloads locais desta sessão, incluindo sufixos do navegador. O Word completo do DF foi renderizado e sua página única inspecionada, sem corte de tabela ou texto no exemplo. A conferência dos demais arquivos foi estrutural e de conteúdo; não se declara revisão visual de todas as combinações possíveis.

Não foram realizados testes exaustivos de acessibilidade com leitor de tela, responsividade em uma matriz de dispositivos, falhas de serviços externos, concorrência, expiração da sessão, geração nacional em todos os formatos, nem validação externa das fontes geográficas e normativas. Foram observados os estados de carregamento e os resultados efetivamente disponíveis na sessão. Os achados de dados desta seção dizem respeito ao clone local, não a uma auditoria nova de produção.

## 13. Validação do Painel de Gestão como usuário

### 13.1. Ambiente, método e resultados que funcionaram

Avaliação de `/monitoramento-equipamentos/painel` na **porta 5180**, mesma cópia `3906761` e API local 8010. Foram testados busca por instrumento, filtros de UF, equipamento, situação e período, limpeza de filtros, mapa nacional, abertura de macro no mapa rodoviário, seleção de localização, diálogo de vigências, acesso ao detalhe e retorno, recarregamento e paginações independentes da agenda, divergências e ações.

O código foi consultado para distinguir defeito, regra existente e oportunidade de organização. A conferência adicional do resumo usou a implementação de leitura do backend contra o clone, em transação somente leitura: banco `sigeo_local_integrado`, usuário `gustavoleite`, `transaction_read_only=on`. Não houve alteração de registros de negócio, publicação de dados, execução de pipeline nem nova consulta a produção. A sessão expirou durante a rodada; foi renovado o login com a conta fornecida, sem registrar suas credenciais no documento.

**Retrato inicial do clone:** 245 instrumentos, 111 em fase concluída, progresso de fase de referência 56%, valor global informado de R$ 1.423.265.438, indicador 97% pago ao fornecedor e 26 pontos de atenção. Contratações: 138 Convênios, 92 PERSUS I, 12 FAF e 3 TED. Esses números descrevem a sessão avaliada, não um inventário atualizado de produção.

**Comportamentos a preservar:**

- As fases somam os 245 instrumentos e o filtro Concluído retornou 111, com progresso de referência 100%.
- SC retornou dez instrumentos, oito concluídos, duas ações atrasadas no CEPON e uma divergência externa. As seções acompanharam o recorte.
- O diálogo de vigências mostrou o convênio 954413, com fim em 26/12/2026 e 58 dias restantes. O acesso abriu o instrumento correto; o retorno preservou `uf=SC`, inclusive após recarregar o painel.
- A agenda foi percorrida até a terceira página, abrangendo seus 20 itens. Divergências chegaram à segunda página, com 14 casos; ações, à segunda página, com 12 casos. A paginação de uma lista não alterou a das demais.
- O mapa abriu o DF no mesmo espaço da visão nacional, com contorno, marcadores agrupados e oito instrumentos. A seleção de localização mostrou CNES, instrumento, fase e técnico.
- A série de inaugurações separa realizadas de previstas e explica que cinco previsões vencidas pertencem às pendências, sem tratá-las como realizações.
- Valores desconhecidos não são convertidos automaticamente em zero na distribuição de investimento: FAF informa 11/12 com valor e TED, 2/3. A completude também é visível.
- Uma busca sem correspondência retornou zero instrumentos e “—” para média de fase e valor, com mensagens de ausência nas listas. Há oportunidades de simplificação visual desse estado, registradas ao final.

### D40 — P1 — Composição por equipamento e mapa usam descrição diferente da fonte do filtro

**Reprodução:** selecionar UF SC e equipamento Mamógrafo. O painel retorna um instrumento, o convênio **825374**, com valor R$ 142.963, fase concluída e **Mamógrafo 1/1 entregue/planejado**. Entretanto, Por equipamento informa **Não informado: 1**. Selecionar a localização mostra CNES 2419653, Hospital Nossa Senhora da Conceição, convênio 825374 e “Equipamento não informado”.

**Causa:** o filtro usa os marcadores canônicos de equipamento, enquanto a composição reconstrói uma única família a partir de `equipamento_descricao`. O detalhe do mapa também consulta essa descrição. Assim, a ausência do campo antigo é apresentada como ausência de classificação, mesmo quando o instrumento tem equipamento identificado no catálogo e no plano.

**Sugestão:** usar o catálogo e os marcadores como fonte comum de classificação, preservando a distinção entre instrumento, item planejado e unidade entregue. Definir se Por equipamento conta instrumentos com cada marcador ou unidades planejadas. Se um instrumento participar de várias famílias, explicar a sobreposição e não exigir que essa distribuição some o total de instrumentos.

**Aceite:** SC + Mamógrafo identifica 825374 como instrumento com mamógrafo em todas as representações pertinentes. Mapa, filtro e composição deixam de contradizer-se; dados físicos entregues continuam separados do equipamento planejado.

Referências: `frontend/src/lib/monitoramento-painel-metricas.ts:11`, `frontend/src/lib/monitoramento-painel-metricas.ts:244`, `frontend/src/hooks/use-monitoramento-interno-filtros.ts:173`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:250`, `frontend/src/components/features/monitoramento-painel-mapa-rodoviario.tsx:37`.

### D41 — P1 — Período parece filtrar resultados da gestão, mas seleciona ano do instrumento

**Reprodução:** selecionar início 2026 e fim 2026. O painel retorna dois instrumentos, um concluído, e a série Ano de inauguração mostra uma realização em **2020**. Sem esse filtro, a série contém vinte realizadas em 2026, além de dez previsões para 2026 e cinco para 2027.

O recorte 2026 não responde “o que inauguramos/concluímos em 2026”. Ele seleciona instrumentos cujo `ano_instrumento` é 2026 e apresenta os eventos desses instrumentos, independentemente do ano de ocorrência. Registros sem ano também ficam fora. A ocorrência de uma inauguração em 2020 num instrumento com referência 2026 merece conferência de origem, mas não se conclui apenas pela tela que a data esteja errada.

**Sugestão:** renomear imediatamente o filtro atual para Ano do instrumento. Para a leitura gerencial, oferecer referência temporal explícita: conclusão real, inauguração realizada, previsão ou ano de origem. Ao filtrar eventos, indicar como a carteira de instrumentos e os gráficos de outras referências são contextualizados, evitando recortar silenciosamente toda a página por um campo inadequado.

**Aceite:** selecionar inauguração realizada em 2026 retorna eventos desse ano, mesmo de instrumentos antigos. Previsões e realizações mantêm séries distintas. O universo sem data permanece acessível e identificado. Não alterar as datas de origem apenas para fazê-las coincidir com um filtro.

Referências: `frontend/src/components/features/monitoramento-interno-filtros.tsx:103`, `frontend/src/hooks/use-monitoramento-interno-filtros.ts:189`, `frontend/src/lib/monitoramento-painel-metricas.ts:187`, `frontend/src/components/features/monitoramento-painel-evolucao.tsx:80`.

### D42 — P1 — Concluídos sem datas essenciais não aparecem como pendência de qualidade

**Reprodução:** buscar o TED **25000185040202348**. O painel informa um instrumento concluído, progresso 100%, uma unidade entregue de uma planejada e **zero pontos de atenção**, mas Ano de inauguração mostra **Nenhuma data de inauguração registrada neste recorte**.

**Conferência no clone:** há 111 instrumentos em fase concluída e 104 com inauguração real registrada. Sete concluídos não têm inauguração real; dois desses sete mantêm uma previsão. Também foram encontrados sete instrumentos com evento vigente de conclusão sem data de ocorrência. Essas contagens foram verificadas separadamente e não implicam automaticamente que os dois conjuntos de sete sejam idênticos.

O quadro de completude cobre CNES, coordenadas, técnico, ano e pagamento, mas não data de conclusão, inauguração real nem previsão para os instrumentos em andamento. A regra atual de atenção soma ações atrasadas, licenças, inaugurações atrasadas e divergências externas, sem representar todas essas lacunas. O legado permanece visível como concluído, porém a gestão não recebe uma fila direta para saneá-lo.

**Sugestão:** acrescentar indicadores e listas para Concluído sem data de conclusão, Concluído sem inauguração confirmada e Em andamento sem previsão. Mostrar que são lacunas de cadastro/evidência, distintas de atraso ou divergência administrativa. Manter a fase histórica identificada e orientar a correção auditável, sem inventar data a partir de vigência, entrega ou criação do registro.

**Aceite:** o caso TED tem sua ausência de data sinalizada e acesso ao detalhe para saneamento. Os totais de conclusão física, inauguração real e previsões podem ser reconciliados por listas, com eventuais diferenças explicadas.

Referências: `backend/app/services/monitoramento_resumo.py:167`, `backend/app/services/monitoramento_resumo.py:184`, `frontend/src/lib/monitoramento-painel-metricas.ts:171`, `frontend/src/lib/monitoramento-painel-metricas.ts:218`, `frontend/src/components/features/monitoramento-painel-evolucao.tsx:55`.

### D43 — P2 — Percentual pago combina registros financeiros e quitação assumida por regra

O indicador inicial apresenta **97% pago ao fornecedor** ao lado do valor global da carteira. A completude, mais abaixo, informa base de pagamento em 190/245 instrumentos. No TED concluído 25000185040202348, o indicador mostra **100% pago ao fornecedor**, embora se trate de carga interna cuja quitação é assumida pela regra de fase concluída.

**Causa e limite:** o cálculo combina pagamento registrado de fonte confiável com valor integral assumido para cargas manuais concluídas e usa apenas a base comparável. A regra está comentada no código e explicada em uma nota inferior da página. Não se trata de erro aritmético demonstrado; o rótulo superior sugere um grau de comprovação financeira que a base mista não tem uniformemente.

**Sugestão:** apresentar junto do percentual sua base e natureza: valor global comparável, pago registrado, quitação assumida pela regra da carga e registros sem informação suficiente. Quando houver estimativa/regra de fonte, indicar isso no próprio indicador, não apenas na nota inferior. Preservar a distinção entre desembolso para a instituição e pagamento ao fornecedor.

**Aceite:** o usuário identifica quanto é comprovado por registro financeiro e quanto é assumido pela regra existente, sem interpretar 97% como pagamento observado sobre todo o valor global exibido. Não alterar a regra aprovada de carga manual durante uma simples correção de apresentação.

Referências: `frontend/src/lib/monitoramento-painel-metricas.ts:140`, `frontend/src/lib/monitoramento-painel-metricas.ts:234`, `frontend/src/pages/monitoramento-painel-page.tsx:130`, `frontend/src/components/features/monitoramento-painel-evolucao.tsx:55`.

### D44 — P2 — Pontos de atenção conta ocorrências, sem mostrar instrumentos distintos nem todo o escopo de risco

**Confirmado:** os 26 pontos nacionais correspondem a sete ações atrasadas, cinco inaugurações atrasadas e 14 divergências externas; não há licença crítica nessa sessão. A conferência encontrou **24 instrumentos distintos** com pelo menos uma dessas condições. Em SC, são três pontos: duas ações do mesmo CEPON e uma divergência de outro instrumento, portanto dois instrumentos afetados.

O cálculo já produz `instrumentosEmAtencao`, mas a faixa principal usa somente a soma de ocorrências. Vigências próximas, falta de técnico e datas essenciais ausentes não entram nessa soma. A página pode exibir zero pontos ao lado de outras lacunas, como no D42.

**Sugestão:** mostrar “24 instrumentos com atenção · 26 ocorrências”, com definição das categorias incluídas e acesso à lista consolidada, sem duplicar instrumento. Apresentar qualidade cadastral e prazos de vigência como categorias identificadas, mantendo a contagem de ocorrências quando ela for útil ao trabalho da equipe.

**Aceite:** múltiplas ações de um instrumento não parecem múltiplos instrumentos. Os subtotais reconciliam o total, e ausência de alerta operacional não é apresentada como certificação de cadastro completo.

Referências: `frontend/src/lib/monitoramento-painel-metricas.ts:178`, `frontend/src/lib/monitoramento-painel-metricas.ts:218`, `frontend/src/lib/monitoramento-painel-metricas.ts:223`, `frontend/src/pages/monitoramento-painel-page.tsx:142`.

### D45 — P2 — O mapa não explica todos os registros ausentes e o ranking tem nomes ambíguos

**Reprodução nacional:** a seção informa **178 de 245 instrumentos no mapa** e **65 sem coordenadas**, deixando dois instrumentos sem explicação nessa reconciliação. Completude mostra coordenadas em 180/245. No ranking, há duas entradas “METROPOLITANA”, ambas com sete instrumentos, sem UF no rótulo.

**Causa identificada:** além dos sem coordenadas, o classificador conta pontos que não encontram uma macrorregião na geometria. Esses pontos não entram nos locais agrupados nem na contagem mapeada; a interface só mostra o motivo sem coordenadas. Não se comprovou se a falta de associação dos dois pontos decorre de coordenadas incorretas, geometria ou posição em limite territorial.

**Sugestão:** distinguir mapeados, sem coordenadas e com coordenadas sem associação territorial. Permitir consultar os instrumentos de cada grupo e conferir o cadastro. Acrescentar UF e código da macro nos rankings e nomes acessíveis, especialmente para denominações repetidas.

**Aceite:** as categorias explicam os 245 instrumentos, e a diferença entre possuir coordenadas e estar efetivamente representado é clara. Não inferir macrorregião pelo município de texto livre nem ajustar coordenadas sem evidência.

Referências: `frontend/src/lib/monitoramento-geografia.ts:55`, `frontend/src/lib/monitoramento-geografia.ts:86`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:62`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:276`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:335`.

### D46 — P2 — Mapa conserva uma macro incompatível depois de trocar o filtro territorial

**Reprodução:** no recorte SC + Mamógrafo, selecionar a localização do convênio 825374, abrindo a macro SUL. Limpar filtros e selecionar UF DF. A geografia passa a informar **8 de 9 instrumentos no mapa**, com ranking DISTRITO FEDERAL: 8, mas mantém **Mapa rodoviário · SUL**, zero instrumentos e Nenhum estabelecimento geocodificado neste recorte.

**Causa:** a macro e a localização selecionadas são estados internos do mapa, independentes dos filtros da página. Não há reconciliação automática da macro ao receber um conjunto filtrado incompatível. A ação Limpar filtros também não representa visualmente essa seleção local.

**Sugestão:** tratar a macro do mapa como seleção explícita, com escopo identificado. Quando uma mudança de filtro a tornar incompatível com o recorte, retornar à visão nacional ou solicitar seleção válida, explicando a mudança. Manter zero como um resultado legítimo quando a pessoa escolher intencionalmente uma macro sem instrumentos, sem impor a primeira macro arbitrariamente.

**Aceite:** trocar SC por DF não deixa o mapa focado em SUL com uma mensagem vazia que pareça descrever todo o DF. Contagem, título, seleção e marcadores pertencem ao mesmo contexto. Limpar filtros informa ou remove também a seleção local, conforme o comportamento definido.

Referências: `frontend/src/components/features/monitoramento-painel-geografia.tsx:44`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:146`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:173`.

### D47 — P2 — Gráficos resumidos não oferecem caminho suficiente para conferir os instrumentos

**Confirmado:** Por equipamento exibe apenas sete categorias. Os números nacionais visíveis somam 241 instrumentos — 135 Acelerador Linear, 70 Não informado, 22 Mamógrafo, 6 Braquiterapia, 4 Gama-câmara/SPECT, 2 PET/CT e 2 Medicina Nuclear — embora a seção descreva 245 instrumentos. O componente corta a lista sem indicar o restante. O ranking geográfico também mostra apenas oito macros, enquanto a seção informa 80 com instrumentos; o nome Maior concentração já sugere ranking, mas falta acesso à relação completa.

As representações de fase, contratação e técnico são estáticas, sem abertura da lista correspondente. Não há filtro específico de técnico no conjunto de filtros do painel, apesar de existir distribuição Por técnico titular. Os links das pendências e do mapa já demonstram um padrão de navegação que pode ser reaproveitado.

**Sugestão:** identificar Top N, mostrar quantidade restante e oferecer Ver todos. Permitir consultar os instrumentos que compõem uma fase, técnico, família ou contratação, levando à mesa operacional com o recorte preservado. Não fazer uma barra parecer botão sem interação e acessibilidade equivalentes. Ao revisar Por equipamento, aplicar também a definição de fonte e contagem do D40.

**Aceite:** qualquer total resumido tem universo e limite claros, e a gestão consegue conferir os registros de origem. Listas completas reconciliam os subtotais sem misturar unidades físicas e instrumentos.

Referências: `frontend/src/components/features/monitoramento-painel-visuals.tsx:39`, `frontend/src/pages/monitoramento-painel-page.tsx:169`, `frontend/src/components/features/monitoramento-painel-geografia.tsx:60`, `frontend/src/components/features/monitoramento-painel-analises.tsx:50`, `frontend/src/components/features/monitoramento-interno-filtros.tsx:22`.

### D48 — P2 — A hierarquia do painel ainda deixa conclusão e agenda depois de composição e mapa

A primeira faixa destaca Instrumentos, progresso de fase, valor global e pontos de atenção. Os **111 em fase concluída** aparecem como detalhe do total de instrumentos. Logo depois vem um mapa de grande altura, seguido de fases, anos e contratação. A série de inaugurações e a agenda de prazos aparecem mais abaixo, depois da composição e das entregas por família.

Isso dificulta responder primeiro às perguntas gerenciais definidas pelo usuário: **o que foi concluído, quando foi concluído, o que tem previsão e o que está atrasado ou sem data**. O progresso de fase está corretamente rotulado como referência; deve continuar secundário e não representar percentual físico medido de unidades entregues ou instaladas.

**Sugestão de ordem:** abrir com conclusão física e datas, agenda futura e atrasos; em seguida permitir investigação por instrumento e pendência. Depois mostrar distribuição da carteira, investimento, entregas e geografia. O mapa continua útil, mas não precisa anteceder a síntese temporal e a fila de decisões.

**Aceite:** a primeira tela responde à conclusão e aos próximos compromissos, com comparação temporal de referência explícita. A entrega permanece uma informação operacional própria. Fase concluída, inauguração real e encerramento administrativo mantêm indicadores e fontes distintos.

Referências: `frontend/src/pages/monitoramento-painel-page.tsx:110`, `frontend/src/pages/monitoramento-painel-page.tsx:149`, `frontend/src/pages/monitoramento-painel-page.tsx:179`, `frontend/src/pages/monitoramento-painel-page.tsx:204`.

### D49 — P2 — Cores repetidas ou parecidas sugerem equivalência entre dados diferentes

**Problema apontado pelo usuário:** dashboards com dados diferentes usam cores parecidas, dificultando distinguir categorias e compreender o significado de cada representação. Esse ponto não estava explícito nos achados anteriores e foi acrescentado nesta revisão.

**Confirmação no código da versão avaliada:** Fase atual, Tipo de contratação, Por equipamento e Por técnico reutilizam a mesma paleta por posição na lista, sem um vínculo estável entre cor e categoria. Realizadas e Previstas também usam as duas primeiras cores dessa paleta. Assim, o azul pode representar Não iniciado num gráfico, Convênio em outro, a família de maior frequência em outro e inaugurações realizadas em outro, sem relação de significado entre esses dados.

Há ainda uma repetição dentro do próprio gráfico de fases: são nove fases na sessão avaliada e oito cores, selecionadas por índice com módulo do tamanho da paleta. Portanto, **Não iniciado e Concluído recebem exatamente a mesma cor**, apesar de serem os extremos do acompanhamento. O comentário da paleta sobre distância entre cores não evita essa reutilização. Nas distribuições ordenadas por quantidade, a cor de uma categoria também pode mudar quando um filtro altera sua posição no ranking.

**Impacto:** a pessoa pode transferir indevidamente o significado de uma cor entre gráficos, confundir os extremos da execução ou interpretar uma mudança de cor como mudança de situação. Ter bom contraste entre amostras isoladas não resolve a consistência de significado no conjunto do painel.

**Sugestão:** definir uma convenção visual por dimensão. Fases precisam de cores estáveis por código, com distinção clara entre Não iniciado e Concluído; realizadas e previstas precisam de identidade constante e legenda próxima. Para rankings independentes de equipamento ou técnico, considerar barras de uma única cor, com nomes e quantidades, evitando sugerir uma correspondência cromática entre dimensões que não existe. Manter cores de alerta e conclusão com significado consistente e não depender apenas da cor para transmitir informação. Diferenciar também os blocos por títulos, unidade de contagem e organização visual, sem criar uma cor arbitrária para cada dashboard.

**Aceite:** Não iniciado e Concluído são distinguíveis no mesmo gráfico; uma categoria mantém sua cor ao filtrar ou reordenar; o significado das cores fica explícito em cada dimensão. Verificar o conjunto de gráficos lado a lado, além de contraste e leitura com diferentes percepções de cor. Esta rodada confirma a repetição e a atribuição por posição; não realizou medição perceptual nem teste com usuários com deficiência de visão de cores.

Referências: `frontend/src/lib/monitoramento-painel-palette.ts:3`, `frontend/src/components/features/monitoramento-painel-analises.tsx:68`, `frontend/src/components/features/monitoramento-painel-analises.tsx:178`, `frontend/src/components/features/monitoramento-painel-visuals.tsx:63`, `frontend/src/components/features/monitoramento-painel-evolucao.tsx:91`.

### 13.2. Organização proposta para o painel

1. **Contexto e filtros:** título, carteira monitorada, atualização das fontes e filtros ativos por nome. Referência do período explícita e separação entre ano do instrumento e data do resultado. Preservar o comportamento já validado de URL e retorno ao recorte.
2. **Síntese de conclusão:** concluídos com data, concluídos sem data, inaugurações realizadas no período e em andamento. Links para listas de conferência, sem substituir data ausente por fim de vigência.
3. **Agenda gerencial:** previsões futuras, atrasadas e instrumentos sem previsão; ações com responsável e prazo; divergências externas. Mostrar instrumentos distintos e ocorrências.
4. **Evidência e qualidade:** origem financeira observada ou assumida, atualização, ausência de datas, técnico, CNES, coordenadas e associação territorial. Licenças deferidas devem ter a natureza do denominador explícita: 12/245 é uma proporção da carteira inteira, não uma taxa de regularização dos equipamentos sujeitos ao licenciamento. A aplicabilidade regulatória precisa de regra de domínio própria, sem inferência improvisada pela interface.
5. **Composição e execução:** fases, contratação, técnicos, classificação canônica dos equipamentos e entregues/planejados, com unidade de contagem identificada e listas completas acessíveis.
6. **Geografia:** mapa e ranking conciliados com os filtros, UF/código nos nomes e explicação de todos os instrumentos não mapeados.

No estado vazio, substituir indicadores de completude como 0/0 e 0% por Não se aplica ao recorte vazio e concentrar a orientação em Nenhum instrumento encontrado / Limpar filtros. Isso reduz a impressão de baixa qualidade cadastral em um conjunto que apenas não contém registros.

### 13.3. Prioridade e limites

**Prioridade de confiabilidade:** alinhar a classificação por equipamento, tornar explícita a referência temporal e dar visibilidade aos concluídos sem datas essenciais. **Prioridade de uso:** reconciliar seleção do mapa com filtros, explicar base financeira e unidades das contagens, corrigir cores repetidas e sua instabilidade entre categorias. **Organização:** elevar conclusão e agenda, acrescentar investigação por categoria e identificar limites das listas.

O teste autenticado foi feito com perfil administrador. Não incluiu matriz de permissões de leitor/colaborador/gestor, validação normativa do denominador de licenciamento, teste de todas as combinações de programas/contratações, alterações de dados para simular vencimentos, simulação de rede indisponível, carga concorrente ou revisão exaustiva em dispositivos e leitores de tela. Houve navegação com o menu compacto, sem fixar uma matriz de resoluções. A expiração observada levou à tela de login e, após autenticar, a Dados Oficiais; a continuidade do endereço de destino deve ser verificada numa rodada específica de sessão, sem atribuir uma causa não demonstrada.

Esta seção é diagnóstico e sugestão. Nenhuma das correções propostas foi implementada.

## 14. Investigação do Radar de Instrumentos e das Notificações

### 14.1. Escopo, ambiente e operações realizadas

Validação autenticada como administrador na **porta 5180**, cópia `3906761`, API 8010 e clone local já identificados nas seções anteriores. A investigação combinou navegação de usuário, leitura do código dessa versão e SELECTs no banco `sigeo_local_integrado`, usuário `gustavoleite`, em transações com `transaction_read_only=on`.

**Radar:** abertura pelo cabeçalho, inspeção das duas abas, detalhes e atualização do histórico de coleta, busca por número, seleção de situações Novo e Aprovado, reabertura e fechamento por Escape. A fila disponível ao usuário permaneceu vazia. Não foram criados candidatos artificiais, alterados critérios de elegibilidade, executadas coletas nem submetidas decisões de aprovação/rejeição. Portanto, essas decisões e sua inclusão na carteira não foram validadas funcionalmente nesta rodada.

**Notificações:** abertura do resumo pelo sino e da Central, caixas Recebidas/Não lidas/Arquivadas, busca, tipos, paginação até a terceira página, arquivamento/restauração, leitura individual ao abrir registro, leitura em lote e persistência após recarregar. Os 21 avisos acessíveis à conta eram os gerados nos testes locais anteriores do TED 25000175998202088, conforme a seção 11. Não se alteraram eventos, ações, entregas ou cadastros do instrumento nesta rodada.

**Comportamentos que funcionaram:**

- O Radar distingue visualmente coleta concluída de coleta defasada e exibe data da tentativa e do último sucesso.
- A atualização de histórico não executa coleta; o botão tem nome acessível Atualizar histórico de consultas e explicação correspondente no atributo de título. A mesma data permaneceu após atualizar, de forma coerente com essa finalidade.
- Os filtros de candidato têm busca por número e situações de triagem. O estado vazio orienta consultar a coleta, embora falte explicar o universo elegível, conforme D51.
- A Central tem caixas separadas, tipo e busca, contagem e paginação. A última página de Não lidas mostrou um aviso, posição 21–21 de 21.
- Arquivar um aviso não lido retirou-o de Recebidas e reduziu o badge de 21 para 20; a caixa Arquivadas permitiu encontrá-lo e Restaurar devolveu-o como não lido, com badge 21. Arquivar e ler são estados distintos.
- Abrir o último aviso não lido levou ao TED correto e reduziu o badge para 20. A caixa Não lidas passou a ter duas páginas, sem permanecer numa terceira página vazia.
- A leitura em lote persistiu após recarregar. Os avisos continuaram disponíveis como Lida em Recebidas, sem exclusão do conteúdo.
- O filtro de tipo oferece onze categorias e trata um tipo sem avisos com mensagem de recorte vazio. Isso não comprova os destinos e as regras de geração dos onze tipos.

Na revisão de código, há tratamento de erro com nova tentativa na Central, estados pessoais por destinatário e autorização no backend. Avisos de fonte indisponível recebem corpo público resumido, preservando os detalhes internos fora da resposta pública. Esses aspectos foram inspecionados no código; não foram simulados erros de rede nem uma matriz de contas/perfis para comprovar todos os cenários.

### D50 — P2 — Radar anuncia propostas em tramitação, mas a aba está desabilitada

**Reprodução:** o título auxiliar diz Convênios para revisão e propostas em tramitação; ao lado de Convênios, a aba Propostas em tramitação está desabilitada. Não existe conteúdo de proposta navegável por esse caminho na sessão avaliada.

**Causa confirmada:** a desabilitação é fixa no componente, com atributo de título Aguardando definição do critério de propostas novas. Não depende da falta de propostas ou da permissão do administrador testado. A descrição do modal anuncia uma capacidade indisponível, e a justificativa fica dependente de uma dica de mouse em um controle desabilitado.

**Sugestão:** mostrar o estado de implantação em texto visível: Radar de convênios ativo; Radar de propostas aguardando definição de critério. Até haver definição, orientar para a consulta de propostas já existente em Linhas de financiamento, explicitando que essa carteira não equivale a uma fila de novas entradas. Não habilitar automaticamente a aba nem tratar todo registro histórico como proposta nova.

**Aceite:** usuário de mouse, teclado ou toque entende o que está disponível e onde consultar as propostas existentes. A definição de novo, alterado, já conhecido e confirmado precisa anteceder a ativação da triagem.

Referência: `frontend/src/components/features/central-entradas.tsx:38`.

### D51 — P2 — Fila vazia não explica a diferença entre candidatos históricos e candidatos elegíveis

**Reprodução:** Convênios informa Nenhum convênio neste recorte, inclusive sem busca ou situação selecionadas. A conferência somente leitura encontrou **4.965 registros históricos de candidato**, todos com última captura de origem `siconv_oficial`, distribuídos assim:

- 30 com critério `prioritarios_ms_v1`, elegíveis na captura e Portal não consultado.
- 4.934 sem critério de escopo registrado, elegíveis na captura e Portal não consultado.
- Um sem critério, marcado como inelegível e Portal não consultado.

Nenhuma dessas últimas capturas tem o critério atual `prioritarios_ms_celebrados_v2` ou confirmação do Portal. A API do Radar exige o recorte oficial atual para a fila aberta, além de excluir instrumentos já conhecidos/monitorados; decisões encerradas têm tratamento próprio. **Logo, 4.965 históricos não significam 4.965 itens aptos a aparecer ou ser aprovados.** O vazio é explicável pela elegibilidade e não comprova perda de dados.

**Sugestão:** apresentar o escopo da fila em linguagem de produto: convênios do Ministério da Saúde, no recorte prioritário e celebrado, com confirmação oficial e ainda fora da carteira. Distinguir Sem candidatos elegíveis, Filtro sem resultados e Nenhuma coleta válida nesse escopo. Para a gestão, oferecer um resumo diagnóstico de históricos fora do critério atual, sem misturá-los à fila operacional.

**Aceite:** o usuário compreende por que a fila está vazia e que isso não equivale a inexistência de registros históricos. A explicação não transforma capturas antigas em comprovação atual nem permite contornar a conferência oficial.

Referências: `backend/app/routers/candidatos_legados.py:64`, `backend/app/repositories/candidatos_legados.py:188`, `backend/app/repositories/candidatos_legados.py:194`, `frontend/src/components/features/candidatos-legados.tsx:75`.

### D52 — P2 — Coleta defasada está sinalizada, mas não explica a cobertura nem o próximo passo operacional

O Radar apresentou **Concluída · Defasada**, última tentativa e último sucesso em **08/10/2026, 15:23:52**, com **zero verificados e zero alterados**. Em 29/10, essa informação está defasada em cerca de três semanas. Atualizar histórico confirmou o mesmo estado.

O aviso de defasagem é correto e deve ser preservado. Entretanto, um sucesso técnico com zero itens não esclarece se houve consulta efetiva do universo esperado, coleta sem alterações, ausência de dados elegíveis ou carga histórica. A data antiga e a fila vazia não permitem ao usuário concluir que não há novos instrumentos na fonte hoje.

**Sugestão:** informar separadamente tentativa, último sucesso completo no escopo atual, abrangência/volume consultado, candidatos encontrados, novos, alterados e excluídos por critério. Mostrar orientação sobre quem pode solicitar uma nova execução e como acompanhar seu resultado. Se o agendamento estiver suspenso ou ainda não configurado, apresentar esse estado a partir de informação operacional verificável.

**Aceite:** Atualizar histórico continua distinto de Executar coleta; uma fila vazia não sugere vigilância atual quando o dado está defasado. Não acionar coleta ou agendamento de produção como consequência automática de uma revisão da tela. Nesta rodada não se verificou a configuração ativa do agendamento no GitHub/produção nem se atribuiu uma causa à defasagem local.

Referência: `frontend/src/components/features/monitor-descoberta-legado.tsx:30`.

### D53 — P1 — Marcar todas como lidas afeta avisos fora do recorte visível

**Reprodução controlada:** com vinte avisos de teste ainda não lidos, selecionar a caixa Não lidas e buscar `QA-SEM-RESULTADO-20261029`. A lista mostrou zero resultados, mas manteve 20 não lidas e o botão Marcar todas como lidas habilitado. Acioná-lo marcou **os vinte avisos da conta**, mesmo não pertencendo ao resultado visível. A contagem passou a zero e o estado persistiu após recarregar.

**Causa:** o contador de não lidas é global às recebidas do destinatário; o endpoint de leitura em lote recebe somente a identidade do usuário e ignora busca, tipo e página. O comportamento não é uma falha de persistência. O problema é a ação de alcance global ficar junto dos filtros e dos resultados sem deixar esse alcance explícito. A interface também não oferece Marcar como não lida para recuperar uma seleção marcada por engano.

**Sugestão:** separar Marcar resultados deste recorte como lidos de Marcar todas as minhas recebidas como lidas, com alcance e quantidade visíveis. Se apenas a ação global permanecer, identificá-la dessa forma e não apresentá-la como operação da lista filtrada. Acrescentar recuperação por Desfazer ou Marcar como não lida, com estado individual preservado por destinatário.

**Aceite:** ação de recorte não modifica avisos fora dos critérios selecionados; ação global informa claramente seu universo, inclusive com busca vazia de resultados. O badge global pode continuar independente do filtro, desde que seja rotulado como tal. Manter a exclusão das arquivadas da ação global atual, caso essa regra permaneça aprovada.

Referências: `frontend/src/components/features/central-notificacoes.tsx:133`, `frontend/src/hooks/use-notificacoes.ts:73`, `backend/app/routers/notificacoes.py:85`, `backend/app/repositories/notificacoes.py:253`.

### D54 — P2 — Busca de notificações exige a mesma acentuação do texto

**Reprodução:** na caixa Não lidas, antes da leitura em lote, buscar `licenca` retornou zero; buscar `licença` retornou dois avisos do marco Licença de operação/alteração. A diferença de acentuação é suficiente para esconder notificações que o usuário espera encontrar.

**Causa:** a busca usa comparação sem distinção de maiúsculas/minúsculas sobre título e corpo, mas não normaliza acentos. Não há, nessa consulta, procura estruturada por instrumento, tipo de entidade ou registro de origem; o resultado depende de o termo estar nos textos persistidos.

**Sugestão:** normalizar acentuação e espaços para pesquisa de texto, preservando o conteúdo original na exibição. Acrescentar filtro estruturado de instrumento/entidade quando necessário. Separar a contagem do resultado da contagem global de não lidas para reduzir confusão quando uma busca não encontra avisos.

**Aceite:** licença/licenca encontram os mesmos avisos pertinentes; busca por número encontra o instrumento independentemente da descrição editorial; caracteres usados como parte literal da pesquisa continuam tratados como texto, sem ampliar o resultado como curingas involuntários.

Referência: `backend/app/repositories/notificacoes.py:205`.

### D55 — P2 — Abrir registro perde o contexto e não localiza o evento ou ação do aviso

**Reprodução:** partindo de Dados Oficiais, abrir a Central e, na última página de Não lidas, acionar Abrir registro no aviso Teste Local abriu uma ação em 25000175998202088. O destino foi o instrumento correto, mas sem a ação destacada e com retorno para **Mesa de trabalho**, não para a Central ou a página de origem. O instrumento mostrava zero ações ativas, pois a ação de teste havia sido posteriormente excluída de forma auditável.

A notificação continua válida como histórico, mas o usuário precisa descobrir sozinho por que o fato anunciado não aparece no estado atual. Ao reabrir a Central, caixa, busca e paginação recomeçam. No código, o destino é montado apenas com o identificador do instrumento, sem parâmetro de retorno nem referência específica de ação/evento.

Há outras limitações de destino identificadas somente no código: avisos de proposta levam à lista geral de propostas, sem destacar o item; Novo convênio no Radar não recebe destino navegável. Não houve aviso desses tipos para essa conta que permitisse reproduzir a navegação correspondente pela interface.

**Sugestão:** incluir referência estruturada ao fato notificado, navegar para a seção ou versão correta, indicar quando houve substituição/exclusão posterior e oferecer retorno ao mesmo contexto da Central. Para avisos de descoberta, abrir o candidato correspondente no Radar; para propostas, localizar a proposta certa, respeitando seu estágio atual. Manter histórico e estado atual claramente separados.

**Aceite:** a pessoa identifica o registro e a alteração que originaram o aviso, inclusive quando já houve correção posterior. Voltar recupera caixa, busca e página, ou oferece uma ação explícita de retorno à Central. Um aviso histórico não parece comprovar que a ação continua pendente.

Referências: `backend/app/services/notificacoes.py:114`, `backend/app/services/notificacoes.py:122`, `backend/app/services/notificacoes.py:134`, `frontend/src/components/features/central-notificacoes.tsx:36`, `frontend/src/components/features/notification-bell.tsx:36`.

### D56 — P2 — Avisos de correção são pouco distinguíveis e não mostram hora nem mudança específica

Na primeira página, apareceram dois avisos **Teste Local corrigiu um evento em 25000175998202088**, ambos com corpo **Marco: Concluído** e data **29/10/2026**. Não se trata de duplicidade comprovada: são correções distintas realizadas na validação anterior. A apresentação, porém, torna os dois avisos indistinguíveis para o usuário.

A Central mostra somente a data, embora receba timestamp. A descrição resumida não informa qual campo mudou, valor anterior/novo ou referência da versão. O destino genérico descrito no D55 tampouco ajuda a conferir a diferença. Vinte e um avisos de um único instrumento também ocupam várias páginas, exigindo esforço para reconstruir a sequência.

**Sugestão:** exibir data e hora com fuso identificado, autor, instrumento com identificação legível — inclusive NUP formatado para FAF/TED — e resumo pertinente da alteração. Permitir expansão do detalhe ou acesso ao histórico auditável, sem expor informação desnecessária no resumo. Considerar agrupamento por instrumento e período com contagem de alterações, mantendo cada evento acessível. Distinguir atualização informativa de pendência que exige ação; Lida não significa Resolvida.

**Aceite:** duas correções do mesmo marco no mesmo dia são distinguíveis. O usuário consegue conferir a sequência e o conteúdo sem interpretar avisos repetidos como duplicação do sistema. Agrupamento não apaga autoria ou versões e leitura não conclui ações automaticamente.

Referências: `frontend/src/components/features/notificacao-item.tsx:54`, `frontend/src/components/features/notification-bell.tsx:144`, `backend/app/services/notificacoes.py:131`.

### 14.2. Organização sugerida

**Radar:** abrir com um resumo inequívoco do que é monitorado, estado da coleta e critérios da fila. Depois separar A revisar, Em análise e Decisões encerradas, com contagens e busca no universo correspondente. Detalhes devem reunir evidência oficial, confirmação, relação com o equipamento e histórico da decisão. A leitura de código já mostra justificativa, conferência e proteção contra versão desatualizada; preservar essas salvaguardas e validá-las pela interface quando houver candidato elegível. A aprovação inclui na carteira e não deve ser confundida com iniciar o monitoramento interno.

**Notificações:** manter o sino como resumo recente e a Central como espaço de consulta. Identificar contagem global versus resultados, filtros ativos e alcance das ações em lote. Priorizar pendências por prazo e separar alterações informativas, com agrupamento opcional por instrumento e ligação direta ao fato. Considerar identificação de alterações feitas pelo próprio usuário para evitar que confirmações das próprias operações encubram avisos recebidos da equipe, sem suprimir auditoria ou impor uma preferência não definida.

**Integração:** notificações de descoberta devem levar ao Radar; aprovação deve localizar a entrada na carteira; acompanhamento deve levar ao evento/ação no instrumento. Cada destino precisa preservar referência, contexto e possibilidade de retorno. A identidade da entidade não pode ser inferida só por uma chave numérica compartilhada entre tabelas.

### 14.3. Estado final dos testes e limites

**Alterações pessoais realizadas pela interface:** um aviso foi arquivado e restaurado; um aviso foi marcado como lido ao abrir o instrumento; os vinte restantes foram marcados como lidos no teste de alcance global. A verificação final por SELECT confirmou, para a conta local, **21 destinatários, zero não lidos e zero arquivados**. Os 21 avisos permanecem em Recebidas como lidos. Não se afirma que o estado de leitura voltou ao inicial: não existe comando de marcar como não lido na interface avaliada, e não se alterou o banco para simular essa restauração.

A tabela de notificações do clone contém outros tipos e destinatários, mas somente esses 21 avisos de teste estavam disponíveis à conta utilizada. Portanto, não se certificou pela interface a geração e o destino de todos os tipos, nem o recebimento por titular/suplente, gestor e leitor. O código materializa destinatários na criação do aviso; um administrador criado depois não recebe automaticamente todo o histórico anterior. Isso deve ser considerado ao preparar contas e dados de homologação.

Não foram testados aprovação/rejeição efetivas, conflito de versões entre revisores, nova captura oficial, coleta incompleta, inclusão duplicada, alteração de destinatários, funcionamento do agendamento em produção, concorrência entre abas, notificações chegando durante uma ação em lote, falhas de rede nem matriz completa de acessibilidade e dispositivos. A inexistência de candidatos elegíveis e a aba de propostas desabilitada são limites concretos, não fluxos certificados como funcionando. Não foram criados dados para contornar essas condições.

Os achados distinguem comportamento reproduzido, explicação verificada no código/banco e sugestão de organização. Nenhuma correção foi implementada.

## 15. Verificação de Renovar sessão

### 15.1. Resultado funcional confirmado

Teste na mesma versão **5180 / revisão 3906761**, com a conta administradora local e sessão já autenticada. A renovação foi acionada pelo comando normal do menu da conta, sem manipular cookies, tokens, relógio ou validade no banco.

**Cenário principal:**

1. Em Dados Oficiais, selecionar UF SC: 23 instrumentos.
2. Abrir o menu da conta: Expira em aproximadamente 48:09.
3. Acionar Renovar sessão: o contador passou a **1:00:00**, mantendo o menu e a página abertos, sem mensagem de falha ou novo login.
4. Conferir que a URL continuava em `/monitoramento-equipamentos?uf=SC` e o filtro SC permanecia selecionado.
5. Avançar à segunda página: itens 21–23 de 23. Recarregar: UF e página continuaram preservadas.

**Segunda aba:** abrir o endereço filtrado e paginado em outra aba do mesmo navegador. Seu contador estava em aproximadamente 53:41. Renovar novamente pela primeira aba atualizou o contador nas duas para **1:00:00**, sem recarregar a segunda. O recorte da segunda aba permaneceu SC, página 2.

**Conclusão desse cenário:** Renovar sessão funcionou, preservou a navegação e propagou a nova referência de expiração entre abas. Não foi encontrado defeito funcional na renovação manual bem-sucedida testada.

O código usa o mesmo fluxo de refresh para renovação manual e tentativa automática após 401, com deduplicação dentro da aba. A emissão atualiza a referência de expiração; a assinatura de mudanças de armazenamento propaga o relógio entre abas. A API rotaciona o refresh token. A propagação do contador não equivale a testar duas rotações simultâneas em abas diferentes: esse cenário não foi provocado.

Referências: `frontend/src/components/layout/user-menu.tsx:116`, `frontend/src/hooks/useTempoSessao.ts:33`, `frontend/src/lib/http-client.ts:111`, `frontend/src/lib/http-client.ts:142`, `frontend/src/lib/sessao-expiracao.ts:73`, `backend/app/routers/auth.py:201`.

### D57 — P2 — Falha definitiva de sessão pode perder o destino e os filtros após novo login

**Evidência anterior:** durante a rodada do Painel de Gestão, a sessão levou à tela de login e, após autenticar, o retorno foi a Dados Oficiais. O fluxo exato de requisições que originou aquela transição não foi instrumentado; não se atribui o episódio a uma causa única nem ao botão Renovar sessão, que funcionou nos cenários atuais.

**Problema confirmado na revisão do código:** quando uma requisição continua com 401 após a tentativa de refresh, o cliente HTTP usa redirecionamento completo para `/login`, sem guardar o endereço de origem. Por outro caminho, o guard da rota guarda apenas `pathname`, omitindo busca e fragmento. A página de login usa esse estado quando existe e, na ausência, envia para Dados Oficiais. Portanto, os caminhos de recuperação não preservam de forma consistente página e filtros.

A mensagem Expirada — será renovada na próxima ação também descreve a renovação como garantida. O refresh pode já estar inválido ou a rede indisponível; o contador do cliente não comprova, sozinho, validade da sessão no servidor.

**Sugestão:** preservar um destino interno validado com caminho, parâmetros e fragmento antes de exigir login. Após autenticar, retornar ao contexto seguro e explicar quando uma alteração não foi gravada. Para formulários, definir recuperação do rascunho conforme a sensibilidade dos dados, sem prometer preservação que ainda não existe. Distinguir sessão de acesso vencida com renovação possível de sessão que exige autenticação; usar mensagem condicional enquanto o resultado do refresh for desconhecido.

**Aceite:** expiração com refresh válido renova sem perda do contexto; refresh inválido solicita login e retorna à página e aos filtros anteriores; falha de rede oferece recuperação clara sem declarar renovação garantida. Destinos externos ou não autorizados não são aceitos como retorno. A recuperação de uma gravação interrompida não duplica a operação nem informa sucesso sem confirmação.

Referências: `frontend/src/lib/http-client.ts:249`, `frontend/src/components/layout/protected-route.tsx:45`, `frontend/src/pages/login-page.tsx:23`, `frontend/src/components/layout/user-menu.tsx:59`.

### 15.2. Limites desta verificação

Não houve espera pelo vencimento natural de uma hora nesta rodada nem alteração de configurações para encurtá-lo. Não foram provocados refresh revogado, indisponibilidade de rede, bloqueio de armazenamento, duas rotações simultâneas entre abas ou falha durante gravação de formulário. Não se certificou preservação de rascunho em falha de autenticação. A renovação manual, a preservação do recorte/paginação e a sincronização observada entre duas abas foram efetivamente testadas.

A renovação alterou somente o estado normal de autenticação da conta de teste. Não foram modificados senha, perfil, permissões ou registros de negócio. Os 21 avisos de teste continuam com o estado final documentado na seção 14.

## 16. Encerramento e ordem sugerida de tratamento

O diagnóstico está encerrado para o escopo solicitado, com avaliação de usuário na porta 5180, investigação de código e conferências de dados identificadas por ambiente. A aplicação não foi corrigida nesta entrega. O arquivo reúne os resultados para orientar uma etapa posterior de decisão e implementação.

**Ordem sugerida:**

1. **Integridade e confiança dos dados:** tratar correção/reabertura de ações, coerência entre conclusão e inauguração, datas regulatórias, resultados macrorregionais de PET-CT e fonte canônica de classificação de equipamento. Conferir cada problema em produção por procedimento próprio antes de aplicar eventual reparo de dados; o clone não certifica seu estado atual.
2. **Conclusão e referência temporal:** reorganizar Relatórios e Painel para destacar concluídos, data real e previsão; distinguir fim de vigência, pagamento, entrega e conclusão. Identificar o período usado em cada consulta e tornar visíveis concluídos sem datas essenciais.
3. **Operação sem efeitos inesperados:** acrescentar Cancelar às edições, corrigir ajuda cortada e clique indevido, esclarecer o alcance da leitura em lote, manter contexto no mapa e no retorno após autenticação.
4. **Carteira e financiamento:** planejar a apresentação conjunta de FAF manual/API e TED em Linhas de financiamento, com categoria, origem, estágio e conciliação de identidades. Manter PRONON e a distinção entre proposta e parceria conforme evidência da fonte, sem promoção automática por semelhança de nome ou CNPJ.
5. **Leitura executiva e rastreabilidade:** corrigir significado e estabilidade das cores, unidades das contagens, identificação das bases financeiras, granularidade dos relatórios, acesso aos registros que compõem gráficos e ligação das notificações ao fato de origem.
6. **Radar e acompanhamento da fonte:** definir e comunicar critérios de propostas novas, elegibilidade da fila e atualidade/cobertura das coletas. Validar triagem e aprovação pela interface com candidatos oficiais elegíveis numa rodada própria; não considerar esses fluxos aprovados pela inspeção de código.

**Critério transversal de conclusão de uma futura correção:** reproduzir o caso descrito, comprovar o comportamento esperado na mesma versão avaliada ou em versão identificada, verificar persistência e efeitos nos relatórios/indicadores relacionados e registrar seus limites. Ajustes de regra de cálculo devem atualizar a metodologia junto com o código. Não usar monitoramento manual para modificar cobertura, déficit ou distância.

Não foi atribuído um percentual geral de aprovação: os módulos têm amplitudes de teste diferentes, e alguns fluxos estavam indisponíveis. Os achados indicam prioridades e critérios de aceite; as limitações expressas impedem confundir diagnóstico finalizado com homologação completa.
