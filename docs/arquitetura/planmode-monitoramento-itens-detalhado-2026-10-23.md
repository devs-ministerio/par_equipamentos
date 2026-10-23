# Monitoramento por item e unidade — plano detalhado (23/10/2026)

Detalha, etapa por etapa, o [plano de monitoramento por item](planmode-monitoramento-itens-equipamentos-2026-10-20.md) com as respostas do usuário de 23/10. Posição na ordem geral: trilha B do [plano unificado](planmode-homologacao-unificado-2026-10-23.md). Base de dados: [inventário](inventario-itens-equipamento-2026-10-22.md), medido na cópia de 17/10 (não é a produção). **Nada aqui foi implementado.** Tudo acontece na `homologacao`; cada etapa é um PR com base nela.

## 0. Decisões fechadas

| # | Decisão do usuário (23/10) | Consequência |
|---|---|---|
| 1 | Controlam-se por unidade só **16 famílias**: Mamógrafo (convencional e digital), Colposcópio, Sistema de Vídeo Endoscópio Flexível, Sistema de Vídeo Endoscopia Rígida, Endoscópio Rígido, Endoscópio Flexível (Fibroendoscopia), Ultrassom Diagnóstico sem Aplicação Transesofágica, Simulador/Tomógrafo para Radioterapia, Tomógrafo Computadorizado (até 16 canais), Ressonância Magnética, PET-CT, Câmara Cintilográfica (Gama Câmara), Acelerador Linear, Braquiterapia, Arco Cirúrgico, Cirurgia Robótica. **O catálogo precisa ser atualizado** (etapa 1). |
| 2 | Unidade não é pré-criada: nasce na entrega. | A entrega mostra os itens do instrumento para o colaborador selecionar; ver etapa 5. A **tabela de equipamentos fica abaixo do Cadastro Interno** (decisão de 23/10, que prevalece sobre a primeira versão deste plano). |
| 3 | **Toda entrega vincula pelo menos um equipamento, podendo selecionar mais de um.** | Regra de validação obrigatória no backend e na tela. |
| 4 | Cargas manuais recebem um **ID criado pelo sistema**. | Identificador sintético estável (etapa 2). |
| 5 | Vínculo automático só quando é inequívoco; o resto fica "a revisar", **com alerta aos técnicos responsáveis**. | Backfill conservador e aviso por notificação (etapa 3). |
| 6 | Quem registra: a regra de hoje (titular, suplente, gestor e admin). | Sem mudança de autorização. |
| 7 | Prazos: D−1, D0 e D+1, 08:00 de São Paulo. | Etapa 8. |
| 8 | NUP só em FAF e TED, formatado `25000.198305/2024-59`. | Etapa 7. |
| — | Cargas manuais valem quantidade 1; itens `OBRA`/`SERVICO` ficam fora (PR #38). | Já decidido. |
| 9 | **Cargas manuais devem ser ligadas a um código de catálogo quando for possível.** | Etapa 1 (tabela RENEM) e etapa 3 (vínculo por código, nome idêntico ou revisão). |
| 10 | A lista de 16 também define o conceito de **Prioritário**; Ultrassom só a variante "sem Aplicação Transesofágica"; acessórios excluídos; série opcional e única dentro do item; entrega acima do planejado bloqueada. | Respostas 1, 2, 3, 5 e 6 de 23/10, todas "de acordo". |
| 11 | **Cirurgia Robótica = código `012005`, "Sistema Cirúrgico Robótico"**, que **não consta** da lista RENEM. | Entra como código local no catálogo. |

**Esclarecimento sobre "série":** é o **número de série do aparelho** (o que vem gravado na placa), e não "série histórica". Cada unidade tem marca, modelo, número de série e vida útil.

### Perguntas (todas respondidas em 23/10)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | A lista de 16 vira o "Prioritário"? | Sim |
| 2 | Ultrassom: só a variante da lista? | De acordo |
| 3 | Excluir acessórios que citam o equipamento? | Concordo |
| 4 | Código da Cirurgia Robótica? | `012005`, "Sistema Cirúrgico Robótico" (fora da RENEM) |
| 5 | Série opcional e única dentro do item? | De acordo (a pergunta 5 do usuário confirmou o formato) |
| 6 | Entrega acima do planejado bloqueada? | Concordo |

Também ficou verificado que **não há API pública da RENEM** que o projeto use (nenhuma integração no código; busca na web sem resultado); a fonte é a planilha `data/raw/Lista.Renem_.Site_.FNS_030326-1.xlsx` (RENEM de 03/03/2026, 840 itens).

## 1. Etapa 1 — Catálogo oficial por código (pré-requisito de tudo)

**Por que:** hoje o catálogo tem 5 prioritários e 163 linhas, das quais **147 são geradas automaticamente por item** (`item_plano_<hash>`, inclusive descrições de obra). A classificação é por palavra-chave (`Ressonância` casa com acessórios; `Tomógrafo` mistura simulador e tomógrafo; `Endoscopia` reúne quatro equipamentos distintos). Os itens do SICONV trazem um **código de catálogo** no início da descrição (`010925-Mamógrafo Digital`, `000277-Mamógrafo Convencional`, `000595-Câmara Cintilográfica (Gama Câmara)`, `011422-Ultrassom …`). Classificar pelo código é exato.

**O que se faz:**
1. **Migração aditiva** em `equipamento_catalogo`: colunas `controle_por_unidade BOOLEAN NOT NULL DEFAULT false` e `nome_oficial TEXT`. Nenhuma linha removida.
2. **Nova tabela `renem_item`** com a lista oficial (`codigo_item` de 6 dígitos, `nome`, `definicao`, `classificacao`, `valor_sugerido`, `item_dolarizado`, `versao_lista`, `catalogo_id FK NULL`), carregada por script idempotente a partir de `data/raw/Lista.Renem_.Site_.FNS_030326-1.xlsx` (840 itens; a planilha é versionada com o repositório e cada nova edição da lista entra como nova `versao_lista`, sem apagar a anterior). Os 16 itens/famílias do usuário apontam para o catálogo. Códigos **que aparecem nos dados mas não estão na RENEM atual** (legados, por exemplo `000277` Mamógrafo Convencional, `010933`, `010911` e `010910` de aceleradores, `010874` Tomógrafo 16 cortes) e o código local `012005` entram numa tabela `codigo_item_legado` (`codigo_item`, `nome_visto`, `catalogo_id`, `origem` = `dados` ou `usuario`), revisada pelo usuário. A tabela do próximo item (`equipamento_item_oficial`) fica **substituída** por estas duas.
3. (Mapeamento que o seed deve conter, por família, a revisar:) (`id`, `codigo_item TEXT`, `nome_oficial TEXT`, `catalogo_id FK`, `ativo`, `UNIQUE(codigo_item, nome_oficial)`), semeada por migração/seed com os códigos observados nos dados:

   | Família | Códigos e nomes vistos na base |
   |---|---|
   | Mamógrafo | `010925` (Mamógrafo / Digital), `000277` (Convencional) |
   | Colposcópio | `000378` |
   | Vídeo Endoscopia Flexível | `011268` |
   | Vídeo Endoscopia Rígida | `010254` (inclui "Vídeo Laparoscopia/ Endoscopia Rígida") |
   | Endoscópio Rígido | `000547` |
   | Endoscópio Flexível (Fibroendoscopia) | `010138` |
   | Ultrassom sem Transesofágica | `011422` "…sem Aplicação Transesofágica" |
   | Simulador/Tomógrafo para Radioterapia | `000719` |
   | Tomógrafo Computadorizado (até 16 canais) | `011804`, `011805` |
   | Ressonância Magnética | `010889` |
   | PET-CT | `000301` |
   | Câmara Cintilográfica | `000595` |
   | Acelerador Linear | `010933`, `010911`, `010910`, `011806`, `011807` |
   | Braquiterapia | `010547` |
   | Arco Cirúrgico | `000253` |
   | Cirurgia Robótica | **sem código ainda** (pergunta 4) |

   A tabela é revisada pelo usuário antes de entrar: códigos ambíguos (por exemplo `010400-Sistema de Vídeo Endoscopia`, sem "flexível" nem "rígida") ficam **sem família** e aparecem num relatório de não classificados.
4. **Classificador (`app/equipamentos.py`)**: primeiro casa o prefixo numérico contra `equipamento_item_oficial`; só na falta de código usa o nome normalizado exato (itens de carga manual, que não têm código); o casamento por palavra solta passa a ser o último recurso e **nunca** marca família com controle por unidade. Lista de exclusão de acessórios (pergunta 3).
5. **Reclassificação** dos marcadores existentes por script idempotente (`--simulacao` por padrão), que também **desativa** as linhas `item_plano_*` sem marcador, sem apagar.
6. **Filtro "Prioritários"** passa a usar a lista de 16 (se a pergunta 1 for aprovada); ajustar o front (`lib/equipamento-tags.ts`) e os relatórios.

**Testes:** casamento por código para cada família e cada código acima; os acessórios de ressonância e a lavadora de endoscópio **não** classificam; idempotência da reclassificação; item sem código cai em não classificado.
**Aceite:** relatório de não classificados revisado pelo usuário; contagem por família confere com o inventário (~740 itens e ~800 unidades nas 15 famílias com dado; cirurgia robótica zerada).
**Rollback:** a migração é aditiva; reverter o código volta à classificação anterior; marcadores antigos não são apagados (guardam a origem).

## 2. Etapa 2 — Modelo de dados (expand)

Tudo em migração aditiva, `sigeo_migration` como dono, permissões garantidas pelo `migrar_banco.yml`.

**`item_plano`** — o item planejado, projeção do que a fonte informa:
`id`, `convenio_id FK`, `instrumento_id FK NULL`, `origem` (`siconv` | `transferegov` | `manual`), `id_origem TEXT` (`ID_ITEM_PAD`, `id_item_proposta` ou ID sintético), `codigo_item` (6 dígitos, NULL quando a equipe ainda não definiu), `codigo_fonte` (`descricao` | `nome_renem` | `definido_pela_equipe`), `descricao`, `catalogo_id FK NULL`, `controla_unidade BOOLEAN`, `quantidade_planejada INTEGER NULL`, `ativo BOOLEAN`, `removido_na_fonte_em TIMESTAMPTZ NULL`, `hash_conteudo`, `criado_em`, `atualizado_em`. `UNIQUE(origem, id_origem)`; `CHECK quantidade_planejada >= 1`; índices por `instrumento_id`, `convenio_id` e `catalogo_id`. Populada pelo script da etapa 3 a partir de `siconv_raw`, e mantida pela recaptura **sem nunca tocar nas unidades**: item removido na fonte vira `ativo=false` e gera conciliação.

**`entrega_equipamento`** — o ato de entrega (1 por registro, ligado à linha do tempo):
`id`, `instrumento_id FK`, `evento_id FK evento_marco` (o evento `cronograma_entrega`, para a fase e a timeline continuarem iguais), `data_ocorrencia DATE`, `observacao`, `autor_id FK user`, `chave_idempotencia UUID UNIQUE`, `criado_em`, `substituido_por_id`, `deletado_em`, `deletado_por_id`, `motivo_exclusao` (mesmo padrão append-only de `EventoMarco`: corrigir cria nova versão e aponta a antiga; excluir é soft delete com motivo).

**`unidade_equipamento`** — a unidade física:
`id`, `entrega_id FK`, `item_id FK item_plano`, `ordem INTEGER`, `marca`, `modelo`, `numero_serie NULL`, `vida_util_anos NULL`, `criado_em`. `UNIQUE(item_id, ordem)`; índice único parcial `(item_id, numero_serie) WHERE numero_serie IS NOT NULL`; `CHECK vida_util_anos >= 0`.

**`entrega_legada_revisao`** — fila das entregas antigas sem vínculo:
`id`, `instrumento_id`, `evento_id`, `motivo` (`varios_itens`, `sem_item_controlado`, `varias_entregas`, `quantidade_desconhecida`), `situacao` (`pendente`|`resolvida`), `resolvida_em`, `resolvida_por_id`, `entrega_id NULL`. `UNIQUE(evento_id)`.

**Regras no banco:** FKs reais, `ON DELETE RESTRICT` nas unidades; nada de JSON no lugar de relação; os campos `equipamento_marca/modelo/numero_serie/vida_util_anos` de `instrumento_equipamento` **permanecem** (deprecated, só leitura) até a etapa de contração, que só ocorre com aceite e plano de preservação. A regra "toda entrega tem pelo menos uma unidade" é validada no Service e coberta por teste; um `CONSTRAINT TRIGGER` diferido garante no banco (decisão técnica a confirmar no PR).

**Testes:** integração em PostgreSQL real (constraints, unicidade parcial, soft delete, `ON DELETE RESTRICT`); migração sobe e desce em banco descartável; `alembic check` sem deriva.
**Rollback:** `downgrade` remove as tabelas novas; como as legadas ficam intactas, nada se perde.

## 3. Etapa 3 — Projeção de itens, backfill e alerta aos técnicos

**3.1 Projeção de `item_plano`:** script idempotente (`scripts/projetar_itens_plano.py`, simulação por padrão, `--aplicar --confirmo-host`):
- Para cada convênio, lê `siconv_raw.itens_plano_aplicacao`, **ignora itens `OBRA`/`SERVICO`**, e grava por `ID_ITEM_PAD` (origem `siconv`).
- Itens de carga manual ganham `origem=manual` e `id_origem = manual:{numero_convenio}:{ordem}`, quantidade 1, sem ligação com a API. Os 22 itens manuais de "Convênio" que repetem a API **não** viram item.
- Classifica pelo catálogo da etapa 1; `controla_unidade` é verdadeiro só nas 16 famílias.
- Relatório: itens por origem e família, não classificados, descrição repetida entre itens.

**3.1.1 Vínculo de código nas cargas manuais** (pedido do usuário de 23/10). Para cada item manual, nesta ordem, e só quando o resultado é único:
1. **Código no texto** (`010925-Mamógrafo`, `10925 - Mamógrafo`, `301 - PET CT`): normaliza para 6 dígitos e confere em `renem_item` ou em `codigo_item_legado`.
2. **Nome idêntico** a um único item da RENEM (por exemplo "Mamógrafo", "Braquiterapia com sistema de controle remoto").
3. **Caso contrário**: o item recebe a **família** (pelo catálogo), `codigo_item = NULL` e o estado "código a definir". Nunca se escolhe um código por semelhança de valor ou de nome.

Estado medido na cópia de 17/10 (183 itens manuais): 21 com código no texto presente na RENEM, 7 com nome idêntico a um item da RENEM, 4 com código legado fora da RENEM, e **150 sem código possível**, dos quais 147 são "Acelerador Linear" de PERSUS I e II. Para esses a RENEM tem duas variantes (`011806` básico-intermediário e `011807` com IGRT 3D), então **a escolha é humana**: a tela do instrumento oferece ao titular, suplente, gestor e admin um seletor de código restrito à família, e a decisão fica registrada (`codigo_fonte = definido_pela_equipe`, autor e data). A lista de itens a definir sai também em relatório para a equipe fazer em lote. Como apoio, o relatório mostra, só como **sugestão não aplicada**, a variante cujo valor sugerido da RENEM é mais próximo do valor do instrumento.

Casos de dado a corrigir à parte: o item "Ultrasom + Mamógrafo" de um FAF descreve **dois** equipamentos num só texto (contradiz a regra de um equipamento por instrumento FAF/TED) e vai para revisão. Os 22 itens manuais de convênio, que repetem a API, não recebem código.

**3.2 Backfill das entregas antigas** (`scripts/vincular_entregas_legadas.py`, mesma disciplina): para cada instrumento com entrega ativa:
- Se tem **exatamente um item controlado e um evento de entrega ativo**, cria `entrega_equipamento` + uma `unidade_equipamento` com os campos físicos que já existem no instrumento. Quantidade planejada 1 é a regra; se for maior que 1, cria só a unidade de ordem 1 e deixa o item como "parcial".
- Em qualquer outro caso, **não atribui nada** e grava em `entrega_legada_revisao` com o motivo.
- Nunca "primeira unidade" por conveniência.

**3.3 Alerta aos técnicos:** novo tipo de notificação `entrega_legada_revisao` (um `ALTER TYPE ... ADD VALUE`, possível porque o `sigeo_migration` é o dono), criado por `criar_notificacao` com a regra de sempre: titular e suplente do instrumento mais gestor e admin ativos; sem titular, difusão. Um aviso **por instrumento** ("Entrega registrada antes do controle por unidade: vincule aos itens"), deduplicado, sem repetição diária. A tela do instrumento mostra o banner enquanto a revisão estiver pendente.

**Testes:** dry-run e aplicação reportam os mesmos números; segunda execução não muda nada; caso de vínculo único, de vários itens, sem item controlado e de duas entregas; o aviso chega só a quem deve e uma vez.
**Ensaio:** cópia local com a base de 17/10 e, antes do release, cópia restaurada de um backup de produção.

## 4. Etapa 4 — API e serviços

Padrão Router → Service → Repository, `DomainError`, autorização no Service (`assert_pode_editar_instrumento`), CSRF nas mutações, Pydantic no backend e Zod no frontend. Arquivos novos: `repositories/itens_equipamento.py`, `services/entregas_equipamento.py`, `schemas_entregas.py`, rotas em `routers/monitoramento.py` (ou `routers/entregas.py` se passar de 200 linhas).

| Rota | O que faz |
|---|---|
| `GET /monitoramento/instrumentos/{nr}/equipamentos` | itens com `controla_unidade`, planejado, entregue, situação (`pendente`, `parcial`, `entregue`, `legado_a_revisar`), última entrega e unidades; qualquer usuário autenticado lê |
| `POST /monitoramento/instrumentos/{nr}/entregas` | registra a entrega |
| `PATCH /monitoramento/unidades/{id}` | corrige marca, modelo, série ou vida útil (com `AuditLog` do antes e depois) |
| `DELETE /monitoramento/entregas/{id}` | soft delete com motivo obrigatório |
| `GET /monitoramento/entregas-legadas` | fila de revisão do técnico logado (gestor e admin veem todas) |
| `POST /monitoramento/entregas-legadas/{id}/vincular` | resolve a revisão escolhendo item e unidade |

**Corpo do `POST …/entregas`:**
```json
{
  "chave_idempotencia": "uuid",
  "data_ocorrencia": "2026-10-23",
  "observacao": "texto opcional",
  "itens": [
    {"item_id": 123, "quantidade": 2, "marca": "…", "modelo": "…", "vida_util_anos": 10,
     "series": ["ABC123", "ABC124"]}
  ]
}
```
**Validações no Service (nesta ordem):** instrumento existe (404); autorização por instrumento (403); **`itens` com pelo menos 1** (422, regra do usuário); cada `item_id` pertence ao instrumento e `controla_unidade` (422); `quantidade ≥ 1` e **≤ planejado − já entregue** (422; quantidade planejada desconhecida exige confirmação explícita); `len(series) ≤ quantidade` e sem repetição; reenvio com a mesma `chave_idempotencia` devolve o mesmo resultado, sem duplicar; tudo numa transação.
**Efeitos:** cria a `entrega_equipamento`, as unidades, o `EventoMarco` `cronograma_entrega` (mantém linha do tempo e fase), o `AuditLog`, e a notificação `edicao_manual` já existente. A **inauguração permanece única por instrumento** e independe das entregas parciais.
**Compatibilidade:** o formulário genérico de evento deixa de oferecer "Entrega no estabelecimento" (um caminho só) e a API antiga de evento continua aceitando o marco para não quebrar a versão anterior do front durante a janela de deploy; os campos `equipamento_*` do `PATCH` do instrumento ficam, marcados como deprecated.

**Testes:** unidade das validações; integração com PostgreSQL (transação, unicidade, concorrência de duas entregas do mesmo item, idempotência); autorização (titular, suplente, gestor, admin, colaborador de outro instrumento, leitor, IDOR em `item_id` de outro instrumento); contrato Pydantic/Zod; CSRF.

## 5. Etapa 5 — Tela do instrumento

**Posição:** a nova seção **"Equipamentos do instrumento" fica abaixo do "Cadastro interno"** (decisão de 23/10, que confirma o plano de 20/10), e o atual card "Equipamento físico" do cabeçalho sai, para não haver dois lugares para o mesmo dado.

**A tabela** (uma linha por item controlado do instrumento):

| Equipamento | Planejado | Entregue | Situação | Última entrega | Marca / modelo | Séries | Ação |
|---|---|---|---|---|---|---|---|
| Acelerador Linear (010933) | 1 | 0 | Pendente | — | — | — | Registrar entrega |
| Mamógrafo Digital (010925) | 3 | 2 | Parcial | 23/10/2026 | Marca X / Modelo Y | S1, S2 | Registrar entrega · Editar |

Linha expansível mostra cada unidade. Itens não controlados (as demais categorias) aparecem num resumo recolhido "Outros itens do plano (n)". Estados vazio, carregando, erro com nova tentativa e sem permissão (somente leitura) explícitos; teclado e leitor de tela; em celular a tabela vira lista de cartões.

**Fluxo "Registrar entrega"** (botão no topo da tabela; também por linha, já com o item marcado):
1. Abre um painel com **data da entrega** (obrigatória, não futura) e **observação**.
2. Mostra **a lista dos itens pendentes** do instrumento para o colaborador **marcar um ou mais** (a tela não deixa confirmar sem pelo menos um).
3. Para cada item marcado: **quantidade** (padrão = o que falta, máximo = o que falta), **marca**, **modelo**, **vida útil**, e **números de série** opcionais (um por linha; no máximo a quantidade).
4. Confirmar chama o `POST`; sucesso atualiza a tabela, a linha do tempo e a fase; erros de validação aparecem no campo; conflito de concorrência pede para recarregar.
5. Duplo clique não duplica (chave de idempotência gerada no abrir do painel).

**Revisão de legado:** banner no topo da seção quando existe entrega a revisar: "Entrega registrada antes do controle por unidade". Abre o mesmo painel com o evento antigo à vista e o campo para escolher o item. Quem não pode editar vê o aviso sem o botão.

**Arquivos:** novos `components/features/equipamentos-instrumento-*.tsx` (tabela, linha, painel, formulário), `hooks/useEquipamentosInstrumento.ts` e `useRegistrarEntrega.ts` (TanStack Query com invalidação), `services/entregas-equipamento.ts` (Zod), `lib/validations/entregas.ts` (React Hook Form + Zod). Ajustar `monitoramento-interno.tsx` e `monitoramento-interno-cabecalho.tsx`; manter cada arquivo abaixo de 200 linhas.
**Testes:** componentes (estados e validações), fluxo de entrega com mocks, axe (acessibilidade), e2e com instrumento sintético de vários itens e unidades, entrega parcial, correção, exclusão e banner de legado; teste visual em 320, 768 e 1440 px.

## 6. Etapa 6 — Cabeçalho, NUP e ordenação

- **NUP** ao lado do convenente **só em FAF e TED** (onde o número já é o NUP SEI), formatado `25000.198305/2024-59`; nenhum outro tipo recebe o marcador.
- **Ordenação** de ações e eventos por `created_at DESC, id DESC`, mostrando em separado a ocorrência e a previsão; a seleção do evento vigente e as invariantes de fase não mudam.

## 7. Etapa 7 — Relatórios e painel passam a usar item e unidade

- A "Quantidade" e a tabela de equipamentos dos relatórios (Concluídos e instrumentos) somam **unidades entregues** quando o instrumento já tem controle por unidade, e continuam com a regra do PR #38 (itens `BEM` e cargas manuais com quantidade 1) quando não tem. Mostrar "planejado" e "entregue" separados.
- O painel de gestão ganha o indicador "equipamentos entregues x planejados" por família, sem alterar a cobertura/déficit/distância (esses seguem só CNES/ElastiCNES).
- Atualizar `CLAUDE.md`, `AGENTS.md`, `docs/metodologia-parametros.md` (apenas onde tocar) e o modelo ER.

## 8. Etapa 8 — Prazos e notificações

- Job `scripts/job_prazos_monitoramento.py`, idempotente, com simulação, métricas e teste de falha e reexecução.
- Avisos para **ação aberta com prazo** e **previsão de inauguração ativa**, nos dias **D−1, D0 e D+1**, às **08:00 de São Paulo**, para titular, suplente, gestor e admin ativos (pessoa com vários papéis recebe uma vez; leitor e inativo nunca).
- Chave de deduplicação: `(destinatário, entidade, tipo, versão do prazo, janela)`; concluir, cancelar ou reagendar invalida os avisos antigos; "após atrasar" não repete todo dia.
- Recuperação de rodada perdida (rodar de novo sem duplicar) e controle de concorrência.
- **Criar o job não liga o agendamento**: ele só é habilitado depois da operação de alertas (trilha F) e com a rodada manual supervisionada de sempre.

## 9. Etapa 9 — Fotografias (por último e isolada)

Só começa depois das etapas 2 a 5 em produção e das decisões sobre armazenamento privado e orçamento, formatos (incluindo HEIC), limites de tamanho e quantidade, e retenção. Entidade própria ligada à unidade e à entrega, com autoria e data; upload com validação de assinatura, reprocessamento e remoção de EXIF e localização; acesso por link temporário autenticado; nunca bucket público nem disco efêmero; foto depois do lançamento gera evidência própria, sem editar o evento original; orientação de não fotografar pacientes nem documentos. Detalhamento completo quando as decisões chegarem.

## 10. Entrega por pacote de release

| Release | Etapas | Migração | Observação |
|---|---|---|---|
| R-itens-1 | 1 e 2 | sim, aditiva | catálogo e modelo; sem mudança visível |
| R-itens-2 | 3, 4, 5, 6 | `ALTER TYPE` do aviso | a mudança que o usuário vê; backfill depois do deploy, com simulação |
| R-itens-3 | 7 | não | relatórios e painel |
| R-itens-4 | 8 | não | job criado, **agendamento desligado** |
| R-itens-5 | 9 | sim | fotos |

Cada release segue o roteiro de sempre (backup, migração pelo `migrar_banco.yml` com conferência de role e permissões, Manual Deploy, verificação, janela de observação, preenchimentos só com simulação e "pode gravar").

## 11. Critérios de aceite do conjunto

- Nenhuma unidade vinculada por nome, posição ou "primeira da lista".
- A entrega sem item é impossível na tela, na API e no banco.
- Uma recaptura que altera ou remove item oficial **não apaga unidade** nem entrega; gera conciliação visível.
- Instrumentos com carga manual funcionam sem ID oficial e sem ligação com a API.
- Lint, tipos, build, pisos de cobertura, e2e e CI verdes; migração reversível ensaiada em banco descartável.
- Documentação (`CLAUDE.md`, `AGENTS.md`, modelo ER) atualizada no mesmo release.
