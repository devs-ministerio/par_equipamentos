# Mapa do Monitoramento interno (19/11/2026)

Objetivo: servir de base para a equipe validar o fluxo e apontar funcionalidade ou código sem uso. Tudo aqui foi lido do código da branch `feat/persus-ii-fora-do-monitoramento` (estado de 19/11/2026). Os diagramas usam Mermaid e renderizam no Obsidian, no GitHub e no VS Code.

Escopo: Mesa de trabalho (`/monitoramento-equipamentos/instrumentos`), detalhe do instrumento (`/monitoramento-equipamentos/instrumentos/:nr`) e a fila de revisão de itens. O Painel de Gestão está desabilitado (flag `PAINEL_GESTAO_HABILITADO`) e fica fora deste mapa.

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
    REV["Revisão de itens<br/>/revisao-itens"]:::tela
    GEST(["gestor / admin"]):::perfil --> REV
    PAINEL["Painel de gestão<br/>botão desabilitado"]:::off
    SINO["Sino de notificações"]:::tela -->|"abre o instrumento"| DET
```

## 2. Estrutura da página de detalhe

Cada bloco é um componente em `frontend/src/components/features/`. A coluna da direita mostra de onde vêm os dados.

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

    SEC1 --> FASE["Fase geral calculada<br/>+ Concluir acompanhamento"]:::comp
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

```mermaid
flowchart TB
    classDef dado fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef acao fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00

    SICONV["Itens do plano SICONV<br/>ou carga manual"]:::dado --> PROJ["Projeção em item_plano<br/>projetar_itens_plano"]:::acao
    PROJ --> CLASS{"Classificação do item"}:::regra
    CLASS -->|"aquisição"| MON{"Monitorado?"}:::regra
    CLASS -->|"rendimento, serviço, obra"| FORA["Não soma unidade nem valor"]:::dado
    CLASS -->|"incerto"| FILA["Fila de revisão de itens<br/>gestor ou admin decide"]:::acao
    FILA --> CLASS
    MON -->|"uma das 16 famílias"| SIM["Controle por unidade"]:::dado
    MON -->|"valor unitário a partir de R$ 300 mil"| SIM
    MON -->|"nenhum dos dois"| NAO["Sem controle por unidade"]:::dado

    SIM --> PREV["Previsão de entrega por item<br/>PUT e DELETE"]:::acao
    SIM --> ENT["Registrar entrega<br/>marca, modelo, série, vida útil"]:::acao
    ENT --> LIM{"Passa do planejado?"}:::regra
    LIM -->|"sim"| BLOQ["Bloqueado, 422"]:::regra
    LIM -->|"não"| UNI["Unidade nasce na entrega<br/>série única dentro do item"]:::dado
    UNI --> CORR["Corrigir unidade, com AuditLog"]:::acao
    UNI --> EXC["Excluir entrega, com motivo"]:::acao
    SIM --> CANC["Cancelar unidade, com motivo"]:::acao
    CANC --> DESF["Desfazer cancelamento"]:::acao
    LEG["Entrega antiga sem vínculo"]:::dado --> VINC["Vincular à fila de legado"]:::acao --> ENT
    CONC{"Instrumento concluído?"}:::regra -->|"sim"| TRAVA["Entrega e cancelamento travados até reabrir"]:::regra
```

## 5. Concluir e reabrir o acompanhamento

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
    CONF --> FIM["Fase Concluído<br/>entrega e cancelamento travam"]:::regra
    FIM --> REAB["Reabrir com motivo<br/>DELETE .../conclusao"]:::acao
    REAB --> VOLTA["Volta à fase calculada dos fatos"]:::regra
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

Tipos de documento: nota fiscal, ordem de serviço, TRP, TRD, CNEN SCRA e CNEN licença. Status CNEN: Em análise, Em diligência, Deferido, Indeferido. Validade só vale na licença.

Inauguração: previsão, realizada e "dispensada" são excludentes, no máximo um evento ativo no conjunto (409 se repetir). Entrega por item não passa mais pelo seletor de marcos da linha do tempo.

## 8. Quem pode editar

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    U["Usuário logado"] --> R{"Papel"}:::regra
    R -->|"leitor"| L["Só lê, nunca edita"]
    R -->|"admin ou gestor"| T["Edita qualquer instrumento"]
    R -->|"colaborador"| CT{"É titular ou suplente<br/>ou o instrumento não tem técnico?"}:::regra
    CT -->|"sim"| T
    CT -->|"não"| L
    T --> UI["pode_editar vem calculado pelo backend<br/>e a sessão atual também precisa permitir"]
```

Fila de revisão de itens: só gestor e admin (`GestaoRoute`).

## 9. Avisos e jobs

```mermaid
flowchart LR
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef aviso fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    E1["Edição manual de cadastro, evento ou ação"] --> N1["edicao_manual"]:::aviso
    J1["job_prazos_monitoramento<br/>D-1, D0, D+1 de ação, previsão de entrega e inauguração<br/>agendamento 08:00 NÃO ligado"]:::job --> N2["avisos de prazo"]:::aviso
    J2["job_alerta_vigencia<br/>fim de vigência em 90 dias"]:::job --> N3["alerta_vigencia"]:::aviso
    J3["jobs de verificação SICONV e TransfereGov<br/>cron desligado"]:::job --> N4["atualizacao_api"]:::aviso
    N1 & N2 & N3 & N4 --> D["Destinatários: titular, suplente,<br/>gestor e admin ativos<br/>sem técnico: só gestor e admin"]
    D --> SINO["Sino do cabeçalho"]
```

## 10. Registro de funcionalidades (para a equipe marcar)

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
| 20 | Notificações por edição, prazo e vigência | Sino | |
| 21 | Relatórios de instrumentos e repasse (Excel e Word) | Relatórios | |

## 11. Candidatos a código sem uso (verificados por busca no código)

Método: busca por nome em todo o `frontend/src` e `backend` (incluindo testes). **Candidato não é prova**: confirme com a equipe antes de apagar. Nada foi removido.

### Backend

| Item | Evidência | Observação |
|---|---|---|
| `repositories/documentos.py::codigos_familias_com_licenca` | Nenhuma chamada em `app`, `tests` ou `scripts` | Sobrou da licença por item, que foi removida. Apagar |
| `repositories/monitoramento.py::listar_marcos_fase_geral_desc` | Nenhuma chamada | Provável resto do tempo em que a fase geral era escolhida; hoje ela é calculada |
| `repositories/monitoramento.py::preencher_ano_convenio_se_ausente` | Nenhuma chamada | Provável resto de carga antiga; ver `scripts/preencher_ano_*.py` |
| `repositories/auditoria_marcadores.py` | Importado só por 1 teste | Confirmar se algum script ou tela usa |

### Frontend

| Item | Evidência | Observação |
|---|---|---|
| `AjudaCampo` (`monitoramento-ui.tsx`) | 0 usos em qualquer arquivo | Apagar |
| `useEntregasLegadas` (`useEquipamentosInstrumento.ts`) | 0 usos | Confirmar se a fila de legado tem outra entrada na tela |
| `TECNICOS_EQUIPE` (`lib/monitoramento-opcoes.ts`) | 0 usos | Lista fixa; o cadastro hoje usa `GET /monitoramento/colaboradores` (a confirmar) |
| `LEGENDA_STATUS` (`lib/monitoramento-status.ts`) | 0 usos | |
| `getMapThemeColors` (`lib/theme-colors.ts`) | 0 usos | |
| `equipamentosDaProposta` (`lib/proposta-metas-resumo.ts`) | 0 usos | |
| `mediaReferenciaFase`, `formatarNup`, `codificarSituacao` | Usados só em testes e no próprio arquivo | Exportados sem consumidor de tela |
| `motivoExclusaoSchema`, `unidadeEntregaSchema`, `itemEntregaSchema`, `conclusaoKeys`, `documentosKeys` | Usados só dentro do próprio arquivo | Só o `export` está sobrando |
| `/monitoramento-equipamentos/entradas` | Rota que só redireciona | Mantida por links antigos; confirmar se pode sair |
| Tipos órfãos em `types/monitoramento.ts` (`ProgramaTransfereGov`, `ConvenioPortal`, `EtapaExpandida`, `PropostaExpandida`, `ComponentePropostaApi`, `ComponenteOncologia`) | Sem importador | Heranças do desenho antigo de propostas |

Todas as rotas de `routers/monitoramento.py`, `entregas.py`, `documentos.py`, `conclusao.py`, `repasses.py` e `licenca_operacao.py` têm consumidor no frontend (busca pelo caminho).

### Scripts de uma só execução (arquivar depois do release)

`migrar_marcos_para_documentos`, `migrar_concluidos_para_conclusao`, `migrar_eventos_inauguracao_prevista`, `remover_persus_ii_do_monitoramento`, `corrigir_entregas_persus_i`, `consolidar_eventos_marco_duplicados`, `vincular_entregas_legadas`, `derivar_repasses_siconv`, `projetar_itens_plano` (este também serve de rotina recorrente), `preencher_*`, `importar_planilha_monitoramento`, `importar_programas_monitoramento`. Depois do release e da conferência em produção, mover para `scripts/arquivo/` ou remover, mantendo o histórico no git.

Pendente já registrado no plano do fluxo: remover a leitura do evento antigo `fase_concluido` em `fatos_do_instrumento` e `fases_calculadas_em_lote` depois de conferir a produção.

## 12. Limites desta análise

- Busca textual, não análise de grafo de chamadas: função chamada por nome dinâmico ou por reflexão não seria detectada.
- Endpoints foram cruzados com o frontend pelo caminho; endpoint usado só por script externo apareceria como "com consumidor" se o texto coincidir.
- Uso real em produção não foi medido. Para isso, olhar `AuditLog` por tipo de ação (quem lançou o quê, quando) é o melhor indicador de funcionalidade que a equipe não usa.
