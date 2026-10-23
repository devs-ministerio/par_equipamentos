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

## Ainda não feito (bloqueia a subida)

1. **Ensaio com cópia restaurada de um backup de produção:** aplicar as 6 migrations com a role de migração, rodar `projetar_itens_plano` e `vincular_entregas_legadas` em simulação, conferir contagens e a suíte de regressão.
2. **Conferência humana de layout:** Word e Excel abertos nos aplicativos, e-mail em Gmail e Outlook, e2e do front.
3. **Resíduos decididos à parte:** nome por extenso do SISGEO, "SIEO" no `pyproject`/Render, nomes externos (New Relic, repositório).
4. **PR #38** (quantidade e valor de equipamento) só depois da janela de 48 h (até a noite de 24/10); o pacote assume que ele já está na `master`.

## Sequência em produção (cada passo com autorização)

1. Backup de pré-deploy (`backup_banco.yml`, manual) e conferência.
2. Merge do pacote e `migrar_banco.yml` (confere role e permissões) **antes** do deploy do código.
3. Manual Deploy no Render; Vercel publica o front.
4. Verificação: `/health`, login, abrir um instrumento com e sem itens, painel, relatório de Concluídos.
5. Janela de observação (48 h).
6. `projetar_itens_plano.py` em **simulação**; revisar os números (itens por origem, famílias, fila, rendimentos ligados); gravar só com o "pode gravar".
7. `vincular_entregas_legadas.py` em simulação e, depois, gravação com "pode gravar" (cria os avisos aos técnicos).
8. Fila de revisão: gestor e admin decidem os itens pendentes.
9. Job de prazos: uma rodada manual supervisionada em simulação; **agendamento só depois** da operação de alertas.

## Rollback

Backend: redeploy do commit anterior (as migrations são aditivas e o código antigo continua funcionando). Front: promover o deploy anterior na Vercel. Banco: restaurar o backup de pré-deploy. Dados gravados pelos scripts dos passos 6 e 7 são reversíveis por restauração; as decisões da fila (passo 8) são append-only.

## Fora deste pacote

Fotografias (etapa 9), `equivalente_renem` dos códigos extintos, valor pago ao fornecedor por item (seção 10 do plano de classificação), rateio de rendimento entre bens.
