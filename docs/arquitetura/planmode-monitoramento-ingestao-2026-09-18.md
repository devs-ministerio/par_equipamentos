# Plan Mode — monitoramento interno e ingestão (2026-09-18)

## Objetivo

- Restringir a alteração de CNES ao instrumento já incluído no monitoramento interno.
- Tornar notificações navegáveis até o instrumento ou proposta correspondente.
- Incorporar FAF, TED, PERSUS I/II e PRONON com carga idempotente e origem rastreável.
- Tratar previsão, realização e reprogramação de inauguração como eventos auditáveis.
- Exibir em conjunto o marco interno e a situação externa, destacando divergências operacionais.

## Arquivos e camadas

- Banco: `backend/app/db/models.py` + migration Alembic reversível.
- Contratos: schemas Pydantic do monitoramento/notificações e schemas Zod equivalentes.
- Dados: repository de monitoramento; services de instrumento, eventos e notificações; routers finos.
- Ingestão: importador transacional com `--dry-run`, chaves estáveis e reconciliação sem sobrescrita destrutiva.
- Frontend: detalhe do monitoramento, formulário de evento, sino de notificações e serviços.
- Documentação: diagnóstico de ingestão, fluxo de requisição e modelo ER/Mermaid.

## Dados e regras

- Novos atributos: origem, tipologia, investimento, situação do programa e natureza do serviço.
- Tipologia limitada a `A`, `CV`, `C`, `EO`, `C.B` e `NA`; valores monetários não negativos.
- Fontes sem CNPJ mantêm o campo nulo; nome/localização vêm do CNES quando disponíveis.
- Equipamento físico vazio usa o equipamento planejado somente como referência visual, sem copiar estado.
- Confirmar realização exige data de ocorrência. Uma previsão futura pode ser confirmada desde que o técnico atualize a data no mesmo envio.
- Reprogramação cria novo evento append-only e exige justificativa; autor e instante vêm da sessão.
- CNES só muda via PATCH do instrumento monitorado, validado no servidor e gravado no `AuditLog`.

## Resiliência, testes e riscos

- Cargas idempotentes por origem + identificador estável; transação única e relatório de rejeições.
- Testar autorização, CNES inválido, datas, reprogramação, tipologia, moeda, zeros à esquerda e reexecução.
- Validar migration e importação primeiro no PostgreSQL local, depois executar dry-run antes da carga definitiva.
- Risco principal: PERSUS/PRONON sem CNPJ ou identificador federal único; não fabricar dado institucional.
- Remover endpoint, service e UI mortos da edição direta de CNES em proposta candidata.

## Aprovação

Aprovado pelo usuário em 2026-09-18, com ajuste: data futura pode ser marcada como realizada desde
que o técnico atualize a data da ocorrência no mesmo ato.

## Correção pós-execução (mesmo dia)

A execução deste plano gravou FAF/TED/PERSUS I/PERSUS II/PRONON só em `instrumento_equipamento`
(monitoramento interno). O usuário revisou o resultado e corrigiu o requisito: o destino correto é
`convenio` ("Instrumentos firmados") para todos eles — só permanecem também no monitoramento
interno o que a equipe já acompanhava (Convênio/FAF/TED) e PERSUS I ainda não inaugurado. Detalhe
completo, migration e script de correção em
`docs/arquitetura/diagnostico-ingestao-dados-2026-09-18.md` ("Correção de escopo").
