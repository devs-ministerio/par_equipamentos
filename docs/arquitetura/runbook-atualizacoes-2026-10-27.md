# Atualizações de dados e Radar — operação

## Escopo

Pipelines: Tomógrafo, Ressonância e PET-CT. Fontes: atualização SICONV,
verificação/descoberta TransfereGov e descoberta SICONV confirmada no Portal.
Inclui alertas de vigência. Sem migrações, sem inclusão automática na carteira
monitorada e sem as frentes futuras Custeio/SISPRO/Contratações.
A aba de propostas em tramitação continua dependendo de critério aprovado.

## Configuração e habilitação

- GitHub Environment `Production`: `DATABASE_URL` com role `sigeo_runtime`;
  `PORTAL_TRANSPARENCIA_API_KEY` para o Radar. Não reutilizar a chave JWT do backend:
  o processo batch gera uma chave efêmera em memória apenas para inicializar Settings.
- Executar manualmente os workflows antes de ligar as variáveis do repositório
  `ATUALIZACOES_PIPELINES_ATIVAS=true` e `ATUALIZACOES_RADAR_ATIVAS=true`.
- Horários previstos: pipelines 09:00 UTC (06:00 Brasília); Radar 09:30 UTC
  (06:30 Brasília). GitHub pode atrasar o início. O grupo de concorrência
  `sigeo-production-database` serializa também backup e migrations.
- O executor mantém advisory lock em conexão direta do Neon, fora do pooler
  transacional, enquanto cada tarefa roda; os jobs usam o engine runtime normal.
- Pré-voo exige schema igual ao head Alembic e permissões DML; não aplica schema.
- Sem `.env`, credencial de migration/teste ou configuração PG herdada no runner.

## Aceite de uma rodada

Cada etapa deve concluir e gravar `fonte_captura` com `status=ok`. Captura
parcial faz o executor falhar visivelmente; fontes independentes continuam
sendo tentadas. Conferir fonte, horário, itens verificados/alterados e avisos.
Nos pipelines, conferir também competência, execução publicada e oferta por
família; não usar uma execução global para validar as três famílias.

Primeira descoberta SICONV sem captura íntegra anterior usa baseline silenciosa:
registra candidatos, preserva revisão humana e não transforma passivo histórico
em centenas de alertas de novidade. Aprovação de candidato continua humana.

Repetição deve preservar identidade, não duplicar a carteira e não reemitir
mudanças idênticas. Falha da fonte não pode apagar valores confirmados.
População incompleta, ANS ausente e inventário CNES parcial/vazio não publicam
nova execução de cobertura. Prorrogação oficial atualiza a coluna de vigência
antes de avaliar alertas. A referência ANS ativa não é substituída pelo mesmo
CSV a cada rodada: o job não é um coletor de ANS ao vivo.

## Suspensão e diagnóstico

Definir a variável do workflow como `false` suspende o próximo agendamento;
execução manual continua disponível. Cancelar uma execução em andamento é
uma ação separada. Não executar restore nem downgrade automaticamente.

Conferir logs das etapas, registros de captura e fonte federal. O executor
mostra tipo de erro sem traceback/URL/credencial. Corrigir a causa e repetir
controladamente; não trocar `parcial` por `ok` para obter workflow verde.

## Evidência inicial

- Pré-voo de 27/10: banco acessível e schema `b6c7d8e9f0a1`; zero capturas anteriores.
- Backup GitHub `40470380754` concluído em 27/10 às 07:58 UTC.
- Consulta de validação do Portal: HTTP 200; chave configurada em Production
  após autorização específica do usuário, sem exposição do valor.
- 132 testes direcionados aprovados; mypy aprovado nos 525 arquivos do backend.
- Revisão `metodologia-sync`: fórmulas e regras SUS/em uso/per-família preservadas.
- CI e rodada real: registrar resultados após execução; estes itens não são
  considerados aprovados apenas pela existência do agendamento.
