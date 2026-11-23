# Dicionário de dados: Carteira e monitoramento

Convênios firmados, instrumentos monitorados e o acompanhamento interno pós-repasse. Gerado do schema real no head `d9e0f1a2b3c4` e dos modelos em `backend/app/db/`. Legenda e convenções em [README](README.md).

## `convenio`

Instrumento firmado do universo de Instrumentos firmados (carteira), com dados das fontes oficiais.

Chave primária: `id`. Colunas: 51. Uso: 560 linhas em produção (contagem exata de 22/11/2026).

560 firmados em 26/10; 542 no escopo. `fora_escopo_equipamentos = true` tira o instrumento de tudo (`instrumento_no_escopo()`).

Liga a `instrumento_equipamento` por `numero` = `nr_convenio` e `tipo_contratacao`, sem FK. Convênio sem monitoramento é o caso normal (monitorado: cerca de 290).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `cnes` | [`cnes_estabelecimento`](carteira-monitoramento.md#cnes_estabelecimento).`cnes` | SET NULL |
| `fonte_dado_id` | [`fonte_dado`](carteira-monitoramento.md#fonte_dado).`id` | SET NULL |

Restrições:

- Único `uq_convenio_chave_origem`: (chave_origem)
- Único `uq_convenio_numero`: (numero)
- `ck_convenio_convenente_cnpj_formato`: CHECK (((convenente_cnpj IS NULL) OR ((convenente_cnpj) ~ '^[0-9]{14}$')))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `numero` | texto | não | Identificador do instrumento, chave de negócio única. FAF e TED usam o NUP SEI; PERSUS usa código com prefixo (PS1-, PS2-). |  |
| `numero_instrumento` | texto | sim | Número do instrumento. Vem de `dimConvenio.numero` do Portal quando o Portal responde; senão é derivado do SICONV (sequencial de `NR_PROPOSTA` + `/` + `ANO` do convênio). |  |
| `ano_instrumento` | integer | sim | Ano do instrumento. |  |
| `objeto` | texto | sim | Objeto do instrumento. |  |
| `situacao` | texto | sim | Situação do instrumento. **A confirmar.** |  |
| `situacao_portal` | texto | sim | Situação do instrumento no Portal. **A confirmar.** |  |
| `situacao_contratacao` | texto | sim | Situação da contratação (por exemplo, PERSUS II em contratação). |  |
| `convenente_nome` | texto | não | Nome do convenente. |  |
| `convenente_cnpj` | texto | sim | CNPJ do convenente (14 dígitos). Nulo em PERSUS e PRONON, que não publicam CNPJ; nunca preencher com sentinela. |  |
| `convenente_tipo` | texto | sim | Tipo do convenente. **A confirmar.** |  |
| `municipio` | texto | sim | Município do convenente. |  |
| `uf` | varchar(2) | sim | UF do convenente. |  |
| `codigo_ibge` | texto | sim | Código IBGE do município. |  |
| `regiao` | texto | sim | Região do país. **A confirmar.** |  |
| `orgao` | texto | sim | Órgão. **A confirmar.** |  |
| `unidade_gestora` | texto | sim | Unidade gestora. **A confirmar.** |  |
| `subfuncao` | texto | sim | Subfunção orçamentária. **A confirmar.** |  |
| `funcao` | texto | sim | Função orçamentária. **A confirmar.** |  |
| `tipo_instrumento` | texto | sim | Tipo do instrumento na fonte. **A confirmar.** |  |
| `numero_processo` | texto | sim | Número do processo. **A confirmar.** |  |
| `programa` | texto | sim | Programa. **A confirmar.** |  |
| `data_publicacao` | date | sim | Data de publicação. |  |
| `data_inicio_vigencia` | date | sim | Início da vigência. |  |
| `data_final_vigencia` | date | sim | Fim da vigência; base do aviso de vigência (3 meses antes). |  |
| `data_conclusao` | date | sim | Data de conclusão na fonte. **A confirmar.** |  |
| `data_ultima_liberacao` | date | sim | Data da última liberação de recursos. |  |
| `valor_global` | numeric | sim | Valor global. |  |
| `valor_repasse` | numeric | sim | Valor de repasse. |  |
| `valor_empenhado` | numeric | sim | Valor empenhado. |  |
| `valor_desembolsado` | numeric | sim | Valor desembolsado. |  |
| `valor_contrapartida` | numeric | sim | Valor de contrapartida. |  |
| `valor_saldo_conta` | numeric | sim | Saldo em conta. **A confirmar.** |  |
| `valor_ultima_liberacao` | numeric | sim | Valor da última liberação. |  |
| `financeiro_fonte_confiavel` | boolean | não | Se os valores financeiros vêm de fonte confiável (a projeção do Radar grava `true`). | padrão `false` |
| `equipamentos_tags` | jsonb | sim | EQUIPAMENTOS_ALVO detectados nos itens (mesmos 14 padrões de equipamento-tags.ts) -- pré-computado na carga pra filtrar sem reprocessar itens a cada request. |  |
| `cnes` | varchar(7) | sim | CNES do estabelecimento (ver `cnes_estabelecimento`). | FK `cnes_estabelecimento.cnes` (SET NULL) |
| `cnes_metodo` | texto | sim | Como o CNES foi resolvido na carga (planilha, cnpj_exato, cnpj_multi_municipio, manual, nome_endereco); nulo quando editado à mão depois. |  |
| `siconv_raw` | jsonb | sim | Dump bruto do SICONV (JSON); inclui `itens_plano_aplicacao`, de onde vem o valor do equipamento. |  |
| `transferegov_raw` | jsonb | sim | Dump bruto do TransfereGov (JSON). |  |
| `atualizado_em` | timestamptz | não | Data e hora da última atualização. | padrão `now()` |
| `valor_pago_fornecedor` | numeric | sim | Soma de VL_PAGO dos pagamentos a fornecedores (SICONV), pré-computada na carga para o card não ler `siconv_raw`. |  |
| `pagamentos_count` | integer | não | Quantidade de pagamentos do convênio. | padrão `0` |
| `tipo_contratacao` | texto | sim | Convênio, FAF, TED, PERSUS I ou PERSUS II. Nulo conta como Convênio na junção com `instrumento_equipamento`. |  |
| `origem_dado` | texto | sim | Proveniência da carga para fonte que não é SICONV, Portal ou TransfereGov (ex.: PERSUS I, nome da planilha e sha256). |  |
| `chave_origem` | texto | sim | Chave estável de upsert para origem sem número oficial (NUP SEI em dígitos para FAF e TED; PERSUS1-{cnes}-{tipologia}). Nunca exposta na API nem na tela. |  |
| `tipologia` | varchar(3) | sim | Tipologia (A, CV, C, EO, C.B ou NA). Significado de cada sigla: a confirmar. **A confirmar.** |  |
| `municipio_normalizado` | texto | sim | Município normalizado por `normalizar_texto`, base do filtro por município. |  |
| `codigo_ibge_municipio` | varchar(6) | sim | Código IBGE do município (6 dígitos). |  |
| `fonte_dado_id` | bigint | sim | Referência a `fonte_dado.id`. | FK `fonte_dado.id` (SET NULL) |
| `fora_escopo_equipamentos` | boolean | não | Exclusão de escopo preserva a fonte e evita reentrada na descoberta. | padrão `false` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `situacao`, `situacao_portal`, `convenente_tipo`, `regiao`, `orgao`, `unidade_gestora`, `subfuncao`, `funcao`, `tipo_instrumento`, `numero_processo`, `programa`, `data_conclusao`, `valor_saldo_conta`, `tipologia`.

## `instrumento_equipamento`

Instrumento monitorado pela equipe: o nó que amarra o convênio ao acompanhamento manual.

Chave primária: `id`. Colunas: 37. Uso: 427 linhas em produção (contagem exata de 22/11/2026).

Sem FK para `convenio`: a junção é por número e `tipo_contratacao` (padrão Convênio). Em 22/11/2026, 24 PERSUS II aparecem aqui como Convênio e 2 FAF não têm contraparte (diagnóstico do Codex).

O equipamento planejado (`equipamento_descricao`, do SICONV) nunca é editável; o físico entregue (marca, modelo, série, vida útil) é informado pela equipe.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `cnes` | [`cnes_estabelecimento`](carteira-monitoramento.md#cnes_estabelecimento).`cnes` | SET NULL |
| `fonte_dado_id` | [`fonte_dado`](carteira-monitoramento.md#fonte_dado).`id` | SET NULL |

Restrições:

- Único `uq_instrumento_equipamento_chave_origem`: (chave_origem)
- Único `uq_instrumento_equipamento_nr_convenio`: (nr_convenio)
- `ck_instrumento_equipamento_cnpj_convenente_formato`: CHECK (((cnpj_convenente IS NULL) OR ((cnpj_convenente) ~ '^[0-9]{14}$')))
- `ck_instrumento_equipamento_investimento`: CHECK (((investimento_aquisicao IS NULL) OR (investimento_aquisicao >= (0))))
- `ck_instrumento_equipamento_modalidade_onco`: CHECK (((modalidade_onco IS NULL) OR ((modalidade_onco) = ANY ([('Apoio'), ('Diagnóstico'), ('Rastreamento'), ('Tratamento'), ('Múltiplas')]))))
- `ck_instrumento_equipamento_tipologia`: CHECK (((tipologia IS NULL) OR ((tipologia) = ANY ([('A'), ('CV'), ('C'), ('EO'), ('C.B'), ('NA')]))))
- `ck_instrumento_equipamento_vida_util`: CHECK (((equipamento_vida_util_anos IS NULL) OR (equipamento_vida_util_anos >= 0)))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `nr_convenio` | texto | não | Identificador do instrumento. FAF e TED usam o NUP SEI em dígitos; PERSUS tem valor aleatório com prefixo (PS1-, PS2-). |  |
| `cnpj_convenente` | texto | sim | PERSUS/PRONON chegam por CNES e não publicam CNPJ nesta fonte. Nulo é dado desconhecido; nunca preencher com sentinela ou CNPJ inventado. |  |
| `nome_convenente` | texto | não | Nome do convenente. |  |
| `municipio` | texto | sim | Município. |  |
| `uf` | varchar(2) | sim | UF. |  |
| `cnes` | varchar(7) | sim | Referência a `cnes_estabelecimento.cnes`. | FK `cnes_estabelecimento.cnes` (SET NULL) |
| `equipamento_descricao` | texto | sim | Descrição do equipamento planejado (SICONV, plano de aplicação). Nunca editável pela tela. |  |
| `programa` | texto | sim | Programa (`nm_programa` do TransfereGov), quando há correspondência. |  |
| `tp_instrumento_programa` | texto | sim | Texto do tipo de instrumento do programa na API do TransfereGov (ex.: Transferências Fundo a Fundo da Saúde); filtra o escopo. |  |
| `componente` | texto | sim | Componente de financiamento da planilha (ex.: RADIOTERAPIA); critério de escopo do monitoramento. |  |
| `ano_instrumento` | integer | sim | Ano do instrumento. |  |
| `tecnico_titular` | texto | sim | Nome do técnico titular (nossa equipe), retrato textual das cargas históricas. A fonte relacional é `instrumento_responsavel`. |  |
| `tecnico_suplente` | texto | sim | Nome do técnico suplente (nossa equipe); retrato textual, como `tecnico_titular`. |  |
| `nivel_monitoramento` | texto | sim | Nível de monitoramento do instrumento. Vocabulário: a confirmar. **A confirmar.** |  |
| `modalidade_onco` | texto | sim | Modalidade oncológica: Apoio, Diagnóstico, Rastreamento, Tratamento ou Múltiplas. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `equipamento_marca` | texto | sim | Marca do equipamento físico entregue, informada pela equipe; nula até a entrega. |  |
| `equipamento_modelo` | texto | sim | Modelo do equipamento físico entregue; nulo até a entrega. |  |
| `equipamento_numero_serie` | texto | sim | Número de série do equipamento físico entregue; nulo até a entrega. |  |
| `equipamento_vida_util_anos` | integer | sim | Vida útil do equipamento físico, em anos (≥ 0). |  |
| `tipo_contratacao` | texto | sim | Convênio, FAF, TED, PERSUS I ou PERSUS II. Vem da planilha ou da importação; nunca editável à mão. |  |
| `responsavel_execucao_nome` | texto | sim | Responsável técnico da execução no convenente (opcional); diferente de `tecnico_titular` e `tecnico_suplente`, que são da nossa equipe. |  |
| `responsavel_execucao_contato` | texto | sim | Contato do responsável pela execução no convenente. |  |
| `situacao_prestacao_contas` | texto | sim | Situação da prestação de contas (SICONV legado, ex.: Prestação de Contas Concluída); distinta do status financeiro do Portal. |  |
| `situacao_parceria_transferegov` | texto | sim | Situação da parceria no TransfereGov novo; só para instrumentos vindos de parceria (hoje FAF de parceria). |  |
| `situacao_ordem_pagamento_transferegov` | texto | sim | Situação da última ordem de pagamento da parceria (ex.: Paga); nula sem ordem. |  |
| `origem_dado` | texto | sim | Proveniência da carga (ex.: PERSUS I, nome da planilha e sha256). |  |
| `tipologia` | varchar(3) | sim | Tipologia (A, CV, C, EO, C.B ou NA), vale para todos os tipos de contratação. Significado de cada sigla: a confirmar. **A confirmar.** |  |
| `investimento_aquisicao` | numeric(16,2) | sim | Valor de investimento em aquisição (`Convenio.valor_global`); a decomposição por item está em `item_plano`. |  |
| `situacao_programa` | texto | sim | Situação do programa (por exemplo, Em operação, Em execução). Valores unificados pela migration `b4c5d6e7f8a9`. |  |
| `natureza_servico` | texto | sim | Natureza do serviço. Vocabulário: a confirmar. **A confirmar.** |  |
| `chave_origem` | texto | sim | Mesma chave de `convenio.chave_origem`: instrumento sem número oficial tem `nr_convenio` aleatório, que não se reconstrói da fonte. |  |
| `valor_obra` | numeric(16,2) | sim | Valor de obra ou reforma (PERSUS, aba Obras, R$ Projeto + reajuste). |  |
| `valor_equipamento` | numeric(16,2) | sim | Valor do equipamento (PERSUS, aba Obras, coluna R$ Equipamento). |  |
| `municipio_normalizado` | texto | sim | Município normalizado por `normalizar_texto`, base do filtro por município. |  |
| `fonte_dado_id` | bigint | sim | Referência a `fonte_dado.id`. | FK `fonte_dado.id` (SET NULL) |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `nivel_monitoramento`, `tipologia`, `natureza_servico`.

## `instrumento_responsavel`

Vínculo de acesso entre usuário e instrumento monitorado, com papel de titular ou suplente.

Chave primária: `id`. Colunas: 5. Uso: 527 linhas em produção (contagem exata de 22/11/2026).

Base da autorização por titularidade (`app/authz.py`): admin e gestor editam qualquer instrumento; colaborador só onde é titular ou suplente; leitor nunca edita.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |
| `usuario_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |

Restrições:

- Único `uq_instrumento_responsavel_papel`: (instrumento_id, papel)
- Único `uq_instrumento_responsavel_usuario`: (instrumento_id, usuario_id)
- `ck_instrumento_responsavel_papel`: CHECK (((papel) = ANY ([('titular'), ('suplente')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `usuario_id` | bigint | não | Referência a `user.id`. | FK `user.id` (RESTRICT) |
| `papel` | texto | não | Papel do responsável: titular ou suplente. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `marco_catalogo`

Catálogo fixo de marcos (fase geral, cronograma físico, regulatório).

Chave primária: `id`. Colunas: 7. Uso: 27 linhas em produção (contagem exata de 22/11/2026).

Fase e cronograma físico seguem em revisão com a equipe técnica; não redesenhar o catálogo sozinho.

Restrições:

- Único `uq_marco_catalogo_codigo`: (codigo)
- `ck_marco_catalogo_execucao_pct`: CHECK (((execucao_fisica_pct_referencia IS NULL) OR ((execucao_fisica_pct_referencia >= (0)) AND (execucao_fisica_pct_referencia <= (1)))))
- `ck_marco_catalogo_ordem`: CHECK (((ordem IS NULL) OR (ordem >= 0)))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `codigo` | texto | não | Código estável do marco. |  |
| `grupo` | enum `marco_grupo` | não | Grupo: fase_geral, cronograma_fisico ou regulatorio. | valores: fase_geral, cronograma_fisico, regulatorio |
| `ordem` | integer | sim | Ordem de progressão dentro do grupo: em `fase_geral` define a fase atual (maior ordem com evento); nos demais, a sequência do cronograma. |  |
| `execucao_fisica_pct_referencia` | numeric | sim | Percentual de execução física de referência (0 a 1); só em `fase_geral`. |  |
| `rotulo` | texto | não | Rótulo exibido. |  |
| `descricao_referencia` | texto | sim | Descrição de referência do marco. |  |

## `evento_marco`

Histórico de marcos do instrumento (o que já aconteceu), contra o catálogo fixo.

Chave primária: `id`. Colunas: 17. Uso: 2.336 linhas em produção (contagem exata de 22/11/2026).

Append-only por regra da aplicação, não do banco: a API corrige criando registro novo e exclui por soft delete com motivo. Não há trigger que impeça UPDATE ou DELETE físico.

Registro ativo: `substituido_por_id IS NULL AND deletado_em IS NULL`. Ordenar com desempate por `id`, porque carga em lote repete `created_at`.

Evento de cronograma exige `fase_geral_id` (validado no service). Há DELETE físico em dois scripts de correção e `ON DELETE CASCADE` a partir do instrumento.

Seis conclusões antigas (`fase_concluido`) estão sem `data_ocorrencia`; a API mostra a data do dia nelas até a correção em andamento.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `fase_geral_id` | [`marco_catalogo`](carteira-monitoramento.md#marco_catalogo).`id` | RESTRICT |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |
| `marco_id` | [`marco_catalogo`](carteira-monitoramento.md#marco_catalogo).`id` | RESTRICT |
| `substituido_por_id` | [`evento_marco`](carteira-monitoramento.md#evento_marco).`id` | SET NULL |

Restrições:

- Único `uq_evento_marco_fase_geral_ativo`: USING btree (instrumento_id, marco_id) WHERE ((substituido_por_id IS NULL) AND (deletado_em IS NULL) AND (marco_id = ANY ([(1), (2), (3), (4), (5), (6), (7), (8), (9)])))
- Único `uq_evento_marco_inauguracao_ativa`: USING btree (instrumento_id) WHERE ((substituido_por_id IS NULL) AND (deletado_em IS NULL) AND (marco_id = ANY ([(19), (28)])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `marco_id` | bigint | não | Referência a `marco_catalogo.id`. | FK `marco_catalogo.id` (RESTRICT) |
| `data_ocorrencia` | date | sim | Data em que o marco ocorreu; nula para marco ainda não realizado, e em 6 conclusões antigas (`fase_concluido`). |  |
| `data_prevista` | date | sim | Data prevista do marco. |  |
| `status_regulatorio` | texto | sim | Só em marco regulatório: vocabulário da ANSN (NI, NA, Em análise, Em diligência, Deferido, Indeferido), texto livre de propósito. |  |
| `observacao` | texto | sim | Observação livre. |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (SET NULL) |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `numero_documento` | texto | sim | Número de matrícula, licença ou processo (ex.: matrícula ANSN). |  |
| `data_validade` | date | sim | Validade da licença ou matrícula; alimenta o alerta de vencimento. |  |
| `fase_geral_id` | bigint | sim | Marco `fase_geral` a que o evento pertence. Obrigatório (validado no service) para marco físico ou regulatório; nulo quando o próprio evento é de fase geral. | FK `marco_catalogo.id` (RESTRICT) |
| `atualizado_em` | timestamptz | sim | Data e hora da última atualização. |  |
| `substituido_por_id` | bigint | sim | Registro que corrigiu este; nulo enquanto este é a versão vigente. | FK `evento_marco.id` (SET NULL) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (SET NULL) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |

## `acao_monitoramento`

Tarefa livre da equipe sobre o instrumento, distinta do marco histórico.

Chave primária: `id`. Colunas: 14. Uso: 391 linhas em produção (contagem exata de 22/11/2026).

Append-only por regra da aplicação, não do banco: a API corrige criando registro novo e exclui por soft delete com motivo. Não há trigger que impeça UPDATE ou DELETE físico. Concluir uma ação atualiza `data_conclusao` na própria linha (único UPDATE permitido).

`EventoMarco` (histórico, catálogo fixo) é diferente de `AcaoMonitoramento` (tarefa livre).

Há DELETE físico em `corrigir_escopo_instrumentos_firmados.py` e `ON DELETE CASCADE` a partir do instrumento.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `criado_por_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |
| `responsavel_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `substituido_por_id` | [`acao_monitoramento`](carteira-monitoramento.md#acao_monitoramento).`id` | SET NULL |

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `descricao` | texto | não | Texto da tarefa livre registrada pela equipe. |  |
| `data_prevista` | date | sim | Data prevista da ação (base do aviso `prazo_acao`). |  |
| `data_conclusao` | date | sim | NULL = pendente. Preenchida quando a acao e marcada como concluida (unico UPDATE que esta tabela permite de proposito). |  |
| `responsavel` | texto | sim | Texto livre legado (dado historico anterior a 2026-09-19, mantido pra nao perder registro antigo). Escrita nova usa `responsavel_id`; leitura cai pra este texto quando `responsavel_id` for nulo. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `responsavel_id` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |
| `criado_por_id` | bigint | sim | Usuário que criou a ação; preenchido pelo service a partir da sessão, nunca vindo do cliente. Difere de `responsavel_id`, que é quem executa. | FK `user.id` (SET NULL) |
| `atualizado_em` | timestamptz | sim | Data e hora da última atualização. |  |
| `substituido_por_id` | bigint | sim | Registro que corrigiu este; nulo enquanto este é a versão vigente. | FK `acao_monitoramento.id` (SET NULL) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (SET NULL) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |

## `repasse_instrumento`

Confirmação de repasse do instrumento, integral ou parcial.

Chave primária: `id`. Colunas: 11. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head; produção ainda não a tem. Append-only. Repasse `manual` exige `autor_id`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | RESTRICT |
| `substituido_por_id` | [`repasse_instrumento`](carteira-monitoramento.md#repasse_instrumento).`id` | RESTRICT |

Restrições:

- Único `uq_repasse_instrumento_fonte_ativo`: USING btree (instrumento_id) WHERE (((origem) = 'fonte') AND (deletado_em IS NULL) AND (substituido_por_id IS NULL))
- Único `uq_repasse_instrumento_manual_ativo`: USING btree (instrumento_id) WHERE (((origem) = 'manual') AND (deletado_em IS NULL) AND (substituido_por_id IS NULL))
- `ck_repasse_instrumento_manual_autor`: CHECK ((((origem) <> 'manual') OR (autor_id IS NOT NULL)))
- `ck_repasse_instrumento_origem`: CHECK (((origem) = ANY ((['fonte', 'manual']))))
- `ck_repasse_instrumento_tipo`: CHECK (((tipo) = ANY ((['integral', 'parcial']))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (RESTRICT) |
| `tipo` | texto | não | Tipo do repasse: integral ou parcial. |  |
| `origem` | texto | não | Origem: fonte (derivado do SICONV) ou manual. |  |
| `justificativa` | texto | sim | Justificativa do repasse. |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (RESTRICT) |
| `substituido_por_id` | bigint | sim | Registro que corrigiu este; nulo enquanto este é a versão vigente. | FK `repasse_instrumento.id` (RESTRICT) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (RESTRICT) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `documento_instrumento`

Documentos do instrumento (nota fiscal, OS, TRP, TRD, SCRA e licença da CNEN).

Chave primária: `id`. Colunas: 15. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head. Append-only.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |
| `origem_evento_id` | [`evento_marco`](carteira-monitoramento.md#evento_marco).`id` | SET NULL |
| `substituido_por_id` | [`documento_instrumento`](carteira-monitoramento.md#documento_instrumento).`id` | SET NULL |

Restrições:

- Único `uq_documento_instrumento_origem_evento`: USING btree (origem_evento_id) WHERE ((origem_evento_id IS NOT NULL) AND (deletado_em IS NULL))
- `ck_documento_instrumento_tipo`: CHECK (((tipo) = ANY ((['nota_fiscal', 'ordem_servico', 'trp', 'trd', 'cnen_scra', 'cnen_licenca']))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `tipo` | texto | não | Tipo: nota_fiscal, ordem_servico, trp, trd, cnen_scra ou cnen_licenca. |  |
| `numero` | texto | sim | Número do documento. |  |
| `data_documento` | date | não | Data do documento. |  |
| `status` | texto | sim | Só nos documentos da ANSN: vocabulário externo (Em análise, Em diligência, Deferido, Indeferido). |  |
| `data_validade` | date | sim | Só na licença de operação. |  |
| `observacao` | texto | sim | Observação livre. |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (SET NULL) |
| `origem_evento_id` | bigint | sim | Referência a `evento_marco.id`. | FK `evento_marco.id` (SET NULL) |
| `substituido_por_id` | bigint | sim | Registro que corrigiu este; nulo enquanto este é a versão vigente. | FK `documento_instrumento.id` (SET NULL) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (SET NULL) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `conclusao_instrumento`

Conclusão do acompanhamento confirmada pela equipe.

Chave primária: `id`. Colunas: 11. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head. Append-only; uma conclusão ativa por instrumento. Resultado diferente de integral exige justificativa.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |

Restrições:

- Único `uq_conclusao_instrumento_ativa`: USING btree (instrumento_id) WHERE (deletado_em IS NULL)
- `ck_conclusao_instrumento_justificativa`: CHECK ((((resultado) = 'integral') OR (length(btrim(COALESCE(justificativa, ''))) > 0)))
- `ck_conclusao_instrumento_resultado`: CHECK (((resultado) = ANY ((['integral', 'parcial', 'sem_entregas']))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `resultado` | texto | não | Resultado: integral, parcial ou sem_entregas. |  |
| `data_conclusao` | date | não | Data da conclusão confirmada. |  |
| `justificativa` | texto | sim | Obrigatória quando o resultado não é integral. |  |
| `data_inauguracao` | date | sim | Data da inauguração; opcional. |  |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (SET NULL) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (SET NULL) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `pagamento_obra_persus`

Pagamento da obra ou da fiscalização do PERSUS.

Chave primária: `id`. Colunas: 14. Uso: 204 linhas em produção (contagem exata de 22/11/2026).

Mantida por decisão do usuário (22/11/2026): uso futuro. Nenhuma rota ou serviço a lê hoje.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `fonte_dado_id` | [`fonte_dado`](carteira-monitoramento.md#fonte_dado).`id` | SET NULL |
| `instrumento_id` | [`instrumento_equipamento`](carteira-monitoramento.md#instrumento_equipamento).`id` | CASCADE |

Restrições:

- Único `uq_pagamento_obra_persus_chave_origem`: (chave_origem)
- `ck_pagamento_obra_persus_fornecedor_cnpj_formato`: CHECK (((fornecedor_cnpj IS NULL) OR ((fornecedor_cnpj) ~ '^[0-9]{14}$')))
- `ck_pagamento_obra_persus_tipo`: CHECK (((tipo) = ANY ([('obra'), ('fiscalizacao')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `instrumento_id` | bigint | não | Referência a `instrumento_equipamento.id`. | FK `instrumento_equipamento.id` (CASCADE) |
| `codigo_obra` | texto | sim | Código da obra na planilha PERSUS. **A confirmar.** |  |
| `nup_pagamento` | texto | sim | NUP do pagamento. **A confirmar.** |  |
| `fornecedor_nome` | texto | sim | Nome do fornecedor. |  |
| `fornecedor_cnpj` | texto | sim | CNPJ do fornecedor (14 dígitos). |  |
| `data_nota_fiscal` | date | sim | Data da nota fiscal. |  |
| `data_pagamento` | date | sim | Data do pagamento. |  |
| `valor` | numeric(16,2) | sim | Valor pago. |  |
| `origem_dado` | texto | sim | Proveniência da carga. **A confirmar.** |  |
| `chave_origem` | texto | não | Hash determinístico da linha de origem -- evita duplicar o mesmo pagamento se o script rodar de novo sobre a mesma planilha. |  |
| `created_at` | timestamptz | sim | Data e hora de criação do registro. | padrão `now()` |
| `tipo` | texto | não | Tipo do pagamento: obra ou fiscalizacao. | padrão `'obra'` |
| `fonte_dado_id` | bigint | sim | Referência a `fonte_dado.id`. | FK `fonte_dado.id` (SET NULL) |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `codigo_obra`, `nup_pagamento`, `origem_dado`.

## `vinculo_licenca_estabelecimento`

Vínculo entre estabelecimento (CNES) e matrícula da ANSN.

Chave primária: `id`. Colunas: 9. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head. Append-only com soft delete e motivo. Liga a `instalacao_ansn` pela matrícula, sem FK.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `autor_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |
| `cnes` | [`cnes_estabelecimento`](carteira-monitoramento.md#cnes_estabelecimento).`cnes` | RESTRICT |
| `deletado_por_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |

Restrições:

- Único `uq_vinculo_licenca_ativo`: USING btree (cnes, matricula) WHERE (deletado_em IS NULL)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `cnes` | varchar(7) | não | Referência a `cnes_estabelecimento.cnes`. | FK `cnes_estabelecimento.cnes` (RESTRICT) |
| `matricula` | texto | não | Matrícula da licença na ANSN; liga a `instalacao_ansn.matricula` (sem FK). |  |
| `origem` | texto | não | Finalidade não consta do código. **A confirmar.** | padrão `'carga'` |
| `autor_id` | bigint | sim | Usuário que criou o registro (`user`). | FK `user.id` (SET NULL) |
| `deletado_em` | timestamptz | sim | Data e hora da exclusão lógica; nulo enquanto o registro está ativo. |  |
| `deletado_por_id` | bigint | sim | Usuário que fez a exclusão lógica (`user`). | FK `user.id` (SET NULL) |
| `motivo_exclusao` | texto | sim | Motivo informado na exclusão lógica. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `origem`.

## `instalacao_ansn`

Instalação radiativa da base aberta da ANSN/CNEN; fonte da validade da licença de operação.

Chave primária: `matricula`. Colunas: 11. Uso: só existe no head `d9e0f1a2b3c4`; produção ainda não a tem.

Só existe no head.

Restrições:

- `ck_instalacao_ansn_status`: CHECK (((status) = ANY ((['valida', 'suspensa']))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `matricula` | texto | não | Matrícula da instalação na ANSN; chave de negócio. | PK |
| `designacao` | texto | não | Designação da instalação. **A confirmar.** |  |
| `cidade` | texto | sim | Cidade. |  |
| `uf` | varchar(2) | sim | UF. |  |
| `area_atuacao` | texto | sim | Área de atuação. **A confirmar.** |  |
| `setor_atuacao` | texto | sim | Setor de atuação. **A confirmar.** |  |
| `status` | texto | não | Situação da licença: valida ou suspensa. |  |
| `validade` | date | sim | Validade da licença. |  |
| `consultado_em` | date | não | Data da última consulta à base da ANSN. |  |
| `primeira_consulta_em` | date | não | Data da primeira consulta. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `designacao`, `area_atuacao`, `setor_atuacao`.

## `fonte_dado`

Catálogo de proveniência das cargas.

Chave primária: `id`. Colunas: 7. Uso: 6 linhas em produção (contagem exata de 22/11/2026).

Mantida: tem FK em convênios, instrumentos e pagamentos PERSUS (6 fontes; 142, 85 e 204 referências). `url_referencia` está nula.

Restrições:

- Único `uq_fonte_dado_codigo`: (codigo)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `codigo` | texto | não | Código estável da fonte. **A confirmar.** |  |
| `nome` | texto | não | Nome da fonte. |  |
| `tipo` | texto | não | Tipo da fonte. **A confirmar.** |  |
| `url_referencia` | texto | sim | URL de referência da fonte; nula em todas as linhas. |  |
| `ativo` | boolean | não | Se a fonte está ativa. | padrão `true` |
| `criado_em` | timestamptz | sim | Data e hora de criação do registro. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `codigo`, `tipo`.

## `cnes_estabelecimento`

Espelho local do cadastro público do CNES.

Chave primária: `cnes`. Colunas: 12. Uso: 635.113 linhas em produção (contagem exata de 22/11/2026).

Sincronizado a partir do S3 e do ElastiCNES. Cobertura e distância usam só CNES/ElastiCNES agregado.

Restrições:

- `ck_cnes_estabelecimento_cnes_formato`: CHECK (((cnes) ~ '^[0-9]{7}$'))
- `ck_cnes_estabelecimento_cnpj_formato`: CHECK (((cnpj IS NULL) OR ((cnpj) ~ '^[0-9]{14}$')))
- `ck_cnes_estabelecimento_latitude`: CHECK (((latitude IS NULL) OR ((latitude >= ('-90')) AND (latitude <= (90)))))
- `ck_cnes_estabelecimento_longitude`: CHECK (((longitude IS NULL) OR ((longitude >= ('-180')) AND (longitude <= (180)))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `cnes` | varchar(7) | não | Código CNES do estabelecimento (7 dígitos); chave de negócio. | PK |
| `nome_estabelecimento` | texto | não | Nome do estabelecimento. |  |
| `cnpj` | texto | sim | CNPJ (14 dígitos); opcional. |  |
| `municipio` | texto | sim | Município. |  |
| `uf` | varchar(2) | sim | UF. |  |
| `cep` | texto | sim | CEP. |  |
| `logradouro` | texto | sim | Logradouro. |  |
| `sincronizado_em` | timestamptz | não | Última sincronização do cadastro com a fonte. | padrão `now()` |
| `latitude` | numeric | sim | Latitude (−90 a 90). Sincronizada pelo ElastiCNES; nem todo estabelecimento tem coordenada. |  |
| `longitude` | numeric | sim | Longitude (−180 a 180); ver `latitude`. |  |
| `fonte_sincronizacao` | texto | sim | Fonte da última sincronização que escreveu o registro: s3 ou elasticnes. |  |
| `municipio_normalizado` | texto | sim | Município normalizado por `normalizar_texto`, base do filtro por município. |  |
