# Plan Mode — correção de logout (2026-09-24)

## Objetivo

Corrigir a saída para que ela mude a interface imediatamente, descarte dados
associados à conta atual e invalide no servidor também o access JWT emitido
para a sessão encerrada.

## Escopo e arquivos

- Frontend: `useAuthSession`, `UserMenu`, teste do hook e spec E2E.
- Backend: emissão/validação de sessão em `app/auth.py`, rotas de auth e
  testes HTTP/fixtures que criam sessões válidas.
- Documentação: matriz HTTP e diagnósticos de Frontend, Segurança, Backend e
  Qualidade.

## Estratégia aprovada e executada

1. Ao clicar em Sair, remover queries autenticadas, fixar `currentUser` como
   visitante e navegar explicitamente para `/login`; a revogação HTTP continua
   em segundo plano.
2. Em falha de rede, preservar a saída local e informar a falta de confirmação
   remota por toast seguro, sem vazar erro técnico.
3. Reusar `RefreshToken.id` como identificador opaco da sessão dentro do JWT
   de acesso. Cada endpoint protegido valida id, usuário, expiração e
   `revoked_at`; não há migration nem token bruto no JWT.
4. Cobrir cache/estado local, reutilização deliberada de access cookie após
   logout e o fluxo E2E login → Sair → login.

## Riscos e compatibilidade

- Não há alteração do contrato público: cookies, CSRF e respostas
  `{"status":"ok"}` permanecem iguais.
- Cada autenticação protegida acrescenta uma consulta indexada por chave
  primária em `refresh_token`; é o custo deliberado para revogação imediata.
- Sessões emitidas por versões anteriores, sem identificador de sessão, passam
  a receber `401` e fazem o usuário entrar novamente — comportamento seguro e
  esperado no deploy.

## Validação

- Frontend: lint, typecheck, build e 108 testes passaram.
- Backend: Ruff e mypy passaram; testes com PostgreSQL foram coletados, mas
  ficaram skip nesta máquina sem `TEST_DATABASE_URL`.
- O E2E novo requer a stack efêmera e credenciais do workflow de CI.
