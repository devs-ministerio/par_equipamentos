# Plan Mode — centralização de equipamentos e marcadores (2026-09-20)

## Status de execução — 2026-09-20

### Correção obrigatória de escopo — 2026-09-20

- A primeira execução do backfill foi invalidada para Convênios: ela leu
  `transferegov_raw.propostas_expandidas`, que é um conjunto agregado por
  CNPJ e **não** a proposta vinculada ao instrumento. Isso explica os
  marcadores indevidos do Convênio `997349` (Acelerador Linear e
  Radioterapia), embora o seu item de plano seja somente
  `010254-Sistema de Vídeo Endoscopia Rígida`.
- A fonte exclusiva de marcadores de Convênio passa a ser
  `siconv_raw.itens_plano_aplicacao` do próprio registro. O payload agregado
  por CNPJ segue armazenado para consulta, mas é vedado para classificação,
  filtros e marcadores.
- Itens da ingestão manual inicial (planilha de Convênio/FAF/TED e PERSUS I)
  são incorporados nessa **mesma** coleção de itens do plano, identificados
  por `ORIGEM_ITEM=carga_manual_inicial` e `FONTE_ITEM`; não são mais uma
  fonte paralela de marcador. PERSUS II e PRONON sem item individual não
  recebem item ou marcador por inferência.
- O catálogo passa a conter `Citômetro de Fluxo`. Quando há pelo menos um
  equipamento prioritário no mesmo instrumento, a API exibe somente os
  prioritários; sem prioritário, exibe os equipamentos efetivamente presentes
  nos itens, incluindo Citômetro. Assim, `7AACVL` deve exibir Citômetro de
  Fluxo e `997349` somente Endoscopia.
- A correção reconstrói as evidências automáticas após snapshot. Não apaga
  itens da fonte; substitui apenas os 1.415 marcadores gerados pela primeira
  centralização, que ainda não possuem fluxo de edição humana.

- Migration `f4c7e1d9a820` aplicada no Neon após snapshot validado em `/private/tmp` (36 MB).
- Catálogo central criado com 15 equipamentos, incluindo Citômetro de Fluxo. Após a correção de escopo, o backfill foi reconstruído com 904 evidências: 785 em `convenio`, 28 em `proposta_candidata` e 91 em `instrumento_equipamento`.
- Relações preservadas: 1.376 aquisições, 27 modernizações, 5 equipamentos existentes e 7 menções; não houve conversão automática de contexto em aquisição.
- APIs de Convênios e Propostas retornam a coleção central de evidências; filtros e marcadores visuais do frontend consomem essa coleção.
- Importadores PERSUS/PRONON, planilha FAF/TED, Convênios/API e descoberta TransfereGov foram conectados ao registro central para as próximas cargas.
- Os 384 valores divergentes de `convenio.equipamentos_tags` foram recalculados a partir dos itens do plano; permanecem apenas como compatibilidade e não são consumidos pela interface.

## Objetivo e decisão de arquitetura

- Centralizar a evidência de equipamentos de Convênios, FAF, TED, PERSUS I/II e PRONON, independentemente de a origem ser API ou planilha/carga manual.
- Manter as entidades de negócio (`convenio`, `proposta_candidata` e `instrumento_equipamento`) como origens; não copiar programas para uma nova tabela de monitoramento.
- Criar uma relação normalizada única, proposta `equipamento_marcador`, com FK para a origem, equipamento canônico, descrição da fonte, tipo de evidência, relação com a aquisição e confiança.
- Criar catálogo fechado de equipamentos (`equipamento_catalogo`) com nome canônico, aliases e `prioritario`; os cinco prioritários permanecem identificáveis sem eliminar os demais equipamentos já acompanhados.
- Todos os filtros, marcadores visuais, KPIs, relatórios e endpoints devem consumir essa relação central. `equipamentos_tags` e `equipamento_detectado` ficam apenas como compatibilidade durante a transição.

## Achados que o plano corrige

- `Convenio.equipamentos_tags` é um array denormalizado e pode contaminar um convênio com outras propostas do mesmo CNPJ.
- `PropostaCandidata.equipamento_detectado` guarda apenas um equipamento; o objeto da proposta pode conter vários itens e relações distintas.
- O backend classifica o primeiro termo encontrado no objeto, enquanto o frontend escolhe o item de maior valor e filtra todos os itens: marcador, marcador visual e filtro podem divergir.
- `importar_programas_monitoramento.py` grava “Acelerador linear” de forma fixa para registros programáticos, sem comprovação individual da fonte.
- O PRONON manual possui equipamento curado em código e também metas/itens da API, sem reconciliação estruturada entre as duas evidências.
- Fontes manuais identificadas: planilhas FAF/TED e PERSUS I, CSVs PERSUS II/PRONON, registros manuais do radar PRONON e scripts de seed/batimento.

## Blocos de execução

- **Bloco 0 — inventário e congelamento:** listar cada escritor/leitor de marcadores, fontes manuais, scripts one-shot e campos legados; produzir relatório dry-run sem alterar produção.
- **Bloco 1 — modelo:** migration Alembic aditiva para catálogo e marcadores, FKs explícitas, `CHECK` para origem/relação, `UNIQUE` por origem/equipamento/evidência e auditoria padrão; incluir `down` testado.
- **Bloco 2 — classificação:** extrair um classificador backend único, baseado em itens/metas e evidência explícita; suportar múltiplos equipamentos, upgrade e menção a equipamento existente sem tratá-la como aquisição.
- **Bloco 3 — backfill:** popular marcadores para APIs e cargas manuais com `source_hash`, idempotência e origem declarada; revisar manualmente falso positivo, ausência de evidência e múltiplos equipamentos.
- **Bloco 4 — contratos:** expor no backend uma coleção única de equipamentos por Convênio e proposta, com schema tipado; aplicar Repository → Service → Router, paginação/limite e transação única.
- **Bloco 5 — frontend:** remover regex/classificação paralela de `equipamento-tags` dos fluxos de negócio; card, filtro, detalhe, monitoramento e painel passam a usar o mesmo campo retornado pela API.
- **Bloco 6 — legado e qualidade:** congelar escrita nos campos antigos, manter leitura de compatibilidade apenas durante o rollout, depois remover consumidores e só então avaliar remoção de colunas em migration separada.

## Regras de dados e reconciliação

- Evidência primária: item orçamentário/meta/etapa que descreve aquisição; evidência secundária: objeto ou componente estruturado claramente qualificável; texto genérico não basta.
- “Equipamento existente”, “manutenção”, “obra”, “serviço” e “ampliação sem compra” não viram aquisição automaticamente; registrar a relação específica.
- Não aplicar equipamento por programa, CNPJ, ano ou tipo de contratação sem evidência do registro individual.
- Preservar descrição original, fonte, identificador da origem e hash; correção deve ser auditável e idempotente.
- O relatório de reconciliação deve conter: origem, identificador, equipamento canônico, evidência, relação, confiança, divergências e ação recomendada.

## Critérios de aceite e riscos

- Zero marcador decidido por regra fixa sem evidência; zero divergência entre API, marcador visual, filtro e painel para o mesmo registro.
- Todos os registros manuais e de API aparecem no mesmo repositório relacional de marcadores, sem perder a origem nem os campos operacionais existentes.
- Testar isolamento por CNPJ, múltiplos equipamentos, menções negativas, upgrade, ausência de item e reexecução idempotente.
- Testar FK, `CHECK`, unicidade, rollback, volume, ausência de N+1 e contrato HTTP/frontend.
- Antes do backfill compartilhado: snapshot/backup confirmado, dry-run aprovado e relatório de divergências revisado; não executar migração destrutiva.
- A implementação foi aprovada e executada nesta frente. A remoção física dos campos legados continua condicionada à retenção/auditoria do programa integral de saneamento.

## Diagnósticos afetados

- Atualizar `diagnostico-constituicao-database-2026-09-16.md` com a ausência atual da relação central e o plano de normalização.
- Atualizar `diagnostico-constituicao-backend-2026-09-16.md` com a divergência entre classificadores, cargas manuais e camadas arquiteturais.
- Atualizar `diagnostico-constituicao-frontend-2026-09-16.md` com a duplicidade de fontes do marcador e o contrato único proposto.
- Atualizar `diagnostico-ingestao-dados-2026-09-18.md` com o inventário manual/API e a regra de não considerar o marcador atual como confirmação de equipamento.
