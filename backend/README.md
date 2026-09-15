## Usuario operacional

As rotas de escrita do monitoramento interno exigem JWT. Configure
`JWT_SECRET` no `.env` e crie pelo menos um usuario:

```bash
uv run python scripts/criar_usuario.py --name "Nome" --email nome@org.gov.br --role colaborador
```

Perfis `admin` e `colaborador` podem alterar o monitoramento; `leitor` so
consulta.

## Banco de dados local (migration)

**Regra desde 2026-09-15**: nunca rodar `alembic upgrade`/`downgrade` contra
o banco de producao (Neon, `DATABASE_URL` do `.env`) sem pedido explicito do
usuario -- so testar migration nova localmente primeiro. `render.yaml` ja
roda `alembic upgrade head` sozinho a cada deploy, entao produção se
atualiza quando o deploy acontecer, nao quando alguem roda o comando na mao.

Ja existe um Postgres local (Postgres.app, `localhost:5432`, banco
`SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos` -- nome antigo,
mantido de proposito pra nao precisar `ALTER DATABASE` numa base que
outras ferramentas locais podem ja referenciar). Pra rodar migration
contra ele sem tocar no `.env` (que continua apontando pro Neon, usado
pelo `uv run uvicorn ...` do dia a dia):

```bash
export DATABASE_URL_LOCAL="postgresql+psycopg://$(whoami)@localhost:5432/SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos"

# testar migration nova
DATABASE_URL="$DATABASE_URL_LOCAL" uv run alembic upgrade head

# conferir schema
psql -h localhost -U $(whoami) -d "SIEO-Sistema-de-Informacao-de-Equipamentos-Oncologicos" -c "\dt"

# reverter se precisar corrigir a migration antes de commitar
DATABASE_URL="$DATABASE_URL_LOCAL" uv run alembic downgrade -1
```

Só depois de validado localmente (e só quando o usuário pedir) roda contra
produção: `DATABASE_URL=<neon> uv run alembic upgrade head` -- ou,
preferencialmente, deixa o próximo deploy do Render aplicar sozinho.
