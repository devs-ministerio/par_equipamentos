# Capacidade dos relatórios em produção

Caminho aprovado pelo usuário em 21/10/2026: correção isolada, CI e validação
controlada em produção, sem provisionar homologação remota ou contratar recursos.

- Base: `master` / `de81e98c5e76540ce6a20abbcf6601eefa090441`.
- Uma PR independente: `fix(relatorios): reduz consumo e ajusta prazo de exportacao`.
- Somente builder DOCX, sua admissão concorrente, chamada no Service, dependência
  direta já instalada e testes. Sem copiar Services inteiros da homologação.
- Preservar layout vigente de produção: não importar larguras, paginação ou
  outras melhorias visuais que ainda pertencem à homologação.
- Sem schema, migration, ingestão, Radar, notificações, autenticação, UI,
  workflows, cron, plano contratado ou número de processos novos.
- ZIP progressivo em memória e linha XML pré-formatada; dados/filtros/cálculos
  idênticos. Um DOCX por processo, recusa 503 controlada; XLSX independente.
- Serializar operações python-docx sob trava compartilhada, inclusive gravação;
  não compartilhar parser mutável entre threads sem proteção.
- Testes: paridade XML/partes do pacote com o builder vigente, tabelas vazias e
  longas, unicode/zeros, falha e retomada, concorrência e contrato HTTP.
- Fixtures exclusivamente sintéticas; banco descartável local/CI. Nenhum teste
  de carga ou criação de usuário sintético no banco de produção.
- CI com lint, tipos, testes, pisos, scans e build; não contornar falha de gate.
- Publicar apenas o SHA aprovado/verde da correção, mantendo referência do SHA
  anterior. Não promover o pacote pendente da PR de homologação.
- Pós-publicação: health, sessão real e uma exportação por vez; medir CPU/RAM,
  tempo e erros. Não executar carga concorrente de estresse em produção.
- Se houver regressão, interromper validação e retornar ao SHA anterior pelo
  deploy de aplicação. Não há rollback de schema nem mudança de dados.

## Estado

Preparação e validação em andamento. Sem merge ou deploy executado.
O resultado medido no clone de homologação não certifica esta adaptação sobre
a master: repetir as provas aplicáveis antes de publicar.

## Evidência da adaptação isolada

- Snapshot recuperável do checkout de homologação preservado em
  `refs/backup/capacidade-homologacao-20261021`; arquivos novos também
  arquivados privadamente, sem limpar ou mover trabalho preexistente.
- Base confirmada remotamente: `de81e98`. Sem CODEOWNERS encontrado;
  responsabilidade desta fatia é geração/infra de relatórios backend.
- Linux arm64/Python 3.12.13/PostgreSQL 16.9, fonte congelada e banco
  efêmero sem rede: **401 testes aprovados em 9,34 s**. Ruff/formatação/mypy
  integrais aprovados; cobertura linhas/branches: Services **92,6/82,6%**,
  Repositories **92,7/77,8%**, Routes **91,7/63,0%**, acima dos pisos.
- No bloco inicial de capacidade, `lxml 6.1.3` apenas explicitado como
  dependência direta, sem atualização de versão. Exceção de segurança
  posterior, aprovada pelo usuário, registrada abaixo.
- Metadados locais privados: `/private/tmp/sigeo-release-capacidade-T15JV6/`.

### Revisão final antes da PR

- O primeiro ensaio sobre master, apesar de caber em memória, levou
  96–123 s em 0,1 CPU. Não foi considerado aprovado para o prazo de 90 s.
- A linha XML agora reutiliza o template e o setter `CT_R.text` usado pelo
  próprio `Run.text`; evita reconstruir proxies por célula. Paridade estrutural
  integral novamente aprovada, inclusive espaços, tabs, quebras e Unicode.
- Linux descartável, sem rede, 512 MiB sem swap e 0,1 CPU: três gerações de
  16.710 linhas em **34,90 / 54,30 / 67,70 s**, ZIP íntegro e todas as linhas
  conferidas; pico de cgroup **169,7 MiB**, `oom=0`, `oom_kill=0`, `max=0`.
  É montagem/serialização sintética com aplicação importada: não inclui SQL,
  proxy, instrumentação remota ou concorrência de outras rotas.
- Revisão final backend: **401 testes em 9,71 s**, PostgreSQL descartável
  migrado, Ruff/formatação/mypy e pisos integrais aprovados.
- Frontend: **187 testes**, lint, tipos, formatação, cobertura e build
  aprovados. Testes cobrem arquivo binário, filtros, zeros, timeout de cabeçalho
  e corpo, 503 sem retry, renovação de sessão e preservação do prazo padrão.
  Node 26 local exige desativar seu Web Storage experimental para usar o
  armazenamento do jsdom; nenhum teste/configuração foi enfraquecido por isso.
- O filtro Monitorado permanece no checkout de homologação, fora desta fatia.
- CI remoto, publicação controlada e aceite operacional ainda pendentes.

### Correção de segurança autorizada após o primeiro CI

- PR #29, commit inicial `6ecf4cc`: testes, cobertura, tipos, formatação,
  frontend e E2E remotos passaram. A auditoria Python e o scanner da imagem
  bloquearam a dependência preexistente `certifi 2026.7.22`:
  `PYSEC-2026-4320` / `GHSA-6q48-6c7w-9gw2`.
- Usuário autorizou incluir exclusivamente `certifi 2026.10.19`, versão
  corrigida indicada pelos dois scanners. `uv lock --upgrade-package
  certifi==2026.10.19` alterou somente esse pacote e seus hashes oficiais.
  Nenhuma outra dependência, política HTTPS, CA customizada ou verificação
  TLS foi modificada; nenhum alerta foi ignorado.
- Auditoria local repetida: `uv run --frozen --with pip-audit pip-audit`,
  resultado `No known vulnerabilities found`. Regressão Linux repetida
  com apenas certifi atualizado na imagem QA e rede desativada: **401 testes
  em 9,30 s**, Ruff/formatação/mypy e pisos integrais aprovados. Novo CI
  precisa incluir o lock corrigido antes do aceite final de publicação.

## Diferença encontrada no cliente de produção

`frontend/src/services/relatorios.ts` usa `httpFetch` sem opções de prazo.
O cliente compartilhado da master aplica **15 segundos**, com uma repetição
automática de GET/HEAD após timeout. Isso difere do prazo de relatório de
90 segundos já validado em homologação; não importar o cliente inteiro de lá.

Complemento aprovado expressamente pelo usuário: permitir prazo de 90 segundos
somente para a geração de relatórios e desabilitar repetição automática dessa
geração, mantendo 15 segundos nas demais chamadas. Acrescentar somente os
ajustes mínimos de transporte e testes correspondentes à PR. O prazo inclui
cabeçalhos e corpo do arquivo; o comportamento de autenticação não muda.
