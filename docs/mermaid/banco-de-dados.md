# Mapa do banco de dados (revisão 2, de 23/11/2026)

Objetivo: dar uma visão única das 50 tabelas do schema e de como elas se ligam, para a equipe validar o modelo e apontar o que está sem uso. Gerado a partir do schema real no head `d9e0f1a2b3c4` (cópia de ensaio `sigeo_ensaio_release_20261122`): 50 tabelas, 596 colunas e 98 chaves estrangeiras. Produção está no head `d9e0f1a2b3c4` desde 23/11/2026 (conferido em `alembic_version`); as 7 tabelas marcadas com asterisco chegaram junto, e a revisão 2 não mudou o schema. Os diagramas usam Mermaid e renderizam no Obsidian, no GitHub e no VS Code.

Cada entidade mostra só a chave primária, as chaves estrangeiras e até 6 colunas de negócio. O detalhe de todas as colunas fica para o dicionário de dados. `autor_id` e `deletado_por_id` apontam para `user` em todas as tabelas append-only e foram omitidos das relações para não poluir o desenho. Outras relações com `user` também ficaram de fora quando só registram quem executou ou revisou (por exemplo `execution.executed_by`, `reference_file.uploaded_by`, `proposta_candidata.revisado_por`). Nas relações desenhadas, `|o` no lado do pai significa chave estrangeira que aceita nulo.

## 1. Como o banco se divide

| Domínio | Tabelas | Quem escreve |
| --- | --- | --- |
| Cobertura (análise de mérito) | `reference_file`, `accelerator_row`, `municipality_population_row`, `competency`, `execution`, `equipment_offer_row`, `macro_coverage`, `municipality_coverage`, `inca_estimate`, `config_decision` | Pipelines de cobertura |
| Carteira e monitoramento | `convenio`, `instrumento_equipamento`, `instrumento_responsavel`, `marco_catalogo`, `evento_marco`, `acao_monitoramento`, `repasse_instrumento`\*, `documento_instrumento`\*, `conclusao_instrumento`\*, `pagamento_obra_persus`, `vinculo_licenca_estabelecimento`\*, `instalacao_ansn`\*, `fonte_dado`, `cnes_estabelecimento` | Cargas, jobs do SICONV e equipe |
| Itens e entregas | `item_plano`, `entrega_equipamento`, `unidade_equipamento`, `cancelamento_unidade_planejada`\*, `previsao_entrega_item`\*, `entrega_legada_revisao`, `decisao_classificacao_item`, `equipamento_catalogo`, `renem_item`, `codigo_item_legado`, `equipamento_marcador` | Equipe e scripts de classificação |
| Radar | `fonte_captura`, `candidato_legado`, `candidato_legado_captura`, `candidato_legado_componente`, `candidato_legado_evidencia`, `candidato_legado_recaptura`, `candidato_legado_decisao`, `proposta_candidata`, `evidencia_transferegov` | Job de descoberta, recaptura e gestão |
| Acesso e avisos | `user`, `refresh_token`, `audit_log`, `notificacao`, `notificacao_destinatario` | Aplicação |

\* Tabela criada no release de 22/11/2026 (migrations até `d9e0f1a2b3c4`); já está em produção.

Fora dos domínios: `alembic_version`, controlada pelo Alembic.

## 2. Cobertura

Cada família de equipamento tem uma `competency` e várias `execution`; a competência aponta a execução publicada (`published_execution_id`). Os resultados (`macro_coverage`, `municipality_coverage`, `equipment_offer_row`) pertencem a uma execução. `cnes_estabelecimento` não aparece aqui: a cobertura usa o CNES agregado nas linhas de oferta e não por chave estrangeira.

```mermaid
erDiagram
    reference_file {
        bigint id PK
        reference_file_type type
        date reference_period
        string original_file
        bigint uploaded_by FK
        timestamptz uploaded_at
        boolean active
    }
    accelerator_row {
        bigint id PK
        bigint reference_file_id FK
        string cnes_code
        string facility_name
        string state
        string ibge_code
        integer operational_qty
    }
    municipality_population_row {
        bigint id PK
        bigint reference_file_id FK
        string ibge_code
        integer resident_population
        integer ans_population
        integer sus_dependent_population
    }
    competency {
        bigint id PK
        string label
        bigint published_execution_id FK
        string equipment_family
    }
    execution {
        bigint id PK
        bigint competency_id FK
        integer version
        execution_mode mode
        execution_status status
        timestamptz started_at
        timestamptz finished_at
        bigint executed_by FK
        string error
        bigint accelerator_file_id FK
        bigint population_file_id FK
        bigint deleted_by FK
    }
    equipment_offer_row {
        bigint id PK
        bigint execution_id FK
        string cnes_code
        string ibge_code
        string state
        string equipment_family
        string equipment_subtype
        integer existing_qty
    }
    macro_coverage {
        bigint id PK
        bigint execution_id FK
        string macro_code
        string macro_name
        string state
        string equipment_family
        integer population
        numeric estimated_need
    }
    municipality_coverage {
        bigint id PK
        bigint execution_id FK
        string ibge_code
        string municipality_name
        string health_region_code
        string health_region_name
        string macro_code
        string macro_name
    }
    inca_estimate {
        bigint id PK
        inca_estimate_level level
        string uf
        string capital_ibge_code
        integer estimated_cases
        string triennium
        boolean active
    }
    config_decision {
        bigint id PK
        config_decision_key key
        string value
        boolean confirmed
        bigint confirmed_by FK
        timestamptz confirmed_at
        timestamptz valid_from
        timestamptz valid_to
    }
    user {
        bigint id PK
        string name
        string email
        string password_hash
        user_role role
        user_status status
        integer failed_login_attempts
    }
    competency ||--o{ execution : "competency_id"
    execution |o--o{ competency : "published_execution_id"
    execution ||--o{ equipment_offer_row : "execution_id"
    execution ||--o{ macro_coverage : "execution_id"
    execution ||--o{ municipality_coverage : "execution_id"
    reference_file ||--o{ accelerator_row : "reference_file_id"
    reference_file |o--o{ execution : "accelerator_file_id"
    reference_file |o--o{ execution : "population_file_id"
    reference_file ||--o{ municipality_population_row : "reference_file_id"
    user |o--o{ config_decision : "confirmed_by"
```

## 3. Carteira e monitoramento

`convenio` (a fonte oficial do SICONV) e `instrumento_equipamento` (o que a equipe monitora) **não têm chave estrangeira entre si**: a ligação é por `numero` e `tipo_contratacao`. Convênio sem monitoramento é o caso normal. `evento_marco` (histórico com catálogo fixo) e `acao_monitoramento` (tarefa livre) são append-only: "editar" cria o registro corrigido e aponta o antigo por `substituido_por_id`; "excluir" é soft delete com motivo.

```mermaid
erDiagram
    convenio {
        bigint id PK
        string numero
        string numero_instrumento
        integer ano_instrumento
        string objeto
        string situacao
        string situacao_portal
        string cnes FK
        bigint fonte_dado_id FK
    }
    instrumento_equipamento {
        bigint id PK
        string nr_convenio
        string cnpj_convenente
        string nome_convenente
        string municipio
        string uf
        string cnes FK
        string equipamento_descricao
        bigint fonte_dado_id FK
    }
    cnes_estabelecimento {
        string cnes PK
        string nome_estabelecimento
        string cnpj
        string municipio
        string uf
        string cep
        string logradouro
    }
    fonte_dado {
        bigint id PK
        string codigo
        string nome
        string tipo
        string url_referencia
        boolean ativo
    }
    instrumento_responsavel {
        bigint id PK
        bigint instrumento_id FK
        bigint usuario_id FK
        string papel
    }
    marco_catalogo {
        bigint id PK
        string codigo
        marco_grupo grupo
        integer ordem
        numeric execucao_fisica_pct_referencia
        string rotulo
        string descricao_referencia
    }
    evento_marco {
        bigint id PK
        bigint instrumento_id FK
        bigint marco_id FK
        date data_ocorrencia
        date data_prevista
        string status_regulatorio
        string observacao
        bigint autor_id FK
        string numero_documento
        date data_validade
        bigint fase_geral_id FK
        bigint substituido_por_id FK
        bigint deletado_por_id FK
    }
    acao_monitoramento {
        bigint id PK
        bigint instrumento_id FK
        string descricao
        date data_prevista
        date data_conclusao
        string responsavel
        bigint responsavel_id FK
        bigint criado_por_id FK
        bigint substituido_por_id FK
        bigint deletado_por_id FK
        string motivo_exclusao
    }
    repasse_instrumento {
        bigint id PK
        bigint instrumento_id FK
        string tipo
        string origem
        text justificativa
        bigint autor_id FK
        bigint substituido_por_id FK
        bigint deletado_por_id FK
        text motivo_exclusao
    }
    documento_instrumento {
        bigint id PK
        bigint instrumento_id FK
        string tipo
        string numero
        date data_documento
        string status
        date data_validade
        string observacao
        bigint autor_id FK
        bigint origem_evento_id FK
        bigint substituido_por_id FK
        bigint deletado_por_id FK
    }
    conclusao_instrumento {
        bigint id PK
        bigint instrumento_id FK
        string resultado
        date data_conclusao
        text justificativa
        date data_inauguracao
        bigint autor_id FK
        bigint deletado_por_id FK
        text motivo_exclusao
    }
    pagamento_obra_persus {
        bigint id PK
        bigint instrumento_id FK
        string codigo_obra
        string nup_pagamento
        string fornecedor_nome
        string fornecedor_cnpj
        date data_nota_fiscal
        date data_pagamento
        bigint fonte_dado_id FK
    }
    vinculo_licenca_estabelecimento {
        bigint id PK
        string cnes FK
        string matricula
        string origem
        bigint autor_id FK
        bigint deletado_por_id FK
        string motivo_exclusao
    }
    instalacao_ansn {
        string matricula PK
        string designacao
        string cidade
        string uf
        string area_atuacao
        string setor_atuacao
        string status
    }
    user {
        bigint id PK
        string name
        string email
        string password_hash
        user_role role
        user_status status
        integer failed_login_attempts
    }
    convenio }o..o| instrumento_equipamento : "numero + tipo_contratacao (sem FK)"
    instalacao_ansn }o..o{ vinculo_licenca_estabelecimento : "matricula (sem FK)"
    acao_monitoramento |o--o{ acao_monitoramento : "substituido_por_id"
    cnes_estabelecimento |o--o{ convenio : "cnes"
    cnes_estabelecimento |o--o{ instrumento_equipamento : "cnes"
    cnes_estabelecimento ||--o{ vinculo_licenca_estabelecimento : "cnes"
    documento_instrumento |o--o{ documento_instrumento : "substituido_por_id"
    evento_marco |o--o{ evento_marco : "substituido_por_id"
    evento_marco |o--o{ documento_instrumento : "origem_evento_id"
    fonte_dado |o--o{ convenio : "fonte_dado_id"
    fonte_dado |o--o{ instrumento_equipamento : "fonte_dado_id"
    fonte_dado |o--o{ pagamento_obra_persus : "fonte_dado_id"
    instrumento_equipamento ||--o{ acao_monitoramento : "instrumento_id"
    instrumento_equipamento ||--o{ conclusao_instrumento : "instrumento_id"
    instrumento_equipamento ||--o{ documento_instrumento : "instrumento_id"
    instrumento_equipamento ||--o{ evento_marco : "instrumento_id"
    instrumento_equipamento ||--o{ instrumento_responsavel : "instrumento_id"
    instrumento_equipamento ||--o{ pagamento_obra_persus : "instrumento_id"
    instrumento_equipamento ||--o{ repasse_instrumento : "instrumento_id"
    marco_catalogo |o--o{ evento_marco : "fase_geral_id"
    marco_catalogo ||--o{ evento_marco : "marco_id"
    repasse_instrumento |o--o{ repasse_instrumento : "substituido_por_id"
    user |o--o{ acao_monitoramento : "responsavel_id"
    user ||--o{ instrumento_responsavel : "usuario_id"
```

## 4. Itens e entregas

O plano de aplicação do SICONV vira `item_plano` (um equipamento distinto por linha). A entrega é append-only e gera `unidade_equipamento` para as famílias com controle por unidade ou valor unitário acima do limite. `equipamento_catalogo` é o catálogo das famílias; `renem_item` e `codigo_item_legado` o alimentam. `decisao_classificacao_item` guarda a decisão de classificação por `convenio_numero` e `chave_item`, sem chave estrangeira. Em `conta_unidade`, nulo significa que a equipe não afirmou controle (a projeção aplica a regra de valor e a exceção do instrumento) e `false` é decisão explícita de não controlar. `convenio.fora_escopo_equipamentos` esconde o convênio de tudo (obra e serviço, ou órgão que não é o Ministério da Saúde).

```mermaid
erDiagram
    item_plano {
        bigint id PK
        bigint convenio_id FK
        bigint instrumento_id FK
        string origem
        string id_origem
        string codigo_item
        string codigo_fonte
        text descricao
        bigint catalogo_id FK
        boolean controla_unidade
        bigint item_principal_id FK
    }
    entrega_equipamento {
        bigint id PK
        bigint instrumento_id FK
        bigint evento_id FK
        date data_ocorrencia
        text observacao
        bigint autor_id FK
        string chave_idempotencia
        bigint substituido_por_id FK
        bigint deletado_por_id FK
        text motivo_exclusao
    }
    unidade_equipamento {
        bigint id PK
        bigint entrega_id FK
        bigint item_id FK
        integer ordem
        string marca
        string modelo
        string numero_serie
        integer vida_util_anos
    }
    cancelamento_unidade_planejada {
        bigint id PK
        bigint item_id FK
        text motivo
        bigint autor_id FK
        bigint deletado_por_id FK
        text motivo_exclusao
    }
    previsao_entrega_item {
        bigint id PK
        bigint item_id FK
        date data_prevista
        bigint autor_id FK
        bigint substituido_por_id FK
        bigint deletado_por_id FK
        text motivo_exclusao
    }
    entrega_legada_revisao {
        bigint id PK
        bigint instrumento_id FK
        bigint evento_id FK
        string motivo
        string situacao
        timestamptz resolvida_em
        bigint resolvida_por_id FK
        bigint entrega_id FK
    }
    decisao_classificacao_item {
        bigint id PK
        string convenio_numero
        string chave_item
        string tipo_lancamento
        string codigo_item
        boolean conta_unidade
        string origem
        bigint substituida_por_id FK
    }
    equipamento_catalogo {
        bigint id PK
        string codigo
        string nome
        boolean prioritario
        boolean ativo
        boolean controle_por_unidade
        string nome_oficial
    }
    renem_item {
        bigint id PK
        string codigo_item
        string nome
        text definicao
        string classificacao
        numeric valor_sugerido
        boolean item_dolarizado
        bigint catalogo_id FK
    }
    codigo_item_legado {
        bigint id PK
        string codigo_item
        string nome
        bigint catalogo_id FK
        string origem
    }
    equipamento_marcador {
        bigint id PK
        bigint equipamento_catalogo_id FK
        bigint convenio_id FK
        bigint proposta_candidata_id FK
        bigint instrumento_equipamento_id FK
        string descricao_original
        string tipo_evidencia
        string relacao
        integer confianca
        string chave_evidencia
        string origem_dado
    }
    instrumento_equipamento {
        bigint id PK
        string nr_convenio
        string cnpj_convenente
        string nome_convenente
        string municipio
        string uf
        string cnes FK
        string equipamento_descricao
        bigint fonte_dado_id FK
    }
    convenio {
        bigint id PK
        string numero
        string numero_instrumento
        integer ano_instrumento
        string objeto
        string situacao
        string situacao_portal
        string cnes FK
        bigint fonte_dado_id FK
    }
    evento_marco {
        bigint id PK
        bigint instrumento_id FK
        bigint marco_id FK
        date data_ocorrencia
        date data_prevista
        string status_regulatorio
        string observacao
        bigint autor_id FK
        string numero_documento
        date data_validade
        bigint fase_geral_id FK
        bigint substituido_por_id FK
        bigint deletado_por_id FK
    }
    proposta_candidata {
        bigint id PK
        bigint id_proposta
        string cnpj_ente_recebedor
        string nm_proponente
        string municipio
        string uf
        string ds_objeto
        bigint revisado_por FK
        string cnes FK
    }
    convenio |o--o{ equipamento_marcador : "convenio_id"
    convenio ||--o{ item_plano : "convenio_id"
    decisao_classificacao_item |o--o{ decisao_classificacao_item : "substituida_por_id"
    entrega_equipamento |o--o{ entrega_equipamento : "substituido_por_id"
    entrega_equipamento |o--o{ entrega_legada_revisao : "entrega_id"
    entrega_equipamento ||--o{ unidade_equipamento : "entrega_id"
    equipamento_catalogo ||--o{ codigo_item_legado : "catalogo_id"
    equipamento_catalogo ||--o{ equipamento_marcador : "equipamento_catalogo_id"
    equipamento_catalogo |o--o{ item_plano : "catalogo_id"
    equipamento_catalogo |o--o{ renem_item : "catalogo_id"
    evento_marco |o--o{ evento_marco : "substituido_por_id"
    evento_marco |o--o{ entrega_equipamento : "evento_id"
    evento_marco ||--o{ entrega_legada_revisao : "evento_id"
    instrumento_equipamento ||--o{ entrega_equipamento : "instrumento_id"
    instrumento_equipamento ||--o{ entrega_legada_revisao : "instrumento_id"
    instrumento_equipamento |o--o{ equipamento_marcador : "instrumento_equipamento_id"
    instrumento_equipamento ||--o{ evento_marco : "instrumento_id"
    instrumento_equipamento |o--o{ item_plano : "instrumento_id"
    item_plano |o--o{ item_plano : "item_principal_id"
    item_plano ||--o{ cancelamento_unidade_planejada : "item_id"
    item_plano ||--o{ previsao_entrega_item : "item_id"
    item_plano ||--o{ unidade_equipamento : "item_id"
    previsao_entrega_item |o--o{ previsao_entrega_item : "substituido_por_id"
    proposta_candidata |o--o{ equipamento_marcador : "proposta_candidata_id"
```

## 5. Radar de instrumentos

Cada rodada do job grava uma `fonte_captura`. O candidato (`candidato_legado`) tem capturas sucessivas; a decisão e a recaptura referenciam a captura por chave composta (candidato, captura), o que impede ligar prova a candidato errado. A decisão aprovada aponta o `convenio` criado e o técnico titular.

```mermaid
erDiagram
    fonte_captura {
        bigint id PK
        string fonte
        timestamptz iniciado_em
        timestamptz finalizado_em
        string status
        integer itens_verificados
        integer itens_alterados
    }
    candidato_legado {
        bigint id PK
        string numero
        string id_proposta
        bigint ultima_captura_id FK
        timestamptz descoberto_em
        timestamptz verificado_em
    }
    candidato_legado_captura {
        bigint id PK
        bigint candidato_id FK
        string confirmacao_portal
        date data_publicacao
        string origem
        string referencia_snapshot
        string hash_conteudo
        timestamptz capturado_em
        bigint fonte_captura_id FK
    }
    candidato_legado_componente {
        bigint id PK
        bigint captura_id FK
        string id_programa
        string nome_programa
        string componente
    }
    candidato_legado_evidencia {
        bigint id PK
        bigint captura_id FK
        bigint equipamento_catalogo_id FK
        string id_item
        string descricao
        string relacao
    }
    candidato_legado_recaptura {
        bigint id PK
        bigint candidato_id FK
        bigint captura_id FK
        bigint fonte_captura_id FK
        string hash_conteudo
        string situacao
        numeric valor_global
        jsonb payload_oficial
    }
    candidato_legado_decisao {
        bigint id PK
        bigint candidato_id FK
        bigint captura_id FK
        bigint usuario_id FK
        uuid chave
        string situacao_anterior
        string situacao
        string justificativa
        bigint recaptura_id FK
        bigint convenio_id FK
        bigint tecnico_titular_id FK
    }
    equipamento_catalogo {
        bigint id PK
        string codigo
        string nome
        boolean prioritario
        boolean ativo
        boolean controle_por_unidade
        string nome_oficial
    }
    convenio {
        bigint id PK
        string numero
        string numero_instrumento
        integer ano_instrumento
        string objeto
        string situacao
        string situacao_portal
        string cnes FK
        bigint fonte_dado_id FK
    }
    user {
        bigint id PK
        string name
        string email
        string password_hash
        user_role role
        user_status status
        integer failed_login_attempts
    }
    proposta_candidata {
        bigint id PK
        bigint id_proposta
        string cnpj_ente_recebedor
        string nm_proponente
        string municipio
        string uf
        string ds_objeto
        bigint revisado_por FK
        string cnes FK
    }
    evidencia_transferegov {
        bigint id PK
        bigint proposta_candidata_id FK
        string tipo_recurso
        string chave_externa
        string caminho
        string caminho_pai
        jsonb payload
        string hash_conteudo
    }
    cnes_estabelecimento {
        string cnes PK
        string nome_estabelecimento
        string cnpj
        string municipio
        string uf
        string cep
        string logradouro
    }
    candidato_legado ||--o{ candidato_legado_captura : "candidato_id"
    candidato_legado ||--o{ candidato_legado_decisao : "candidato_id"
    candidato_legado ||--o{ candidato_legado_recaptura : "candidato_id"
    candidato_legado_captura |o--o{ candidato_legado : "ultima_captura_id"
    candidato_legado_captura ||--o{ candidato_legado_componente : "captura_id"
    candidato_legado_captura ||--o{ candidato_legado_decisao : "candidato_id,captura_id"
    candidato_legado_captura ||--o{ candidato_legado_evidencia : "captura_id"
    candidato_legado_captura ||--o{ candidato_legado_recaptura : "candidato_id,captura_id"
    candidato_legado_recaptura |o--o{ candidato_legado_decisao : "candidato_id,captura_id,recaptura_id"
    cnes_estabelecimento |o--o{ convenio : "cnes"
    cnes_estabelecimento |o--o{ proposta_candidata : "cnes"
    convenio |o--o{ candidato_legado_decisao : "convenio_id"
    equipamento_catalogo ||--o{ candidato_legado_evidencia : "equipamento_catalogo_id"
    fonte_captura |o--o{ candidato_legado_captura : "fonte_captura_id"
    fonte_captura ||--o{ candidato_legado_recaptura : "fonte_captura_id"
    proposta_candidata ||--o{ evidencia_transferegov : "proposta_candidata_id"
    user |o--o{ candidato_legado_decisao : "tecnico_titular_id"
    user ||--o{ candidato_legado_decisao : "usuario_id"
```

## 6. Acesso e avisos

`notificacao` não tem chave estrangeira para o objeto avisado: `entidade_id` aponta, conforme o `tipo`, para um instrumento, convênio, proposta ou candidato. Quem vê cada aviso está em `notificacao_destinatario` (lida e arquivada por usuário). `Notificacao.lida` está deprecated em favor dessa tabela.

```mermaid
erDiagram
    user {
        bigint id PK
        string name
        string email
        string password_hash
        user_role role
        user_status status
        integer failed_login_attempts
    }
    refresh_token {
        bigint id PK
        bigint user_id FK
        string token_hash
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz last_used_at
        timestamptz session_started_at
    }
    audit_log {
        bigint id PK
        bigint user_id FK
        string entity_name
        bigint entity_id
        string action
        jsonb details
    }
    notificacao {
        bigint id PK
        notificacao_tipo tipo
        string titulo
        string corpo
        bigint entidade_id
        string nivel_minimo
        boolean lida
    }
    notificacao_destinatario {
        bigint id PK
        bigint notificacao_id FK
        bigint usuario_id FK
        boolean lida
        timestamptz lida_em
        boolean arquivada
    }
    notificacao ||--o{ notificacao_destinatario : "notificacao_id"
    user |o--o{ audit_log : "user_id"
    user ||--o{ notificacao_destinatario : "usuario_id"
    user ||--o{ refresh_token : "user_id"
```

## 7. Ligações sem chave estrangeira

| De | Para | Como liga |
| --- | --- | --- |
| `instrumento_equipamento` | `convenio` | `nr_convenio` = `numero` e mesmo `tipo_contratacao` (padrão "Convênio") |
| `decisao_classificacao_item` | `convenio` | `convenio_numero` |
| `decisao_classificacao_item` | `item_plano` | `convenio_numero` + `chave_item` (`ID_ITEM_PAD` do SICONV ou hash do texto na carga manual) |
| `notificacao` | instrumento, convênio, proposta ou candidato | `entidade_id` conforme `tipo` |
| `instalacao_ansn` | `vinculo_licenca_estabelecimento` | `matricula` |
| `candidato_legado` | `convenio` | `numero` (a aprovação grava `convenio_id` na decisão) |

## 8. Estado de uso das tabelas (produção, 22/11/2026, contagem exata)

As estatísticas do Neon (`n_live_tup`) estão defasadas e não foram usadas.

| Situação | Tabelas |
| --- | --- |
| Núcleo ativo | `convenio` (560), `instrumento_equipamento` (427), `evento_marco`, `acao_monitoramento`, `item_plano`, `entrega_equipamento`, `unidade_equipamento`, `notificacao`, `notificacao_destinatario`, `user` (23), `refresh_token`, `audit_log`, `cnes_estabelecimento` (635.113), as tabelas do Radar |
| Só carga ou pipeline, sem leitura pelo app | `accelerator_row` (0), `inca_estimate` (0), `municipality_population_row` (11.140), `reference_file` (2), `fonte_dado` (6), `pagamento_obra_persus` (204) |
| Legada, sem uso pelo app | `entrega_legada_revisao` (3) |
| Vazia por desenho ainda | `candidato_legado_recaptura` (0; a recaptura nunca rodou em produção) |

> [!warning] A confirmar
> O relatório de limpeza (próximo passo) decide caso a caso. Nada foi removido nem alterado por este mapa.
