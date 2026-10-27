# Continuidade da ativação — coleta real

- Autorização vigente: ativar atualizações e comprovar funcionamento; esta correção conclui esse escopo.
- Diagnóstico: PR #51 passou nos gates; rodada real atualizou 403 convênios e 10 propostas/parcerias.
- Avaliação: cobertura bloqueada por conexão ao DEMAS; descoberta SICONV rejeitada por ValidationError.
  O log ocultava também os campos do contrato, dificultando diagnosticar sem expor payload.
- Há 34 alertas de vigência reais no log, mas o wrapper genérico registrava zero no contador.
- Estratégia: reproduzir contrato com snapshots públicos sem gravação; corrigir somente a causa
  comprovada, sem ampliar critério de elegibilidade ou remover guardas.
- Arquivos: contrato/coletor afetado pela reprodução, executor batch, workflow do Radar,
  contador de vigência, testes de regressão e evidência operacional.
- Diagnóstico seguro: apenas nome do contrato, campo/tipo e arquivo/função/linha; nunca entrada,
  contexto de validação, mensagem SQL, URL privada, chave, CPF ou payload.
- Operação: permitir repetição manual de uma tarefa sem refazer fontes já concluídas;
  preservar o grupo de concorrência e advisory lock.
- Contadores: retornar quantidade real de avisos do job e conferir contra PostgreSQL efêmero;
  repetição deve emitir zero; não corrigir registro histórico reescrevendo captura antiga.
- Qualidade: unidade para contrato e sanitização; integração real do contador/idempotência;
  lint, tipos, actionlint e CI completo antes de repetir a descoberta em produção.
- Riscos: indisponibilidade federal e novo formato oficial; falhar sem publicar dados inconclusivos.
- Sem migrations, disparo retroativo de avisos SICONV ou incorporação de frentes futuras.
