# Plan Mode — filtros canônicos e painel de monitoramento (2026-09-28)

## Objetivo e escopo

- Permitir incluir no monitoramento somente linha TransfereGov com parceria **Confirmada**; proposta em tramitação permanece consultável, sem ação de inclusão.
- Unificar filtros de Instrumentos/Programas, Linhas de financiamento, Mesa, Painel, Relatórios e listas operacionais; telas de administração mantêm filtros próprios, pois não representam instrumentos financeiros.
- Remover o atalho “Abrir mesa de trabalho” do Painel de Gestão; mapa de cobertura não faz parte deste ciclo e será decidido em plano próprio.
- Identidade preservada: verde-petróleo, Public Sans, régua editorial, densidade administrativa, shadcn/Radix/Lucide e light-only.

## Decisões de domínio e contrato

- `POST /monitoramento/instrumentos` receberá referência tipada à proposta quando `tipo_contratacao="Parceria TransfereGov"`; o Service resolve a proposta no banco, exige `tem_parceria=true` e `cd_parceria`, monta a identidade confiável e rejeita tramitação com `DomainError`.
- Criação manual FAF/TED/PERSUS e Convênio permanece no fluxo atual; não aceitar `tem_parceria`, código ou situação enviados pelo browser como prova de elegibilidade.
- Frontend exibe o botão apenas em `Confirmada (parceria)` e, em tramitação, exibe texto informativo sem CTA; backend continua a fronteira autoritativa.
- Qualquer evolução de mapa permanece fora de escopo; quando retomada, a metodologia continuará exclusiva da oferta SUS em uso, sem usar instrumento monitorado, repasse, município em texto livre ou dado de proposta como insumo do cálculo.

## Filtros e experiência

- Criar modelo/hook compartilhado de filtros de domínio e aplicar a ordem fixa: **Tipo de contratação, CNES, UF, Município, Equipamento, Situação, Programas, Período**.
- Remover o rótulo “Filtrar por” e o `SearchInput` genérico dessas superfícies; o botão “Limpar filtros” passa a ser a única forma de voltar ao universo completo.
- Nenhum controle mostrará “Todos/Todas”: sem seleção, o placeholder é o próprio nome canônico do campo; seleção escolhida aparece como valor do controle.
- CNES mantém busca apenas dentro do seletor/combobox de CNES para localizar código válido; não haverá campo de busca global na barra de filtros.
- Substituir anos soltos por `AnoIntervaloFilter`: dois selects de ano sem data falsa, validação `início <= fim`, opções em cascata e intervalo aberto permitido quando só uma ponta for escolhida.
- Cada página usa somente campos que existam no seu domínio; Linhas de financiamento não exibe Tipo de contratação, pois toda a seção já é exclusivamente TransfereGov. Em tramitação, CNES também não é exposto por não apoiar decisão operacional nessa etapa.

## Execução por blocos

1. **Elegibilidade segura** — `backend/app/{routers,services,repositories}/`, schemas e testes: proposta confirmada cria; tramitação, parceria sem código, duplicidade e editor sem permissão são rejeitados.
2. **Primitivas de filtro** — `frontend/src/components/common/`, `hooks/`, `lib/validations/`, `services/`: contrato Zod, estado TanStack Query, opções dependentes, teclado/ARIA/Escape e reset atômico de página.
3. **Migração de superfícies** — Dados Oficiais, propostas, Mesa, Painel e Relatórios: retirar busca/rótulo, adotar nomes/ordem, intervalo anual, loading/error com retry e empty com CTA contextual.
4. **Painel de Gestão e Dados Oficiais** — remover links à Mesa e limitar este bloco aos filtros e estados já existentes; não criar, mover ou alterar mapa nesta entrega.
5. **Qualidade e limpeza** — remover estados/filtros mortos, atualizar contratos e documentação de fluxo; não reescrever plan-modes históricos executados.

## Execução — 2026-09-28

- [x] Inclusão no monitoramento de linha TransfereGov ficou restrita à parceria confirmada, com validação autoritativa no Service e CTA removido da tramitação.
- [x] Dados Oficiais, Relatórios e Linhas de financiamento receberam filtros sem busca global, sem “Todos/Todas”, com `UF` e `CNES` em caixa alta e Período por intervalo como último campo.
- [x] O filtro decorativo de Parceria TransfereGov foi removido; CNES foi removido somente de Em tramitação.
- [x] Mesa de trabalho e Painel de Gestão usam agora o hook/componente comum de filtros internos, na mesma ordem canônica. Os gráficos, carteira, agenda e divergências do painel são recalculados para o conjunto filtrado. Indicadores sem dado filtrável (ações e licenças deferidas agregadas) mostram `—` quando houver recorte, em vez de exibir um total nacional enganoso.
- [x] Município no monitoramento interno usa chave sem acento/caixa para filtrar e deduplicar opções; a UI apresenta o rótulo capitalizado. Assim, variações como `SAO PAULO` e `São Paulo` pertencem à mesma opção.
- [x] Equipamento no monitoramento interno usa nome prioritário canônico quando houver alias conhecido e, nos demais casos, chave sem acento/caixa. O Painel de Gestão reutiliza a mesma normalização para seus filtros e para a composição da carteira.
- [x] Equipamento no Monitoramento Interno e Painel de Gestão replica o seletor `Prioritário` de Instrumentos/Programas: começa em `Todos`; `Prioritários` e `Outros identificados` apenas determinam o catálogo disponível no campo Equipamento e limpam a escolha anterior ao alternar.
- [x] A busca textual e os filtros legados de fase/técnico foram removidos da Mesa; fase interna passou a ser o valor de `Situação`.
- [x] Removido o atalho “Abrir mesa de trabalho” do Painel e o item global “Auditoria” da navegação; auditoria permanece acessível pelo detalhe de Usuários.
- [x] Ano de instrumentos: Convênio usa ano no número e, se ausente, data oficial de publicação; PERSUS I usa data da licença de operação; PERSUS II recebe o ano da inclusão futura no monitoramento. A reingestão não apaga ano definido pela gestão.
- [x] Backfill aplicado: 58 PERSUS I pela licença e 2 Convênios pela publicação. O PERSUS II `PS2-332125`, incluído indevidamente, e seus 10 eventos foram removidos do monitoramento interno. Resultado conferido: 510 de 560 registros têm ano; os 50 sem ano são PERSUS II ainda fora do monitoramento.
- [x] Mapa de cobertura permaneceu explicitamente fora deste ciclo.

## Riscos e aceite

- Mudança de payload de inclusão exige migração coordenada front/back e compatibilidade explícita; filtros grandes não podem carregar listas ilimitadas nem gerar N+1.
- Cobrir unidade/contrato/E2E: elegibilidade, período inválido, vazio, erro/retry, limpeza, teclado, responsividade 320/375/400/768/1024/1440 e mapa indisponível.
- Validações executadas nesta rodada: `npm run typecheck`, `npm run lint`, `npm run test -- --run` (**121 testes**), `uv run ruff check` e `uv run mypy app` verdes. O conjunto local de `tests/test_monitoramento.py` depende do banco de teste e foi corretamente pulado neste ambiente; E2E e inspeção visual 400/768 permanecem como validação de homologação.
