# Roteiro de release — monitoramento por item e unidade + SISGEO (23/10/2026)

**Estado:** nada foi enviado ao remoto. Tudo está em commits locais na branch `feat/itens-equipamento` (34 commits desde `origin/homologacao`). Cada passo abaixo em produção exige autorização específica do usuário.

## O que o pacote contém

| Bloco | Conteúdo |
|---|---|
| Catálogo e classificação | RENEM (840 itens), códigos legados, 16 famílias com controle por unidade, motor de classificação validado contra a revisão da equipe, fila de revisão |
| Itens e unidades | `item_plano`, `entrega_equipamento`, `unidade_equipamento`, `entrega_legada_revisao`; API de entrega por unidade; tela "Equipamentos do instrumento" |
| Ajustes de interface | NUP em FAF/TED, ordenação por lançamento, nova Fase e cronograma |
| Relatórios e painel | Concluídos e instrumentos com quantidade planejada e entregue; painel com entregues/planejados por família; rendimento fora da quantidade |
| Prazos | Job D−1/D0/D+1 criado, **sem agendamento** |
| Identidade | SIGEO passa a SISGEO (monograma GEO, favicon, e-mails, relatórios, documentação); identificadores técnicos `sigeo_*` preservados |

## Migrations (ordem, todas aditivas)

`c1d2e3f4a5b6` catálogo RENEM · `d2e3f4a5b6c7` decisões de classificação · `e3f4a5b6c7d8` item, entrega e unidade · `f4a5b6c7d8e9` tipo de aviso `entrega_legada_revisao` (ALTER TYPE) · `a5b6c7d8e9f0` tipos `prazo_acao`/`prazo_inauguracao` (ALTER TYPE) e `notificacao.chave_dedup` · `b6c7d8e9f0a1` classificação do item.

Nenhuma remove ou reescreve dado existente. Valores de enum não saem no `downgrade`; a reversão em produção é restaurar o backup de pré-deploy.

## Verificação feita (local, 23/10)

- Backend: suíte inteira com 1.496 testes passando e os mesmos 19 testes que já falhavam e 439 erros de preparação que existem na `origin/homologacao` (medidos lado a lado; são testes de clone/recuperação que exigem papéis e bancos que esta máquina não tem). Nenhuma regressão.
- Frontend: `tsc`, `oxlint`, `build` e 923 testes passando.
- Migrations: sobem, descem e sobem de novo; `alembic check` sem diferença.
- Ao vivo no ambiente local (base de 17/10 pseudonimizada): entrega, vínculo de entrega antiga, painel, fila de revisão, login e e-mail renderizado.

## Ensaio em cópia (23/10, autorizado pelo usuário)

Cópia descartável do clone de 17/10 (`sigeo_homologacao_clone_20261017`, revisão `b7f35c806e4a`, dados pseudonimizados), com o fluxo completo na ordem abaixo. **Não foi o backup de produção:** a restauração dele exige a credencial do R2 e a identidade `age` privada, que não estão nesta máquina nem foram fornecidas; fica como passo do usuário (`backend/scripts/restaurar_backup.sh`).

| Passo | Resultado |
|---|---|
| 6 migrations | 0,53 s no total; só tabelas novas (7, vazias); contagem das 29 tabelas existentes inalterada; `alembic check` limpo |
| `atualizar_catalogo_equipamentos` | 840 itens RENEM, 8 famílias criadas, 2 adotadas, **6 atualizadas** (mamógrafo, ressonância, PET-CT, gama câmara, acelerador, braquiterapia: ligam `controle_por_unidade` e `prioritario`), 6 códigos legados; segunda execução sem mudança |
| `reclassificar_marcadores_por_codigo` | 112 marcadores religados à família, 19 criados (sem apagar nenhum); segunda execução sem mudança |
| `importar_revisao_classificacao` | 71 decisões aplicadas e 6 pendentes; segunda execução `ja_igual` 77 |
| `projetar_itens_plano` | 2.548 itens (2.387 da API, 161 manuais), 623 controlados por unidade, 12 na fila, 46 rendimentos ligados; segunda execução sem mudança |
| `vincular_entregas_legadas` | 57 entregas vinculadas, 3 para revisão em 2 instrumentos, 2 avisos; segunda execução sem mudança |
| `job_prazos_monitoramento` | simulação por data: sem avisos hoje; 2 em 30/10 (D−1 e D0) |
| `downgrade` das 6 migrations | volta a `b7f35c806e4a`; o que os scripts gravaram em tabelas existentes (catálogo, marcadores, avisos, auditoria) **não** volta: a reversão em produção é o backup de pré-deploy |

**Ordem obrigatória:** a revisão da equipe deve ser importada **antes** da projeção; sem ela a projeção sai com 55 rendimentos e 13 itens na fila, e uma segunda projeção corrige (77 itens atualizados).

**Atenção ao release:** o passo do catálogo muda o significado de "Prioritário" nas 6 famílias já existentes (decisão do usuário de 23/10: as 16 famílias definem o prioritário); conferir os relatórios e filtros que usam `prioritario` depois de gravar.

## Ensaio com o backup real de produção (26/10, autorizado pelo usuário)

Backup `sigeo/producao/2026/10/26/sigeo-20261026T075305Z-40288491488.dump.age` (agendado, 04:52 de Brasília; SHA-256 conferido), decifrado e restaurado pelo usuário em `sigeo_restore_manual` (183 MB, `alembic_version` `b7f35c806e4a`, 560 convênios, 292 instrumentos monitorados, 22 usuários). O ensaio rodou numa cópia dele, só no Mac, sem tocar em produção.

| Passo | Resultado |
|---|---|
| 6 migrations | `b7f35c806e4a` → `b6c7d8e9f0a1`; só criam 7 tabelas novas (vazias); as 29 existentes mantêm a contagem; `alembic check` limpo |
| `atualizar_catalogo_equipamentos` | 840 itens RENEM; **9 famílias criadas** (inclui colposcópio, que em produção ainda não tinha linha) e 1 adotada (arco cirúrgico); 6 atualizadas; 6 códigos legados; 2ª execução sem mudança |
| `reclassificar_marcadores_por_codigo` | 112 religados e 19 criados; 2ª execução sem mudança |
| `importar_revisao_classificacao` | 71 aplicadas e 6 pendentes; 2ª execução `ja_igual` 77 |
| `projetar_itens_plano` | 2.548 itens (2.387 API, 161 manuais, todos com quantidade 1), 623 controlados por unidade, 12 na fila, 46 rendimentos ligados; 2ª execução sem mudança |
| `vincular_entregas_legadas` | 57 entregas, 3 revisões; **2 avisos para 14 destinatários cada** (instrumentos sem titular: difusão a todo colaborador, gestor e admin); 2ª execução sem mudança |
| `job_prazos_monitoramento` (simulação) | 26/10: 1 aviso D0; 27/10: 1 D+1; 05/11: 2 D+1 |
| Relatórios (Excel e Word, instrumentos e Concluídos, simplificado e completo, Brasil e SP) | todos gerados e abertos, 0,3 a 1,1 s cada, com a coluna de entregues; Concluídos com 290 instrumentos; PERSUS I com quantidade planejada 1 (efeito do #38) |
| API de equipamentos e fila (serviço, com um admin real da cópia) | instrumento com entrega lista item `entregue`; fila com 12 itens; 3 entregas legadas visíveis ao admin |
| `downgrade` e nova subida | 6 reversões e 6 subidas, sem erro; o que os scripts gravaram em tabelas existentes não volta (restaurar o backup de pré-deploy) |

Os números do clone de 17/10 e do backup de hoje são idênticos nas projeções.

## Ainda não feito (bloqueia a subida)

1. **Conferência humana de layout:** Word e Excel abertos nos aplicativos (os arquivos foram gerados e lidos, não vistos), e-mail em Gmail e Outlook, e2e do front.
2. **Decisões e resíduos:** nome por extenso do SISGEO, "SIEO" no `pyproject`/Render, nomes externos (New Relic, repositório).
3. **Difusão dos 2 avisos de entrega a vincular** (14 pessoas cada): confirmar se é o desejado ou se o aviso deve ir só a gestor e admin quando não há titular.
4. Roles `sigeo_runtime`/`sigeo_migration` não existem no restauro local: o teste de permissões só vale no `migrar_banco.yml`.

## Sequência em produção (cada passo com autorização)

1. Backup de pré-deploy (`backup_banco.yml`, manual) e conferência.
2. Merge do pacote e `migrar_banco.yml` (confere role e permissões) **antes** do deploy do código.
3. Manual Deploy no Render; Vercel publica o front.
4. Verificação: `/health`, login, abrir um instrumento com e sem itens, painel, relatório de Concluídos.
5. Janela de observação (48 h).
6. Em simulação e, depois de revisar os números, com o "pode gravar" do usuário, **nesta ordem**: `atualizar_catalogo_equipamentos` → `reclassificar_marcadores_por_codigo` → `sanear_marcadores_equipamento` → `importar_revisao_classificacao` → `projetar_itens_plano` → `vincular_entregas_legadas` (cria os avisos aos técnicos).
7. Fora de escopo: `marcar_fora_escopo_obras` em simulação e, depois, com o "pode gravar" (18 convênios; 4 deixam de ser monitorados).
7b. Fila de revisão: gestor e admin decidem os itens pendentes.
8. Job de prazos: uma rodada manual supervisionada em simulação; **agendamento só depois** da operação de alertas.

## Pendências para a equipe (investigação do universo de 560 instrumentos, 26/10)

Medido no backup de 26/10 com a classificação da branch (só leitura). Os 560 são as linhas de `convenio`; nenhum tratamento de item (remover obra, identificar item fora do catálogo) reduz esse número, porque o único mecanismo que tira um instrumento do universo é a marca manual `fora_escopo_equipamentos` (hoje 0 marcados).

| Grupo | Instrumentos |
|---|---|
| A. Ao menos 1 equipamento das 16 famílias | 479 |
| B. Equipamento fora das 16 famílias, de programa oncológico (mantido; inclui acessório, como o 985680 com o item 011237, monitor para ressonância) | 61 |
| D. Só obra/serviço | 18 |
| E. Sem item algum | 2 (FAF) |

- **FAF sem itens, a verificar com a equipe:** `25000083818202628` (MG, sem nenhum item) e `25000083829202616` (RR, só um item "Ultrasom + Mamógrafo", que descreve dois equipamentos e aguarda separação). Ambos são monitorados.
- **Obras (18 convênios só de obra): decidido em 26/10** que não fazem parte do escopo e **não devem aparecer em lugar nenhum**; ficam no banco. Implementado: `scripts/marcar_fora_escopo_obras.py` (simulação, auditoria, `--desfazer`) e o filtro `instrumento_no_escopo()` em monitoramento, painel, relatórios, avisos e prazos. Quatro eram monitorados (744879, 813703, 851416 e 971253): saem junto (monitorados 292 → 288; firmados 560 → 542). Passo novo do release, **depois** dos scripts de carga e **com autorização**: `marcar_fora_escopo_obras`.
- **Regra dos R$ 300 mil (decidida em 26/10):** equipamento fora das 16 famílias com valor por unidade ≥ R$ 300 mil entra no monitoramento por item (75 itens no backup de 26/10, 55 convênios; sem a regra eram 0). Aplica-se com `projetar_itens_plano`.
- **Adicionar item manual (decidido em 26/10): não será permitido por ora.** O colaborador não insere item em instrumento de carga manual (FAF, TED, PERSUS I e II); a pendência dos dois FAFs acima fica registrada para o responsável verificar com a equipe.

## Rollback

Backend: redeploy do commit anterior (as migrations são aditivas e o código antigo continua funcionando). Front: promover o deploy anterior na Vercel. Banco: restaurar o backup de pré-deploy. Dados gravados pelos scripts do passo 6 são reversíveis por restauração; as decisões da fila (passo 7) são append-only.

## Fora deste pacote

Fotografias (etapa 9), `equivalente_renem` dos códigos extintos, valor pago ao fornecedor por item (seção 10 do plano de classificação), rateio de rendimento entre bens.
