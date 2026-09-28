# Auditoria completa de dados — Database (2026-09-28)

## Escopo e método

Auditoria somente leitura no Neon operacional, guiada por
`padroes/database/constituicao_database.md`. Foram consultados o catálogo
PostgreSQL, constraints, índices, migrações, consistência referencial e
formatos de identificadores/dados de domínio. Nenhum registro, schema ou
migration foi alterado nesta rodada.

## Síntese executiva

A integridade estrutural é boa: as 29 tabelas têm chave primária, há 40 FKs e
44 `CHECK`s. As oito verificações oficiais de integridade passaram com zero
órfãos de CNES e relacionamentos, zero CNES inválido, zero coordenada fora da
faixa e zero contagem negativa.

As pendências são de padronização e contrato entre fontes, não de corrupção
referencial generalizada. Nenhuma correção em massa deve ser aplicada antes do
plan-mode de normalização descrito ao final.

## Achados

### P1 — normalizáveis com regra determinística

1. **CNPJ salvo com formatação em 612 registros.**
   - `convenio`: 416; `instrumento_equipamento`: 86;
     `pagamento_obra_persus`: 110.
   - Todos se tornam válidos ao remover caracteres não numéricos e resultam em
     exatamente 14 dígitos.
   - Há outros quatro valores inválidos que são strings vazias (dois em
     `convenio`, dois em `instrumento_equipamento`), normalizáveis para `NULL`.
   - Não há proposta ou CNES com CNPJ não numérico fora do padrão.

2. **Município tem caixa inconsistente em 69 grupos.**
   - 47 grupos em `convenio` e 22 em `instrumento_equipamento` variam apenas
     por capitalização/espaço após normalização; exemplos públicos recorrentes
     incluem `RECIFE`/`Recife` e `SÃO PAULO`/`São Paulo`.
   - A correção precisa definir uma forma persistida única (recomendação:
     `capitalizar_nome` para exibição, acompanhado de chave normalizada para
     matching), antes do backfill.

3. **Um responsável titular ainda existe apenas no campo legado textual.**
   - 76 instrumentos têm `tecnico_titular`; 75 possuem a relação
     `instrumento_responsavel` com `papel='titular'` correspondente.
   - Um registro precisa de reconciliação contra `user` antes de criar a
     relação. Não inferir por similaridade de nome.

### P2 — exige decisão de contrato ou revisão humana

4. **Contrato de IBGE usa duas representações.**
   - `equipment_offer_row` (12.264), `municipality_coverage` (16.710) e
     `municipality_population_row` (11.140) usam consistentemente seis
     dígitos numéricos; `convenio.codigo_ibge` usa sete.
   - A chave analítica de seis dígitos corresponde ao prefixo de seis dígitos
     do código de convênio em todos os 1.209 joins observados. É um contrato
     interno consistente, mas o nome `ibge_code` sugere equivocadamente o
     código IBGE municipal completo de sete dígitos.
   - Não aplicar `LPAD`/concatenação em massa: definir se o banco guarda
     código-base de seis dígitos ou código municipal completo e criar uma
     migração expand-contract para a representação escolhida.

5. **21 eventos carregam `data_ocorrencia` futura.**
   - 18 pertencem à previsão de inauguração; os três restantes representam
     chegada no porto, comissionamento e entrega.
   - Para previsão, a data deve estar em `data_prevista`, não em
     `data_ocorrencia`. Os demais casos exigem conferência humana, pois podem
     ser planejamento lançado como fato ocorrido.

6. **O Neon está atrás das migrations locais.**
   - Banco: `7fd36a4d65a5`; head local: `e5fdb376edeb`.
   - Inclui a remoção de tabelas mortas já aprovada em código. Aplicar somente
     por workflow de migration, após snapshot/PITR confirmado e em janela
     operacional.

7. **Proveniência de fontes continua como texto livre.**
   - `origem_dado` contém variações de arquivo, aba e hash em texto, inclusive
     87 `NULL` em instrumentos e 418 `NULL` em convênios.
   - A tabela `reference_file` já existe; a normalização correta é uma FK ou
     relação de proveniência auditável, não padronização textual destrutiva.

### P3 — qualidade e governança a acompanhar

8. **Uma linha de `cnes_estabelecimento.logradouro` tem espaço de borda** e
   três possuem sentinelas textuais de ausência. Corrigível em lote após
   snapshot, com `NULLIF(trim(...))` e relatório de chaves afetadas.

9. **118 hashes PBKDF2 permanecem em `user`; 308 já são argon2id.** É estado
esperado da migração gradual: rehash no próximo login, sem reset forçado.

10. **JSONB de evidência ainda é transitório em alguns domínios.**
`convenio.siconv_raw` (559), `convenio.transferegov_raw` (403),
`convenio.equipamentos_tags` (560) e `proposta_candidata.metas_resumo` (28)
existem como prova de fonte/adaptador. `evidencia_transferegov` segue vazia;
não migrar consumidores antes de construir a ingestão relacional.

## Itens que não são erro de formatação

- 182 ações têm `data_conclusao < created_at`. São predominantemente histórico
  importado; `created_at` representa o momento de cadastro/auditoria, não a
  data do fato. Não atualizar sem uma nova coluna semântica ou decisão de
  negócio.
- Não foram encontrados espaços de borda em nomes de convênio, instrumento,
  proposta ou estabelecimento; nem quebras de linha/caracteres de controle nos
  campos auditados.
- Nenhum valor financeiro auditado (`valor_global`, empenhado, desembolsado,
  pago ao fornecedor ou valor de proposta) é negativo.

## Plan-mode proposto para normalização

1. **Preparação:** backup pontual confirmado, relatório de dry-run por PK,
   transação por lote e teste de reversão em PostgreSQL isolado.
2. **Onda 1 (segura):** converter CNPJ formatável para 14 dígitos, strings
   vazias para `NULL`, aparar o logradouro e reconciliar o único titular apenas
   após identificação inequívoca do usuário.
3. **Onda 2 (política de texto):** formalizar formato persistido para município
   e criar chave normalizada reutilizável; aplicar somente a variantes exatas,
   com auditoria antes/depois.
4. **Onda 3 (contratos):** escolher a semântica de IBGE seis/sete dígitos e
   modelar proveniência via `reference_file`, ambas por expand-contract.
5. **Onda 4 (revisão humana):** classificar os 21 eventos futuros e manter
   registro append-only da correção, nunca sobrescrever o histórico sem motivo.
6. **Validação:** `auditar_integridade_database`, drift estrito, testes de
   constraints e contagem dos desvios igual a zero ou explicitamente aceita.

## Evidência complementar

O painel visual de contagens e prioridades está em
`auditoria-database-2026-09-28.canvas.tsx` no Canvas do workspace. O script
existente `backend/scripts/auditar_integridade_database.py` permanece a base
para invariantes referenciais; esta auditoria amplia a leitura para formato e
normalização de domínio.
