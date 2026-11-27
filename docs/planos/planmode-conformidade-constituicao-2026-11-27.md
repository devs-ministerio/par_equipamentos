# Plan Mode: conformidade com as constituições (2026-11-27)

Origem: checagem do PR 78 contra `padroes/` (desvios de tamanho, migration sem teste e gate). Aguarda aprovação; nada foi alterado.

## Objetivo
Fechar os desvios encontrados sem mudar comportamento: teste da migration, tamanho de função no backend, tamanho de arquivo no frontend e gate verde. Segredo de uso só em localhost fica fora de escopo (decisão do usuário em 27/11/2026).

## Fase 1: no PR 78, antes do merge (pequena, baixo risco)
- **Teste da migration `e1f2a3b4c5d6`** (database): `backend/tests/test_migration_usuario_regiao_aditiva_db.py`, no padrão dos testes `test_migration_*_aditiva_db`. Afirma: sobe cria a tabela com PK composta e FK em cascata; desce remove; repetir é idempotente. Nome termina em `_db.py` e entra em `_DB_TEST_MODULES` antes de rodar (regra do quase-incidente de 28/10).
- **Gate**: PR com os quatro checks verdes (`validar`, `build_e_testes`, `e2e`, `imagem`) antes de qualquer merge.

## Fase 2: backend, PR próprio (depois do release)
- **Escopo nosso**: `montar_propostas` (72), `montar_instrumentos` (86), `_fatos_equipamentos` (79), `_montar` (62), `montar_relatorio` (64), `gerar_relatorio` (67) no router, `_escrever_tabela` (56), `_registros_equipamentos_simplificados` (61), `_docx` (54).
- **Escopo herdado** (decisão sua: entra ou fica de fora): `montar_resumo_monitoramento` (196), `carteira_da_regiao` (101), `editar_evento_monitorado` (109), `registrar_evento_monitorado` (91).
- **Estratégia**: extrair passos nomeados do domínio (ex.: montar indicadores, montar quebras, montar linhas), sem mexer em assinatura pública. Um arquivo por vez; bateria de relatórios e `test_relatorios_*` verdes a cada passo. Arquivos gerados (xlsx e docx) comparados antes e depois, mesmos bytes de conteúdo nas amostras MG, RS e Brasil.

## Fase 3: frontend, PR próprio
- **Dividir por responsabilidade** (máximo recomendado de 200 linhas): `dados-oficiais-filtros-controles.tsx` (285), `painel-gestao-filtros-controles.tsx` (230), `use-propostas-filtros.ts` (242), `propostas-filtros.tsx` (209), `monitoramento-meu-painel-page.tsx` (205), `adicionar-monitoramento-button.tsx` (272). `monitoramento-interno-cabecalho.tsx` (296) já excedia na master: entra só se você aprovar.
- **Estratégia**: import direto, sem barrel; símbolo em PascalCase, arquivo em kebab-case; testes existentes devem passar sem edição (ou só mudar o caminho do import). Cobertura de hooks não pode cair do piso de 70% (hoje 70,3%), então a divisão de `use-propostas-filtros.ts` mantém o teste novo.

## Riscos
- Refatoração de relatório pode alterar texto, ordem ou formato de célula sem erro de teste; mitigado pela comparação das amostras.
- Dividir hook de filtros pode quebrar a `queryKey` ou a ordem dos efeitos; mitigado pelos testes do hook e do E2E.
- Mexer em código herdado aumenta o raio do PR; por isso a Fase 2 separa escopo nosso e herdado.

## O que muda para quem consome
- Nada na API, no schema ou na interface. Arquivos de relatório saem idênticos.

## Ordem e rollback
- Segue a ordem das constituições: database (Fase 1), backend (2), frontend (3), qualidade em todas. Cada fase é um PR reversível por revert; nenhuma toca dado nem migration.

## Estratégia de teste
- Fase 1: novo teste da migration. Fases 2 e 3: suíte existente verde e comparação das amostras. Antes do merge de cada uma: `ruff`, `mypy`, `tsc -b`, `oxlint`, `vitest` e E2E.
