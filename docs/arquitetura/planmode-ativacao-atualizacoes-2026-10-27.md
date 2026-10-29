# Ativação das atualizações — 27/10/2026

- Autorização: pedido do usuário para ativar as atualizações e comprovar funcionamento.
- Diagnóstico: schedules comentados; Radar sem execuções; descoberta SICONV ausente do workflow;
  aba de propostas bloqueada por critério; DATABASE_URL já existe em Production.
- Avaliação: falta de banco citada nos comentários é obsoleta; faltam executor operacional,
  credencial Portal no runner, guardas e evidência de captura. Ativar apenas cron é insuficiente.
- Escopo: workflows de pipelines/Radar, entrada CLI de produção, guardas de integridade,
  testes de regressão e runbook; sem migrations ou incorporação das três frentes futuras.
- Estratégia: rotinas independentes e rastreáveis; exclusão mútua com backup/migration;
  execução manual inicial e schedules condicionados a variáveis de habilitação reversíveis.
- Configuração: credencial runtime existente; chave Portal em GitHub Secrets Production;
  JWT efêmero exclusivo do processo batch, sem reutilizar assinatura das sessões de usuários.
- Segurança: preflight de schema/permissão, autorização explícita do executor, logs sem segredo;
  nenhuma chave em arquivo versionado ou saída; primeira descoberta SICONV silenciosa.
- Integridade: ElastiCNES parcial não publica; ANS ausente bloqueia cálculo; vigência oficial
  atualiza a coluna utilizada pelo alerta; fontes parciais falham visivelmente sem apagar histórico.
- Validação: unidade das guardas e regressões; CI com PostgreSQL efêmero; actionlint;
  rodada real acompanhada por tarefa e confirmação de FonteCaptura/execuções publicadas.
- Fixtures/mocks: dados sintéticos; rede e relógio como fronteiras; testes não usam banco real de produção.
- Riscos: indisponibilidade federal, volume do dump, timeout e diferença entre schema/backend.
- Reversão: desligar variáveis de habilitação; preservar última captura confirmada;
  não restaurar banco automaticamente nem reverter esquema.
- Critério: habilitar execução diária apenas após rodada controlada; registrar resultados,
  contagens, fontes indisponíveis e limites restantes sem declarar sucesso parcial como integral.
- A aba de propostas permanece separada: liberar UI não define critério de negócio.
