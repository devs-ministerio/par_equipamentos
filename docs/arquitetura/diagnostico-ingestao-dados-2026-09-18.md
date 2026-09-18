# Diagnóstico sênior — ingestão de dados do monitoramento (2026-09-18)

## Fontes e cobertura

- `Monitoramento Base de Dados - Convênio FAF TED.xlsx`: usa **exclusivamente a aba
  `Planilha Monitoramento `** (o espaço final pertence ao nome da aba no arquivo). São 133
  linhas operacionais, 126 com identificador resolvível e 86 instrumentos únicos. Nenhuma
  outra aba desse arquivo participa da ingestão. Sete linhas não possuem número TransfereGov
  nem NUP SEI utilizável e não podem ser importadas sem fabricar identidade.
- `Apresentação PER-SUS.xlsx`, aba canônica `Panorama PER-SUS`: 92 projetos válidos, 91 CNES
  distintos; o CNES `2077477` possui dois projetos legítimos (`A` e `EO`).
- PERSUS II: 50 registros recebidos, todos com CNES e tipologia, ainda sem valor de aquisição.
- PRONON 2024/2025: 21 registros recebidos, com investimento, situação e natureza do serviço.
- Total da nova carga programática: 163 instrumentos; dry-run local rejeitou zero CNES.

## Decisões de modelagem

- Convênio continua identificado pelo número oficial e FAF/TED pelos dígitos do NUP SEI.
- PERSUS I usa `PERSUS1-{CNES}-{TIPOLOGIA}`; PERSUS II usa `PERSUS2-{CNES}`; PRONON usa
  `PRONON-{ANO}-{CNES}`. São códigos internos explícitos, não números TransfereGov.
- `cnpj_convenente` passa a aceitar nulo porque as fontes PERSUS/PRONON não fornecem CNPJ.
  Nome, município e UF são enriquecidos pela referência CNES; nenhuma informação é inventada.
- Tipologia tem domínio fechado: `A`, `CV`, `C`, `EO`, `C.B`, `NA`.
- Investimento, situação do programa e natureza do serviço ficam separados dos valores e
  situações das APIs de convênios.

## Campos úteis encontrados

- **Importados:** CNES, unidade, município, UF, tipologia, investimento, situação, natureza,
  licença de operação, inauguração, observação e previsão de inauguração da planilha FAF/TED.
- **Mantidos como referência:** equipamento planejado. Quando o físico ainda não foi confirmado,
  a tela mostra esse valor com o rótulo de referência, sem gravá-lo como equipamento entregue.
- **Candidatos futuros:** ordem de serviço, TRP, TRD, chegada na obra/prazo total do PERSUS I e
  paralisação/motivo da planilha operacional. Precisam de regra de negócio antes de ganhar campo;
  não foram despejados como texto genérico.
- **Não importados:** coordenadas defeituosas da planilha e valores anuais antigos que já possuem
  fonte oficial ou qualidade insuficiente.

## Riscos e controles

- Excel perde zeros à esquerda do CNES; o importador normaliza para sete dígitos e valida FK.
- Previsão de inauguração antes era gravada como ocorrência. A carga corrigida cria um novo evento
  `data_prevista`, preservando o evento antigo por append-only; a leitura usa o evento mais recente.
- Reprogramação exige justificativa e cria novo evento com usuário e instante. Realização exige
  que o técnico atualize uma previsão futura para a data real da ocorrência.
- Carga é transacional e idempotente, possui `--dry-run`, hash abreviado da fonte e relatório de
  criados, atualizados, eventos e rejeitados.
- Situação externa e marco interno nunca se sobrescrevem. Inauguração concluída com prestação de
  contas ainda em análise aparece como divergência operacional.

## Etapas operacionais e validações

| Etapa | Entrada obrigatória | Validação | Evidência e alerta |
|---|---|---|---|
| Contratação | situação do programa | vocabulário da fonte, sem converter em fase interna | origem e situação lado a lado |
| Fabricação/obra | ocorrência ou previsão | data realizada não pode permanecer futura | evento append-only com autor |
| Entrega | data realizada | equipamento físico é opcional; planejado fica só como referência | série/marca no retrato histórico quando informadas |
| Instalação/comissionamento | data realizada ou prevista | nova previsão exige justificativa | data anterior/nova no `AuditLog` |
| Licença CNEN | status, documento e datas disponíveis | validade vencida ou próxima vira alerta | agenda crítica no painel |
| Inauguração prevista | data prevista | ao vencer sem ocorrência, permanece atrasada | alerta no overview/painel |
| Inauguração realizada | data real atualizada pelo técnico | rejeita data futura; aceita confirmação após correção da data | marcador “Realizada”, autor e instante |
| Pós-inauguração | situação externa da API | não conclui automaticamente o marco interno | divergência destacada quando estados não acompanham o fato interno |

Pendências de produto mapeadas para rodada futura: exigir resposta explícita “foi inaugurado?” no
dia do vencimento por tarefa/notificação automática; definir SLA e destinatário; permitir encerrar
o alerta como falso positivo sem apagar o histórico; criar taxonomia para paralisação e motivo.

## Validação executada

- Migration aplicada, revertida e reaplicada no PostgreSQL local.
- Carga local: 163 criados, 171 eventos, zero rejeitados.
- Segunda execução: zero criados e zero eventos, confirmando idempotência.
- Reconciliação FAF/TED em dry-run detectou sete linhas sem identidade, mantidas como rejeição
  explícita, e passou a preservar zeros à esquerda do CNES.
- Neon: migration `7c1f2e9a4b60` aplicada; dry-run dos programas confirmou 163 criações,
  171 eventos e zero rejeitados antes do commit.
- Neon: carga aplicada com 163 instrumentos de programa e 171 eventos. A reconciliação
  conservadora da aba única `Planilha Monitoramento ` criou zero instrumentos, sobrescreveu
  zero campos e acrescentou 38 eventos ausentes; as sete linhas sem identidade continuaram
  rejeitadas explicitamente.
- Estado final conferido no Neon: 249 instrumentos com 249 identificadores únicos — 71
  Convênios, 12 FAF, 3 TED, 92 PERSUS I, 50 PERSUS II e 21 PRONON — e 578 eventos no total.

## Correção de escopo (2026-09-18, mesmo dia — revisão sênior pós-carga)

A validação acima confirmou que a carga estava correta *tecnicamente* (idempotente, sem
fabricar dado, CNES validado), mas o **destino** estava errado: os 249 instrumentos foram
gravados só em `instrumento_equipamento` (monitoramento interno). O usuário corrigiu o
requisito depois de ver o resultado: FAF/TED/PERSUS I/PERSUS II/PRONON pertencem ao universo
  de `convenio` (etapa de interface **Instrumentos/Programas**, igual aos 403 registros
  Convênio/SICONV) — só permanecem
*também* no monitoramento interno o que a equipe já acompanhava manualmente (Convênio, FAF,
TED) e PERSUS I ainda não inaugurado.

Migration `26becbd31f95` + `scripts/corrigir_escopo_instrumentos_firmados.py` (idempotente,
com `--dry-run`, testado antes em PostgreSQL local com migration up/down/up e ciclo completo)
corrigiram os 249 registros já commitados sem perder histórico:

- **Convênio (71)**: intocado.
- **FAF (12) + TED (3)**: permanecem no monitoramento interno (decisão do usuário — preservar
  cadastro/eventos/ações já existentes), ganham espelho em `convenio`.
- **PERSUS I não inaugurado (5)**: fica nos dois (mesmo padrão do Convênio monitorado).
- **PERSUS I inaugurado (87) + PERSUS II (50) + PRONON (21) = 158**: saem do monitoramento
  interno (eventos apagados via cascade — só cronograma/licença re-derivados desta mesma
  carga, nada que a equipe tivesse editado a mão), entram só em `convenio`.

Estado final no Neon: **91 instrumentos no monitoramento interno** (71 Convênio + 12 FAF +
3 TED + 5 PERSUS I não inaugurado) e **581 registros em `convenio`** (403 originais + 178
novos: FAF, TED, PERSUS I completo, PERSUS II, PRONON).

Na interface, essa etapa é denominada **Instrumentos/Programas**. `convenio` permanece apenas
como nome técnico da tabela e da camada de persistência legada.

### Identificador visível vs. chave de upsert

Achado do usuário ao revisar o resultado: o identificador sintético usado como `nr_convenio`
pras fontes sem número oficial (NUP SEI só com dígitos colados pra FAF/TED, ex.
`25000198305202459`) "ficou muito ruim" pra leitura/URL. Substituído por um identificador
**aleatório com prefixo do tipo** (`FAF-284917`, `PERSUS1-503028`, ver
`scripts/lib_identificadores.py`) — sem significado, mas legível e nunca colide.

Isso exigiu decouplar identidade de upsert de identidade visível: `Convenio.chave_origem` e
`InstrumentoEquipamento.chave_origem` (migration `26becbd31f95`) guardam o identificador
determinístico antigo (NUP SEI dígitos / `PERSUS1-{cnes}-{tipologia}` / `PERSUS2-{cnes}` /
`PRONON-{ano}-{cnes}`) só pra reencontrar o registro em execuções futuras — nunca exposto na
API/UI. `numero`/`nr_convenio` (aleatório) é gerado 1x na criação e nunca mais muda.
`scripts/lib_monitoramento_convenio.py` centraliza o espelhamento em `convenio`, reusado por
`importar_programas_monitoramento.py`, `importar_planilha_monitoramento.py` (FAF/TED) e o
script de correção pontual, pra não triplicar a regra de mapeamento de campo.

**PERSUS I**: confirmado com o usuário que não existe NUP SEI nem qualquer outro identificador
oficial pra essa fonte — o esquema aleatório é definitivo, não um placeholder.
**PRONON**: o usuário ainda vai estudar se existe uma fonte de identificador melhor; o esquema
aleatório fica valendo até essa decisão, registrado aqui como pendência (não fabricar um
identificador "mais bonito" a partir de CNES/ano antes de confirmar que não há nada oficial).

### Campos deliberadamente não carregados em `convenio` nesta rodada

Data de inauguração e de licença de operação (PERSUS I inaugurado/PERSUS II/PRONON) não têm
coluna equivalente em `convenio` hoje — só a `situacao`/`programa`/`objeto` textual (vocabulário
da própria fonte) foi preservada. Repurpose de `data_conclusao` (semântica real: prestação de
contas SICONV) foi descartado de propósito para não misturar dois conceitos diferentes sob a
mesma coluna. Registrado como pendência de produto, não perda silenciosa.

### Ajuste de identificador (mesmo dia, 2ª revisão)

Revendo o resultado renderizado, o usuário fez 2 correções ao esquema de identificador acima:

- **PERSUS I/PERSUS II/PRONON**: o prefixo do id aleatório repetia o nome do tipo já exibido
  como badge ao lado (ex. "PERSUS I PERSUS1-135842"). Encurtado: `PERSUS1-` → `PS1-`,
  `PERSUS2-` → `PS2-`, `PRONON-` → `PN-`.
- **FAF/TED**: ao contrário de PERSUS/PRONON, têm identidade oficial (NUP SEI) — não fazia
  sentido escondê-la atrás de um id aleatório. `nr_convenio`/`numero` voltou a ser o NUP SEI
  (dígitos) direto, igual ao esquema original de 2026-09-09/10 — a diferença desta rodada é só
  o espelho em `convenio`, que não existia antes. `chave_origem` continua preenchida (igual ao
  próprio identificador) só para manter o upsert idempotente de `espelhar_convenio` funcionando
  sem caso especial.

`scripts/renomear_identificadores_instrumentos_firmados.py` (idempotente, testado local antes
do Neon) aplicou isso aos 249 registros já corrigidos: 163 prefixos encurtados em `convenio`
(92 PERSUS I + 50 PERSUS II + 21 PRONON), 15 FAF/TED revertidos para NUP SEI em `convenio`, 20
identificadores ajustados em `instrumento_equipamento` (15 FAF/TED + 5 PERSUS I não
inaugurado). `importar_programas_monitoramento.py` e o trecho FAF/TED de
`importar_planilha_monitoramento.py` foram atualizados para já nascer nesse formato — reexecução
confirmada idempotente contra o Neon já ajustado (mesmos números de antes: `convenio_atualizados=
163`, `monitoramento_atualizados=5`, reconciliação da planilha em 0 criados/126 reconciliados).

### Ingestão daqui pra frente

`importar_programas_monitoramento.py` e o trecho FAF/TED de
`importar_planilha_monitoramento.py` foram reescritos pra já nascer no destino correto (nunca
mais recriar o erro desta rodada) — testado com dry-run + execução real + reexecução
idempotente contra o Neon já corrigido: `convenio_atualizados=163`, `monitoramento_atualizados=5`,
zero criação nova; reconciliação da planilha (`somente_ausentes=True`) devolveu 0 criados/
126 reconciliados, confirmando que o FAF/TED corrigido é reencontrado pelo `chave_origem` sem
duplicar sob o novo `nr_convenio` aleatório.

### Auditoria sênior PERSUS — revisão visual e semântica (2026-09-18)

A planilha `Apresentação PER-SUS.xlsx` foi conferida pela aba operacional `Panorama PER-SUS`.
Os 92 projetos válidos são aceleradores lineares; `A`, `C`, `C.B`, `CV` e `EO` descrevem a
forma de implantação (infraestrutura/equipamento), não modelos de equipamento. A interface
agora mantém “Acelerador linear” como equipamento do programa e apresenta a tipologia em
chip próprio, com o dicionário da fonte. O programa passou a ser exibido como
**Plano de Expansão da Radioterapia no SUS - PERSUS** (com a fase I/II).

As abas `Obras retomadas`, `Norte`, `Nordeste`, `Centro Oeste`, `Sudeste` e `Sul` são
resumos/recortes de conferência e não entram como linhas de ingestão. A reconciliação confirmou
92 PERSUS I, sendo 87 inaugurados e 5 ainda monitorados internamente; PERSUS II tem 50 e
PRONON 21. O Neon ficou com 92 PERSUS I, 50 PERSUS II e 21 PRONON em `convenio`, tipologia
preenchida em todos os PERSUS, cinco instrumentos PERSUS I no monitoramento interno e zero
rejeições na carga corrigida.

A etapa visual também encontrou e corrigiu a apresentação que rotulava todos os projetos como
“Acelerador Linear Radioterapia” sem distinguir a tipologia. A carga continua inicial,
idempotente e controlada; as alterações posteriores devem ocorrer pelos eventos e ações do
monitoramento interno.

### Auditoria complementar FAF/TED

No Neon existem 12 FAF e 3 TED. A comparação dos campos de cadastro mostrou que as lacunas
não são falha silenciosa da carga: a aba operacional da planilha também não fornece esses
dados para todos os registros. O quadro atual é:

- FAF: 1 sem equipamento planejado, 6 sem componente, 1 sem finalidade, 3 sem suplente,
  5 sem nível de monitoramento, 1 sem modalidade oncológica e 12 sem responsável técnico;
- TED: nenhum sem equipamento planejado, 2 sem componente, 2 sem finalidade, 2 sem suplente,
  2 sem nível de monitoramento, nenhum sem modalidade oncológica e 3 sem responsável técnico.

CNES e técnico titular estão preenchidos nos 15 registros. Os campos físico (marca, modelo,
número de série e vida útil) permanecem corretamente vazios até a confirmação da entrega pelo
estabelecimento. O marcador “Radioterapia” foi removido por ser componente/serviço, não
equipamento; o marcador automático fica reservado a “Acelerador Linear”. Tipologia não é
marcador visual: aparece apenas como informação textual junto ao programa PERSUS.

O único FAF sem equipamento planejado é o NUP `25000083818202628`, da Unidade Mista Carlos
Modesto dos Santos (Ituiutaba/MG). A linha correspondente da aba `Planilha Monitoramento `
não possui `ID MODELO NO SIGEM/TRANSFEREGOV`, componente ou finalidade; portanto o vazio é
fiel à fonte e não deve ser preenchido por inferência.

### Correção final do escopo do monitoramento interno (2026-09-18)

Após revisão, o usuário confirmou que somente os PERSUS I ainda não entregues devem ser
acompanhados internamente. PERSUS I entregues, PERSUS II e PRONON permanecem exclusivamente
em `convenio`/Instrumentos firmados. Os 158 registros que haviam sido incluídos indevidamente
foram removidos com autorização explícita, preservando os registros da fonte em `convenio`.

Estado final no Neon: **91 instrumentos no monitoramento interno** — 71 Convênios, 12 FAF,
3 TED e 5 PERSUS I não entregues. O catálogo continua com os marcos específicos do PERSUS I
(Ordem de Serviço, TRP, TRD, Chegada na obra, licença CNEN e inauguração); `PRAZO TOTAL` é
preservado como duração na observação do evento, sem conversão artificial em data.

### Auditoria PRONON contra a API pública TransfereGov Parcerias (2026-09-18)

Pedido do usuário: conferir se os 21 PRONON da carga (`pronon.csv`) já existem oficialmente na
API pública `api-publica.transferegov.gestao.gov.br/parcerias`, e se essa API tem mais casos de
equipamento prioritário (Acelerador Linear, Mamógrafo, PET/CT, Gama-câmara/SPECT,
Braquiterapia) que a carga original não cobriu.

- **`cd_parceria` (ex. `202500023008`) não é o NUP SEI.** É o código formal gerado pelo
  TransfereGov novo quando uma proposta é formalizada em parceria; o NUP SEI (`cd_processo_sei`
  na API) é de outro sistema e pode vir vazio mesmo quando a parceria já existe.
- Batimento por CNPJ dos 21 PRONON contra a API: **16 de 21 já têm parceria formalizada e NUP
  SEI reais** na API (`in_finalidade='PRONON'`, `id_programa` 96/97/98); 5 não têm proposta de
  Acelerador Linear localizável por esse CNPJ na API.
- Varredura ampliada (sem restringir aos CNPJs já carregados) nos 3 ciclos PRONON reais
  (`id_programa` 4, 96, 97, 98, 11 — nomes variam por ciclo/ano, todos com `in_finalidade` ligado
  a PRONON) achou mais **16 propostas de Acelerador Linear** fora da carga original — todas com
  `cd_parceria`/NUP SEI já formalizados.
- Varredura nos 18 programas de saúde/oncologia relacionados (nome contendo
  CANCER/CÂNCER/ONCOLOG/PRONON) filtrando pelos 5 equipamentos prioritários achou 136 propostas
  candidatas por palavra-chave; **curadoria manual do `ds_objeto` completo** (não só o trecho
  truncado) descartou 7 como falso positivo puro (capacitação de recursos humanos, prestação de
  serviço/exame sem aquisição de equipamento, menção genérica dentro de um texto de dashboard) e
  marcou 5 como ambíguo (não fica claro no texto se é aquisição de equipamento novo ou uso de um
  já existente/serviço móvel).
- **18 entidades com aquisição real de equipamento prioritário, confirmada por leitura completa
  do objeto, ficaram fora da carga original** — nenhuma delas ainda tem `cd_parceria`/NUP SEI
  formalizado na API (todas em estágio de "Proposta", não "Parceria" ainda). Carregadas por
  `scripts/importar_pronon_api_complementar.py` (idempotente por `chave_origem =
  f"PRONON-API-{id_proposta}"`, testado local antes do Neon) só em `convenio` — nenhuma vai para
  o monitoramento interno (mesmo critério do resto do PRONON: sem parceria formalizada, não é
  caso de acompanhamento ativo da equipe). Sociedade Beneficente Hospital Sírio-Libanês entrou
  como 2 linhas (Braquiterapia e Acelerador Linear são propostas/ciclos distintos do mesmo CNPJ).
  Estado final: **40 PRONON em `convenio`** (21 originais + 19 novos), **600 registros totais em
  `convenio`**.
- Campos não disponíveis nesta fonte (API de proposta, não de estabelecimento): CNES (não
  resolvido por CNPJ — nenhum cruzamento inventado), valor financeiro (`nr_vlr_total` não veio
  preenchido nas propostas consultadas).
