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

## Causa reproduzida e correção delimitada

- Os quatro snapshots estruturais validaram integralmente. O cruzamento completo
  encontrou dois candidatos; o segundo falhou em PublicacaoPortal por número
  descritivo e objeto vazios (`string_too_short`). A reprodução não persistiu dados.
- Os testes preexistentes exigem esses campos: confirmação permanece estrita.
  O coletor separa o registro inconclusivo e preserva qualquer captura anterior,
  publica somente os demais e marca a fonte como parcial, com metadados sem payload.
- Identidade divergente continua abortando o lote; não é tratada como falta de campo.
- Uma publicação parcial explicitamente concluída estabelece baseline para que
  pendência permanente de um registro não silencie todas as novidades futuras.
  Parcial sem publicação e conflito não estabelecem baseline.
- A rotina continua sinalizando parcial como falha operacional. O estado parcial
  não será apresentado como coleta integral aprovada.
- Em contrato incompleto, as revalidações históricas são adiadas: nenhum item da
  fila anterior pode ser ocultado ou alterado por causa da incompletude de outro
  registro. Apenas candidatos novos íntegros podem ser publicados nessa rodada.
- 59 testes direcionados passaram em PostgreSQL 18.6 descartável local, incluindo
  cenário misto, preservação de fila, baseline, contador e replay. CI usa PostgreSQL 16.
