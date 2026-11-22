# Dicionário de dados: Acesso e avisos

Usuários, sessões, auditoria e notificações. Gerado do schema real no head `d9e0f1a2b3c4` e dos modelos em `backend/app/db/`. Legenda e convenções em [README](README.md).

## `user`

Usuário do sistema.

Chave primária: `id`. Colunas: 13. Uso: 23 linhas em produção (contagem exata de 22/11/2026).

Quatro papéis: admin, gestor, colaborador, leitor. Gestão de usuários só pelo admin. A consulta de 22/11/2026 devolveu 0 usuários `pytest-%` em produção.

Restrições:

- Único `uq_user_activation_token_hash`: (activation_token_hash)
- Único `uq_user_email`: (email)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `name` | texto | não | Nome de exibição do usuário. |  |
| `email` | texto | não | E-mail de login; único. |  |
| `password_hash` | texto | não | Hash da senha (argon2id; PBKDF2 legado recebe rehash silencioso no login). Nunca exposto. |  |
| `role` | enum `user_role` | não | Papel RBAC: admin, gestor, colaborador ou leitor. | padrão `'colaborador'_role`; valores: admin, colaborador, leitor, gestor |
| `status` | enum `user_status` | não | Situação da conta: active, inactive ou suspended. | padrão `'active'_status`; valores: active, inactive, suspended |
| `deleted_at` | timestamptz | sim | Data e hora da exclusão lógica da conta. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `failed_login_attempts` | integer | não | Falhas de login seguidas; 10 falhas bloqueiam a conta por 15 minutos. | padrão `0` |
| `locked_until` | timestamptz | sim | Fim do bloqueio por falhas de login; nulo sem bloqueio. |  |
| `activation_token_hash` | texto | sim | Hash SHA-256 do token do convite ou da redefinição de senha (o token vale 7 dias e vai no fragmento da URL). |  |
| `activation_expires_at` | timestamptz | sim | Validade do token de convite ou redefinição. |  |
| `activated_at` | timestamptz | sim | Quando o usuário ativou a conta. |  |

## `refresh_token`

Sessão de refresh: token opaco em cookie HttpOnly; o banco guarda só o hash.

Chave primária: `id`. Colunas: 8. Uso: 844 linhas em produção (contagem exata de 22/11/2026).

Rotação atômica (`UPDATE ... WHERE revoked_at IS NULL RETURNING`). Cookie `sigeo_refresh`. 697 das 844 linhas estão expiradas; não há rotina de purga.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `user_id` | [`user`](acesso-avisos.md#user).`id` | CASCADE |

Restrições:

- Único `uq_refresh_token_token_hash`: (token_hash)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `user_id` | bigint | não | Referência a `user.id`. | FK `user.id` (CASCADE) |
| `token_hash` | texto | não | Hash SHA-256 do refresh token; o token em si não é guardado. |  |
| `expires_at` | timestamptz | não | Validade do token. |  |
| `revoked_at` | timestamptz | sim | Quando o token foi revogado (rotação ou logout); nulo enquanto vale. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `last_used_at` | timestamptz | não | Última rotação da sessão, base do timeout por inatividade (2 h). | padrão `now()` |
| `session_started_at` | timestamptz | não | Início da sessão original, copiado para toda a cadeia de rotações; base do teto absoluto (24 h). | padrão `now()` |

## `audit_log`

Registro de auditoria das mudanças.

Chave primária: `id`. Colunas: 7. Uso: 3.938 linhas em produção (contagem exata de 22/11/2026).

Lacuna conhecida: login, logout e aceite de convite não geram `AuditLog`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `user_id` | [`user`](acesso-avisos.md#user).`id` | SET NULL |

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `user_id` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |
| `entity_name` | texto | não | Nome da entidade auditada (texto livre, por convenção o nome da tabela). |  |
| `entity_id` | bigint | sim | Identificador da entidade auditada; nulo quando não se aplica. |  |
| `action` | texto | não | Ação registrada. |  |
| `details` | jsonb | sim | Detalhes da mudança em JSON (por exemplo `old` e `new`). |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `notificacao`

Aviso interno (atualização da API, edição manual, vigência, prazos, Radar e outros).

Chave primária: `id`. Colunas: 9. Uso: 4.454 linhas em produção (contagem exata de 22/11/2026).

Criar sempre por `repositories/notificacoes.py::criar_notificacao`, que materializa os destinatários.

`atualizacao_api` e `edicao_manual` vão a titular, suplente, gestor e admin; `proposta_candidata` é broadcast; leitor nunca recebe.

Restrições:

- Único `uq_notificacao_chave_dedup`: USING btree (chave_dedup) WHERE (chave_dedup IS NOT NULL)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `tipo` | enum `notificacao_tipo` | não | Tipo do aviso; define a entidade apontada por `entidade_id`. | valores: proposta_candidata, atualizacao_api, edicao_manual, alerta_vigencia, inclusao_monitoramento, fonte_indisponivel, aprovacao_carteira, convenio_descoberto, entrega_legada_revisao, prazo_acao, prazo_inauguracao, prazo_previsao_entrega |
| `titulo` | texto | não | Título do aviso. |  |
| `corpo` | texto | sim | Texto do aviso. |  |
| `entidade_id` | bigint | não | Identificador polimórfico da entidade do aviso, resolvido por `tipo`; sem FK de propósito. |  |
| `nivel_minimo` | texto | sim | Nível mínimo de usuário que vê o aviso. Texto livre: o RBAC do aviso ficou por definir. |  |
| `lida` | boolean | não | Obsoleta. O estado de leitura vive em `notificacao_destinatario.lida`; 11 linhas têm `true` neste campo antigo. | padrão `false` |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `chave_dedup` | texto | sim | Evita aviso repetido do mesmo prazo (tipo:referência:data:janela); nulo nos demais. |  |

## `notificacao_destinatario`

Quem vê cada aviso e quem o marcou como lido, uma linha por aviso e usuário.

Chave primária: `id`. Colunas: 7. Uso: 37.386 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `notificacao_id` | [`notificacao`](acesso-avisos.md#notificacao).`id` | CASCADE |
| `usuario_id` | [`user`](acesso-avisos.md#user).`id` | CASCADE |

Restrições:

- Único `uq_notificacao_destinatario_usuario`: (notificacao_id, usuario_id)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `notificacao_id` | bigint | não | Referência a `notificacao.id`. | FK `notificacao.id` (CASCADE) |
| `usuario_id` | bigint | não | Referência a `user.id`. | FK `user.id` (CASCADE) |
| `lida` | boolean | não | Se este destinatário leu o aviso. | padrão `false` |
| `lida_em` | timestamptz | sim | Quando o destinatário leu o aviso. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `arquivada` | boolean | não | Se o destinatário arquivou o aviso. | padrão `false` |
