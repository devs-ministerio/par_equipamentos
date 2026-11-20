# Mapa do Monitoramento interno (19/11/2026, revisão 2)

Objetivo: servir de base para a equipe validar o fluxo e apontar funcionalidade ou código sem uso. Tudo aqui foi lido do código da branch `feat/persus-ii-fora-do-monitoramento` (estado de 19/11/2026, depois da revisão 2). Os diagramas usam Mermaid e renderizam no Obsidian, no GitHub e no VS Code.

Escopo: Mesa de trabalho (`/monitoramento-equipamentos/instrumentos`), detalhe do instrumento (`/monitoramento-equipamentos/instrumentos/:nr`), Radar de instrumentos e fila de revisão de itens. O Painel de Gestão está desabilitado (flag `PAINEL_GESTAO_HABILITADO`) e fica fora deste mapa.

Mudanças da revisão 2: instrumento concluído trava todas as edições; as 16 famílias entram no diagrama de itens; exceções de itens, entregas e unidades listadas; Radar só para gestor e admin, com card enxuto e aprovação com técnico; jobs detalhados; código sem uso removido.

## 1. Telas e navegação

```mermaid
flowchart LR
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef off fill:#eee,stroke:#999,color:#777,stroke-dasharray:4 3
    classDef perfil fill:#FFF4DD,stroke:#C98A00,color:#5a3d00

    LOGIN["Login"]:::tela --> DADOS["Dados oficiais<br/>/monitoramento-equipamentos"]:::tela
    DADOS -->|"adicionar ao monitoramento"| MESA
    DADOS -. "/entradas redireciona" .-> DADOS
    MESA["Mesa de trabalho<br/>/instrumentos"]:::tela --> DET["Detalhe do instrumento<br/>/instrumentos/:nr"]:::tela
    DADOS --> DET
    MESA --> REL["Relatórios<br/>/monitoramento-equipamentos/relatorios"]:::tela
    MESA -->|"atalho"| MERITO["Análise de mérito<br/>/dashboard"]:::tela
    GEST(["gestor / admin"]):::perfil --> REV["Revisão de itens<br/>/revisao-itens"]:::tela
    GEST --> RADAR["Radar de instrumentos<br/>botão do cabeçalho"]:::tela
    OUTROS(["colaborador / leitor"]):::perfil -. "não veem o Radar" .-> RADAR
    RADAR -->|"aprovar com técnico"| DET
    PAINEL["Painel de gestão<br/>botão desabilitado"]:::off
    SINO["Sino de notificações"]:::tela -->|"abre o instrumento"| DET
```

## 2. Estrutura da página de detalhe

Cada bloco é um componente em `frontend/src/components/features/`. A linha tracejada mostra de onde vêm os dados. Com o acompanhamento **concluído**, todos os blocos ficam somente leitura, exceto "Concluir / Reabrir" (ver seção 5).

```mermaid
flowchart TB
    classDef comp fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef api fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    PG["MonitoramentoInterno<br/>monitoramento-interno.tsx"]:::comp
    PG --> CAB["Cabeçalho<br/>dados, inauguração, ações abertas, totais de equipamento"]:::comp
    PG --> EQ["Equipamentos do instrumento<br/>itens, entrega, unidades, cancelamento, previsão, repasse"]:::comp
    PG --> LIC["Licença de operação<br/>só com item que exige licença"]:::comp
    PG --> CAD["Cadastro interno<br/>técnicos, nível, tipologia, modalidade, responsável, CNES"]:::comp
    PG --> SEC1["Seção Fase e cronograma"]:::comp
    PG --> SEC2["Seção Ações"]:::comp
    PG --> SEC3["Seção Eventos, fechada por padrão"]:::comp

    SEC1 --> FASE["Fase geral calculada<br/>+ Concluir ou Reabrir"]:::comp
    SEC1 --> CRON["Cronograma físico e regulatório"]:::comp
    CRON --> DOC["Documentos<br/>NF, OS, TRP, TRD, SCRA, licença"]:::comp
    CRON --> LANC["Lançar evento ou ação"]:::comp

    CAB -.-> A1["GET /monitoramento/instrumentos/:nr"]:::api
    EQ -.-> A2["GET /monitoramento/instrumentos/:nr/equipamentos<br/>POST .../entregas · PATCH /unidades/:id · DELETE /entregas/:id<br/>POST /itens/:id/cancelamentos · DELETE /cancelamentos/:id<br/>PUT e DELETE /itens/:id/previsao-entrega<br/>GET e POST .../repasse"]:::api
    LIC -.-> A3["GET .../licenca-operacao"]:::api
    CAD -.-> A4["PATCH /monitoramento/instrumentos/:nr<br/>GET /monitoramento/colaboradores · GET /cnes-referencia"]:::api
    FASE -.-> A5["GET e POST e DELETE .../conclusao"]:::api
    DOC -.-> A6["GET e POST .../documentos<br/>PUT e DELETE /documentos/:id"]:::api
    LANC -.-> A7["POST .../eventos · POST .../acoes"]:::api
    SEC2 -.-> A8["GET /monitoramento/acoes<br/>PATCH /acoes/:id · PATCH /acoes/:id/concluir · DELETE /acoes/:id"]:::api
    SEC3 -.-> A9["PATCH e DELETE /monitoramento/eventos/:id"]:::api
```

## 3. Fase do acompanhamento (calculada, nunca escolhida)

A fase sai de fatos acumulados (`services/fase_acompanhamento.py`). O fato mais avançado decide. Atualização externa não faz a fase regredir.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> AcompanhamentoIniciado
    AcompanhamentoIniciado --> AguardandoRepasse: repasse previsto
    AguardandoRepasse --> ValorRepassado: repasse confirmado
    AcompanhamentoIniciado --> ValorRepassado: repasse confirmado
    ValorRepassado --> EmAquisicao: licitação ou contrato ou fabricação realizada
    EmAquisicao --> EquipamentoEntregue: entrega lançada
    ValorRepassado --> EquipamentoEntregue: entrega sem repasse também avança
    AcompanhamentoIniciado --> EquipamentoEntregue: idem
    EquipamentoEntregue --> PosEntrega: instalação, comissionamento, treinamento ou operação
    PosEntrega --> Concluido: conclusão confirmada pela equipe
    EquipamentoEntregue --> Concluido: conclusão confirmada
    Concluido --> EquipamentoEntregue: reabertura com motivo
```

Nomes na tela: Acompanhamento iniciado, Aguardando repasse, Valor repassado, Em aquisição, Equipamento entregue, Pós-entrega, Concluído.

### Marcos do cronograma liberados por fase (`marcos_por_fase.py`)

| Grupo de marcos | Liberado a partir de | Até |
|---|---|---|
| Fabricação, chegada ao Brasil, desembaraço | Valor repassado | Em aquisição |
| Obra e reforma | Acompanhamento iniciado | Equipamento entregue |
| Instalação, comissionamento, treinamento, início da operação | Equipamento entregue | Pós-entrega |
| Em Concluído | nada se lança (reabrir antes) | |

Fora da janela a opção aparece desabilitada com o motivo, e o backend recusa com 422. Vale só para lançamento novo, não para correção.

## 4. Itens, entregas e unidades

### 4.1 As 16 famílias com controle por unidade

Item de uma destas famílias sempre é monitorado por unidade e define "Prioritário". Quatro delas exigem licença de operação (ANSN); Cobalto e Radioterapia também exigem, mas não têm controle por unidade.

```mermaid
flowchart LR
    classDef lic fill:#FDECEC,stroke:#B3261E,color:#5a1410
    classDef fam fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00

    R["16 famílias<br/>controle por unidade"]:::regra
    R --> RT["Radioterapia e medicina nuclear<br/>exigem licença ANSN"]
    RT --> F1["Acelerador Linear"]:::lic
    RT --> F2["Braquiterapia"]:::lic
    RT --> F3["Gama-câmara/SPECT"]:::lic
    RT --> F4["PET/CT"]:::lic
    R --> IM["Imagem"]
    IM --> F5["Mamógrafo"]:::fam
    IM --> F6["Ressonância"]:::fam
    IM --> F7["Tomógrafo até 16 canais"]:::fam
    IM --> F8["Ultrassom diagnóstico sem transesofágica"]:::fam
    IM --> F9["Arco Cirúrgico"]:::fam
    IM --> F10["Simulador/Tomógrafo para Radioterapia"]:::fam
    R --> EN["Endoscopia e cirurgia"]
    EN --> F11["Endoscópio Flexível"]:::fam
    EN --> F12["Endoscópio Rígido"]:::fam
    EN --> F13["Vídeo Endoscopia Flexível"]:::fam
    EN --> F14["Vídeo Endoscopia Rígida"]:::fam
    EN --> F15["Sistema Cirúrgico Robótico"]:::fam
    R --> CO["Diagnóstico"]
    CO --> F16["Colposcópio"]:::fam
```

Os agrupamentos (radioterapia, imagem, endoscopia) são só para leitura do diagrama; o sistema trata as 16 igualmente.

### 4.2 Fluxo do item

```mermaid
flowchart TB
    classDef dado fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef acao fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00

    SICONV["Itens do plano SICONV<br/>ou carga manual"]:::dado --> PROJ["Projeção em item_plano<br/>projetar_itens_plano"]:::acao
    PROJ --> CLASS{"Classificação do item"}:::regra
    CLASS -->|"aquisição"| MON{"Monitorado?"}:::regra
    CLASS -->|"rendimento, serviço, obra, acessório"| FORA["Não soma unidade nem valor"]:::dado
    CLASS -->|"incerto"| FILA["Fila de revisão de itens<br/>gestor ou admin decide"]:::acao
    FILA --> CLASS
    MON -->|"uma das 16 famílias"| SIM["Controle por unidade"]:::dado
    MON -->|"valor de uma unidade a partir de R$ 300 mil"| SIM
    MON -->|"nenhum dos dois"| NAO["Sem controle por unidade"]:::dado
    NAO --> INST{"Instrumento monitorado e<br/>nenhum item dele controla unidade?"}:::regra
    INST -->|"não"| FIM0["Segue sem controle"]:::dado
    INST -->|"sim"| EXC{"Há item de aquisição com<br/>unidade a partir de R$ 100 mil?"}:::regra
    EXC -->|"sim"| SIM
    EXC -->|"não: exceção da exceção"| TOP["Os 3 itens de maior valor unitário<br/>passam a ter controle por unidade"]:::regra
    TOP --> SIM

    SIM --> PREV["Previsão de entrega por item<br/>PUT e DELETE"]:::acao
    SIM --> ENT["Registrar entrega<br/>marca, modelo, série, vida útil"]:::acao
    ENT --> LIM{"Unidades da entrega mais as já entregues e<br/>canceladas passam da quantidade planejada?"}:::regra
    LIM -->|"sim"| BLOQ["Bloqueado, 422"]:::regra
    LIM -->|"não"| UNI["Unidade nasce na entrega<br/>série única dentro do item"]:::dado
    UNI --> CORR["Corrigir unidade, com AuditLog"]:::acao
    UNI --> EXC["Excluir entrega, com motivo"]:::acao
    SIM --> CANC["Cancelar unidade, com motivo"]:::acao
    CANC --> DESF["Desfazer cancelamento"]:::acao
    LEG["Entrega antiga sem item definido"]:::dado --> VINC["Equipe vincula ao item"]:::acao --> ENT
    CONC{"Acompanhamento concluído?"}:::regra -->|"sim"| TRAVA["Nenhuma edição do instrumento<br/>até reabrir"]:::regra
```

### 4.3 Exceções e travas (lidas do código)

| Situação | O que acontece | Onde |
|---|---|---|
| Entrega passa do planejado | Compara **quantidade**, não data: unidades novas maiores que `planejado − já entregue − canceladas` dão 422 | `entregas_equipamento._validar_itens` |
| Data da entrega no futuro | 422 | `registrar_entrega` |
| Instrumento monitorado sem nenhum item controlado | Entrou pelo componente: o item de aquisição classificado cuja unidade vale **R$ 100 mil ou mais** passa a ter controle por unidade, para a entrega poder ser lançada (`limite_valor_unitario_excecao`) | `projetar_itens_plano._aplicar_excecao_instrumento` |
| Nenhum item chega a R$ 100 mil (exceção da exceção) | Os **3 itens de maior valor unitário** do instrumento viram controle por unidade (`itens_excecao_da_excecao`) | `projetar_itens_plano._aplicar_excecao_instrumento` |
| Equipamento fora das 16 famílias | Monitorado por item só se a unidade vale **R$ 300 mil ou mais** (`limite_valor_unitario_monitorado`); valor da unidade = valor do item no plano ÷ quantidade | `classificacao_itens`, `projetar_itens_plano` |
| Item sem quantidade planejada | Exige confirmar a quantidade entregue; não permite cancelar unidade | `_validar_itens`, `cancelamento_unidade` |
| Item não controlado por unidade | Entrega recusada (item fora das 16 famílias e abaixo de R$ 300 mil) | `_validar_itens` |
| Item de outro instrumento ou inativo | Tratado como inexistente, sem vazar que existe | `_validar_itens` |
| Mesmo item duas vezes na entrega | 422 | `_validar_itens` |
| Entrega sem item vinculado | 422: toda entrega liga ao menos um item | `_validar_itens` |
| Número de série repetido | 422 na mesma entrega, 409 se já existe no item | `_limpar_series`, `_validar_itens` |
| Reenvio da mesma entrega | Idempotente pela `chave_idempotencia`; chave de outro instrumento dá 409 | `registrar_entrega` |
| Unidade com entrega excluída | Não pode ser corrigida | `corrigir_unidade` |
| Excluir entrega | Exige motivo; entrega já excluída dá 422 | `excluir_entrega` |
| Cancelamento | Exige unidade pendente; já desfeito dá 409 | `cancelamento_unidade` |
| Rendimento de aplicação | Não soma unidade nem valor; aparece como linha filha do item principal | `classificacao_itens` |
| Carga manual | Não tem valor, então não entra na regra de R$ 300 mil | `classificacao_itens` |
| Decisão da equipe na fila de revisão | Prevalece sobre a regra automática | `decisao_classificacao_item` |
| Convênio com todos os itens obra ou serviço | `fora_escopo_equipamentos=true`: some de tudo | `instrumento_no_escopo()` |
| PERSUS II | Fora do monitoramento interno | `criar_instrumento_monitorado` |
| Acompanhamento concluído | Nada pode ser alterado até reabrir (seção 5) | `assert_nao_concluido` |

### 4.4 Entrega antiga sem item definido

**O que é.** Antes do controle por unidade, a entrega era um evento do cronograma (marco `cronograma_entrega`), sem dizer qual item foi entregue. Ao migrar, o script `vincular_entregas_legadas` liga a entrega ao item só quando há exatamente um item controlado e ativo no instrumento. Nos demais casos ele **não escolhe**: grava um pedido de revisão (`entrega_legada_revisao`) com o motivo (`varias_entregas`, `sem_item_controlado`, `varios_itens`, `quantidade_desconhecida`).

**Finalidade.** Não perder o histórico, não adivinhar a qual equipamento a entrega pertence e não contar a mesma entrega duas vezes. Enquanto o pedido está pendente, o item aparece como "A vincular" e a conclusão do acompanhamento fica impedida. A equipe resolve pelo botão de vincular no próprio item; não existe tela separada de fila.

## 5. Concluir e reabrir o acompanhamento

"Concluído" e "Concluir acompanhamento" são a mesma coisa: a fase Concluído existe quando há conclusão confirmada. Enquanto a migração dos concluídos antigos (`migrar_concluidos_para_conclusao`) não roda em produção, o evento antigo `fase_concluido` também vale como concluído, com a mesma trava, e Reabrir também o desfaz.

Regra: com o acompanhamento **concluído**, o instrumento inteiro fica travado para edição. A única ação liberada é **reabrir** (com motivo). Isso vale para cadastro, entregas, unidades, cancelamentos, previsões, repasse, eventos, ações e documentos.

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef acao fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e
    A["Botão Concluir"]:::acao --> AV["GET .../conclusao<br/>avalia o resultado"]:::acao
    AV --> IMP{"Impedimentos?"}:::regra
    IMP -->|"ação aberta"| X["Não conclui"]:::regra
    IMP -->|"entrega antiga a vincular"| X
    IMP -->|"item na fila de revisão"| X
    IMP -->|"nenhum"| RES["Resultado calculado pelo sistema<br/>só itens por unidade contam"]:::regra
    RES --> CONF["Equipe confirma<br/>POST .../conclusao"]:::acao
    CONF --> FIM["Fase Concluído<br/>instrumento inteiro travado"]:::regra
    FIM --> REAB["Reabrir com motivo<br/>DELETE .../conclusao"]:::acao
    REAB --> VOLTA["Volta à fase calculada dos fatos<br/>edição liberada"]:::regra
    FIM -. "qualquer edição recebe 409" .-> BLOQ["Reabra o acompanhamento para alterar"]:::regra
```

## 6. Licença de operação (por estabelecimento CNES)

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef dado fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    S{"Algum item exige licença?<br/>acelerador, braquiterapia, cobalto,<br/>radioterapia, PET-CT, gama-câmara"}:::regra
    S -->|"não"| N["Card não aparece"]:::dado
    S -->|"sim"| C{"Instrumento tem CNES?"}:::regra
    C -->|"não"| SC["Sem CNES vinculado ao instrumento"]:::dado
    C -->|"sim"| V{"Há vínculo CNES e matrícula<br/>para cada área exigida?"}:::regra
    V -->|"não"| SV["Área: sem vínculo com a ANSN"]:::dado
    V -->|"sim"| I{"Matrícula na última carga da ANSN?"}:::regra
    I -->|"não"| NC["Não consta na última carga<br/>nunca diz vencida"]:::dado
    I -->|"sim, suspensa"| SU["Suspensa"]:::dado
    I -->|"sim, válida"| VA["Válida até data, com dias restantes"]:::dado
    NC -. "alerta usa o documento interno, rotulado interna" .-> AL["Alerta de licença do resumo"]:::dado
    VA --> AL
```

A carga da ANSN e dos vínculos é feita pela equipe direto no banco (`scripts/importar_licencas_ansn.py`). Ainda não há tela para vincular ou trocar matrícula.

## 7. Registros append-only (eventos, ações, documentos)

```mermaid
stateDiagram-v2
    [*] --> Ativo: criar
    Ativo --> Substituido: editar cria registro novo e aponta o antigo
    Ativo --> Excluido: excluir, soft delete com motivo
    Substituido --> [*]: fica no histórico
    Excluido --> [*]: fica no histórico
    note right of Ativo
        Ativo = substituido_por_id nulo
        e deletado_em nulo.
        Nunca UPDATE nem DELETE físico.
    end note
```

Tipos de documento: nota fiscal, ordem de serviço, TRP, TRD, CNEN SCRA e CNEN licença. Validade só vale na licença.

Inauguração: previsão, realizada e "dispensada" são excludentes, no máximo um evento ativo no conjunto (409 se repetir). Entrega por item não passa mais pelo seletor de marcos da linha do tempo.

## 8. Quem pode fazer o quê

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    U["Usuário logado"] --> R{"Papel"}:::regra
    R -->|"leitor"| L["Só lê, nunca edita<br/>não vê o Radar"]
    R -->|"admin ou gestor"| T["Edita qualquer instrumento<br/>vê e decide no Radar<br/>revisa itens"]
    R -->|"colaborador"| CT{"É titular ou suplente<br/>ou o instrumento não tem técnico?"}:::regra
    CT -->|"sim"| E["Edita o instrumento<br/>não vê o Radar"]
    CT -->|"não"| L2["Só lê"]
    T --> UI["pode_editar vem calculado pelo backend<br/>e a sessão atual também precisa permitir"]
    E --> UI
    UI --> CC{"Acompanhamento concluído?"}:::regra
    CC -->|"sim"| TR["Ninguém edita até reabrir"]
    CC -->|"não"| OK["Edição conforme o papel"]
```

Radar de instrumentos, fila de revisão de itens e aprovação: só gestor e admin. O backend recusa leitura do Radar (lista, histórico, prova) com 403 para os demais papéis, e o botão some do cabeçalho.

## 9. Radar de instrumentos (revisão 2)

O Radar lista convênios novos do SICONV que ainda não estão na carteira. Só gestor e admin acessam.

```mermaid
flowchart TB
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef aviso fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    J["job descoberta-siconv<br/>e recaptura oficial"]:::job --> CARD["Card do candidato<br/>Componente · Item · Valor · UF · Município<br/>Data da coleta · Data do instrumento"]:::tela
    CARD --> D{"Decisão"}:::regra
    D -->|"rejeitar, com motivo"| REJ["Rejeitado"]:::regra
    D -->|"aprovar"| DLG["Pop-up único: escolher o técnico titular<br/>(obrigatório) e confirmar"]:::tela
    DLG --> MON["Entra na carteira e já vai para o<br/>monitoramento interno com o técnico"]:::regra
    MON --> N1["Notificação de inclusão<br/>titular, suplente, gestor e admin"]:::aviso
    N1 --> POP["Pop-up na tela do técnico<br/>e item na central de notificações"]:::aviso
    MON --> N2["Notificação de aprovação<br/>só gestor e admin"]:::aviso
```

Detalhes do aprovar com técnico:

- O botão **Aprovar** abre o mesmo pop-up de "Adicionar ao monitoramento interno": o técnico titular é obrigatório e **Confirmar** já leva o instrumento ao monitoramento. Não há mais "Iniciar análise"; sobra Aprovar e Rejeitar.
- A lista tem duas abas: **Aguardando** (novo e em análise) e **Arquivados** (aprovado e rejeitado). O card não mostra o campo Item; o botão **Ver itens** abre um pop-up com todos os bens da última recaptura.
- Com técnico, a mesma transação cria o instrumento monitorado (tipo Convênio, origem `radar_aprovacao`), grava o titular e emite o aviso de inclusão. Se qualquer passo falhar, nada é gravado.
- O pop-up aparece na tela do técnico indicado, no próximo ciclo do sino (até 60 segundos), uma vez por aviso, com atalho para o instrumento. Quem apenas incluiu não recebe o pop-up, só o aviso no sino.
- O resumo oficial (valor, município e UF) vem da última recaptura. Sem recaptura, a lista mostra traço em vez de inventar valor.

## 10. Avisos e jobs

### 10.1 Origem dos avisos

```mermaid
flowchart LR
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef aviso fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    E1["Edição manual de cadastro, evento ou ação"] --> N1["edicao_manual"]:::aviso
    E2["Aprovação no Radar com técnico<br/>ou inclusão manual no monitoramento"] --> N5["inclusao_monitoramento"]:::aviso
    E3["Aprovação no Radar"] --> N6["aprovacao_carteira"]:::aviso
    J1["job_prazos_monitoramento"]:::job --> N2["prazo_acao, prazo_inauguracao,<br/>prazo_previsao_entrega"]:::aviso
    J2["job_alerta_vigencia"]:::job --> N3["alerta_vigencia"]:::aviso
    J3["job_verificacao_siconv<br/>job_verificacao_transferegov"]:::job --> N4["atualizacao_api"]:::aviso
    J4["job_descoberta_siconv<br/>job_descoberta_transferegov"]:::job --> N7["convenio_descoberto,<br/>proposta_candidata,<br/>fonte_indisponivel"]:::aviso
    J5["vincular_entregas_legadas --avisar"]:::job --> N8["entrega_legada_revisao"]:::aviso
```

### 10.2 Quem recebe cada aviso

| Aviso | Destinatários |
|---|---|
| `edicao_manual`, `atualizacao_api`, `prazo_*`, `entrega_legada_revisao`, `inclusao_monitoramento` | Titular, suplente, gestor e admin ativos; sem técnico, só gestor e admin |
| `alerta_vigencia` | Igual ao anterior quando há instrumento monitorado; sem instrumento, só gestor e admin |
| `aprovacao_carteira`, `convenio_descoberto`, `fonte_indisponivel` | Só gestor e admin |
| `proposta_candidata` | Todos, exceto leitor (broadcast) |

Leitor nunca recebe aviso. Colaborador que não é titular nem suplente não recebe aviso de instrumento alheio.

### 10.3 Jobs, agenda e efeito

| Job | O que faz | Agenda | Estado | Grava |
|---|---|---|---|---|
| `job_prazos_monitoramento` | Avisa D-1, D0 e D+1 de ação aberta com prazo e de previsão de inauguração não realizada. Dedup por `chave_dedup`; concluir, excluir ou reagendar arquiva os avisos antigos | 08:00 de São Paulo (intenção) | **Não agendado.** Só roda à mão, com simulação por padrão e `--aplicar --confirmo-host` | `Notificacao` |
| `job_alerta_vigencia` | Convênios com fim de vigência em até 90 dias. Não repete o mesmo convênio em 30 dias | Diário no `radar_convenios.yml` (06:30 Brasília) | Só roda se a variável `ATUALIZACOES_RADAR_ATIVAS` for `true`; manual pelo `workflow_dispatch` | `Notificacao` |
| `job_verificacao_siconv` | Baixa o dump oficial do SICONV e reconcilia convênios conhecidos e instrumentos. Compara por chave estável; a primeira captura de cada convênio vira linha de base | Diário (mesmo workflow) | Mesma variável | `Convenio`, `InstrumentoEquipamento`, `Notificacao` |
| `job_verificacao_transferegov` | Consulta ao vivo cada parceria monitorada (parceria e ordens de pagamento) | Diário (mesmo workflow) | Mesma variável | Instrumento, repasse, `Notificacao` |
| `job_descoberta_transferegov` | Descobre propostas do TransfereGov de programas do Ministério da Saúde | Diário (mesmo workflow) | Mesma variável | Propostas candidatas, `Notificacao` |
| `job_descoberta_siconv` | Coleta fresca de convênios para o Radar; nunca inclui na carteira nem no monitoramento | Diário (mesmo workflow) | Mesma variável | Candidatos do Radar |
| `job_recaptura_legado_local`, `job_revalidacao_legado_local` | Recaptura oficial de um candidato e revalidação de escopo histórico | Manual | Só em clone local validado | Recaptura do candidato |
| `pipelines.yml` | Atualiza cobertura (tomógrafo, ressonância, PET-CT) e população | 06:00 Brasília | Só com `ATUALIZACOES_PIPELINES_ATIVAS=true`; fora do monitoramento interno | Dados de cobertura |
| `backup_banco.yml` | `pg_dump` cifrado com `age` para o R2, retenção de 7 dias | 02:17 e 14:17 UTC | Ligado | R2 |

Regras comuns: simulação por padrão nos scripts que gravam; `--aplicar` exige `--confirmo-host`; o aviso é criado por `criar_notificacao`, que grava o destinatário na criação (não em tempo de leitura); aviso de instrumento ou convênio fora de escopo não aparece para ninguém.

Importante para o release: nenhum agendamento foi ligado. A decisão de ligar cada um fica para depois de uma rodada supervisionada.

## 11. Registro de funcionalidades (para a equipe marcar)

Marque a coluna final com **usa**, **não usa** ou **não conheço**.

| # | Funcionalidade | Onde fica | Equipe usa? |
|---|---|---|---|
| 1 | Filtros da Mesa: busca por número, convenente, CNES ou município; contratação; CNES; UF; município; prioritário; equipamento; situação; programa; período | Mesa de trabalho | |
| 2 | Indicadores no topo da Mesa e lista de instrumentos | Mesa de trabalho | |
| 3 | Adicionar instrumento ao monitoramento | Dados oficiais | |
| 4 | Cadastro interno (técnico titular e suplente, nível, tipologia, modalidade, responsável da execução, CNES) | Detalhe | |
| 5 | Editar só o CNES | Detalhe, cabeçalho | |
| 6 | Registrar entrega com várias unidades por item | Detalhe, Equipamentos | |
| 7 | Corrigir unidade (marca, modelo, série, vida útil) | Detalhe, Equipamentos | |
| 8 | Excluir entrega com motivo | Detalhe, Equipamentos | |
| 9 | Cancelar e desfazer cancelamento de unidade | Detalhe, Equipamentos | |
| 10 | Previsão de entrega por item (definir e remover) | Detalhe, Equipamentos | |
| 11 | Confirmar repasse integral ou parcial | Detalhe, Equipamentos | |
| 12 | Vincular entrega antiga (legado) | Detalhe, Equipamentos | |
| 13 | Card de licença de operação (somente leitura) | Detalhe | |
| 14 | Documentos (6 tipos), incluindo corrigir e excluir | Detalhe, Cronograma | |
| 15 | Lançar evento de cronograma e regulatório | Detalhe, Cronograma | |
| 16 | Editar e excluir evento, com motivo | Detalhe, Eventos | |
| 17 | Ações: criar, editar, concluir, excluir, com prazo e responsável | Detalhe, Ações | |
| 18 | Concluir e reabrir acompanhamento | Detalhe, Fase | |
| 19 | Fila de revisão de itens (confirmar, corrigir, não é equipamento) | Revisão de itens | |
| 20 | Notificações por edição, prazo e vigência, com pop-up de instrumento novo | Sino | |
| 21 | Relatórios de instrumentos e repasse (Excel e Word) | Relatórios | |
| 22 | Radar: ver candidatos, rejeitar e aprovar com técnico (vai direto ao monitoramento) | Radar (gestor e admin) | |

## 12. Código sem uso

Método: busca por nome em todo o `frontend/src` e `backend` (incluindo testes). Candidato não é prova de código morto, mas todos os itens abaixo tinham **zero chamadas** fora da própria definição e foram removidos na revisão 2, depois de rodar lint, tipos e a suíte inteira.

### Removidos

| Item | Onde |
|---|---|
| `codigos_familias_com_licenca` | `repositories/documentos.py` (sobra da licença por item) |
| `listar_marcos_fase_geral_desc` | `repositories/monitoramento.py` (fase agora é calculada) |
| `preencher_ano_convenio_se_ausente` | `repositories/monitoramento.py` |
| `repositories/auditoria_marcadores.py` e seu teste | só um teste importava |
| `AjudaCampo` | `monitoramento-ui.tsx` |
| `useEntregasLegadas`, `fetchEntregasLegadas`, schema e tipo `EntregaLegada` | hook e serviço da fila de legado, sem tela |
| `TECNICOS_EQUIPE` | `lib/monitoramento-opcoes.ts` (o cadastro usa `GET /monitoramento/colaboradores`) |
| `LEGENDA_STATUS` | `lib/monitoramento-status.ts` |
| `getMapThemeColors` | `lib/theme-colors.ts` |
| `equipamentosDaProposta` | `lib/proposta-metas-resumo.ts` |
| Tipos `ProgramaTransfereGov`, `ConvenioPortal`, `ComponentePropostaApi`, `ComponenteOncologia` | `types/monitoramento.ts` |
| `CandidatoLegadoProvaResumo` e a conferência com checkbox e justificativa | Radar, substituídos pela aprovação com técnico |

### Mantidos, para a equipe decidir

| Item | Motivo |
|---|---|
| Rota `/monitoramento-equipamentos/entradas` | Só redireciona; mantida por links antigos |
| `GET /monitoramento/entregas-legadas` (backend) | Sem consumidor de tela depois da remoção do hook; o vínculo é feito item a item |
| Exports só usados em testes (`mediaReferenciaFase`, `formatarNup`, `codificarSituacao`) | Têm teste próprio; remover só se a funcionalidade sair |
| Exports usados só no próprio arquivo (`motivoExclusaoSchema`, `unidadeEntregaSchema`, `itemEntregaSchema`, `conclusaoKeys`, `documentosKeys`) | Só o `export` está sobrando |
| `EtapaExpandida`, `PropostaExpandida` | Ainda referenciados por outros tipos do mesmo arquivo |
| Scripts de uma só execução | Arquivar depois do release (lista abaixo) |

### Scripts de uma só execução (arquivar depois do release)

`migrar_marcos_para_documentos`, `migrar_concluidos_para_conclusao`, `migrar_eventos_inauguracao_prevista`, `remover_persus_ii_do_monitoramento`, `corrigir_entregas_persus_i`, `consolidar_eventos_marco_duplicados`, `vincular_entregas_legadas`, `derivar_repasses_siconv`, `projetar_itens_plano` (este também serve de rotina recorrente), `preencher_*`, `importar_planilha_monitoramento`, `importar_programas_monitoramento`. Depois do release e da conferência em produção, mover para `scripts/arquivo/` ou remover, mantendo o histórico no git.

Pendente já registrado no plano do fluxo: remover a leitura do evento antigo `fase_concluido` em `fatos_do_instrumento` e `fases_calculadas_em_lote` depois de conferir a produção.

## 13. Limites desta análise

- Busca textual, não análise de grafo de chamadas: função chamada por nome dinâmico ou por reflexão não seria detectada. Por isso a remoção foi validada por lint, tipos e testes.
- Endpoints foram cruzados com o frontend pelo caminho; endpoint usado só por script externo apareceria como "com consumidor" se o texto coincidir.
- Uso real em produção não foi medido. Para isso, olhar `AuditLog` por tipo de ação (quem lançou o quê, quando) é o melhor indicador de funcionalidade que a equipe não usa.
- A agenda dos jobs reflete os arquivos de workflow. O valor das variáveis `ATUALIZACOES_*_ATIVAS` no GitHub não foi consultado.
