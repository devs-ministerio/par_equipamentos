# Plan Mode — Governança de dados e responsáveis do monitoramento

## Decisões aprovadas

- Preservar município de origem e manter uma chave normalizada separada para
  filtro, busca e junção.
- Manter o código IBGE de sete dígitos recebido pela fonte e materializar o
  código municipal de seis dígitos para análise e apresentação. ElastiCNES
  continua exclusivamente com seis dígitos.
- Tratar inauguração futura como previsão: mover a data de ocorrência para
  `data_prevista` quando o marco for `cronograma_previsao_inauguracao`.
- Titular técnico de novos instrumentos é obrigatório e deve ser usuário
  colaborador ativo; a interface só oferece essa lista. Legado sem vínculo
  não recebe identidade inferida e é bloqueado para edição até regularização.
- Preservar `origem_dado` histórico e introduzir proveniência estruturada de
  maneira expand-contract para cargas novas.

## Backup e rollout

- Backup Neon: branch `backup-pre-governanca-dados-20260928`
  (`br-rough-butterfly-ax359mxa`), criada de `production` em 2026-09-28
  10:14:53 BRT, expira em 2026-10-05 10:14 BRT.
- Cada migração passa por PostgreSQL isolado (upgrade/downgrade/testes),
  dry-run e validação pós-produção antes da próxima onda.

## Exceções legadas medidas

- Três eventos ativos de inauguração futura estão elegíveis para migração de
  ocorrência para previsão.
- 182 instrumentos ainda não têm vínculo em `instrumento_responsavel`; 76
  deles têm apenas titular textual. Não criar vínculo por aproximação de nome.
- Não há vínculo existente com usuário fora de `colaborador` ativo.

## Ordem

1. Migrar os três eventos e registrar `AuditLog`.
2. Criar campos normalizados de município e IBGE municipal, executar backfill
   idempotente e adaptar contratos de leitura.
3. Implementar atribuição relacional obrigatória para novos/alterados e lista
   de colaboradores ativos na API/interface; regularizar o legado por ação
   humana assistida.
4. Introduzir referência estruturada de proveniência em novas cargas sem
   reescrever a origem histórica.
