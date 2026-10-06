# Plan Mode — espelho oficial e notificações por mudança (2026-10-06)

Plano aprovado pelo usuário. Implementação restrita à `homologacao`; nenhum
job, migration ou deploy deve ser executado em produção nesta fase.

## Contrato e fontes

- Convênios legados: dump oficial SICONV por `NR_CONVENIO`; não confundir com
  a API nova do TransfereGov. Entrada na carteira depende de convênio assinado
  confirmado pelo Portal da Transparência; descoberta no dump, sozinha, não
  autoriza inclusão automática.
- Propostas novas: API de Gestão de Parcerias, identificadas por `id_proposta`.
  Monitoramento interno continua uma decisão humana, nunca automático.
- Cada alteração de campo de fonte externa deve produzir um resumo agrupado
  por instrumento e por rodada, com deduplicação e sem aviso de carga inicial.
- Gestor/admin recebem todas as atualizações; colaborador recebe somente dos
  instrumentos de que é titular/suplente, com broadcast quando não há dono;
  leitor não recebe. Inclusão no monitoramento avisa apenas gestor/admin.
- Preservar último valor confirmado em falha/omissão da fonte; registrar
  proveniência, data da captura e divergência sem inferir estado desconhecido.

## Etapas e estado

1. **Em homologação — concluído:** situação SICONV reconciliada em `Convenio`
   e `InstrumentoEquipamento`; download fresco, ZIP validado, regressão do
   825374, UI sem falso “pendente” e aviso de inclusão gerencial.
2. **Em homologação — concluído:** job TransfereGov preserva estados em resposta
   parcial e resume as duas situações num aviso; auditoria SICONV read-only
   detecta ausências e diferenças antes da aplicação.
3. **Parcial:** o registro principal `siconv_convenio` usa o payload anterior
   persistido como baseline, compara seus campos e agrupa o resumo por
   convênio; valores financeiros derivados também são atualizados. Capturas
   e frescor por rodada estão registrados; empenhos, desembolsos, licitações,
   termos aditivos, pagamentos e itens são comparados por chave, com baseline
   inicial silenciosa e resumo dos campos alterados. O Radar recaptura
   proposta/programa, metas/etapas/itens, análises, cronograma, distribuição,
   parceria e timeline financeira; compara por ID, atualiza as projeções
   oficiais e agrupa avisos sem alterar revisão humana. Faltam validar
   esses contratos nas fontes reais, tratar coleções sem ID estável e
   completar projeções como CNES verificado e datas do legado.
4. **Parcial:** núcleo diagnóstico somente leitura descobre números novos
   por cruzamento exato e valida identidade/publicação no Portal. Falta a
   coleta recorrente fresca, persistência e apresentação dos candidatos no Radar;
   notificar gestor/admin quando
   convênio ou proposta for incluído no monitoramento.
5. **Parcial:** histórico/frescor via `GET /fontes/capturas`, alerta gerencial
   de fonte indisponível e central com busca, tipo, caixas, paginação,
   arquivar/restaurar por destinatário e leitura em lote individual.
   Frescor agora é visível na central de notificações, com última tentativa,
   último sucesso, parcial/falha e defasagem. Falta validar a operação nas fontes reais.
6. **Pendente:** automatizar workflow diário somente depois de confirmar
   secret, runner, migrations e branch/deploy corretos; testar contra banco
   isolado, replay idempotente, alertas e rollback antes da produção.
7. **Ao final:** retomar classificação dos 401 esperados no New Relic, após
   confirmar que não esconde falhas de sessão reais.

Não declarar “espelho sempre atualizado” enquanto as etapas 3–6 não passarem
nos testes de contrato, integração, E2E e operação programada.

## Evidência da integração do trabalho do Claude (2026-10-06)

- `ca33b02` e `cc877bc` preservados; navegação segue isolada em `8a7a8c1`.
- Migration de capturas aplicada somente em PostgreSQL sintético local.
- 423 testes backend e 132 frontend passaram; Ruff, mypy, lint e build passaram.
- Testes cobrem as seis tabelas filhas, campos omitidos, replay e rollback
  integral diante de chave duplicada/ausente ou pagamento inválido.
- Downloads externos são substituídos na fronteira dos testes; nenhum job foi
  executado contra produção. Ainda falta validação operacional das fontes reais.

## Continuação — recaptura TransfereGov

- 432 testes backend passaram, além de Ruff e mypy; nenhum schema novo.
- Metas e dados financeiros deixam de ficar congelados na primeira coleta.
- Coleções reordenadas não notificam; campos/itens omitidos são preservados;
  IDs ambíguos ou falha HTTP abortam a transação, com captura de erro.
- Primeira recaptura de payload antigo é silenciosa. Alterações posteriores
  avisam uma vez e sincronizam situações do monitoramento, sem duplicação
  pela verificação seguinte. Revisão humana permanece intacta.

## Continuação — central de notificações

- Migration `e8f9a0b1c2d3` adiciona arquivo por destinatário (sem excluir
  histórico). Upgrade/downgrade/reaplicação testados só no PostgreSQL sintético.
- API filtra/pagina no banco; contagem global ignora busca e exclui arquivos.
  Arquivar, restaurar e ler todas não afetam outro usuário. IDOR/CSRF testados.
- 437 testes backend, 134 frontend, Ruff, mypy, lint, tipagem e build passaram.
- Teste de navegador com API sintética cobre arquivo/restauração/leitura,
  popup do filtro e larguras 320/400/768/1440; inspeção visual em 400/768.
- Rollout futuro: migration → backend → frontend. Nada aplicado em produção;
  rollback da migration elimina apenas a preferência de arquivo, não os avisos.

## Continuação — frescor visível e mensagens seguras

- Central apresenta as capturas persistidas, não uma data artificial de atualização.
  Sem captura, informa que não é possível confirmar o frescor; uma tentativa com
  erro/parcial preserva e exibe o último sucesso. Defasagem de 36h vem do backend.
- Consultas movidas para Repository, teto de 50 fontes e última tentativa por
  data de finalização (ID somente desempata). Sem nova migration.
- Exceções cruas deixam de ser gravadas em novos avisos/capturas. A resposta
  HTTP de capturas e avisos antigos também não expõe o detalhe técnico persistido.
  A exceção original continua sendo propagada ao job: falha não vira sucesso.
- 440 testes backend e 138 frontend, Ruff/mypy, lint/tipos/build passaram.
  E2E com fronteira HTTP sintética e inspeção visual em 400/768px; verificação
  de largura também em 320/1440px, com rolagem interna e arquivo/restauração.
- Localhost de demonstração utiliza base sintética própria, distinta da base
  efêmera dos testes e da produção. Não representa uma captura real da fonte.
- Permanecem pendentes descoberta do legado, contratos operacionais, workflow
  diário e New Relic. Este bloco não autoriza push, deploy ou jobs em produção.

## Continuação — descoberta diagnóstica do legado

- `diagnosticar_descoberta_siconv` lê ZIPs locais fornecidos explicitamente;
  não baixa arquivos, não grava candidatos/carteira/capturas e não notifica.
  A consulta opcional ao Portal é somente leitura, com chave no ambiente.
- Cruzamento `ID_PROPOSTA` → `NR_CONVENIO`, limitado ao catálogo canônico,
  mantém evidência por item e relação (aquisição/modernização/existente/menção).
  Identidades ausentes/duplicadas divergentes abortam; não aproximar por CNPJ.
- Exclui números já presentes em convênios legados ou monitoramento legado;
  NUP de FAF/TED não é usado como identidade SICONV. ZIP é lido em streaming,
  exige um CSV e cabeçalho íntegro; linha truncada/ambígua não é omitida.
- Confirmação exige que o Portal devolva o mesmo número e data de publicação
  válida. Ausência no Portal ou ausência de publicação mantém o candidato sem
  confirmação. Isso não é autorização de inclusão no monitoramento.
- Resultado tem teto explícito de processamento e contagem dos não processados;
  snapshot local não é tratado como evidência de coleta atualizada.
- Testes unitários/IO sintético e integração SQL cobrem deduplicação, ordem,
  aliases, evidências, vazio, IDs inválidos, Portal ausente/parcial/divergente e
  ZIP inválido. Não houve chamada à API real ou alteração em produção.
- Próximo bloco: persistência própria dos candidatos, integração com Radar e
  captura recorrente, mantendo confirmação de assinatura e revisão humana.
- Validação: 458 testes backend passaram; cobertura de linhas/branches dos
  novos Service e Repository em 100%, Ruff e mypy passaram. Não significa
  cobertura global de 100% ou validação operacional contra o dump/API reais.
