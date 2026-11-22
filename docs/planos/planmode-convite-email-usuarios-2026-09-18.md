# Plan mode — convite por e-mail e ativação de usuários (2026-09-18)

## Objetivo

Substituir a senha inicial informada pelo administrador por um convite de uso único.
O usuário cadastrado recebe um link com token de ativação, define a própria senha e só
então passa a ter acesso.

## Segurança e escopo

- Dado sensível: credencial e token de ativação.
- O token bruto só aparece no link de envio; no banco fica somente seu hash.
- Token expira em 30 minutos, é de uso único e fica revogado após ativação ou reenvio.
- A URL não será registrada em logs nem retornada pela API administrativa.
- Criação e reenvio exigem `admin` no backend; ativação é pública, mas com rate limit.
- Erros de ativação permanecem genéricos para evitar enumeração de usuários.
- E-mail é entregue por gateway HTTP configurado exclusivamente por `MAIL_API_URL` e
  `MAIL_API_SECRET` no ambiente. O backend envia `to`, `subject`, `subtitle`, `body` e
  `html` e autentica no cabeçalho `x-api-key`; não mantém credenciais SMTP.
- Sem gateway em desenvolvimento, o convite não é enviado: a operação falha de forma explícita,
  sem criar uma conta parcialmente ativável.

## Contrato

- `POST /usuarios` recebe nome, e-mail e perfil, sem senha.
- `POST /usuarios/{id}/reenviar-convite` revoga convites anteriores e envia outro.
- `POST /auth/ativar` recebe token e senha; ativa a conta e inicia sessão.
- `POST /auth/esqueci-senha` recebe e-mail e sempre responde de forma genérica; quando a
  conta existe, envia token de recuperação com a mesma política de expiração.
- `POST /auth/redefinir-senha` recebe token e nova senha, revoga sessões existentes e inicia
  uma nova sessão somente após confirmação.
- Usuário pendente não pode fazer login.

## Dados e auditoria

Adicionar hash, validade e data de ativação ao usuário; registrar criação, envio, reenvio,
ativação, solicitação e conclusão de recuperação sem incluir senha ou token. Migration reversível
enquanto não houver usuários pendentes sem os campos novos.

## Validação

Testar token expirado, token reutilizado, reenvio, senha inválida, usuário pendente impedido
de login, ativação bem-sucedida, recuperação para e-mail existente e inexistente, revogação de
sessões e ausência do gateway de e-mail. Depois executar testes backend/frontend e validar migration local
antes de aplicar no Neon.

## Estado da execução

Implementado no backend e frontend; migration `8d2e4f6a1b90` aplicada no Neon. O build e o
typecheck do frontend passaram. Desde 2026-09-22, a entrega real usa o gateway HTTP
configurado por `MAIL_API_URL`/`MAIL_API_SECRET`; sem ambos, o cadastro por convite falha
de forma segura.
