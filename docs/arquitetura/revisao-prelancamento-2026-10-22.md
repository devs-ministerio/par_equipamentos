# Revisão pré-lançamento do PR #28 — 22/10/2026

Guia de revisão por blocos e revisão de segurança do PR #28 (base `master`,
49 commits, 483 arquivos, +52.439/−1.629 linhas). Estado: CI verde no commit
`9868486`, mesclável, rascunho. Nada deste documento foi executado em produção.

## 1. Como ler o PR

Cerca de 60% das linhas são **teste (15,8 mil)**, **documentação (6,2 mil)** e
**scripts de operação (4,5 mil)**, que não rodam na API. O que muda o
comportamento da produção é bem menor.

| Bloco | Arquivos | + linhas | Roda na API? |
|---|---:|---:|---|
| Migrations (schema) | 21 | 837 | só quando aplicadas por `migrar_banco.yml` |
| Radar, descoberta e recaptura (backend) | 43 | 3.105 | sim |
| Relatórios e exportação (backend) | 13 | 1.090 | sim |
| Notificações e espelho (backend) | 10 | 569 | sim |
| Outros backend (`app`) | 17 | 856 | sim |
| Scripts e jobs | 44 | 4.550 | não, só por workflow manual |
| Testes backend | 130 | 15.831 | não |
| Frontend: relatórios | 18 | 1.632 | sim (navegador) |
| Frontend: Radar, entradas, fontes, notificações | 35 | 3.824 | sim |
| Frontend: monitoramento, painel, mapa | 68 | 6.721 | sim |
| Frontend: outros | 56 | 5.812 | sim |
| Frontend: e2e | 10 | 1.105 | não |
| CI/DevOps | 6 | 140 | CI |
| Documentação e padrões | 8 | 6.231 | não |

## 2. Ordem de revisão sugerida (do maior risco ao menor)

1. **Migrations** (12 revisões, head `b7f35c806e4a`). Só aditivas; ver
   `planmode-execucao-producao-2026-10-22.md` (Fase 0) e o pré-voo de posse
   (`normalizar_posse_aplicacao.sql`) sem o qual falham em produção.
2. **Rotas novas** (10, todas autenticadas): `GET/POST /candidatos-legados...`
   (5), `GET /fontes/capturas`, `PATCH /notificacoes/lidas`,
   `PATCH /notificacoes/{id}/arquivo`, `GET /relatorios/encerrados`.
3. **Relatórios e exportação**: DOCX progressivo, admissão por processo, filtro de
   encerrados, cliente HTTP com prazo de 90 s.
4. **Radar** (descoberta, prova, aprovação): escreve na carteira, por isso a
   autorização é verificada no Service.
5. **Frontend**: relatórios, Central de notificações, Radar; o restante é
   apresentação de monitoramento e painel.
6. Scripts, testes e documentação por amostragem.

## 3. Revisão de segurança (constituição de Segurança)

| Item | Resultado |
|---|---|
| Autenticação nas 10 rotas novas | `require_current_user` em todas. |
| Autorização de escrita | Aprovar e decidir candidatos só passam para `gestor` e `admin` **ativos**, verificado dentro do Service (`aprovacao_legado.py`, `decisoes_legado.py`), não só no router. |
| IDOR | `PATCH /notificacoes/{id}/arquivo` só alcança notificação do próprio destinatário; outro id devolve 404. |
| CSRF | Middleware global cobre `POST/PATCH` novos; sem exceção adicionada. |
| Exposição de dados | `ProvaLegadoRead` traz número, situação, valor, convenente, município, UF e metadados da prova, **sem payload bruto** do SICONV. |
| TLS e clientes externos | Nenhum `verify=False` ou equivalente nos clientes novos; regra do Semgrep local ativa no CI. |
| Segredos | gitleaks verde; nenhuma variável nova em `Settings`, `render.yaml` ou workflows; `radar_convenios.yml` inalterado. |
| Dependências | `pip-audit` backend sem vulnerabilidades; `npm audit` (produção) com 1 **moderada** em `fast-uri` (indireta), abaixo do limite do gate. Acompanhar. |
| Headers, CORS, cookies, sessão | Mudança única: `expose_headers=["Content-Disposition"]` (necessário ao nome do arquivo); TTL, SameSite, Path e CSRF intactos. |
| Posse e permissões no banco | Achado: 3 tabelas, 3 sequências e 11 enums de produção com `neondb_owner`; corrigido por script versionado (PR #35). ACLs reais de produção conferem com o script. |

**Pendências de segurança, sem bloquear o release:** acompanhar `fast-uri`; a CSP
da API segue em Report-Only (promover exige relatório real de violação).

## 4. Pré-requisitos do release

- [x] CI verde no SHA publicado; base em `master`; branch sincronizada.
- [x] Backup real restaurável com duas identidades; ensaio das migrations com a
      posse real de produção (falha sem o pré-voo, passa com ele).
- [ ] Backup agendado com ao menos uma execução bem-sucedida.
- [ ] Aceite nativo dos arquivos Word e Excel (lote de 22/10 em
      `/private/tmp/sigeo-aceite-final-20261022/`).
- [ ] Nomes das variáveis do Render conferidos no painel.
- [ ] Janela de observação e responsável definidos; Manual Deploy planejado.
- [ ] PR marcado como pronto para revisão (hoje é rascunho).
