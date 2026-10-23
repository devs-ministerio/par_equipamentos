
## Segundo achado do mesmo dia: o backup agendado falhou por permissão

A triagem diária de e-mail do usuário listou duas falhas do backup. A de 22/10 13:16 UTC já era conhecida e corrigida (TLS no runner). A de **23/10 07:38 UTC** era nova: `pg_dump: permission denied for table fonte_captura`.

- **Causa:** a migração do release rodou como `neondb_owner` (o secret `DATABASE_URL_MIGRATION` não guardava o `sigeo_migration`). As sete tabelas novas (`candidato_legado*` e `fonte_captura`), duas funções e as sequências ficaram com esse dono. As regras padrão do `neondb_owner` concedem DML ao `sigeo_runtime`, mas **não leitura ao `sigeo_backup`**; só as regras do `sigeo_migration` cobrem os dois.
- **Impacto:** nenhum backup válido entre 22/10 23:03 UTC (pré-deploy) e 23/10 11:56 UTC. O `sigeo_runtime` não foi afetado, porque tinha DML pelas regras do `neondb_owner`.
- **Correção em produção (23/10):** `normalizar_posse_aplicacao.sql` (14 objetos devolvidos ao `sigeo_migration`, 0 restantes), concessões de leitura e DML reaplicadas sob `SET ROLE sigeo_migration`, backup manual verde às 11:56 UTC.
- **Prevenção (este PR):** `scripts/garantir_permissoes_banco.py`. O `migrar_banco.yml` agora falha se a conexão não for do role de migração, reaplica as concessões depois das migrations e falha listando qualquer tabela sem dono ou sem acesso. O `backup_banco.yml` passa a explicar o erro de permissão no próprio log.
- **Pendente do usuário:** regravar o secret `DATABASE_URL_MIGRATION` com a string do `sigeo_migration` (conexão direta). Enquanto isso não for feito, a nova verificação do workflow vai falhar de propósito.

### Lição sobre a triagem

A triagem só leu e-mails e errou o estado de dois itens (um alerta que já estava fechado e uma falha de CI já substituída), mas foi ela que expôs o backup quebrado. Estado e evento precisam andar juntos: ver `monitoramento-render-neon-2026-10-18.md`, seção de 23/10.
