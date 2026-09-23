# Plan Mode — Fechamento da Constituição Frontend (2026-09-22)

## Objetivo e guardrails

- Fechar os achados ativos dos diagnósticos de 2026-09-16/17 e 2026-09-22 sem alterar regras SUS, cálculos ou contratos HTTP publicados sem migração coordenada.
- Preservar identidade: verde-petróleo, Public Sans + Space Grotesk, assinatura lateral, densidade administrativa, light-only e componentes shadcn/Radix/Lucide.
- Toda etapa inclui loading, erro com retry, vazio, sucesso/toast, teclado, foco e verificação visual 400px/768px; rodar lint, typecheck, testes e build antes de avançar.
- Limpeza: só apagar arquivo/comentário após `rg` de consumidores estáticos/dinâmicos, substituto testado e atualização simultânea de `AGENTS.md`/diagnósticos/contexto afetado.

## Etapas de execução

1. **Filtro acessível e responsivo** — propriedade: `components/common/{single,multi}-select-filter.tsx`, `filter-workspace.tsx`, páginas consumidoras e testes. Substituir controles manuais por composição Radix/shadcn ou primitive única com `button` real, `aria-expanded`/`aria-controls`, listbox/opções, Tab/setas/Enter/Escape, clique externo e `type="button"`; adotar largura fluida e empilhamento mobile. Migrar Dashboard, Dados Oficiais, Mesa, Mapa, Relatórios e propostas a `FilterWorkspace` sem mudar filtros ou resultados.
2. **Geodados como contrato** — propriedade: novo `services/geojson.ts`, `hooks/useMacroGeojson.ts`, `hooks/useContornoMunicipio.ts`, schemas Zod e testes. Mover `fetch` dos hooks, validar FeatureCollection mínima, normalizar erro em `ApiError`, manter cache Infinity e expor indisponibilidade de contorno ao mapa sem derrubar o restante.
3. **Decomposição orientada à responsabilidade** — propriedade: páginas `monitoramento-equipamentos`, `dashboard`, `mapa`, `monitoramento-overview`; componentes de tabelas/exportação/form-evento e hooks novos. Extrair estado/filtros/paginação e derivações para hooks, listas/tabelas para features e deixar páginas apenas comporem rota. Prioridade é reduzir todos os arquivos acima de 200 linhas sem split mecânico nem regressão de query keys, URL, loading, vazio ou erro.
4. **Formulários e resiliência global** — propriedade: `account-action-page.tsx`, novos componentes/forms, `lib/validations`, `App.tsx` e testes. Separar ativação, redefinição e recuperação; usar React Hook Form + Zod, labels, helper/error, loading/disabled e feedback seguro. Introduzir Error Boundary global com fallback institucional e ação de recuperação, preservando o tratamento local de `ApiError`.
5. **Qualidade visual e acessibilidade comprovada** — propriedade: testes RTL/axe, Playwright, rotas críticas e CI. Cobrir teclado/ARIA dos filtros, erro GeoJSON, formulários e boundary; executar E2E com usuário descartável e segredo exclusivo do ambiente. Auditar 320/375/400/768/1024/1440px, registrando zero overflow global e rolagem apenas em tabela/diagrama; corrigir contraste, labels e foco encontrados.
6. **Performance, limpeza e contexto** — propriedade: `index.css`, componentes/páginas tocados, docs e workflows. Remover a variante dark/classes aspiracionais somente após confirmar ausência de consumidor; reduzir comentários históricos a motivo local. Reavaliar paginação/virtualização: só implementar com `total`/`meta` real do backend; se esse contrato ainda não existir, documentar o bloqueio e abrir plan-mode coordenado, sem simular paginação.

## Riscos e aceite

- Riscos: quebrar seleção de filtros, foco do mapa, cache TanStack, deep links, exportadores lazy e autenticação; mitigar por migração rota a rota, testes de comportamento e validação visual antes/depois.
- Não executar limpeza de `.DS_Store`: está ignorado e não rastreado; não é item de repositório a remover.
- Aceite: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` e E2E autenticado passam; filtros passam axe/teclado; GeoJSON é Zod+service; arquivos tocados obedecem responsabilidade única; todas as rotas críticas passam em 320/375/400/768/1024/1440px; diagnóstico e nota são atualizados.

## Execução — 2026-09-22

- Concluídos: filtros receberam botões semânticos, ARIA, fechamento por
  Escape, foco na busca e largura fluida; Dashboard, Dados Oficiais, Mesa de
  Trabalho, Mapa, Linhas de Financiamento e os modais de Relatórios adotaram
  `FilterWorkspace`, com limpeza explícita e contagem onde aplicável;
  GeoJSON passou a service validado por Zod e o
  contorno indisponível é comunicado sem derrubar o mapa; os formulários de
  conta usam React Hook Form + Zod, estados de envio e mensagens seguras;
  `AppErrorBoundary` protege a árvore de rotas; a timeline financeira da
  proposta foi separada do seu detalhe bruto; as páginas Mesa de Trabalho,
  Mapa e Dashboard foram reduzidas para composição; Dados Oficiais separou
  estado, regra de filtragem, resumo/paginação, opções em cascata e blocos
  visuais em módulos próprios; a infraestrutura dark não utilizada foi
  removida. O comentário de layout obsoleto da página também foi removido.
- Verificado localmente: `npm run lint`, `npm run typecheck`, `npm run test`
  (78 testes, incluindo contrato GeoJSON, error boundary, teclado e axe dos
  filtros) e `npm run build`
  passaram.
- Validação manual autenticada: login no SIGEO local confirmado em
  `localhost:5173`; Dados Oficiais carregou 560 instrumentos. Em 400px,
  768px e 1440px, `scrollWidth === clientWidth` e nenhum controle excedeu a
  largura disponível.
- E2E de sessão (22/09): Chromium 1.63.0 iniciou corretamente. A rota sem
  sessão passou pelo Playwright e redirecionou para `/login`. A correção
  associada trata `401` de `GET /auth/me` como visitante anônimo; falhas de
  rede e respostas não autorizadas fora desse contrato continuam no estado
  de erro com retry. O login local foi validado de ponta a ponta no navegador
  e carregou os 560 instrumentos.
- Aceite automatizado autenticado (22/09): `npm run test:e2e` passou com os
  três cenários — redirecionamento sem sessão, login válido e auditoria de
  overflow horizontal nas rotas Dashboard, Mapa, Relatórios e Monitoramento
  (visão geral e instrumentos) em 320/375/400/768/1024/1440px. A execução é
  serial porque o limite de autenticação é por IP e a credencial é
  compartilhada. O spec recebe `E2E_EMAIL`/`E2E_SENHA` somente no ambiente;
  credenciais não foram incluídas em código, arquivos ou documentação. Para
  execução contínua, esses mesmos segredos devem ser cadastrados no ambiente
  da CI.
