# Plan Mode — saneamento e centralização integral de dados (2026-09-20)

## Mandato, limite e resultado esperado

- Sanear **100% dos dados persistidos e consumidos pelo SIGEO**: cada campo terá dono, origem, chave, regra de atualização, nível de confiabilidade e consumidor documentados.
- “100%” não significa apagar fontes brutas nem reimportar dados já validados; significa eliminar duplicidade operacional, campos sem semântica e escrita fora do fluxo canônico.
- Este plano substitui ações isoladas de centralização: `planmode-centralizacao-equipamentos-marcadores-2026-09-20.md` torna-se o Bloco 3 deste programa.
- Não haverá alteração destrutiva, carga em produção ou remoção de script antes de inventário, snapshot, dry-run, reconciliação e aprovação do respectivo bloco.

## Arquitetura-alvo de dados

```text
Fonte bruta imutável → staging validado → referência canônica → domínio transacional
                                                    ↓                    ↓
                                            regras/proveniência     projeções derivadas
                                                                         ↓
                                                               API tipada e frontend
```

- Fonte bruta: arquivos/API recebidos e payloads preservados somente como evidência, com hash, data e versão.
- Staging: validação, normalização e rejeições explícitas; nunca escreve diretamente na UI ou em tabelas de domínio.
- Referência canônica: CNES, território, catálogo de equipamentos, programas/componentes e dicionários fechados.
- Domínio: convênios, propostas, instrumentos monitorados, eventos, ações, usuários, decisões e notificações.
- Derivados: execuções, cobertura, oferta, alertas e indicadores; sempre reproduzíveis a partir de fonte/versionamento.

## Blocos de execução

- **0. Inventário total (P0):** catalogar todas as tabelas, colunas, JSONB, FKs, índices, APIs, telas, scripts, CSV/XLSX/JSON, seeds, outputs e jobs; classificar cada item em bruto, staging, canônico, transacional, derivado, histórico ou morto comprovado.
- **1. Governança e proveniência (P0):** definir responsável, política de retenção, chave natural, frequência, mutabilidade e fonte de verdade por conjunto; registrar decisões em `ConfigDecision` quando forem de negócio.
- **2. Referências oficiais (P0):** consolidar CNES/estabelecimentos, geografia, programas/componentes, dicionários de situação e catálogo de equipamentos; corrigir chaves, acentuação, normalização e relacionamentos sem fabricar informação.
- **3. Equipamentos e instrumentos (P0):** executar o plano específico de marcadores; criar catálogo/evidência central, unir API e cargas manuais por origem verificável e retirar classificadores paralelos.
- **4. Repasses e propostas (P0):** reconciliar `convenio`, `proposta_candidata` e `instrumento_equipamento`; definir identidade oficial, chave de upsert, vínculo entre proposta/parceria e separação rigorosa entre Instrumentos Firmados e Monitoramento Interno.
- **5. Monitoramento e auditoria (P1):** validar ciclo de vida de eventos, ações, estados, responsáveis e dados físicos; preservar append-only, corrigir registros sem trilha e eliminar campos com significado duplicado.
- **6. Cobertura e execução analítica (P1):** rastrear `ReferenceFile` → `Execution` → cobertura/oferta/alerta, garantir versão por família e impedir que dado manual de monitoramento entre em cálculo territorial.
- **7. Contratos e consumo (P1):** substituir campos derivados/JSONB consumidos diretamente por schemas e endpoints únicos; API, filtros, cartões, KPIs e exportações passam a ler a mesma projeção validada.
- **8. Legado e operação (P1):** converter scripts úteis em ingestões idempotentes com dry-run e relatório; arquivar fontes históricas com manifesto; remover somente código/arquivo comprovadamente sem produtor, consumidor ou valor de auditoria.

## Regras obrigatórias de saneamento

- Uma informação tem uma fonte de verdade; cópia só é permitida como projeção derivada, identificada e regenerável.
- Relação consultável usa tabela/FK/constraint; JSONB fica restrito a payload bruto, auditoria ou estrutura realmente variável.
- Toda carga valida schema externo, preserva rejeições, é transacional, idempotente e produz relatório de criados/atualizados/ignorados/rejeitados.
- Toda mudança de identidade usa expand-contract, migration Alembic com `down`, teste e janela avaliada; nunca editar migration aplicada.
- Nenhum campo legado é removido até API/UI migrarem, o backfill ser reconciliado e a retenção histórica ser aprovada.

## Auditorias e evidências por bloco

- Executar matriz `origem → tabela → campo → transformação → consumidor → teste` e publicar divergências, duplicidades, nulos indevidos, órfãos, chaves inválidas e dados sem proveniência.
- Rodar integridade referencial, unicidade, domínio de status, hashes de fonte, contagens antes/depois, reexecução e comparação API × banco × interface.
- Para cada migração: snapshot anterior, dry-run assinado, relatório de exceções, rollback testado em banco dedicado e validação pós-produção.
- Proibir inferência por CNPJ, texto genérico, nome parecido ou programa quando faltar evidência individual; registrar pendência em vez de inventar valor.

## Critérios de encerramento

- 100% das tabelas e fontes inventariadas; 100% dos campos operacionais classificados; zero escrita direta fora do pipeline/documentação aprovada.
- Zero relação operacional escondida em JSONB/array; zero consumidor com regra de classificação própria; zero campo legado ainda sendo escrito após a migração correspondente.
- Toda entidade crítica tem FK, chave natural/única, auditoria, origem e testes de integridade; todos os dados derivados declaram execução e insumos.
- Repositório contém apenas fontes, scripts e artefatos com finalidade, responsável e retenção definidos; itens mortos são removidos em commits próprios e recuperáveis pelo histórico Git.
- Diagnósticos de database, backend, frontend, segurança, qualidade e ingestão são atualizados com evidências e pendências residuais antes do encerramento.

## Ordem de aprovação

1. Aprovar inventário e arquitetura-alvo; não altera banco.
2. Aprovar relatório de achados e o desenho de cada migration/backfill.
3. Executar P0 por blocos pequenos, com validação em banco dedicado e produção.
4. Executar P1, retirar legados e atualizar diagnósticos/constituições ao fim de cada bloco.
