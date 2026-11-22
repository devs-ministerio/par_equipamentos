# Roteiro de release: Radar, conclusão, documentos e licença ANSN (22/11/2026)

**Estado:** nada foi enviado ao remoto. Tudo está em commits locais na branch `feat/persus-ii-fora-do-monitoramento` (135 commits desde a `master`, `bc360d4` de 13/11). Cada passo em homologação ou produção exige autorização específica do usuário.

## O que o pacote contém

| Bloco | Conteúdo |
|---|---|
| Radar | Candidato aparece antes do Portal (Aprovar segue travado); card com "Descoberto em" e "Recaptura"; Aprovar exige prova vigente de 24 h; aprovação exige técnico titular e inclui no monitoramento; confirmação do Portal só com `codigo` e `dataPublicacao` |
| Avisos do SICONV | Comparação canônica de identificadores; resumo para a gestão quando passam de 10 instrumentos; popup de detalhe da atualização |
| Conclusão | Conclusão confirmada com inauguração opcional; trava por instrumento; reabrir; PERSUS I conclui pela inauguração |
| Documentos e repasse | Documentos do instrumento; repasse integral ou parcial derivado do SICONV; previsão de entrega por item |
| Licença | Licença de operação pela base da ANSN, por estabelecimento (CNES) |
| Ações e entregas | Ações lidas por instrumento; a entrega manda no evento do cronograma |

## Migrations (12, todas aditivas, uma só cadeia)

Produção está em `e9f0a1b2c3d4`; o head é `d9e0f1a2b3c4`.

`a1b2c3d4e5f7` repasse · `b2c3d4e5f6a8` cancelamento de unidade planejada · `c3d4e5f6a7b9` previsão de entrega (ALTER TYPE `notificacao_tipo`) · `d4e5f6a7b8c0` documento do instrumento · `e5f6a7b8c9d1` conclusão · `f6a7b8c9d0e2` marco de inauguração dispensada · `a8b9c0d1e2f3` catálogo do cronograma ANSN (UPDATE de rótulos) · `a3b4c5d6e7f8` exige licença por família · `b4c5d6e7f8a9` situação "em operação" (UPDATE de valores) · `b9c0d1e2f3a4` índice único de inauguração · `c8d9e0f1a2b3` licença ANSN por estabelecimento · `d9e0f1a2b3c4` titular na decisão do Radar.

Só criam tabelas, colunas e índices, ou ajustam rótulos e valores de catálogo. Nenhuma remove dado. Valor de enum não sai no `downgrade`: a reversão em produção é restaurar o backup de pré-deploy, nunca downgrade.

## Ensaio das migrations (22/11/2026, local)

Cópia descartável `sigeo_ensaio_release_20261122`, feita da base `sigeo_homologacao_base_20261120` (`e9f0a1b2c3d4`, 427 instrumentos, o estado de produção de 20/11).

| Verificação | Resultado |
|---|---|
| `alembic upgrade head` | 12 migrations aplicadas em ordem, sem erro, head `d9e0f1a2b3c4` |
| Índice único de inauguração (`b9c0d1e2f3a4`) em produção, em leitura | 0 instrumentos com mais de uma inauguração ativa; a migration não falha por duplicado |
| Produção, em leitura | `alembic_version = e9f0a1b2c3d4`, 427 instrumentos |

> [!warning] A confirmar
> O ensaio usou a base de 20/11, não o backup real de hoje. Antes da produção, repetir sobre o backup mais recente restaurado pelo usuário (`backend/scripts/restaurar_backup.sh`).

## Verificação feita (local, 22/11)

- CI do backend na ordem do workflow: `ruff check`, `ruff format --check`, `mypy` (642 arquivos) sem achado depois de corrigir imports e formatação de 8 arquivos; suíte completa com cobertura: 2.319 testes passando; pisos por camada atendidos (services 95,1% de linhas contra piso de 80%; repositories 96,2% contra 70%; routes 93,4% contra 60%).
- CI do frontend: `format:check`, `typecheck`, `lint`, `build`, 1.065 testes com cobertura (pisos de hooks e componentes acima de 70%).
- Segurança estática: `semgrep` com as regras do projeto, 0 achados em 916 arquivos.
- Não rodados: `npm audit` e `pip-audit` (consultam o registro externo), Playwright E2E (precisa de `E2E_EMAIL` e `E2E_SENHA`) e `actionlint`.

> [!note] Execução local
> A suíte com cobertura trava se sobrarem bancos `sigeo_test_migrations_*` de execuções interrompidas. Antes de rodar, conferir `select datname from pg_database where datname like 'sigeo_test_migrations%'` e não interromper a suíte no meio.

## Ordem de release (cada passo com autorização)

1. Backup manual (`backup_banco.yml`) e conferência do arquivo.
2. Pré-voo de posse (`backend/scripts/sql/normalizar_posse_aplicacao.sql` como `neondb_owner`). Atenção a `ALTER TYPE` na `c3d4e5f6a7b9`: o dono do tipo precisa ser `sigeo_migration`.
3. Decisão sobre o cron do Radar: `radar_convenios.yml` está ligado (`ATUALIZACOES_RADAR_ATIVAS`). Pausar durante a janela, se o usuário preferir.
4. PR da branch para `homologacao`; CI verde; ensaio na homologação (conferir `SELECT version_num FROM alembic_version` antes).
5. PR de `homologacao` para `master`; merge pelo usuário.
6. `migrar_banco.yml` (faz checkout da `master`); `alembic current` deve mostrar `d9e0f1a2b3c4`.
7. **Manual Deploy no Render** (não é automático). O Vercel publica sozinho. Contrato de API só aditivo.
8. Verificações: `/health`, login, instrumento individual, relatório DOCX e XLSX, notificações e popup, Radar.
9. Preenchimentos de dado (abaixo), cada um com simulação antes de `--aplicar --confirmo-host`.

## Scripts de dado do pacote

Todos mudam dado só com `--aplicar --confirmo-host`; o padrão é simulação. Conferir `select current_database(), current_user` antes.

| Script | Para que serve |
|---|---|
| `importar_licencas_ansn` | Carrega a base da ANSN e os vínculos CNES x matrícula |
| `migrar_marcos_para_documentos` | Cria os documentos do instrumento a partir dos marcos antigos |
| `migrar_concluidos_para_conclusao` | Migra o evento antigo `fase_concluido` para a conclusão confirmada |
| `concluir_persus_i_pela_inauguracao` | PERSUS I conclui na data da inauguração realizada |
| `corrigir_entregas_persus_i` | PERSUS I: data de entrega do item igual à da inauguração |
| `alinhar_eventos_das_entregas` | Evento `cronograma_entrega` segue a data da entrega |
| `derivar_repasses_siconv` | Grava o repasse a partir do desembolso do SICONV |
| `remover_persus_ii_do_monitoramento` | Tira PERSUS II do monitoramento interno |
| `consolidar_eventos_marco_duplicados` | Só se a migration do índice acusar duplicado |
| `excluir_documentos_instrumento` | Só sob pedido, para documento lançado por engano |

> [!warning] A confirmar
> A ordem entre esses scripts e o que cada um grava em produção ainda não foi ensaiada. Ensaiar na cópia `sigeo_ensaio_release_20261122` antes de propor a sequência, como foi feito no release de 23/10.

## Pendências que não são código

| Item | Estado |
|---|---|
| Recaptura em produção (nenhuma rodou; sem prova, o Radar não aprova) | Decisão do usuário; precisa de chave do Portal, "pode gravar" e backup |
| `APP_PUBLIC_URL` no Render (D1) | Usuário confirma no painel |
| Deploy automático do Render desligado (D2) | Decisão do usuário |
| RTO de 1 h não certificado (D6) | Ensaio de restauração completo |
| FAFs e entregas a vincular (E1, E2) | Usuário |
| Job de prazos sem agendamento (D3) | Rodada supervisionada antes de agendar |

## Fora do escopo desta release

RAD-03 (normalização da chave `NR_MOV_FIN`; produção tem 0 casos em 1.664 chaves) e RAD-04 (isolamento de falha por candidato na confirmação; sem evidência de abortar rodada em 27 execuções). Ver o mapa do Radar, seção 18.
