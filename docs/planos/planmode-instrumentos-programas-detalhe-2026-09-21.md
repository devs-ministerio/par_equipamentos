# Plan Mode — instrumentos/programas: disponibilidade de dados e detalhe (2026-09-21)

## Objetivo e decisões de domínio

- Corrigir o detalhe em branco de instrumentos de ingestão manual e tornar explícita a fronteira entre dado oficial de API e dado interno/manual.
- FAF, TED e PERSUS ingeridos manualmente terão `valor_desembolsado = valor_global`; é uma regra de apresentação/indicador da carga, não inferência de pagamento da API.
- Para registros sem API de convênio, a camada "Mais detalhes" exibirá exclusivamente **Monitoramento interno**; se não houver instrumento monitorado, mostrará estado vazio orientando que não há acompanhamento cadastrado. Não exibirá campos financeiros, identificação ou subabas SICONV vazios.
- Convênio com fonte oficial preserva o detalhe atual (identificação, vigência, financeiro e dados SICONV); `siconv_raw` parcial de carga manual deixa de significar disponibilidade de SICONV.
- O filtro de equipamentos ganha uma subcamada "Prioritários" / "Outros equipamentos identificados". As opções vêm de `equipamentos[].prioritario`, sem lista fixa, e cada seleção filtra pelo marcador exato escolhido.
- A linha do tempo poderá reutilizar somente a apresentação horizontal da proposta: para Convênio oficial, eventos financeiros datados e comprovados; para ingestão manual, apenas eventos do monitoramento interno. Não fabricar datas, empenhos ou desembolsos.

## Bloco 0 — contrato, dados e correção da causa (P0)

- Em `backend/app/routers/convenios.py`, incluir no contrato de leitura um discriminante explícito de disponibilidade (`origem_detalhe` ou booleano de dados oficiais), derivado de origem/tipo de contratação e não da existência parcial de JSONB.
- Separar no mesmo contrato a projeção financeira exibível; para FAF/TED/PERSUS manuais, preencher desembolsado com o valor global na projeção e manter os demais campos de execução indisponíveis (`null`). PRONON só recebe a regra se sua origem manual for confirmada no inventário da carga.
- Trocar o filtro SQL de equipamento para `EXISTS` pelo marcador canônico selecionado, sem a supressão atual de não prioritário quando há prioritário; adicionar filtro de classe (`prioritario`) somente para formar opções, se necessário.
- Manter `equipamentos_tags` como coluna legada até o plano de centralização autorizar sua remoção física, mas removê-lo do response model e consumidor frontend se nenhum contrato ainda precisar de compatibilidade.
- Em `backend/scripts/lib_monitoramento_convenio.py`, `importar_planilha_monitoramento.py` e `importar_programas_monitoramento.py`, aplicar a regra de desembolso no espelho `Convenio` de modo idempotente e sem alterar `InstrumentoEquipamento` nem histórico/auditoria.
- Não criar migration: os valores e a disponibilidade são projeções de dados já existentes. Se a auditoria revelar registros manuais sem classificação de origem confiável, parar e propor migration/reconciliação antes de mudar produção.

## Bloco 1 — frontend e linha do tempo (P0/P1)

- Em `frontend/src/services/convenios.ts` e `src/types/monitoramento.ts`, validar e mapear o novo discriminante e a projeção; tipos Zod continuam sendo a fronteira do dado remoto.
- Em `convenio-card-header.tsx`, mostrar o percentual desembolsado de 100% para FAF/TED/PERSUS manuais, com texto de proveniência que não sugira pagamento externo confirmado.
- Em `convenio-card-detalhes.tsx` e `convenio-card.tsx`, ramificar pelo contrato: oficial renderiza detalhes oficiais; manual renderiza somente `Monitoramento interno`, eliminando a chamada/uso de `SiconvSubAbas` nesse caminho e a quebra por arrays ausentes.
- Em `monitoramento-equipamentos-page.tsx`, derivar opções do array canônico `equipamentos`, acrescentar o seletor de classe e preservar filtros em cascata, paginação, reset de página, foco e leitura mobile.
- Extrair uma apresentação genérica de timeline apenas se os dois consumidores compartilharem props tipadas de eventos; `proposta-linha-do-tempo.tsx` permanece responsável por montar eventos de proposta e um adaptador de convênio monta somente eventos comprovados.
- Estados de loading, erro e vazio devem permanecer visíveis; `Mais detalhes` nunca pode deixar a página branca por payload parcial/malformado.

## Bloco 2 — testes, remoção de mortos e documentação (P0)

- Backend: cobrir contrato manual/oficial, fallback de desembolsado, filtro prioritário/não prioritário com coexistência, e idempotência de reimportação. Frontend: detalhe do `25000000145202506`, manual sem monitoramento, oficial com SICONV, filtro por item não prioritário e schema inválido.
- Rodar `uv run pytest`, Ruff e mypy; `npm run test`, lint, typecheck e build; validar visualmente 400/768/1440px e com o registro afetado em ambiente autorizado.
- Remover `equipamentosDoConvenio` e seu teste se a busca final confirmar que só sobrevivem como circuito morto; não remover `equipamento-tags.ts`, que segue atendendo propostas até migração própria.
- Podar comentários históricos que afirmam que `equipamentosTags` alimenta card/filtro ou que todo detalhe possui SICONV; manter só o motivo local da fronteira de fontes.
- Atualizar `docs/arquitetura/fluxo_requisicao.md`/`.mermaid`, `diagnostico-ingestao-dados-2026-09-18.md`, diagnósticos frontend/backend/database e `CLAUDE.md`/`AGENTS.md` se o comportamento permanente mudar; marcar como histórico os planos já executados, sem reescrever seus fatos.
- Antes de excluir qualquer arquivo, executar `rg --files` + `rg` de imports/referências; arquivos de contexto só são removidos quando sem consumidor e sem valor histórico. Preservar as alterações não relacionadas já presentes no worktree.

## Riscos, aceite e ordem

- Risco principal: chamar 100% de "desembolsado" de pagamento confirmado. Mitigar com rótulo/proveniência explícitos e regra limitada às fontes manuais aprovadas.
- Não há autorização nova nem chamada externa; `GET /convenios` continua autenticado e limitado. A mudança é compatível por adição de contrato, seguida da retirada controlada do legado.
- Aceite: nenhum detalhe manual quebra; ele mostra somente monitoramento; FAF/TED/PERSUS totalizam desembolsado igual ao global; não prioritários são selecionáveis; timeline só contém evidência datada real.
- Ordem: contrato/projeção e importadores → frontend → testes e verificação visual → documentação e poda confirmada de mortos.

## Execução — 2026-09-21

- Concluída sem migration: a API projeta `dados_oficiais_disponiveis` e `desembolso_integral_da_carga`; a regra de 100% vale para FAF, TED, PERSUS I/II e PRONON, sem alterar os valores brutos persistidos.
- O detalhe manual não renderiza dados oficiais nem `SiconvSubAbas`; o contrato bloqueia o cast do JSON parcial. Isso corrige o caso `25000000145202506` pela causa, não por tratamento de exceção visual.
- O filtro usa a coleção canônica `equipamentos` e permite alternar entre priorizados e outros identificados. A query SQL por equipamento deixou de ocultar o não prioritário quando existe prioritário no mesmo instrumento.
- A apresentação de timeline foi extraída para `linha-do-tempo-eventos.tsx`; proposta e convênio a reutilizam. O convênio só acrescenta publicação, desembolso e pagamento que tenham data de fonte oficial.
- Removidos `equipamentosDoConvenio` e seu teste, que só se referenciavam mutuamente após a centralização; `equipamento-tags.ts` permanece para propostas com texto bruto.
- Itens não prioritários agora têm rótulo resumido no filtro. Um nome com alias de equipamento prioritário é bloqueado dessa categoria no frontend, e o classificador canônico passou a reconhecer também `LINAC` como Acelerador Linear para não criar novo marcador genérico em cargas futuras.
- A timeline usa espaçamento fixo e conteúdo centralizado quando curto; cards monitorados exibem a `fase_atual` interna no mesmo marcador que antes mostrava apenas a situação externa.
