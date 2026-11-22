# Mapa do Radar de instrumentos (revisão 3, de 22/11/2026)

Objetivo: servir de base para a equipe validar o fluxo do Radar e apontar funcionalidade ou código sem uso. Tudo aqui foi lido do código da branch `feat/persus-ii-fora-do-monitoramento` (estado de 22/11/2026) e conferido, em leitura, contra o banco de produção de 21/11/2026. A revisão 2 incorpora os blocos 1 a 3 do plano [planmode-radar-confirmacao-e-ruido-2026-11-22.md](../planos/planmode-radar-confirmacao-e-ruido-2026-11-22.md), que estão em commits locais e **ainda não estão em produção**. Os diagramas usam Mermaid e renderizam no Obsidian, no GitHub e no VS Code.

Escopo: o Radar de convênios do SICONV (candidatos "legados"), da descoberta diária até a entrada na carteira de monitoramento. Cobre também a aba de propostas do TransfereGov e o job que a alimenta, porque dividem o workflow e a central. O detalhe do que acontece depois da aprovação está em [monitoramento-interno.md](monitoramento-interno.md).

Itens que não deu para confirmar só pelo código vão marcados com `> [!warning] A confirmar`.

## 1. Visão de ponta a ponta

```mermaid
flowchart LR
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef dado fill:#F3EAF7,stroke:#7B3FA0,color:#40205a
    classDef aviso fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    WF["Workflow radar_convenios<br/>06:30 Brasília"]:::job --> DESC["job descoberta-siconv"]:::job
    DESC --> ESC["Escopo: Ministério da Saúde,<br/>convênio celebrado, equipamento prioritário"]:::regra
    ESC --> PORTAL["Confirmação no Portal da Transparência<br/>(data de publicação)"]:::regra
    PORTAL --> BD[("candidato_legado<br/>+ capturas, evidências, componentes")]:::dado
    BD --> AV["Aviso convenio_descoberto<br/>só gestor e admin"]:::aviso
    BD --> FILA["Radar: aba Aguardando"]:::tela
    REC["Recaptura (valor, itens, prova)<br/>só em clone local"]:::job -. "prova válida por 24 h" .-> FILA
    REV["Revalidação: esconde falso positivo"]:::job -. "só em clone local" .-> BD
    FILA --> DEC{"Gestor ou admin decide"}:::regra
    DEC -->|"Rejeitar com motivo"| ARQ["Aba Arquivados"]:::tela
    DEC -->|"Aprovar com técnico titular"| TX["Transação única de aprovação"]:::regra
    TX --> MON["Instrumento entra no monitoramento interno"]:::tela
    TX --> ARQ
    TX --> N["Notificações: inclusão e aprovação"]:::aviso
```

O fluxo tem duas metades que não se falam por rede: a coleta (job e recaptura, escrevem no banco) e a triagem humana (API e telas, só leem e decidem). O que liga as duas é o banco e a regra de frescor da prova.

## 2. Acesso e telas

```mermaid
flowchart TB
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef perfil fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef off fill:#eee,stroke:#999,color:#777,stroke-dasharray:4 3

    P1(["admin / gestor"]):::perfil --> BTN["Botão Radar no cabeçalho<br/>com contador de novos"]:::tela
    P2(["colaborador / leitor"]):::perfil -. "botão não aparece; API devolve 403" .-> BTN
    BTN --> CEN["Central Radar de instrumentos (pop-up)"]:::tela
    CEN --> MON["Monitor da coleta"]:::tela
    CEN --> ABA1["Aba Convênios"]:::tela
    CEN --> ABA2["Aba Propostas em tramitação<br/>desabilitada: aguardando critério"]:::off
    ABA1 --> LISTA["Lista: busca, abas, paginação"]:::tela
    LISTA --> CARD["Card do candidato"]:::tela
    CARD --> ITENS["Itens · n: pop-up em tabela"]:::tela
    CARD --> HIST["Histórico de decisões"]:::tela
    CARD --> APR["Aprovar: pop-up com técnico titular"]:::tela
    CARD --> REJ["Rejeitar: justificativa"]:::tela
```

O contador de novos no botão é a quantidade de candidatos oficiais sem decisão (`contar_novos`), recalculada a cada 60 segundos. A aba "Propostas em tramitação" existe no código e carrega a lista de propostas do TransfereGov sob demanda, mas fica desabilitada na tela com a dica "Aguardando definição do critério de propostas novas".

O monitor da coleta mostra status, defasagem e contagens só para o `admin`. Os demais perfis veem apenas a data e hora da última coleta com sucesso (`/fontes/capturas` corta na API, não só na tela). Uma fonte aparece como defasada quando passa de 36 horas sem captura bem-sucedida.

## 3. Descoberta SICONV (job diário)

```mermaid
flowchart TB
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef erro fill:#FBE9E7,stroke:#C62828,color:#5a1010
    classDef dado fill:#F3EAF7,stroke:#7B3FA0,color:#40205a

    INI["job_descoberta_siconv.run<br/>dentro de captura(siconv_descoberta)"]:::job --> ZIP["Baixa os zips do SICONV:<br/>convênio, plano de aplicação, proposta,<br/>programa, programa-proposta"]:::job
    ZIP --> HASH["Hash do snapshot =<br/>sha256(hash dos convênios + hash dos itens)"]:::dado
    ZIP --> PRIO["descobrir_prioritarios_ms<br/>aplica o escopo (seção 4)"]:::regra
    PRIO --> REVAL["selecionar_revalidacoes<br/>candidatos abertos que podem ter saído do escopo"]:::regra
    REVAL --> SNAP["preparar_snapshot"]:::job
    SNAP --> CONF["confirmar_candidatos<br/>Portal da Transparência"]:::regra
    CONF --> OK{"Portal devolveu o código do convênio?<br/>contrato mínimo, seção 5"}:::regra
    OK -->|"não"| INC["confirmações_inconclusivas<br/>candidato não publicado, rodada parcial"]:::erro
    OK -->|"sim"| LIM{"Candidatos acima do limite (1000)?"}:::regra
    INC --> LIM
    LIM -->|"sim"| ERRO["ValueError: lote não aplicado"]:::erro
    LIM -->|"não"| PUB["publicar_ciclo<br/>uma transação: descoberta + inelegibilidades + avisos"]:::dado
    PUB --> CONFL{"Conflito de revisão (ConflictError)?"}:::regra
    CONFL -->|"sim"| CR["publicacao = conflito_revisao<br/>nada gravado"]:::erro
    CONFL -->|"não"| FIM["Rodada concluída<br/>(parcial levanta erro no fim)"]:::job
```

Desde o bloco 3, a falha de contrato de um candidato não adia mais as revalidações dos demais: a revalidação usa só o SICONV e não depende do Portal.

Modo da rodada: sem baseline anterior da fonte, o orquestrador (`atualizar_dados_producao`) liga `baseline_silenciosa`, e a primeira carga grava os candidatos sem avisar ninguém. Rodadas seguintes são `incremental` e notificam.

## 4. Critério de escopo (o que vira candidato)

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef sai fill:#FBE9E7,stroke:#C62828,color:#5a1010
    classDef entra fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    A["Proposta do SICONV"]:::regra --> B{"Órgão superior = Ministério da Saúde (36000)?"}:::regra
    B -->|"não"| X1["Fora"]:::sai
    B -->|"sim"| C{"Convênio celebrado?"}:::regra
    C -->|"não"| X1
    C -->|"sim"| D{"Já conhecido (convênio ou carteira)?"}:::regra
    D -->|"sim"| X1
    D -->|"não"| E{"Há evidência prioritária?"}:::regra
    E --> E1["Item do plano é equipamento prioritário<br/>(catálogo PRIORITARIOS com relação de financiamento)<br/>exclui consultoria, manutenção, locação,<br/>peças, acessórios, insumos"]:::regra
    E --> E2["ou programa tem componente alvo<br/>(COMPONENTES_ALVO e aliases)"]:::regra
    E1 --> F{"Tem evidência?"}:::regra
    E2 --> F
    F -->|"não"| X1
    F -->|"só obra ou serviço, sem evidência"| X1
    F -->|"sim"| G["Candidato<br/>critério prioritarios_ms_celebrados_v2"]:::entra
```

Duplicidade com dados divergentes na fonte levanta `ValueError` e a rodada não publica. O catálogo de equipamentos prioritários é o mesmo das 16 famílias do monitoramento por item.

## 5. Confirmação no Portal da Transparência

```mermaid
flowchart LR
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef ok fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e
    classDef nao fill:#FBE9E7,stroke:#C62828,color:#5a1010

    C["confirmar_no_portal<br/>GET /convenios/numero, só codigo e dataPublicacao"]:::regra --> S1["nao_consultado"]:::regra
    C --> S2["nao_encontrado<br/>404 ou lista vazia"]:::nao
    C --> S3["sem_publicacao<br/>Portal conhece, sem data"]:::nao
    C --> S4["confirmado<br/>com data_publicacao do Portal"]:::ok
    C --> S5["contrato inválido<br/>sem código: não publica, rodada parcial"]:::nao
    S4 --> USO["Só confirmado permite recapturar e aprovar.<br/>A fila, o contador e o aviso não esperam o Portal"]:::ok
    S1 -. "mantém 'confirmado' anterior se o critério for o mesmo" .-> S4
    S2 -. "consultado de novo todo dia" .-> C
```

**Contrato por finalidade (22/11/2026).** Confirmar só consome `dimConvenio.codigo` e `dataPublicacao`, então o contrato de confirmação (`DimConvenioConfirmacao`) exige só o código. Um registro do Portal com `numero` e `objeto` vazios, como o do convênio `7AAFSX`, passa a confirmar a publicação. O contrato completo (`DimConvenioPortal`, dentro de `PortalLegadoCapturado`) continua exigido onde o dado entra de fato: na recaptura e na aprovação, com convenente, município e data.

**Comportamento observado do Portal (produção, 21/11/2026).** Os 12 candidatos hoje confirmados começaram como `nao_encontrado` e viraram `confirmado` no mesmo dia, 18/11. A data de publicação do Portal sempre coincide com a do SICONV; o Portal só demora a expor o registro.

| Convênio | Publicado no SICONV | Confirmado no Portal | Espera |
| --- | --- | --- | --- |
| `998681` | 27/10 | 18/11 | 22 dias |
| `7AACXC` | 04/11 | 18/11 | 14 dias |
| `7AACXB`, `7AAFQV` | 05/11 | 18/11 | 13 dias |
| `7AAEPR` | 06/11 | 18/11 | 12 dias |
| Seis convênios | 12 e 13/11 | 18/11 | 5 a 6 dias |

Como a checagem é diária, cada espera tem margem de 1 dia. Fora do padrão: `7AAFRI` (SICONV em 23/09, ausente do Portal há 59 dias) e `7AAFSX` (registro vazio desde 05/11, tratado acima). A causa do lote de 18/11 é externa: não houve commit na descoberta entre 27/10 e 21/11, e o dump do SICONV é atualizado todo dia (Last-Modified de 21/11, 11:12).

A data do instrumento exibida no card é a data de assinatura do SICONV; se faltar, vale a data de publicação do Portal.

## 6. Persistência e avisos

```mermaid
flowchart TB
    classDef dado fill:#F3EAF7,stroke:#7B3FA0,color:#40205a
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef aviso fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    REG["registrar_descoberta"]:::regra --> LOCK["Trava o lote (bloquear_lote)"]:::regra
    LOCK --> EXC["Exclui números já conhecidos"]:::regra
    EXC --> CAND[("candidato_legado")]:::dado
    CAND --> HASH{"hash_conteudo mudou?<br/>sha256(origem + json)"}:::regra
    HASH -->|"não"| MESMA["Não cria nova captura"]:::regra
    HASH -->|"sim"| CAP[("candidato_legado_captura<br/>atualiza ultima_captura_id")]:::dado
    CAP --> EVI[("candidato_legado_evidencia<br/>candidato_legado_componente")]:::dado
    REG --> AV{"Aviso convenio_descoberto?"}:::regra
    AV -->|"critério v2, órgão 36000, origem oficial,<br/>ainda não descoberto antes,<br/>e rodada não é baseline"| N["Notificação a gestor e admin ativos<br/>sem destino (triagem é no Radar)"]:::aviso
    CAND --> IE["IntegrityError na concorrência"]:::regra --> C409["ConflictError: nada é gravado"]:::regra
```

Evidência anterior só é mesclada quando o candidato ainda não tem critério. Tabelas de apoio: `candidato_legado_decisao` (seção 8), `candidato_legado_recaptura` (seção 7) e `FonteCaptura` (uma linha por rodada, com fonte `siconv_descoberta`, `siconv_recaptura` ou `siconv_revalidacao`).

## 7. Recaptura, prova e revalidação

```mermaid
flowchart TB
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef dado fill:#F3EAF7,stroke:#7B3FA0,color:#40205a
    classDef erro fill:#FBE9E7,stroke:#C62828,color:#5a1010

    LOC["Scripts locais: coletar_recaptura_legado,<br/>job_recaptura_legado_local,<br/>job_revalidacao_legado_local"]:::job --> AVISO["Só clone local.<br/>Automação de produção não habilitada"]:::erro
    LOC --> PREP["preparar_alvo_coleta<br/>exige descoberta oficial v2, órgão 36000,<br/>Portal confirmado, decisão novo ou em análise<br/>encerra a leitura antes do download"]:::regra
    PREP --> REGR["registrar_recaptura<br/>trava lote, depois candidato"]:::regra
    REGR --> VAL["validar_captura_promocao"]:::regra
    VAL --> OKR[("FonteCaptura siconv_recaptura<br/>+ candidato_legado_recaptura")]:::dado
    OKR --> PROVA["Prova: hash, frescor de 24 h"]:::regra
    LOC --> RV["registrar_inelegibilidade<br/>(revalidação)"]:::regra
    RV --> RVR["Esconde falso positivo, não rejeita:<br/>fonte deixou de qualificar, identidade igual,<br/>fora da carteira, decisão não encerrada"]:::regra
    RVR --> RVD[("FonteCaptura siconv_revalidacao<br/>+ captura inelegível")]:::dado
    RVR -. "fonte ainda qualifica" .-> E409["409: mantém o candidato no escopo"]:::erro
```

A validação da prova (`validar_captura_promocao`) confere: hash igual, mesmo candidato, convênio celebrado no escopo, Ministério da Saúde, confirmação do Portal inalterada, datas oficiais inalteradas, obra ou serviço não aceito como aquisição de equipamento e evidência prioritária inalterada.

`VALIDADE_RECAPTURA` é de 24 horas. Replay da mesma recaptura é reconhecido pelo horário de início.

**Conferido em produção (21/11/2026): a recaptura nunca rodou.** `candidato_legado_recaptura` tem 0 linhas e não existe nenhuma rodada `siconv_recaptura`. Como a aprovação exige uma recaptura de até 24 horas, nenhum candidato chegou à carteira pelo Radar: `convenio` e `instrumento_equipamento` não têm registro com origem `radar_aprovacao`. Há 11 candidatos confirmados sem decisão, o mais antigo descoberto em 28/10, e 1 rejeitado. Os 427 instrumentos e 560 convênios atuais vêm de cargas manuais.

> [!warning] A confirmar
> Decidir como a recaptura passa a existir em produção (agendada com a chave do Portal, ou operada à mão com procedimento documentado). Isso grava em produção e mexe em operação, então depende de autorização.

## 8. Estados do candidato e decisões

```mermaid
stateDiagram-v2
    [*] --> novo: descoberto (Portal pode estar pendente)
    novo --> em_analise: iniciar_analise (API; sem botão na tela)
    novo --> rejeitado: rejeitar com justificativa
    em_analise --> rejeitado: rejeitar com justificativa
    novo --> aprovado: aprovar (transação da seção 9)
    em_analise --> aprovado: aprovar (transação da seção 9)
    rejeitado --> [*]
    aprovado --> [*]
```

Regras das decisões (`candidato_legado_decisao`): a tabela é imutável por trigger (`trg_decisao_legado_imutavel`), com `situacao` em em_analise, rejeitado ou aprovado, justificativa de 3 a 1000 caracteres, chave única por candidato e uma decisão de aprovação por convênio. O campo `versao` do candidato é o id da última decisão: decidir com versão velha dá 409 "O candidato mudou". Repetir a mesma chave devolve o resultado anterior (idempotência).

Quem decide: só `admin` e `gestor` ativos. A listagem mostra na aba Aguardando os estados novo e em análise, e na aba Arquivados aprovado e rejeitado.

## 9. Aprovação (transação única)

```mermaid
flowchart TB
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef dado fill:#F3EAF7,stroke:#7B3FA0,color:#40205a
    classDef erro fill:#FBE9E7,stroke:#C62828,color:#5a1010
    classDef aviso fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    UI["Aprovar: pop-up com técnico titular obrigatório"]:::tela --> PROVA["GET /{id}/prova<br/>mostra a prova e quando expira"]:::tela
    PROVA --> POST["POST /{id}/aprovacoes"]:::tela
    POST --> T1["Trava lote e candidato"]:::regra
    T1 --> RP{"Mesma chave já aprovada?"}:::regra
    RP -->|"sim, mesmos dados e mesmo titular"| IDEM["Devolve o resultado anterior"]:::regra
    RP -->|"sim, dados ou titular diferentes"| E1["409"]:::erro
    RP -->|"não"| REV["preparar_revisao: estado novo ou em análise,<br/>versão e captura iguais, fora da carteira,<br/>descoberta oficial com Portal confirmado, recaptura mais recente,<br/>rodada siconv_recaptura ok e dentro de 24 h,<br/>hash igual, projeção igual à prova"]:::regra
    REV -->|"qualquer falha"| E1
    REV --> CART["carteira_legado.adicionar (insert estrito)"]:::dado
    CART --> MARC["Marcadores de equipamento<br/>(classificar_descricoes)"]:::dado
    MARC --> DECR[("Linha de decisão: aprovado<br/>com tecnico_titular_id")]:::dado
    DECR --> INST["criar_instrumento_monitorado<br/>tipo Convênio, origem radar_aprovacao,<br/>titular gravado"]:::dado
    INST --> ITP["projetar_itens_plano (aplicar)"]:::dado
    ITP --> NOT["Notificações:<br/>inclusao_monitoramento (titular, suplente, gestor, admin)<br/>aprovacao_carteira (gestor, admin)"]:::aviso
    NOT --> FRESC["Confere frescor de novo"]:::regra
    FRESC --> COM["commit"]:::dado
    COM -. "IntegrityError em qualquer passo" .-> E1
```

Sem `tecnico_titular_id` a API responde 422 (a validação do Zod no front deixa o campo opcional de propósito; quem garante é o backend). Se qualquer passo falhar, nada é gravado.

Depois do commit, o front invalida as consultas do Radar, do histórico, da prova, da lista de convênios, do monitoramento e das notificações, e mostra "Convênio aprovado e incluído no monitoramento.". O técnico indicado recebe um pop-up na próxima atualização do sino (até 60 segundos), uma vez por aviso, guardado no armazenamento do navegador por usuário (janela de 7 dias). Quem só aprovou recebe apenas o item no sino.

## 10. Lista, filtros e paginação

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e

    Q["GET /candidatos-legados<br/>pagina, tamanho_pagina 1 a 50 (padrão 10),<br/>busca até 100, confirmacao, situacao[]"]:::tela --> BASE["Base da fila: captura elegível"]:::regra
    BASE --> F1["Fora quem já é convênio conhecido<br/>(tipo Convênio ou sem tipo)"]:::regra
    F1 --> F2["Fora quem já é monitorado"]:::regra
    F2 --> F3["Só descoberta oficial: critério v2,<br/>órgão 36000, origem siconv_oficial<br/>(sem exigir o Portal)"]:::regra
    F3 --> F4["Decisões aprovado e rejeitado continuam listadas (aba Arquivados)"]:::regra
    F4 --> F5["Filtros: situação (sem decisão conta como novo),<br/>confirmação, busca por número ou id da proposta"]:::regra
    F5 --> ORD["Ordem: verificado_em decrescente, depois id"]:::regra
```

Valor global, município, UF e itens do card vêm da última recaptura; sem recaptura, a lista mostra traço (ou os nomes da evidência, no caso dos itens) em vez de inventar.

## 11. Propostas do TransfereGov (job e aba)

```mermaid
flowchart TB
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef tela fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef off fill:#eee,stroke:#999,color:#777,stroke-dasharray:4 3
    classDef aviso fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    J["job descoberta-transferegov"]:::job --> PR["Programas do Ministério da Saúde<br/>com nome no catálogo ou alias curado<br/>(sem similaridade)"]:::regra
    PR --> PP["Propostas desses programas, com parceria,<br/>espelho e cronograma"]:::job
    PP --> PC[("proposta_candidata<br/>baseline silenciosa na 1ª carga")]:::regra
    PC --> AV{"Quantas novas na rodada?"}:::regra
    AV -->|"até 10, com baseline"| IND["Um aviso por proposta"]:::aviso
    AV -->|"mais de 10 ou carga inicial"| RES["Um aviso-resumo"]:::aviso
    IND --> DEST["Notificação proposta_candidata:<br/>broadcast a todo não leitor"]:::aviso
    RES --> DEST
    PC --> API["GET /propostas-candidatas"]:::tela
    API --> ABA["Aba Propostas em tramitação<br/>(desabilitada na central)"]:::off
    DEST -->|"destino"| DADOS["Dados oficiais, aba componentes, subaba novas"]:::tela
```

As duas frentes são independentes: o Radar de convênios (SICONV, legado) tem triagem humana e entra na carteira; as propostas do TransfereGov só são listadas e avisadas, sem fluxo de aprovação. A chave de deduplicação é `id_proposta` do TransfereGov, nunca comparada com número de convênio do SICONV (universos disjuntos).

## 12. Workflow, cron e proteções

```mermaid
flowchart TB
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef erro fill:#FBE9E7,stroke:#C62828,color:#5a1010

    GATE{"Cron 09:30 UTC (06:30 Brasília)<br/>ou disparo manual"}:::regra -->|"cron sem vars.ATUALIZACOES_RADAR_ATIVAS = true"| PARA["Não roda"]:::erro
    GATE -->|"liberado"| CRED["Exige DATABASE_URL e chave do Portal<br/>no environment Production"]:::regra
    CRED --> PRE["Pré-voo: schema, destino e permissões runtime"]:::job
    PRE --> T1["descoberta-transferegov"]:::job
    T1 --> T2["siconv (convênios conhecidos)"]:::job
    T2 --> T3["transferegov (parcerias monitoradas)"]:::job
    T3 --> T4["descoberta-siconv (Radar)"]:::job
    T4 --> T5["vigencia (alertas de fim de vigência)"]:::job
    EXE["Executor exige role sigeo_runtime,<br/>host Neon e trava de sessão (CHAVE_LOCK)"]:::regra -.-> T1
    CONC["Grupo de concorrência sigeo-production-database,<br/>sem cancelar em andamento; limite de 120 min"]:::regra -.-> GATE
```

Cada tarefa roda só se o pré-voo passou e não foi cancelada; no disparo manual dá para escolher uma tarefa só. Uma tarefa que falha não impede as seguintes (usam `!cancelled()`).

Conferido em 21/11/2026: a variável `ATUALIZACOES_RADAR_ATIVAS` está `true`, então o Radar roda sozinho em produção todo dia às 06:30 de Brasília (o CLAUDE.md antigo dizia o contrário e foi corrigido).

Estado observado em produção: a tarefa `descoberta-siconv` termina como parcial todos os dias desde 27/10 (24 rodadas). A causa era o registro vazio do `7AAFSX` no Portal, recusado pelo contrato rígido. O bloco 3 corrige isso (commit `4412c81`), mas só vale depois do release. Até lá a rodada continua vermelha, sem corromper dado.

## 13. API

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /candidatos-legados` | gestor, admin | Lista paginada (seção 10) |
| `GET /candidatos-legados/{id}/prova` | gestor, admin | Resumo da prova da última recaptura e validade (sempre só leitura) |
| `POST /candidatos-legados/{id}/aprovacoes` | gestor, admin | Aprovação com técnico titular (seção 9) |
| `POST /candidatos-legados/{id}/decisoes` | gestor, admin | `iniciar_analise` ou `rejeitar` |
| `GET /candidatos-legados/{id}/historico` | gestor, admin | Decisões em ordem, paginadas |
| `GET /notificacoes` | qualquer logado não leitor | Lista do usuário, com `destino` calculado, busca, tipo, caixa e paginação |
| `PATCH /notificacoes/{id}` | destinatário | Marca como lida |
| `PATCH /notificacoes/lidas` | destinatário | Marca todas como lidas |
| `PATCH /notificacoes/{id}/arquivo` | destinatário | Arquiva ou restaura |
| `GET /fontes/capturas` | qualquer logado | Detalhe para admin, só data do último sucesso para os demais |
| `GET /propostas-candidatas` | qualquer logado | Lista do TransfereGov |

Toda rota mutável exige o cabeçalho CSRF (`X-CSRF-Token`). As sequências de chamadas estão na seção 17.

## 14. Segurança, trava e concorrência

- Ordem de trava: lote, depois candidato (decisões, recaptura e aprovação seguem a mesma ordem), para evitar impasse.
- Decisão e aprovação conferem `versao` e `captura_id` do candidato: se mudou desde que a tela carregou, 409.
- Idempotência por chave (UUID gerado no front) em decisão e aprovação; recaptura por horário de início.
- Decisões são imutáveis por trigger no banco; corrigir é decidir de novo, nunca editar.
- Prova só vale por 24 horas e só se o hash bater com a captura. A consulta da prova nunca grava.
- Revalidação esconde, nunca rejeita: quem some do escopo some da fila, mas a decisão humana continua soberana.

## 15. Avisos do espelho SICONV e popup de detalhe

O job `siconv` (convênios já conhecidos) compara o dump novo com o último dado e avisa mudança real em instrumento monitorado.

```mermaid
flowchart TB
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef aviso fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    J["job siconv<br/>convênios conhecidos"]:::job --> CMP["Compara campos e tabelas filhas<br/>com o último dado confirmado"]:::regra
    CMP --> ID{"Campo identificador?<br/>NR_ e UG_RESPONSAVEL"}:::regra
    ID -->|"sim"| CAN["Forma canônica: sem ponto, barra, hífen<br/>e espaço, sem zeros à esquerda"]:::regra
    ID -->|"não"| EX["Igualdade exata:<br/>valores, datas e textos"]:::regra
    CAN --> DIF{"Mudança real?"}:::regra
    EX --> DIF
    DIF -->|"não"| NADA["Sem aviso"]:::regra
    DIF -->|"sim"| QTD{"Convênios alterados na rodada"}:::regra
    QTD -->|"até 10"| IND["Aviso individual a titular, suplente,<br/>gestor e admin"]:::aviso
    QTD -->|"mais de 10"| GR["Individual só a titular e suplente dos seus<br/>mais um resumo único a gestor e admin"]:::aviso
```

Motivo da forma canônica: a fonte alternava `000.969` e `969` (e `02` e `002`), e cada alternância virava aviso, entre 80 e 110 por dia. `969` e `970` continuam diferentes. Instrumento sem titular nem suplente não recebe aviso individual na rodada grande; a gestão o vê no resumo. O resumo usa `chave_dedup` com prefixo `siconv-resumo:` e não tem destino, porque não pertence a um instrumento só. O leitor nunca recebe.

O texto do aviso agora vem em linhas: campos do convênio, depois um bloco por tabela filha com os registros alterados e até 5 registros novos detalhados.

```mermaid
sequenceDiagram
    actor U as Colaborador
    participant S as Sino ou Central
    participant A as API notificacoes
    participant P as Popup de detalhe
    U->>S: clica no aviso de atualização oficial
    S->>A: PATCH marca como lida, com CSRF
    A-->>S: ok
    S->>P: abre com título, tipo, data e texto em linhas
    U->>P: lê campos alterados e registros novos
    alt aviso tem destino
        U->>P: Abrir instrumento
        P->>S: fecha o popup e navega
    else resumo da rodada
        Note over P: sem destino, só o botão Fechar
    end
```

Só `atualizacao_api` com texto abre o popup; os demais tipos seguem indo direto ao registro. Aviso antigo, gravado numa linha só, é quebrado por campo no popup.

## 16. Fontes externas e suas APIs

```mermaid
flowchart LR
    classDef ext fill:#E8EEF9,stroke:#2A4D9B,color:#1a2f5e
    classDef job fill:#EEE,stroke:#777,color:#333,stroke-dasharray:4 3
    classDef dado fill:#F3EAF7,stroke:#7B3FA0,color:#40205a

    SIC["Dump SICONV (TransfereGov)<br/>api-publica.transferegov.gestao.gov.br<br/>/downloads/dadosgov/*.zip<br/>atualizado todo dia"]:::ext
    POR["Portal da Transparência<br/>GET /convenios/numero<br/>cabeçalho chave-api-dados<br/>um número por consulta"]:::ext
    TGR["TransfereGov relacional<br/>programas, propostas, parcerias<br/>paginado"]:::ext
    SIC --> J1["descoberta-siconv<br/>convenio, proposta, plano, programa,<br/>programa_proposta"]:::job
    POR --> J1
    SIC --> J2["siconv (espelho)<br/>convenio + empenho, desembolso, licitacao,<br/>termo_aditivo, pagamento"]:::job
    TGR --> J3["descoberta-transferegov<br/>e transferegov (parcerias monitoradas)"]:::job
    SIC --> J4["recaptura<br/>só clone local"]:::job
    POR --> J4
    J1 --> BD1[("candidato_legado")]:::dado
    J2 --> BD2[("convenio.siconv_raw<br/>avisos atualizacao_api")]:::dado
    J3 --> BD3[("proposta_candidata<br/>espelho das parcerias")]:::dado
    J4 --> BD4[("candidato_legado_recaptura")]:::dado
```

Limites conhecidos das fontes: o Portal responde 404 ou lista vazia para convênio ainda não publicado nele (`nao_encontrado`) e pode devolver registro com campos vazios (`7AAFSX`); o SICONV não é o gargalo, porque o dump é diário. O catálogo oficial atual é o do Comunicado TransfereGov 23/2026; não há fallback ao repositório descontinuado, porque HTTP 200 não prova frescor.

## 17. Fluxos de API (sequências)

**Triagem e aprovação.**

```mermaid
sequenceDiagram
    actor G as Gestor ou admin
    participant UI as Central Radar
    participant API as API candidatos-legados
    participant DB as Banco
    G->>UI: abre a aba Aguardando
    UI->>API: GET lista, com página, busca e situação
    API->>DB: fila oficial confirmada
    API-->>UI: itens com versao e captura_id
    G->>UI: Aprovar
    UI->>API: GET prova do candidato
    API-->>UI: prova e validade de 24 horas
    G->>UI: escolhe o técnico titular
    UI->>API: POST aprovacoes, com CSRF e chave UUID
    API->>DB: transação única da seção 9
    alt prova vencida ou candidato mudou
        API-->>UI: 409
    else tudo confere
        API-->>UI: aprovado
        UI->>UI: invalida Radar, monitoramento e notificações
    end
```

**Rejeição e histórico.**

```mermaid
sequenceDiagram
    actor G as Gestor ou admin
    participant UI as Card do candidato
    participant API as API candidatos-legados
    G->>UI: Rejeitar com justificativa
    UI->>API: POST decisoes, situação rejeitado, versão e chave UUID
    alt versão velha
        API-->>UI: 409 O candidato mudou
    else mesma chave repetida
        API-->>UI: devolve a decisão anterior
    else ok
        API-->>UI: decisão registrada, imutável
    end
    G->>UI: abre o histórico
    UI->>API: GET historico paginado
    API-->>UI: decisões em ordem
```

**Monitor da coleta e alerta de fonte.**

```mermaid
sequenceDiagram
    participant J as Job do workflow
    participant C as captura da fonte
    participant DB as Banco
    actor A as Admin
    actor O as Outros perfis
    J->>C: executa a rodada
    C->>DB: grava FonteCaptura ok, parcial ou erro
    alt status diferente de ok
        C->>DB: aviso fonte_indisponivel a gestor e admin, no máximo 1 a cada 24 h
    end
    A->>DB: GET fontes capturas
    DB-->>A: status, contagens, defasagem
    O->>DB: GET fontes capturas
    DB-->>O: só a data do último sucesso
```

O corpo do aviso `fonte_indisponivel` é substituído por texto genérico na fronteira pública, porque capturas antigas podem ter guardado exceção crua.

**Notificações.**

```mermaid
sequenceDiagram
    actor U as Usuário não leitor
    participant UI as Sino e Central
    participant API as API notificacoes
    U->>UI: abre o sino
    UI->>API: GET lista, a cada 60 segundos
    API-->>UI: itens do usuário com destino calculado
    U->>UI: abre um aviso
    UI->>API: PATCH marca como lida
    U->>UI: arquiva ou restaura
    UI->>API: PATCH arquivo
    U->>UI: marcar todas
    UI->>API: PATCH lidas
```

## 18. Radar antes do Portal (implementado em 22/11/2026)

O Portal é necessário para **recapturar e aprovar**, porque a recaptura traz convenente, município e data do Portal, e esses campos são gravados uma vez na aprovação. Para **enxergar** o candidato ele só atrasava, porque o SICONV já traz assinatura e publicação e o Portal repete a mesma data. Por isso a confirmação deixou de esconder o candidato e continua travando a aprovação.

```mermaid
flowchart TB
    classDef regra fill:#FFF4DD,stroke:#C98A00,color:#5a3d00
    classDef nao fill:#FBE9E7,stroke:#C62828,color:#5a1010
    classDef ok fill:#EAF6EC,stroke:#2E7D32,color:#1b4d1e

    subgraph ANTES["Antes"]
        H1["SICONV: candidato descoberto"]:::regra --> H2{"Portal confirmou?"}:::regra
        H2 -->|"não"| H3["Invisível: fora da fila, do contador e do aviso"]:::nao
        H2 -->|"sim"| H4["Fila, contador, aviso"]:::ok
    end
    subgraph AGORA["Agora"]
        P1["SICONV: candidato descoberto"]:::regra --> P2["Fila, contador e aviso na hora.<br/>Selo Portal pendente com a idade em dias"]:::ok
        P2 --> P3{"Portal confirmou?"}:::regra
        P3 -->|"não"| P4["Rejeitar liberado.<br/>Aprovar desabilitado na tela e recusado na API (409)"]:::nao
        P3 -->|"sim"| P5["Recaptura e aprovação"]:::ok
    end
```

O que mudou no código:

- A fila e o contador deixaram de exigir `confirmacao_portal = 'confirmado'`. O modo diagnóstico (listagem sem `somente_oficiais`) foi removido em 22/11/2026: a lista é sempre só a descoberta oficial.
- O aviso `convenio_descoberto` sai na primeira descoberta oficial, sem esperar o Portal, e uma vez só: a confirmação posterior não repete (`numeros_ja_descobertos_oficialmente`). Os candidatos que já existiam em produção não geram aviso retroativo.
- O card mostra o selo "Portal pendente · há N dias" (contado da descoberta) enquanto a análise está aberta.
- O botão Aprovar aparece desabilitado até o Portal confirmar. A API também recusa: `preparar_revisao` devolve 409 com "Aprovar exige a confirmação do convênio no Portal da Transparência", mesmo que alguém chame a rota direto.
- A recaptura continua exigindo a confirmação (`preparar_alvo_coleta`).

Por que não aprovar antes do Portal: o cadastro nasceria sem convenente, CNPJ, município, UF, região e ano, que alimentam filtros, mapa, relatórios e o cruzamento com o CNES. O espelho diário só atualiza campos do SICONV e nada preencheria esses buracos depois. A aba "Aguardando Portal" do plano deixou de ser necessária, porque o selo e a idade ficam na própria fila.

> [!warning] A confirmar
> A aprovação segue travada enquanto a recaptura não rodar em produção (seção 7).

### Revisão 3: três estados, não um

"Portal confirmou" e "pode aprovar" são coisas diferentes. O candidato passa por três estados independentes:

| Estado | Quem decide | Onde aparece |
| --- | --- | --- |
| Publicação confirmada | Rodada da descoberta (Portal) | Selo "Portal pendente" some |
| Prova vigente | Recaptura de até 24 h (`VALIDADE_RECAPTURA`) | Campo "Recaptura" no card; sem prova, Aprovar fica desabilitado com o motivo ("Prova ausente" ou "Prova vencida") |
| Aprovado | Decisão humana, transação única | Situação "Aprovado" |

- O card separa "Descoberto em" (primeira vez no SICONV) de "Recaptura" (última prova oficial, `recaptura_em`). A tela só antecipa o bloqueio: quem decide é a API, que devolve 409 se a prova faltar ou estiver vencida, antes do POST.
- Contrato do Portal inconclusivo (campo vazio, timeout): a confirmação usa só `codigo` e `dataPublicacao`, então um registro esqueleto não derruba a rodada nem adia revalidações. O estado `inconclusivo` do plano não foi implementado.
- A revalidação do job diário usa o snapshot do SICONV. O script `job_revalidacao_legado_local` é separado e roda só em clone local.
- Rejeitar trava o candidato (situação terminal).
- A medição de 5 a 22 dias entre SICONV e Portal vem da amostra de 12 confirmados em produção (inclui `7AAIPN`, de 13/11 para 18/11); não é garantia.
- Seção 15: a comparação canônica vale para os campos identificadores; a chave do registro (`NR_MOV_FIN`) segue em texto cru (produção: 0 casos de pontuação ou zero à esquerda em 1.664 chaves). O limite de 10 conta instrumentos monitorados com aviso elegível. O resumo da rodada (`siconv-resumo:`) não some quando o instrumento usado como âncora sai do escopo.
- Implementado nos commits 948d642 (documentação) e 5c5641e (código) e nos desta revisão.

## 19. Registro de funcionalidades (para a equipe marcar)

| Funcionalidade | Estado no código | Equipe confirma |
| --- | --- | --- |
| Descoberta diária SICONV com escopo do Ministério da Saúde | Ativa no workflow, condicionada à variável | |
| Confirmação no Portal da Transparência | Ativa | |
| Baseline silenciosa na primeira carga | Ativa | |
| Aviso `convenio_descoberto` a gestor e admin | Ativa | |
| Botão Radar e contador de novos (gestor, admin) | Ativa | |
| Busca, abas Aguardando e Arquivados, paginação | Ativa | |
| Card com valor, UF, município, datas e Itens · n | Ativa | |
| Rejeitar com justificativa e histórico | Ativa | |
| Iniciar análise | API existe; sem botão na tela | |
| Aprovar com técnico titular, entrada no monitoramento | Ativa | |
| Pop-up de inclusão para o técnico | Ativa | |
| Monitor da coleta por papel | Ativa | |
| Recaptura (valor, itens, prova) | Só em clone local | |
| Revalidação (esconde falso positivo) | Só em clone local | |
| Aba Propostas em tramitação | Código pronto, desabilitada na tela | |
| Comparação canônica de identificadores do SICONV | Implementada em 22/11, só em commit local | |
| Popup de detalhe da atualização oficial (sino e Central) | Implementado em 22/11, só em commit local | |
| Resumo único para a gestão acima de 10 convênios | Implementado em 22/11, só em commit local | |
| Confirmação do Portal só com código e data | Implementada em 22/11, só em commit local | |
| Fila, contador e aviso sem esperar o Portal; selo Portal pendente; Aprovar travado até confirmar (seção 18) | Implementado em 22/11, só em commit local | |
| Aba Aguardando Portal | Dispensada: o selo e a idade ficam na própria fila | |
| Job de descoberta TransfereGov e avisos de proposta | Ativo no workflow | |

## 20. Código sem uso

- Removidos em 22/11/2026: `descobrir_legado` (só os testes o chamavam), o script `diagnosticar_descoberta_siconv.py` (diagnóstico sobre snapshot local, sem referência em workflow ou documentação), o modo diagnóstico da lista e a origem `snapshot_local` do contrato da API. O CHECK do banco ainda admite `snapshot_local` e as guardas de linha legada nos serviços ficam até uma migration estreitar o CHECK (produção tem só `siconv_oficial`: 31 capturas).
- Ação `iniciar_analise` e estado `em_analise`: a API aceita, a tela não tem mais o botão. O estado ainda aparece na aba Aguardando. Decidir se vira código a remover ou se volta para a tela.
- Aba "Propostas em tramitação": carrega a lista sob demanda, mas fica desabilitada. Hoje a aba não é alcançável pelo usuário.
- `Notificacao.lida` está obsoleta; o escopo por destinatário vale (`NotificacaoDestinatario`).

## 21. Limites desta análise

- Não executei o job contra o SICONV ou o Portal; o mapa vem da leitura do código e dos testes.
- A ausência de recaptura em produção vem de contagem no banco em 21/11/2026 (0 linhas); não sei se alguém a roda fora do banco de produção.
- A causa do lote de 9 candidatos descobertos em 17/11 não foi determinada (não é código nem frescor do dump); faltam os dumps daqueles dias.
- A espera do Portal é medida com checagem diária, com margem de 1 dia.
- Os componentes `candidato-legado-aprovacao.tsx`, `candidato-legado-historico.tsx`, `candidato-legado-item.tsx` e `candidato-legado-itens-dialog.tsx` foram descritos a partir dos hooks, do serviço e do mapa do monitoramento, sem releitura linha a linha nesta revisão.
- O comportamento de rede (tempos, limites do Portal) não está no código e não entra aqui.
