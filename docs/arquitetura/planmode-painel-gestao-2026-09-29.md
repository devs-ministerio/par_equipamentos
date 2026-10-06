# Plan Mode — confiabilidade e evolução do Painel de Gestão (2026-09-29)

## Objetivo e identidade

- Tornar o painel executivo confiável antes de ampliar os dashboards; distinguir zero, dado ausente, total global e recorte filtrado.
- Responder três perguntas: onde agir agora, como a carteira avança e onde estão concentrados instrumentos e investimento.
- Preservar a identidade atual: verde-petróleo discreto, Public Sans, divisores editoriais, densidade administrativa e tema claro; sem cards ou cores decorativas em excesso.
- Escopo exclusivo do monitoramento pós-repasse; seus dados não alimentam cobertura, déficit, distância nem o mapa da Análise de Mérito.

## Arquivos previstos e arquitetura

- Backend: `app/repositories/monitoramento.py`, `app/services/monitoramento_resumo.py`, `app/schemas_monitoramento.py` e `tests/test_monitoramento.py`.
- Frontend: `src/services/monitoramento-resumo.ts`, hooks do monitoramento, `src/pages/monitoramento-painel-page.tsx`, componentes `monitoramento-painel-*.tsx` e testes correspondentes.
- A página fica apenas como composição; agregações de apresentação vão para helper testável, e regras de vigência de ação, fase e licença permanecem no Service/Repository.
- Reutilizar filtros, tokens, componentes de mapa e navegação existentes; não criar estado global novo nem duplicar o transporte HTTP.

## Blocos de execução

1. **Confiabilidade (P1):** aplicar o predicado de ação ativa às contagens; testar ações vigentes, substituídas e excluídas. Auditar se a licença com validade exibida é a vigente/deferida e documentar o critério antes de alterar a regra.
2. **Semântica financeira (P1):** incluir o valor global da carga manual controlada mesmo quando a flag de finanças oficiais é falsa; distinguir pagamento registrado de quitação integral assumida **somente para carga manual com fase interna Concluído**. Convênio oficial depende de pagamento registrado. Nunca tratar `null` como pagamento zero nem apresentar a regra da carga como comprovante individual.
3. **Contrato por instrumento (P1):** adicionar ao resumo, de forma tipada, ações pendentes/atrasadas, licença deferida, percentual de referência da fase e data da última atividade por `nr_convenio`; agregar no frontend apenas o recorte, sem recalcular regras de domínio. Sem N+1 e com teto explícito.
4. **KPIs honestos (P1):** tornar “Pontos de atenção” completo sob filtros ou rotulá-lo como parcial até o contrato estar pronto; contar ocorrências e instrumentos afetados separadamente. A média de fase usa o total da carteira filtrada, com ausência de marco como 0%, e é identificada como referência, não medição física individual.
5. **Leitura operacional (P2):** acrescentar uma fila priorizada de ações vigentes e prazos em faixas (vencido, 0–30, 31–90 dias), com responsável, instrumento e acesso ao detalhe. Dividir licenças vencidas das próximas e listar instrumentos cuja vigência se encerra nos próximos 90 dias; evitar um único vermelho para todos os estados.
6. **Novos dashboards úteis (P2):** composição de valor e quantidade por tipo de contratação/fase; calendário de inaugurações previstas versus realizadas; distribuição territorial por fase usando somente coordenadas CNES. Adicionar série por **ano da inauguração realizada**, usando `data_ocorrencia` do marco vigente; previsões ficam em série distinta, nunca misturadas ao realizado. Tempo entre fases só após validar datas/eventos ativos e definir denominadores/coortes.
7. **Qualidade do dado (P2):** expor percentuais de registros com CNES/coordenadas, técnico, ano e finanças observadas; mostrar data de atualização e origem. Não inferir macrorregião por município em texto livre; nomes devem vir da dimensão já usada no Mapa de Cobertura, com fallback pontual apenas quando oficialmente verificado.

## UX, estados e riscos

- Filtros canônicos atualizam todos os blocos; loading com Skeleton, erro com retry, vazio com explicação e CTA contextual, sucesso/seleção com feedback e foco visível.
- Layout sem scroll horizontal em 320/375/400/768/1024/1440 px; mapa e listas utilizáveis por teclado e leitor de tela. Conferir contraste WCAG AA e legibilidade das legendas, não apenas overflow.
- Riscos: quebra de contrato Zod, custo de consulta, contagem dupla de instrumentos com múltiplas pendências, fontes financeiras incomparáveis e falsa leitura de tendência a partir do ano do instrumento.
- Não alterar diretamente a produção, não executar migrations sem necessidade comprovada e não fazer commit em `master`; implementação futura somente em `homologacao` após aprovação deste plano.

## Aceite

- Testes de Repository/Service para vigência, nulos, filtros e denominadores; contratos Zod e testes visíveis dos estados do painel.
- E2E autenticado inclui `/monitoramento-equipamentos/painel`, filtro, mapa nacional/rodoviário, agenda e retorno; inspeção visual real em 400 e 768 px.
- `ruff`, `mypy`, pytest, lint, typecheck, Vitest e build verdes; nenhum KPI apresenta zero para dado desconhecido nem total global como se fosse filtrado.
