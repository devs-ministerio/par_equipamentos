## Usuario operacional

As rotas de escrita do monitoramento interno exigem JWT. Configure
`JWT_SECRET` no `.env` e crie o primeiro usuario (bootstrap, antes de
qualquer usuario existir via UI):

```bash
uv run python scripts/criar_usuario.py --name "Nome" --email nome@org.gov.br --role admin
```

Perfis `admin` e `colaborador` podem alterar o monitoramento; `leitor` so
consulta. **Gestão de usuários (Módulo Admin, 2026-09-17)**: com pelo menos
um `admin` criado, criação/edição/reset de senha/inativação de usuário passam
a ser feitos pela tela `/admin/usuarios` (API em `app/routers/usuarios.py`,
só acessível por `role=admin`) -- o script acima continua existindo só para
esse bootstrap inicial.

## Banco de dados local (migration) e roles do Neon

**Regra desde 2026-09-15, revisada no Plan Mode database 2026-09-16/17 (Bloco 1/4)**:
nunca rodar `alembic upgrade`/`downgrade` contra o banco de produção (Neon)
sem pedido explícito do usuário -- só testar migration nova localmente
primeiro. `render.yaml` **não roda mais `alembic upgrade head` no boot** --
a API sobe direto com `uvicorn`, usando a credencial `sigeo_runtime` (só
`SELECT`/`INSERT`/`UPDATE`/`DELETE`, sem privilégio de DDL). Migration é um
passo manual/isolado: `uv run alembic upgrade head` local com
`DATABASE_URL_MIGRATION` (credencial `sigeo_migration`, dona do schema) ou
via `.github/workflows/migrar_banco.yml` (`workflow_dispatch`) -- sempre
**antes** de qualquer deploy/job que dependa da coluna/tabela nova, nunca
depois.

Dois roles no Neon, sem `CREATEDB`/`CREATEROLE`/`SUPERUSER`:
`sigeo_runtime` (usado por `DATABASE_URL` -- API e os workflows de dado,
que só fazem DML) e `sigeo_migration` (usado só por `DATABASE_URL_MIGRATION`
-- dono de todas as tabelas/sequences do schema `public`, único capaz de
`ALTER`/`CREATE TABLE`). `neondb_owner` (role gerenciado da conta Neon,
com `CREATEDB`/`CREATEROLE`) não é mais usado por nenhuma credencial de
aplicação.

Já existe um Postgres local (Postgres.app, `localhost:5432`, banco
`SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos` -- nome antigo,
mantido de propósito pra não precisar `ALTER DATABASE` numa base que
outras ferramentas locais podem já referenciar). Pra rodar migration
contra ele sem tocar no `.env` (que continua apontando pro Neon, usado
pelo `uv run uvicorn ...` do dia a dia):

**Desde o Plan Mode database 2026-09-17 (Bloco 2)**: um `DATABASE_URL`
exportado de verdade no shell (como nos comandos abaixo) sempre vence
sobre `DATABASE_URL_MIGRATION` do `.env` só pro Alembic -- é a via de
override explícita que evita repetir o incidente onde um `alembic upgrade
head` pensado pra local acabou atingindo o Neon porque o `.env` tinha
`DATABASE_URL_MIGRATION` setado.

```bash
export DATABASE_URL_LOCAL="postgresql+psycopg://$(whoami)@localhost:5432/SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos"

# testar migration nova (local nao tem separacao de role -- um so basta)
DATABASE_URL="$DATABASE_URL_LOCAL" DATABASE_URL_MIGRATION="" uv run alembic upgrade head

# conferir schema
psql -h localhost -U $(whoami) -d "SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos" -c "\dt"

# reverter se precisar corrigir a migration antes de commitar
DATABASE_URL="$DATABASE_URL_LOCAL" DATABASE_URL_MIGRATION="" uv run alembic downgrade -1
```

Só depois de validado localmente (e só quando o usuário pedir) roda contra
produção: `uv run alembic upgrade head` lendo `DATABASE_URL_MIGRATION` do
`.env` (credencial `sigeo_migration`) -- ou, preferencialmente, dispara o
workflow `migrar_banco.yml` no GitHub Actions.
