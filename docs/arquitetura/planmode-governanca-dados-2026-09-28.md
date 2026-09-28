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
- Backup específico da redistribuição: branch
  `backup-pre-limpeza-responsaveis-20260928` (`br-jolly-base-axe3s588`),
  criada de `production` em 2026-09-28 10:27:42 BRT, expira em 2026-10-05
  10:27 BRT.
- Cada migração passa por PostgreSQL isolado (upgrade/downgrade/testes),
  dry-run e validação pós-produção antes da próxima onda.

## Exceções legadas medidas

- Três eventos ativos de inauguração futura foram migrados append-only para
  previsão; a repetição do dry-run retornou zero pendências.
- A limpeza aprovada removeu os 76 espelhos textuais de responsável. Os 182
  instrumentos estão sem vínculo em `instrumento_responsavel`, aguardando
  atribuição humana dentro do sistema. Não criar vínculo por aproximação de
  nome.
- O instrumento `202500044035` foi removido do Neon por solicitação do
  usuário em 2026-09-28. Não tinha eventos, ações, responsáveis, pagamentos
  ou marcadores dependentes; a operação foi registrada no `AuditLog`.
- Não há vínculo existente com usuário fora de `colaborador` ativo.

## Ordem

1. Concluído: migrar os três eventos e registrar `AuditLog`.
2. Concluído: implementar atribuição relacional obrigatória para novos e
   alterados e lista de colaboradores ativos na API/interface. A distribuição
   dos 182 instrumentos será feita manualmente pela equipe.
3. Concluído: criar campos normalizados de município e IBGE municipal,
   executar backfill idempotente e adaptar contratos de leitura. No Neon,
   foram normalizados 560 convênios, 181 instrumentos e 28 propostas; 403
   convênios receberam o IBGE municipal de seis dígitos. O dry-run posterior
   retornou zero pendências.
4. Introduzir referência estruturada de proveniência em novas cargas sem
   reescrever a origem histórica.
