# Diagnóstico do banco pelo Codex e conferência (22/11/2026)

Segunda leitura independente, só leitura, no clone `sigeo_ensaio_release_20261122` (head `d9e0f1a2b3c4`). Os achados abaixo foram conferidos por mim no clone e, quando indicado, na produção (somente `select`).

## Achados conferidos

| Achado | Clone | Produção | Gravidade | Encaminhamento |
|---|---|---|---|---|
| Monitorado sem par na carteira pela junção vigente (número + `tipo_contratacao`): 26 de 427 | 24 são "Convênio" no monitoramento e PERSUS II na carteira; 2 FAF sem par | 24 divergentes e 2 sem número na carteira (mesmos números) | Alta | Os 24 saem pelo script `remover_persus_ii_do_monitoramento` (já no roteiro). Os 2 FAF: origem a confirmar com o usuário (E1) |
| Conclusão antiga sem data aparece com a data do dia: `conclusao_acompanhamento.py::_ler_legado` usa `data_ocorrencia or date.today()` | 6 eventos `fase_concluido` ativos sem data | 6 de 221 | Alta | Exibir "data não registrada" e não inventar. `migrar_concluidos_para_conclusao` já manda esses casos para revisão ("sem data de conclusão"); até lá a tela mente. Correção proposta abaixo |
| 5 pares PERSUS I com `situacao` diferente entre monitoramento (82 em operação, 10 em execução) e carteira (87 e 5) | 5 em 92 pares | não consultado | Média | Decidir a fonte da situação por tela; conferir os 5 com a evidência |
| `evento_marco` e `acao_monitoramento`: DELETE físico em scripts (`corrigir_escopo_instrumentos_firmados`, `importar_programas_monitoramento`) e `ON DELETE CASCADE` para o instrumento; só `candidato_legado_decisao` tem trigger de imutabilidade (e não cobre TRUNCATE) | confirmado por catálogo | n/a | Alta (documental) | "Append-only" é garantia da aplicação, não do banco. Documentar no dicionário; trigger nas demais tabelas é decisão à parte |
| 46 FKs em 20 tabelas sem índice com a FK no prefixo; 2 índices por prefixo (`execution_family`, captura do candidato) | confirmado | n/a | Baixa | Sem ação agora; priorizar só tabela volumosa |
| Planos dos filtros principais usam os índices esperados | confirmado | n/a | Baixa | Nenhuma |
| Sem duplicidade em chaves de negócio, classificação vigente e inauguração ativa | 0 | n/a | Baixa | Manter as unicidades |

## Parecer sobre o relatório de limpeza

- **Corrigido:** `fonte_dado` não é candidata a remoção. Tem FK em 142 convênios, 85 instrumentos e todos os 204 pagamentos PERSUS (conferido). O relatório de limpeza foi ajustado.
- **Ajustado:** só `accelerator_row` e `inca_estimate` comprovadamente vazias; `candidato_legado_recaptura` e tabelas novas estão vazias por etapa ainda sem carga.
- **Concordo:** 12 colunas nulas (ressalva: `inca_estimate.capital_ibge_code` não é observável em tabela vazia; campos de autoria e revisão são decisão de contrato), estreitar `snapshot_local` (31 oficiais, 0 snapshot) e `em_analise` (depois de checar produção), purga de `refresh_token` (o Codex contou 843 e 146 vivos; eu 844 e 147: diferença de uma linha criada entre as leituras), `Notificacao.lida` (11 com `lida = true`, todas sem destinatário materializado).

## Riscos das 12 migrations (resumo)

| Migration | Risco | Observação |
|---|---|---|
| `c3d4e5f6a7b9` (previsão) | Alto | `ALTER TYPE ... ADD VALUE` fora de transação; falha posterior deixa o valor aplicado; conferir posse do tipo (`sigeo_migration`) |
| `a8b9c0d1e2f3`, `a3b4c5d6e7f8`, `b4c5d6e7f8a9`, `b9c0d1e2f3a4`, `d9e0f1a2b3c4` | Médio | UPDATEs de catálogo ou valor; `b4c5d6e7f8a9` não tem downgrade; `b9c0d1e2f3a4` pode não criar o índice se faltarem os marcos esperados, então verificar o índice além do head |
| Demais 6 | Baixo | Só criam estrutura vazia |

A reversão em produção continua sendo restaurar o backup de pré-deploy.

## A confirmar (usuário)

1. Origem dos 2 FAF sem contraparte na carteira.
2. Qual fonte manda na situação dos 5 pares PERSUS I.
3. Data oficial dos 6 encerramentos sem data.
4. Posse do enum e privilégios do `sigeo_runtime` no ambiente de release (o papel não existe no clone).

## Proposta de correção (aguarda aprovação)

`_ler_legado`: devolver a conclusão legada sem data inventada. Exige tornar `ConclusaoRead.data_conclusao` anulável (mudança aditiva de contrato) e ajustar o front para mostrar "data não registrada". Testes: conclusão legada sem data, com data, e front.
