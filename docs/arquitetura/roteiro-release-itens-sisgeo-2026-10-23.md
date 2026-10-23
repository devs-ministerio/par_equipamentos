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

## Ainda não feito (bloqueia a subida)

1. **Ensaio com o backup real de produção** (pelo `restaurar_backup.sh`, com credencial e identidade do usuário), repetindo a tabela acima e conferindo as contagens.
2. **Conferência humana de layout:** Word e Excel abertos nos aplicativos, e-mail em Gmail e Outlook, e2e do front.
3. **Resíduos decididos à parte:** nome por extenso do SISGEO, "SIEO" no `pyproject`/Render, nomes externos (New Relic, repositório).
4. **PR #38** (quantidade e valor de equipamento) só depois da janela de 48 h (até a noite de 24/10); o pacote assume que ele já está na `master`.

## Sequência em produção (cada passo com autorização)

1. Backup de pré-deploy (`backup_banco.yml`, manual) e conferência.
2. Merge do pacote e `migrar_banco.yml` (confere role e permissões) **antes** do deploy do código.
3. Manual Deploy no Render; Vercel publica o front.
4. Verificação: `/health`, login, abrir um instrumento com e sem itens, painel, relatório de Concluídos.
5. Janela de observação (48 h).
6. Em simulação e, depois de revisar os números, com o "pode gravar" do usuário, **nesta ordem**: `atualizar_catalogo_equipamentos` → `reclassificar_marcadores_por_codigo` → `importar_revisao_classificacao` → `projetar_itens_plano` → `vincular_entregas_legadas` (cria os avisos aos técnicos).
7. Fila de revisão: gestor e admin decidem os itens pendentes.
8. Job de prazos: uma rodada manual supervisionada em simulação; **agendamento só depois** da operação de alertas.

## Rollback

Backend: redeploy do commit anterior (as migrations são aditivas e o código antigo continua funcionando). Front: promover o deploy anterior na Vercel. Banco: restaurar o backup de pré-deploy. Dados gravados pelos scripts do passo 6 são reversíveis por restauração; as decisões da fila (passo 7) são append-only.

## Fora deste pacote

Fotografias (etapa 9), `equivalente_renem` dos códigos extintos, valor pago ao fornecedor por item (seção 10 do plano de classificação), rateio de rendimento entre bens.
