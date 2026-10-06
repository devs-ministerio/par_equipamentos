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
   inicial silenciosa e resumo dos campos alterados. Falta completar os
   demais campos da API nova e as outras colunas expostas na UI.
4. **Pendente:** descobrir novos convênios legados, validar assinatura no
   Portal e apresentar candidatos no Radar; notificar gestor/admin quando
   convênio ou proposta for incluído no monitoramento.
5. **Parcial:** histórico/frescor via `GET /fontes/capturas`, alerta gerencial
   de fonte indisponível com dedup de 24h e contrato frontend compatível.
   Falta apresentar frescor na UI e a nova UX de notificações com busca,
   filtros, arquivar e ler tudo, mantendo autorização.
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
