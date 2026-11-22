# Diagnóstico da Constituição de Segurança — 2026-09-28

## Escopo e método

Revisão estática de autenticação, sessão, CORS, CSRF, headers, segredos,
workflows e fronteiras de entrada. Não foram abertas credenciais nem feitas
requisições a produção.

## Evidências

- JWT é validado no boot; cookies de sessão são HttpOnly, refresh é rotativo e
  as mutações usam CSRF double-submit global.
- CORS possui origens/métodos/headers explícitos; Trusted Host, HSTS, nosniff,
  frame denial, cache-control e CSP report-only da API estão declarados.
- Não há `.env` rastreado; secret scan, Semgrep, pip-audit e npm audit estão
  previstos nos workflows.

## Avaliação

**Conformidade: 8,4/10.** Não surgiu P0 estático no código versionado. Os
gaps são de comprovação e configuração operacional, que não podem ser
presumidas pela presença de YAML.

### P1 — rate limit ainda pode ser local por processo

`RATE_LIMIT_STORAGE_URI` aceita `memory://` como fallback. Em produção com
mais de uma instância isso não é controle distribuído. Provisionar storage
compartilhado, definir a variável e confirmar 429/telemetria no ambiente.

### P1 — headers e política publicada não foram comprovados nesta rodada

O frontend declara CSP em enforcement e o backend declara hardening, mas falta
evidência pós-deploy para login, CSRF, fontes, mapas, exportação e rota SPA.
Registrar a validação sem incluir segredo ou payload sensível.

### P2 — autorização permanece majoritariamente por papel

A autorização backend existe, mas escopo por técnico/UF/órgão ainda depende de
decisão de produto. Formalizar matriz recurso×ação×papel antes de introduzir
qualquer filtro de conveniência como controle de acesso.

## Próximo Plan Mode

Tratar storage de rate limit e validação pós-deploy como bloco operacional;
se houver decisão de escopo fino, desenhar contrato de autorização separado.
