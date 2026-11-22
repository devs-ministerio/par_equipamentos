# Relatório de limpeza do banco (22/11/2026)

**Estado:** só leitura. Nada foi alterado no banco nem em produção. Contagens de produção vieram de consultas `select` no Neon (`neondb`, `neondb_owner`, `alembic_version = e9f0a1b2c3d4`); referências de código vêm de busca em `backend/app`, `backend/scripts`, `.github` e `frontend/src` no head `d9e0f1a2b3c4`. Qualquer remoção entra como migration separada, com backup e aprovação do usuário.

O mapa do schema está em [banco-de-dados.md](../mermaid/banco-de-dados.md).

## Resumo

| Classe | Itens |
|---|---|
| Remover agora (sem risco) | Correção de texto no `CLAUDE.md`; nada no banco |
| Remover depois de confirmação | 4 tabelas vazias de pipeline antigo, 12 colunas sempre nulas, CHECKs de `snapshot_local` e `em_analise`, retenção de `refresh_token` |
| Manter | Tabelas com código vivo mesmo com poucas linhas, índices de apoio a FK |

## Tabelas sem uso

| Tabela | Linhas em produção | Quem ainda a referencia | Classe |
|---|---|---|---|
| `accelerator_row` | 0 | modelo e `scripts/importar_aceleradores.py` | Remover após confirmação |
| `inca_estimate` | 0 | modelo e `scripts/importar_inca_estimates.py` | Remover após confirmação |
| `municipality_population_row` | 11.140 | modelo e 3 scripts (`importar_populacao_municipios`, `atualizar_dados_producao`, `auditar_integridade_database`) | Manter: uso futuro (decisão do usuário, 22/11) |
| `reference_file` | 2 | modelo, 7 scripts de pipeline e importação | Manter até decidir sobre os scripts |
| `fonte_dado` | 6 | modelo e `scripts/backfill_fontes_dado.py`; nenhuma rota ou serviço lê | Remover após confirmação |
| `pagamento_obra_persus` | 204 | modelo e 2 scripts (`complementar_persus_fontes_extras`, `normalizar_cnpj_database`); nenhuma rota ou serviço lê | Manter: uso futuro (decisão do usuário, 22/11) |
| `entrega_legada_revisao` | 3 | `repositories/notificacoes.py`, `services/notificacoes.py` | Manter: código vivo |

> [!note] Decisão do usuário (22/11/2026)
> `pagamento_obra_persus` e `municipality_population_row` ficam, porque serão usadas no futuro. Os scripts que as alimentam também ficam. Resta decidir só sobre `reference_file` (2 linhas, ligado a `execution` e aos pipelines).

## Colunas sem referência no código

Doze colunas aparecem só na definição do modelo (nenhum `app`, script ou front as lê ou grava) e estão 100% nulas em produção.

| Tabela | Colunas |
|---|---|
| `entrega_legada_revisao` | `resolvida_em`, `resolvida_por_id` |
| `execution` | `executed_by`, `accelerator_file_id`, `population_file_id`, `deleted_by` |
| `fonte_dado` | `url_referencia` |
| `inca_estimate` | `capital_ibge_code` |
| `proposta_candidata` | `revisado_por`, `revisado_em` |
| `reference_file` | `reference_period`, `uploaded_by` |

`inca_estimate.capital_ibge_code` não teve contagem de produção (tabela vazia). Três delas são FKs (`resolvida_por_id`, `accelerator_file_id`, `population_file_id`); remover exige derrubar a FK antes. `proposta_candidata.revisado_*` e `entrega_legada_revisao.resolvida_*` parecem reserva de fluxo de revisão que não foi construído: decisão de produto, não de limpeza.

## Dados com retenção

| Item | Estado | Proposta |
|---|---|---|
| `refresh_token` | 844 linhas, 697 expiradas, 147 vivas | Rotina de purga de expirados (sem rota nem job hoje). Reduz tabela de sessão e superfície de hash guardado |
| `Notificacao.lida` | Obsoleta; escopo vale por `NotificacaoDestinatario`. 11 linhas com `lida = true` | Manter a coluna até o código parar de lê-la; depois remover |

## Restrições que podem ser estreitadas

| CHECK | Hoje admite | Produção tem | Proposta |
|---|---|---|---|
| origem da captura do Radar | `snapshot_local` e `siconv_oficial` | só `siconv_oficial` (31 capturas) | Migration que remove `snapshot_local`; hoje as guardas de leitura no código continuam |
| `situacao` e `situacao_anterior` da decisão do Radar | `em_analise` | A ação que gravava `em_analise` saiu em 22/11 | Estreitar só depois de checar produção (`select count(*) ... where situacao = 'em_analise'`) |

## Índices

Cerca de 2,8 MB em índices sem leitura detectada (3 em `equipment_offer_row`, 1 em `municipality_coverage`). A maior parte dos índices com 0 varreduras apoia FK ou é recente; manter. Estatística do Neon reinicia com o compute: não remover índice só por `idx_scan = 0`.

## Fora do banco

- `CLAUDE.md`, seção "Segurança e sessão": a "Lacuna conhecida" cita usuários `pytest-*@example.com` em produção. A consulta de hoje devolve 0. Corrigir o texto.
- Bancos locais (`sigeo_*` no Postgres da máquina) não entram. Só sob pedido.

## Ordem sugerida

1. Corrigir o `CLAUDE.md` (sem risco).
2. Decidir sobre `reference_file`.
3. Migration única de limpeza, depois do release: remove tabelas vazias e colunas nulas confirmadas e estreita os CHECKs. Backup antes; ensaio na cópia local; `downgrade` recria estrutura vazia.
4. Rotina de purga de `refresh_token` expirado, como job separado.

## Método e limites

Referência de código por busca de nome em `.py`, `.ts` e `.tsx` fora de testes; coluna com uma única ocorrência é a do modelo. Nome genérico pode mascarar uso (por exemplo `id`); as 12 colunas acima têm nomes específicos e foram conferidas também em produção. Uso via SQL cru em dashboard externo não aparece na busca.
