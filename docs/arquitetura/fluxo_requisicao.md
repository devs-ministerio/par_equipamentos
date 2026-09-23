# Fluxo de requisição — Radar de Convênios

Espelho em prosa de [`fluxo_requisicao.mermaid`](fluxo_requisicao.mermaid) — o
desenho completo do sistema de descoberta/atualização/notificação de convênios,
aprovado com o usuário em 2026-09-15 (histórico da decisão: sessão que corrigiu
o papel de cada fonte e a cadência real dos jobs). Este arquivo é o "porquê" de
cada seta do diagrama; não é metodologia de cálculo (isso é
`docs/metodologia-parametros.md`) — é sobre como o dado se move entre sistema
externo, banco e tela.

## As 3 fontes, 3 papéis diferentes

Decisão central: as 3 fontes não competem entre si, cada uma tem um papel fixo.

- **SICONV legado** (dump bulk, `repositorio.dados.gov.br/seges/detru/`) —
  monitora o **passado**. Cobre os 403 convênios já conhecidos, com detalhe
  granular (empenho, desembolso, licitação, item de plano de aplicação,
  pagamento a fornecedor, `situacao_prestacao_contas`) que nenhuma API viva
  oferece. Nunca é usado pra descobrir convênio novo.
- **TransfereGov novo** (API de Gestão de Parcerias) — monitora o **futuro**.
  Só cobre instrumentos criados depois que o SICONV deixou de ser o sistema
  corrente — sem campo de número de convênio legado, só `id_proposta`/
  `id_parceria` próprios. Usado exclusivamente pra descoberta de proposta
  nova, escopada aos 8 `id_programa` do nosso roll prioritário + ao padrão de
  texto dos equipamentos-alvo (`EQUIPAMENTOS_ALVO`, mesmo vocabulário de
  `frontend/src/lib/equipamento-tags.ts`).
- **Portal da Transparência** (`/convenios/numero`) — camada de
  **visualização**, não fonte de descoberta nem de verdade primária. 1
  consulta pontual por número, ao vivo, a cada abertura de tela. Nunca é
  persistido no banco — se cair, a tela degrada pra "indisponível", nunca
  quebra.

## Cadência — por evidência, não por padrão arbitrário

- **Descoberta TransfereGov**: diária. É API leve (JSON paginado), sem custo
  real de rodar todo dia.
- **Verificação SICONV legado**: diária, mas em 2 estágios —
  1. `HEAD` no dump (só lê o cabeçalho `Last-Modified`, não baixa nada).
  2. Reprocessamento pesado (baixar + reler os CSVs) só dispara se o
     `Last-Modified` mudou desde a última checagem.

  Achado 2026-09-15: inspecionei `repositorio.dados.gov.br/seges/detru/` — os
  61 arquivos do dump têm o **mesmo timestamp** (17-Jul-2026), parado há ~2
  meses na data desta escrita. O `historico_de_versoes.pdf` do próprio
  repositório só versiona mudança de *schema* (coluna nova), não de dado — a
  última mudança de schema foi Ago/2025, sem periodicidade de conteúdo
  declarada em lugar nenhum. Rodar o reprocessamento pesado todo dia seria
  desperdício certo (baixar centenas de MB pra achar o mesmo dado quase
  sempre); a checagem em 2 estágios dá o "espelho com delay aceitável"
  pedido, sem esse custo.

## Detecção de mudança real (não só presença)

Cada job guarda um retrato dos campos relevantes por identificador
(`nr_convenio` pro legado, `id_proposta` pro TransfereGov) e compara campo a
campo a cada rodada — não só "existe/não existe". Só o campo que muda de
verdade dispara notificação (camada 1, ver seção de notificações abaixo);
sem isso, rodar diário geraria notificação repetida pro mesmo dado sem
mudança nenhuma.

## Do universo conhecido ao monitoramento interno

Entrar no "universo conhecido" (ter um convênio validado, seja via SICONV
seja via TransfereGov) **não** equivale a virar monitoramento interno
(`instrumento_equipamento`) automaticamente — é uma segunda decisão manual da
equipe. A inclusão é sempre explícita, via `POST /monitoramento/instrumentos`:
serve tanto às propostas TransfereGov quanto a `FAF`/`TED`/`PERSUS` e a
convênios já conhecidos. Todas as origens passam pela mesma checagem de
duplicidade por identificador antes de criar.

### Disponibilidade de dados no detalhe

Convênios com fonte oficial podem exibir identificação, execução financeira e
subabas SICONV. FAF, TED, PERSUS I/II e PRONON são cargas internas sem esse
contrato externo: no Radar, exibem apenas Valor Global — tratado como 100%
desembolsado conforme a carga — e, em “Mais detalhes”, somente o
Monitoramento Interno. Um `siconv_raw` parcial pode guardar item manual como
evidência de equipamento, mas nunca habilita dados ou subabas SICONV.

### Divergência de conclusão no Painel de Gestão

O resumo do monitoramento compara apenas registros com evento vigente
`fase_concluido` e uma fonte externa conhecida. Para Convênio, o estado
externo conclusivo é “Prestação de contas concluída”; para proposta
TransfereGov, é “Pago”. Cargas manuais FAF/TED/PERSUS sem API não entram nessa
comparação. O backend expõe a lista normalizada em
`GET /monitoramento/resumo.divergencias_conclusao`; a interface não interpreta
os payloads crus das fontes.

### Cargas controladas de programas sem API consolidada

`scripts/importar_programas_monitoramento.py` lê a aba canônica do PERSUS I e
os CSVs versionados de PERSUS II/PRONON. Antes de escrever, normaliza o CNES
para sete dígitos, valida-o em `cnes_estabelecimento`, enriquece somente os
campos disponíveis nessa referência e rejeita a linha quando o CNES não
existe. A transação inteira é revertida em `--dry-run`; reexecuções fazem
upsert do instrumento e não duplicam evento.

`scripts/importar_planilha_monitoramento.py` continua sendo a entrada de
Convênio/FAF/TED. A coluna “PREVISÃO DE INAUGURAÇÃO...” gera
`EventoMarco.data_prevista`; uma confirmação posterior gera outro evento com
`data_ocorrencia`. Ao registrar a fase **Concluído**, a interface exige essa
confirmação e o backend cria ambos os eventos na mesma transação; se as datas
divergirem, a data real prevalece. Reprogramar cria novo evento e exige
justificativa. Marcos de fase geral não recebem data prevista.

O CNES capturado numa proposta é somente leitura. Ele só pode ser corrigido
depois que a proposta vira instrumento monitorado, pelo PATCH do detalhe do
monitoramento, com validação na referência CNES e `AuditLog` de autor e
valores anterior/novo.

### Identificador quando não existe número de convênio

`FAF`/`TED` já resolvem isso hoje
(`backend/scripts/importar_planilha_monitoramento.py::_resolver_identificador`):
sem número TransfereGov real, usa os dígitos do NUP SEI. Uma proposta do
TransfereGov novo incluída no monitoramento usa `cd_parceria`, quando existir,
ou o próprio `id_proposta` como fallback, com `tipo_contratacao = "Parceria
TransfereGov"`.

## Fluxo de validação de proposta nova

1. Job de descoberta acha `id_proposta` nunca visto num dos 8 programas-alvo,
   cujo objeto/item bate com componente ou equipamento do roll prioritário.
2. Cria 1 linha em `proposta_candidata` (schema completo em
   [`../database/modelo_er.md`](../database/modelo_er.md)) com todo o detalhe
   capturado no momento — a equipe não precisa reconsultar a API ao vivo pra
   consultar, mas o link "ver ao vivo" continua disponível caso o dado tenha
   mudado desde a captura.
3. Dispara notificação.
4. Equipe abre o **detalhe completo** e, quando decidir acompanhar o caso,
   escolhe **+ Adicionar ao monitoramento interno**, informa o técnico e
   confirma a inclusão. A proposta continua disponível como dado de descoberta;
   o instrumento é criado com `AuditLog` e pode ser localizado pela chave
   canônica `cd_parceria`/`id_proposta`.

As propostas aparecem na aba "Linhas de financiamento" do frontend
(`frontend/src/pages/monitoramento-equipamentos-page.tsx`, aba `componentes`),
organizadas pelo estágio externo do TransfereGov: parceria confirmada ou
proposta em tramitação.

## Notificações — 2 camadas

- **Camada 1 — atualização vinda da API**: job de descoberta ou verificação
  encontra mudança real (seção "Detecção de mudança real") num convênio já
  monitorado internamente. Visível pra todo mundo que acompanha o
  instrumento.
- **Camada 2 — edição manual do técnico**: reaproveita `AuditLog`
  (`backend/app/audit.py::log_action`, já usado pelas rotas de mutação via
  `PATCH`) em vez de inventar rastreamento novo — toda alteração feita por
  um técnico já vira 1 linha em `audit_log`; a notificação de camada 2 nasce
  a partir dela. Visível só pra nível de usuário **acima** de técnico —
  hierarquia ainda a definir, mas o modelo já reaproveita o enum
  `UserRole` (`backend/app/db/models.py`, `admin`/`colaborador`/`leitor`) como
  candidato natural quando a regra for fechada.

Cada notificação recebe do backend um `destino` resolvido. Ao clicar, o
frontend marca a notificação como lida e navega para o detalhe do instrumento;
notificações de proposta levam à aba de linhas de financiamento.

## Bloqueio de infraestrutura — provavelmente já resolvido

`render.yaml` mostra o backend rodando no Render com banco no **Neon**
(Postgres serverless, externo ao Render). Neon expõe URL pública por
natureza — é assim que o próprio Render se conecta nele. O `schedule:` de
`.github/workflows/pipelines.yml` está comentado hoje só porque falta
cadastrar a mesma `DATABASE_URL` como secret do GitHub Actions (`Settings →
Secrets and variables → Actions`) — não é um problema de infraestrutura pra
construir, é uma ação de configuração (fora do escopo de código, exige
acesso à credencial que só o dono do repositório tem).
