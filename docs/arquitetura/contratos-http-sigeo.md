# Contratos HTTP do SIGEO

Atualizado em 2026-09-24. Esta é a matriz viva das 42 operações expostas
pelos routers da API. Ela é um índice de contrato: o schema efetivo continua
no `response_model` do router e os testes citados são a evidência executável.
Não registrar corpo de sessão, token, e-mail real ou payload de produção nos
testes nem nesta matriz.

## Convenções

- **Sessão**: `Público`, `Sessão` (cookie válido) ou `Admin`.
- **Erros mínimos**: `401` representa ausência/expiração de sessão; `403`,
  papel insuficiente; `422`, entrada inválida; `404`, recurso inexistente.
  Só se aplica o que a rota realmente pode emitir.
- **Evidência**: teste backend de contrato. `Pendente` não é aceite: indica
  cenário que ainda precisa ser acrescentado antes de declarar o bloco 3
  concluído.
- O frontend valida respostas por Zod em `frontend/src/services/`; os testes
  de HTTP backend verificam o contrato observável do servidor.

## Análise de mérito (9)

- `GET /macro-coverage` — consumidor `services/api.ts::fetchMacroCoverage`;
  200 lista agregada; Público; 422 para filtro inválido; evidência:
  `backend/tests/test_cobertura.py`.
- `GET /municipality-coverage` — `services/api.ts::fetchMunicipalityCoverage`;
  200 lista municipal; Público; 422 para parâmetros inválidos; evidência:
  `backend/tests/test_municipality_coverage.py`.
- `GET /health-region-coverage` — `services/api.ts::fetchHealthRegionCoverage`;
  200 lista regional; Público; 422 para parâmetros inválidos; evidência:
  `backend/tests/test_municipality_coverage.py`.
- `GET /equipment-offer-rows` — sem consumidor no frontend hoje (achado
  durante o Plan Mode fechamento final 2026-09-25, Bloco 1 — `fetchEquipmentOfferRows`
  citado aqui nunca existiu em `services/api.ts`; candidato a revisão no
  Bloco 9 de limpeza); 200 página de oferta no envelope `{data, meta.total}`;
  Autenticado; 422 para paginação/filtros inválidos; evidência:
  `backend/tests/test_equipment_offer_contracts.py`.
- `GET /equipment-offer-rows/totals` — `services/api.ts::fetchEquipmentTotals`;
  200 totais SUS/em uso; Público; 422 para filtro inválido; evidência:
  `backend/tests/test_equipment_offer_contracts.py`.
- `GET /equipment-offer-rows/by-legal-nature` —
  `services/api.ts::fetchLegalNatureBreakdown`; 200 agregação SUS/em uso;
  Público; 422 para filtro inválido; evidência:
  `backend/tests/test_equipment_offer_contracts.py`.
- `GET /equipment-offer-rows/facilities` —
  `services/api.ts::fetchFacilityOptions`; 200 opções de estabelecimento;
  Público; 422 para filtro inválido; evidência:
  `backend/tests/test_equipment_offer_contracts.py`.
- `GET /equipment-offer-rows/establishments` —
  `services/api.ts::fetchEstabelecimentosPage`; 200 página de
  estabelecimentos no envelope `{data, meta.total}` (Plan Mode fechamento
  final 2026-09-25, Bloco 1); Autenticado; 422 para paginação/filtros
  inválidos; evidência: `backend/tests/test_equipment_offer_contracts.py`.
- `GET /convenios` — `services/convenios.ts::fetchConvenios`; 200 lista
  paginada; Público; 422 para limite/filtro inválido; evidência:
  `backend/tests/test_convenios_contracts.py`.

## Instrumentos firmados e monitoramento interno (18)

- `GET /convenios/{numero}` — `services/convenios.ts::fetchConvenioDetalhe`;
  200 detalhe, com carga manual sem subdados de API; Público; 404/422;
  evidência: `backend/tests/test_convenios_contracts.py`.
- `GET /monitoramento/cnes-referencia` — `services/cnes-referencia.ts`;
  200 opções CNES; Sessão; 401/422; evidência:
  `backend/tests/test_monitoramento_auth.py` (limite de autocomplete,
  shape público e termo inválido).
- `GET /monitoramento/marcos` — `services/monitoramento-marcos.ts`;
  200 catálogo fixo; Público; 200 vazio aceitável; evidência:
  `backend/tests/test_monitoramento.py`.
- `GET /monitoramento/instrumentos` —
  `services/monitoramento-instrumentos.ts::fetchInstrumentos`; 200 lista;
  Sessão; 401; evidência: `backend/tests/test_monitoramento_auth.py`.
- `GET /monitoramento/instrumentos/{nr_convenio}` —
  `fetchInstrumentoTimeline`; 200 linha do tempo; Sessão; 401/404;
  evidência: `backend/tests/test_monitoramento_auth.py` e
  `backend/tests/test_monitoramento.py`.
- `POST /monitoramento/instrumentos` — `criarInstrumento`; 201 instrumento;
  Editor; 401/403/422; evidência: `backend/tests/test_monitoramento_auth.py`.
- `PATCH /monitoramento/instrumentos/{nr_convenio}` —
  `patchCadastroInstrumento`; 200 instrumento; Editor; 401/403/404/422;
  evidência: `backend/tests/test_monitoramento_auth.py`.
- `POST /monitoramento/instrumentos/{nr_convenio}/eventos` —
  `registrarEvento`; 201 evento append-only; Editor; 401/403/404/422;
  evidência: `backend/tests/test_monitoramento.py` e
  `backend/tests/test_monitoramento_auth.py`.
- `PATCH /monitoramento/eventos/{evento_id}` — `editarEvento`; 200 evento
  substituto; Editor; 401/403/404/422; evidência:
  `backend/tests/test_monitoramento.py`.
- `DELETE /monitoramento/eventos/{evento_id}` — `excluirEvento`; 200 evento
  fechado; Editor; 401/403/404/422; evidência:
  `backend/tests/test_monitoramento.py`.
- `GET /monitoramento/resumo` — `services/monitoramento-resumo.ts`; 200
  resumo e divergências calculadas no backend; Sessão; 401; evidência:
  `backend/tests/test_monitoramento_divergencias.py`.
- `GET /monitoramento/acoes` — `services/monitoramento-acoes.ts`; 200 ações;
  Sessão; 401/422; evidência: `backend/tests/test_monitoramento_auth.py`.
- `POST /monitoramento/instrumentos/{nr_convenio}/acoes` —
  `criarAcao`; 201 ação; Editor; 401/403/404/422; evidência:
  `backend/tests/test_monitoramento.py`.
- `PATCH /monitoramento/acoes/{acao_id}` — `editarAcao`; 200 ação;
  Editor; 401/403/404/422; evidência:
  `backend/tests/test_monitoramento.py`.
- `DELETE /monitoramento/acoes/{acao_id}` — `excluirAcao`; 200 ação fechada;
  Editor; 401/403/404/422; evidência:
  `backend/tests/test_monitoramento.py`.
- `PATCH /monitoramento/acoes/{acao_id}/concluir` — `concluirAcao`; 200 ação
  concluída; Editor; 401/403/404; evidência:
  `backend/tests/test_monitoramento.py`.
- `GET /notificacoes` — `services/notificacoes.ts::fetchNotificacoes`; 200
  lista/paginação; Sessão; 401/422; evidência:
  `backend/tests/test_notificacoes.py`.
- `PATCH /notificacoes/{notificacao_id}` — `marcarNotificacaoLida`; 200
  notificação; Sessão; 401/404; evidência:
  `backend/tests/test_notificacoes.py`.

## Radar de propostas e autenticação (8)

- `GET /propostas-candidatas` — `services/propostas-candidatas.ts`; 200
  lista/paginação; Sessão; 401/422; evidência:
  `backend/tests/test_propostas_candidatas.py`.
- `POST /auth/login` — `services/auth.ts::login`; 200 e cookies HttpOnly;
  Público; 401/422/429; evidência: `backend/tests/test_auth_session.py`.
- `POST /auth/ativar` — `ativarConta`; 200; Público; 400/422; evidência:
  `backend/tests/test_usuarios.py` e `backend/tests/test_auth_session.py`.
- `POST /auth/esqueci-senha` — `solicitarRecuperacao`; 200 genérico;
  Público; 422/429; evidência: `backend/tests/test_usuarios.py`; não revelar
  existência de e-mail é requisito de revisão.
- `POST /auth/redefinir-senha` — `redefinirSenha`; 200; Público;
  400/422; evidência: `backend/tests/test_usuarios.py` e
  `backend/tests/test_auth_session.py`.
- `POST /auth/refresh` — cliente HTTP comum; 200 e rotação de cookies;
  Sessão + CSRF; 401/403; evidência: `backend/tests/test_auth_session.py` e
  `backend/tests/test_csrf.py`.
- `POST /auth/logout` — `services/auth.ts::logout`; 200, limpeza dos cookies
  e revogação imediata da sessão que também invalida seu access JWT; Sessão +
  CSRF; 401/403; evidência: `backend/tests/test_auth_session.py`.
- `GET /auth/me` — `fetchCurrentUser`; 200 usuário; Sessão; 401; evidência:
  `backend/tests/test_auth_session.py`.

## Administração de usuários (7)

- `GET /usuarios` — `services/usuarios.ts::fetchUsuarios`; 200 lista;
  Admin; 401/403/422; evidência: `backend/tests/test_usuarios.py`.
- `POST /usuarios` — `criarUsuario`; 201 usuário e convite; Admin;
  401/403/409/422; evidência: `backend/tests/test_usuarios.py`.
- `PATCH /usuarios/{user_id}` — `atualizarUsuario`; 200 usuário; Admin;
  401/403/404/422; evidência: `backend/tests/test_usuarios.py`.
- `POST /usuarios/{user_id}/enviar-redefinicao` — `enviarRedefinicao`;
  200 usuário; Admin; 401/403/404; evidência:
  `backend/tests/test_usuarios.py`.
- `POST /usuarios/{user_id}/reenviar-convite` — operação administrativa sem
  consumidor frontend atual; 200 usuário; Admin; 401/403/404; evidência:
  `backend/tests/test_usuarios.py`.
- `POST /usuarios/{user_id}/inativar` — `inativarUsuario`; 200 usuário;
  Admin; 401/403/404; evidência: `backend/tests/test_usuarios.py`.
- `POST /usuarios/{user_id}/reativar` — `reativarUsuario`; 200 usuário;
  Admin; 401/403/404; evidência: `backend/tests/test_usuarios.py`.

## Regra de manutenção

Ao adicionar ou remover um endpoint, alterar esta matriz na mesma mudança e
incluir/ajustar o teste indicado. A revisão de PR deve rejeitar endpoint sem
evidência executável, salvo uma marca `Pendente` justificada e com plano de
remoção. Não há marcação pendente nesta revisão; qualquer uma futura deve
ser removida antes de concluir a mudança que a introduziu.
