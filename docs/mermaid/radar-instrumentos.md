# Mapa do Radar de instrumentos (revisão 1, de 21/11/2026)

Objetivo: servir de base para a equipe validar o fluxo do Radar e apontar funcionalidade ou código sem uso. Tudo aqui foi lido do código da branch `feat/persus-ii-fora-do-monitoramento` (estado de 21/11/2026). Os diagramas usam Mermaid e renderizam no Obsidian, no GitHub e no VS Code.

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
    CONF --> OK{"Contrato do Portal válido?"}:::regra
    OK -->|"não"| INC["confirmações_inconclusivas<br/>rodada parcial; revalidações adiadas"]:::erro
    OK -->|"sim"| LIM{"Candidatos acima do limite (1000)?"}:::regra
    INC --> LIM
    LIM -->|"sim"| ERRO["ValueError: lote não aplicado"]:::erro
    LIM -->|"não"| PUB["publicar_ciclo<br/>uma transação: descoberta + inelegibilidades + avisos"]:::dado
    PUB --> CONFL{"Conflito de revisão (ConflictError)?"}:::regra
    CONFL -->|"sim"| CR["publicacao = conflito_revisao<br/>nada gravado"]:::erro
    CONFL -->|"não"| FIM["Rodada concluída<br/>(parcial levanta erro no fim)"]:::job
```

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

    C["confirmar_no_portal<br/>por número do convênio"]:::regra --> S1["nao_consultado"]:::regra
    C --> S2["nao_encontrado"]:::nao
    C --> S3["sem_publicacao"]:::nao
    C --> S4["confirmado<br/>com data_publicacao do Portal"]:::ok
    S4 --> USO["Só confirmado entra na fila oficial<br/>e permite aprovar"]:::ok
    S1 -. "mantém 'confirmado' anterior se o critério for o mesmo" .-> S4
```

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
    AV -->|"critério v2, órgão 36000, Portal confirmado,<br/>com data, origem oficial, ainda não avisado,<br/>e rodada não é baseline"| N["Notificação a gestor e admin ativos<br/>sem destino (triagem é no Radar)"]:::aviso
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

> [!warning] A confirmar
> Os scripts de recaptura e revalidação declaram em docstring que rodam só em clone local e que a automação de produção não está habilitada. Se a recaptura não roda em produção, a aprovação em produção depende de alguém rodá-la à mão antes, porque sem prova de até 24 h a aprovação é recusada. Confirmar com a equipe como isso é operado hoje.

## 8. Estados do candidato e decisões

```mermaid
stateDiagram-v2
    [*] --> novo: descoberto e confirmado
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
    RP -->|"não"| REV["preparar_revisao: estado novo ou em análise,<br/>versão e captura iguais, fora da carteira,<br/>descoberta oficial, recaptura mais recente,<br/>rodada siconv_recaptura ok e dentro de 24 h,<br/>hash igual, projeção igual à prova"]:::regra
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

    Q["GET /candidatos-legados<br/>pagina, tamanho_pagina 1 a 50 (padrão 10),<br/>busca até 100, confirmacao, situacao[]"]:::tela --> BASE["Base da fila:<br/>elegível e (sem critério ou Portal confirmado)"]:::regra
    BASE --> F1["Fora quem já é convênio conhecido<br/>(tipo Convênio ou sem tipo)"]:::regra
    F1 --> F2["Fora quem já é monitorado"]:::regra
    F2 --> F3["somente_oficiais: critério v2,<br/>órgão 36000, Portal confirmado,<br/>origem siconv_oficial"]:::regra
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

Estado observado nas rodadas de 19 a 21/11: a tarefa `descoberta-siconv` termina como parcial todos os dias, porque o Portal da Transparência devolve para o convênio `7AAFSX` um registro com número e objeto vazios (contrato inválido). Oito candidatos ficam sem confirmação e as revalidações são adiadas. Nenhum dado é corrompido, mas a rodada conta como falha.

## 13. API

| Rota | Quem | O que faz |
| --- | --- | --- |
| `GET /candidatos-legados` | gestor, admin | Lista paginada (seção 10) |
| `GET /candidatos-legados/{id}/prova` | gestor, admin | Resumo da prova da última recaptura e validade (sempre só leitura) |
| `POST /candidatos-legados/{id}/aprovacoes` | gestor, admin | Aprovação com técnico titular (seção 9) |
| `POST /candidatos-legados/{id}/decisoes` | gestor, admin | `iniciar_analise` ou `rejeitar` |
| `GET /candidatos-legados/{id}/historico` | gestor, admin | Decisões em ordem, paginadas |
| `GET /fontes/capturas` | qualquer logado | Detalhe para admin, só data do último sucesso para os demais |
| `GET /propostas-candidatas` | qualquer logado | Lista do TransfereGov |

Toda rota mutável exige o cabeçalho CSRF (`X-CSRF-Token`).

## 14. Segurança, trava e concorrência

- Ordem de trava: lote, depois candidato (decisões, recaptura e aprovação seguem a mesma ordem), para evitar impasse.
- Decisão e aprovação conferem `versao` e `captura_id` do candidato: se mudou desde que a tela carregou, 409.
- Idempotência por chave (UUID gerado no front) em decisão e aprovação; recaptura por horário de início.
- Decisões são imutáveis por trigger no banco; corrigir é decidir de novo, nunca editar.
- Prova só vale por 24 horas e só se o hash bater com a captura. A consulta da prova nunca grava.
- Revalidação esconde, nunca rejeita: quem some do escopo some da fila, mas a decisão humana continua soberana.

## 15. Registro de funcionalidades (para a equipe marcar)

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
| Job de descoberta TransfereGov e avisos de proposta | Ativo no workflow | |

## 16. Código sem uso

- `descobrir_legado` em `backend/app/services/descoberta_legado.py`: só os testes o chamam (`tests/test_descoberta_legado.py`). O fluxo de produção usa `descobrir_prioritarios_ms`. Candidato a remoção junto com o teste; `confirmar_no_portal` do mesmo arquivo continua em uso.
- Ação `iniciar_analise` e estado `em_analise`: a API aceita, a tela não tem mais o botão. O estado ainda aparece na aba Aguardando. Decidir se vira código a remover ou se volta para a tela.
- Aba "Propostas em tramitação": carrega a lista sob demanda, mas fica desabilitada. Hoje a aba não é alcançável pelo usuário.
- `Notificacao.lida` está obsoleta; o escopo por destinatário vale (`NotificacaoDestinatario`).

## 17. Limites desta análise

- Não executei o job contra o SICONV ou o Portal; o mapa vem da leitura do código e dos testes.
- Não verifiquei se a recaptura é rodada em produção por alguém (ver aviso na seção 7).
- Os componentes `candidato-legado-aprovacao.tsx`, `candidato-legado-historico.tsx`, `candidato-legado-item.tsx` e `candidato-legado-itens-dialog.tsx` foram descritos a partir dos hooks, do serviço e do mapa do monitoramento, sem releitura linha a linha nesta revisão.
- O comportamento de rede (tempos, limites do Portal) não está no código e não entra aqui.
