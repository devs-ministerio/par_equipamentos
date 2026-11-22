# Dicionário de dados: Radar de instrumentos

Descoberta de convênios no SICONV, recaptura, decisão e propostas do TransfereGov. Gerado do schema real no head `d9e0f1a2b3c4` e dos modelos em `backend/app/db/`. Legenda e convenções em [README](README.md).

## `fonte_captura`

Histórico de cada rodada de coleta de uma fonte oficial.

Chave primária: `id`. Colunas: 10. Uso: 244 linhas em produção (contagem exata de 22/11/2026).

Alimenta o frescor exibido na UI e o alerta de fonte indisponível. Falhas são gravadas em sessão própria para sobreviver ao rollback.

Restrições:

- `ck_fonte_captura_status`: CHECK (((status) = ANY ([('ok'), ('parcial'), ('erro')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `fonte` | texto | não | Código estável do job/fonte, ex. "siconv_legado", "transferegov_verificacao". |  |
| `iniciado_em` | timestamptz | não | Início da rodada. |  |
| `finalizado_em` | timestamptz | não | Fim da rodada. |  |
| `status` | texto | não | ok, parcial ou erro. |  |
| `itens_verificados` | integer | não | Itens verificados na rodada. | padrão `0` |
| `itens_alterados` | integer | não | Itens com mudança real. | padrão `0` |
| `avisos_criados` | integer | não | Avisos criados na rodada. | padrão `0` |
| `erro` | texto | sim | Mensagem de erro; nula sem erro. |  |
| `detalhes` | jsonb | sim | Contagens por tabela/campo, itens sem resposta etc. Sem dado pessoal. |  |

## `candidato_legado`

Convênio candidato descoberto no SICONV, antes da aprovação.

Chave primária: `id`. Colunas: 6. Uso: 19 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `ultima_captura_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`id` | SET NULL |

Restrições:

- Único `uq_candidato_legado_numero`: (numero)
- Único `uq_candidato_legado_proposta`: (id_proposta)
- `ck_candidato_legado_identidade`: CHECK ((((numero) ~ '^[0-9A-Z]+$') AND ((id_proposta) ~ '^[0-9]+$')))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `numero` | texto | não | Número do convênio no SICONV (maiúsculas e dígitos); único. |  |
| `id_proposta` | texto | não | Identificador numérico da proposta no SICONV; único. |  |
| `ultima_captura_id` | bigint | sim | Referência a `candidato_legado_captura.id`. | FK `candidato_legado_captura.id` (SET NULL) |
| `descoberto_em` | timestamptz | não | Quando o candidato foi descoberto. | padrão `now()` |
| `verificado_em` | timestamptz | não | Última vez em que a descoberta o reviu. | padrão `now()` |

## `candidato_legado_captura`

Cada captura oficial do candidato, com confirmação do Portal e recorte de escopo.

Chave primária: `id`. Colunas: 15. Uso: 31 linhas em produção (contagem exata de 22/11/2026).

Só a origem `siconv_oficial` está em uso (31 capturas em produção); o CHECK ainda admite `snapshot_local`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `candidato_id` | [`candidato_legado`](radar.md#candidato_legado).`id` | CASCADE |
| `fonte_captura_id` | [`fonte_captura`](radar.md#fonte_captura).`id` | RESTRICT |

Restrições:

- Único `uq_legado_captura_candidato`: (id, candidato_id)
- `ck_candidato_legado_captura_confirmacao`: CHECK (((confirmacao_portal) = ANY ([('nao_consultado'), ('nao_encontrado'), ('sem_publicacao'), ('confirmado')])))
- `ck_candidato_legado_captura_hash`: CHECK ((((hash_conteudo) ~ '^[a-f0-9]{64}$') AND ((referencia_snapshot) ~ '^[a-f0-9]{64}$')))
- `ck_candidato_legado_captura_origem`: CHECK (((origem) = ANY ([('snapshot_local'), ('siconv_oficial')])))
- `ck_candidato_legado_captura_publicacao`: CHECK ((((confirmacao_portal) = 'confirmado') = (data_publicacao IS NOT NULL)))
- `ck_legado_celebracao_siconv`: CHECK ((((criterio_escopo) IS DISTINCT FROM 'prioritarios_ms_celebrados_v2') OR ((data_assinatura_siconv IS NOT NULL) AND (data_publicacao_siconv IS NOT NULL))))
- `ck_legado_criterio_escopo`: CHECK (((criterio_escopo IS NULL) OR ((criterio_escopo) = ANY ([('prioritarios_ms_v1'), ('prioritarios_ms_celebrados_v2')]))))
- `ck_legado_inelegibilidade_rodada`: CHECK (((elegivel AND (motivo_inelegibilidade IS NULL)) OR ((NOT elegivel) AND (motivo_inelegibilidade IS NOT NULL) AND ((motivo_inelegibilidade) = 'fora_recorte_oficial') AND (fonte_captura_id IS NOT NULL))))
- `ck_legado_orgao_escopo`: CHECK ((((criterio_escopo IS NULL) AND (orgao_superior IS NULL)) OR ((criterio_escopo IS NOT NULL) AND (orgao_superior IS NOT NULL) AND ((orgao_superior) = '36000'))))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `candidato_id` | bigint | não | Referência a `candidato_legado.id`. | FK `candidato_legado.id` (CASCADE) |
| `confirmacao_portal` | texto | não | Confirmação no Portal: nao_consultado, nao_encontrado, sem_publicacao ou confirmado. |  |
| `data_publicacao` | date | sim | Data de publicação no Portal; só quando confirmado. |  |
| `origem` | texto | não | Origem: siconv_oficial (única em uso) ou snapshot_local (legada). |  |
| `referencia_snapshot` | varchar(64) | não | Hash SHA-256 (64 hex) do snapshot de origem. |  |
| `hash_conteudo` | varchar(64) | não | Hash SHA-256 do conteúdo; detecta mudança. |  |
| `capturado_em` | timestamptz | não | Quando a captura foi feita. | padrão `now()` |
| `criterio_escopo` | varchar(32) | sim | Critério de escopo: prioritarios_ms_v1 ou prioritarios_ms_celebrados_v2. |  |
| `orgao_superior` | varchar(5) | sim | Órgão superior do SICONV; só 36000 (Ministério da Saúde). |  |
| `data_assinatura_siconv` | date | sim | Data de assinatura no SICONV; exigida no critério v2. |  |
| `data_publicacao_siconv` | date | sim | Data de publicação no SICONV; exigida no critério v2. |  |
| `elegivel` | boolean | não | Se a captura está no recorte oficial. | padrão `true` |
| `motivo_inelegibilidade` | varchar(32) | sim | fora_recorte_oficial quando não elegível; nulo se elegível. |  |
| `fonte_captura_id` | bigint | sim | Referência a `fonte_captura.id`. | FK `fonte_captura.id` (RESTRICT) |

## `candidato_legado_componente`

Programa e componente do SICONV vinculados à captura; não é equipamento entregue.

Chave primária: `id`. Colunas: 6. Uso: 30 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `captura_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`id` | RESTRICT |

Restrições:

- Único `uq_legado_componente_programa`: (captura_id, id_programa, nome_programa)
- `ck_legado_componente_programa`: CHECK (((id_programa) ~ '^[0-9]+$'))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `captura_id` | bigint | não | Referência a `candidato_legado_captura.id`. | FK `candidato_legado_captura.id` (RESTRICT) |
| `id_programa` | texto | não | Identificador numérico do programa no SICONV. |  |
| `nome_programa` | texto | não | Nome do programa. |  |
| `componente` | texto | não | Componente do programa. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

## `candidato_legado_evidencia`

Evidência de equipamento no item da captura.

Chave primária: `id`. Colunas: 6. Uso: 1 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `captura_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`id` | CASCADE |
| `equipamento_catalogo_id` | [`equipamento_catalogo`](itens-entregas.md#equipamento_catalogo).`id` | RESTRICT |

Restrições:

- Único `uq_candidato_legado_evidencia_item`: (captura_id, id_item, equipamento_catalogo_id)
- `ck_candidato_legado_evidencia_relacao`: CHECK (((relacao) = ANY ([('aquisicao'), ('modernizacao'), ('existente'), ('mencao')])))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `captura_id` | bigint | não | Referência a `candidato_legado_captura.id`. | FK `candidato_legado_captura.id` (CASCADE) |
| `equipamento_catalogo_id` | bigint | não | Referência a `equipamento_catalogo.id`. | FK `equipamento_catalogo.id` (RESTRICT) |
| `id_item` | texto | não | Identificador do item no SICONV. |  |
| `descricao` | texto | não | Descrição oficial do item. |  |
| `relacao` | texto | não | aquisicao, modernizacao, existente ou mencao. |  |

## `candidato_legado_recaptura`

Prova de recaptura oficial do convênio, válida por 24 horas.

Chave primária: `id`. Colunas: 9. Uso: 0 linhas em produção (contagem exata de 22/11/2026).

Vazia em produção: a recaptura nunca rodou lá. Sem prova vigente, o Radar não aprova.

Protegida por trigger `recaptura_legado_append_only`.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `candidato_id` | [`candidato_legado`](radar.md#candidato_legado).`id` | RESTRICT |
| `candidato_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`candidato_id` | RESTRICT |
| `captura_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`id` | RESTRICT |
| `fonte_captura_id` | [`fonte_captura`](radar.md#fonte_captura).`id` | RESTRICT |

Restrições:

- Único `uq_legado_recaptura_identidade`: (id, captura_id, candidato_id)
- Único `uq_legado_recaptura_rodada`: (candidato_id, fonte_captura_id)
- `ck_legado_recaptura_hash`: CHECK (((hash_conteudo) ~ '^[a-f0-9]{64}$'))
- `ck_legado_recaptura_situacao`: CHECK ((length(btrim((situacao))) > 0))
- `ck_legado_recaptura_valor`: CHECK ((valor_global >= (0)))
- Trigger `recaptura_legado_append_only`.

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `candidato_id` | bigint | não | Referência a `candidato_legado_captura.candidato_id`. | FK `candidato_legado_captura.candidato_id` (RESTRICT) |
| `captura_id` | bigint | não | Referência a `candidato_legado_captura.id`. | FK `candidato_legado_captura.id` (RESTRICT) |
| `fonte_captura_id` | bigint | não | Referência a `fonte_captura.id`. | FK `fonte_captura.id` (RESTRICT) |
| `hash_conteudo` | varchar(64) | não | Hash SHA-256 do payload oficial. |  |
| `situacao` | texto | não | Situação do convênio no SICONV na recaptura. **A confirmar.** |  |
| `valor_global` | numeric | não | Valor global na recaptura (≥ 0). |  |
| `payload_oficial` | jsonb | não | Payload oficial do convênio na recaptura (JSON). |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `situacao`.

## `candidato_legado_decisao`

Decisão humana sobre o candidato (rejeição ou aprovação), imutável.

Chave primária: `id`. Colunas: 12. Uso: 1 linhas em produção (contagem exata de 22/11/2026).

Protegida no banco por trigger (`trg_decisao_legado_imutavel`, UPDATE e DELETE de linha; TRUNCATE não é coberto). Só esta e `candidato_legado_recaptura` têm trigger de imutabilidade.

A aprovação exige `tecnico_titular_id`, recaptura e convênio. A ação que gravava `em_analise` foi removida em 22/11/2026; o CHECK ainda o admite.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `candidato_id` | [`candidato_legado_recaptura`](radar.md#candidato_legado_recaptura).`candidato_id` | RESTRICT |
| `candidato_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`candidato_id` | RESTRICT |
| `candidato_id` | [`candidato_legado`](radar.md#candidato_legado).`id` | RESTRICT |
| `captura_id` | [`candidato_legado_recaptura`](radar.md#candidato_legado_recaptura).`captura_id` | RESTRICT |
| `captura_id` | [`candidato_legado_captura`](radar.md#candidato_legado_captura).`id` | RESTRICT |
| `convenio_id` | [`convenio`](carteira-monitoramento.md#convenio).`id` | RESTRICT |
| `recaptura_id` | [`candidato_legado_recaptura`](radar.md#candidato_legado_recaptura).`id` | RESTRICT |
| `tecnico_titular_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |
| `usuario_id` | [`user`](acesso-avisos.md#user).`id` | RESTRICT |

Restrições:

- Único `uq_candidato_legado_decisao_chave`: (candidato_id, chave)
- Único `uq_legado_decisao_convenio`: (convenio_id)
- Único `uq_legado_decisao_recaptura`: (recaptura_id)
- `ck_legado_decisao_anterior`: CHECK (((situacao_anterior) = ANY ([('novo'), ('em_analise')])))
- `ck_legado_decisao_aprovacao_vinculos`: CHECK (((((situacao) = 'aprovado') AND (recaptura_id IS NOT NULL) AND (convenio_id IS NOT NULL)) OR (((situacao) <> 'aprovado') AND (recaptura_id IS NULL) AND (convenio_id IS NULL))))
- `ck_legado_decisao_justificativa`: CHECK (((length(btrim((justificativa))) >= 3) AND (length(btrim((justificativa))) <= 1000)))
- `ck_legado_decisao_situacao`: CHECK (((situacao) = ANY ([('em_analise'), ('rejeitado'), ('aprovado')])))
- `ck_legado_decisao_transicao`: CHECK (((((situacao) = 'em_analise') AND ((situacao_anterior) = 'novo')) OR ((situacao) = ANY ([('rejeitado'), ('aprovado')]))))
- Trigger `trg_decisao_legado_imutavel`.

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `candidato_id` | bigint | não | Referência a `candidato_legado.id`. | FK `candidato_legado.id` (RESTRICT) |
| `captura_id` | bigint | não | Referência a `candidato_legado_captura.id`. | FK `candidato_legado_captura.id` (RESTRICT) |
| `usuario_id` | bigint | não | Referência a `user.id`. | FK `user.id` (RESTRICT) |
| `chave` | uuid | não | UUID de idempotência da decisão; único por candidato. |  |
| `situacao_anterior` | texto | não | Situação antes da decisão: novo ou em_analise. |  |
| `situacao` | texto | não | Decisão: rejeitado ou aprovado (em_analise só em linhas antigas). |  |
| `justificativa` | varchar(1000) | não | Justificativa, de 3 a 1000 caracteres. |  |
| `criado_em` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `recaptura_id` | bigint | sim | Referência a `candidato_legado_recaptura.id`. | FK `candidato_legado_recaptura.id` (RESTRICT) |
| `convenio_id` | bigint | sim | Referência a `convenio.id`. | FK `convenio.id` (RESTRICT) |
| `tecnico_titular_id` | bigint | sim | Titular aceito na aprovação (nulo nas decisões anteriores à exigência): o reenvio idempotente compara com ele. | FK `user.id` (RESTRICT) |

## `proposta_candidata`

Proposta do TransfereGov novo encontrada pelo job de descoberta.

Chave primária: `id`. Colunas: 23. Uso: 28 linhas em produção (contagem exata de 22/11/2026).

Fluxo de revisão obsoleto: `status`, `revisado_por` e `revisado_em` não participam mais de regras, filtros ou APIs.

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `cnes` | [`cnes_estabelecimento`](carteira-monitoramento.md#cnes_estabelecimento).`cnes` | SET NULL |
| `revisado_por` | [`user`](acesso-avisos.md#user).`id` | SET NULL |

Restrições:

- Único `uq_proposta_candidata_id_proposta`: (id_proposta)
- `ck_proposta_candidata_cnpj_ente_recebedor_formato`: CHECK (((cnpj_ente_recebedor) ~ '^[0-9]{14}$'))

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `id_proposta` | bigint | não | ID da proposta no TransfereGov novo; chave de deduplicação do job de descoberta, nunca comparada com `nr_convenio` do SICONV legado. |  |
| `cnpj_ente_recebedor` | texto | não | CNPJ do ente recebedor (14 dígitos). |  |
| `nm_proponente` | texto | não | Nome do proponente. |  |
| `municipio` | texto | sim | Município. |  |
| `uf` | varchar(2) | sim | UF. |  |
| `ds_objeto` | texto | não | Descrição do objeto. |  |
| `nm_programa` | texto | não | Nome do programa. |  |
| `id_programa` | bigint | não | Identificador do programa. **A confirmar.** |  |
| `componente_batido` | texto | não | 1 dos 8 COMPONENTES_ALVO (levantamento_convenios_oncologia.py) -- sempre preenchido, e o proprio job de descoberta que filtra por id_programa desses 8, nao ha candidato fora do escopo. |  |
| `equipamento_detectado` | texto | sim | Equipamento-alvo detectado no objeto ou item; nulo quando nada casa. |  |
| `vl_global_proposta` | numeric | sim | Valor global da proposta. |  |
| `situacao_proposta` | texto | sim | Situação da proposta. **A confirmar.** |  |
| `data_proposta` | date | sim | Data da proposta. |  |
| `metas_resumo` | jsonb | sim | `meta_proposta` e `item_proposta` na descoberta (JSON cru da API, sem schema fixo). |  |
| `tem_parceria` | boolean | não | Ja virou `parceria` formalizada na API (proposta -> parceria) no momento da descoberta -- contexto extra de consulta. | padrão `false` |
| `status` | enum `proposta_candidata_status` | não | Estado legado da revisão (pendente, aceita, rejeitada); sem uso em regras, filtros ou APIs. | padrão `'pendente'_candidata_status`; valores: pendente, aceita, rejeitada |
| `revisado_por` | bigint | sim | Referência a `user.id`. | FK `user.id` (SET NULL) |
| `revisado_em` | timestamptz | sim | Obsoleta; nula em todas as linhas. |  |
| `created_at` | timestamptz | não | Data e hora de criação do registro. | padrão `now()` |
| `cd_parceria` | texto | sim | Código formal da parceria no TransfereGov novo (ex.: 202500044035); só quando a proposta virou parceria. |  |
| `cnes` | varchar(7) | sim | CNES extraído do texto de `metas_resumo`. | FK `cnes_estabelecimento.cnes` (SET NULL) |
| `municipio_normalizado` | texto | sim | Município normalizado por `normalizar_texto`. |  |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `id_programa`, `situacao_proposta`.

## `evidencia_transferegov`

Nó auditável da árvore relacional capturada do TransfereGov.

Chave primária: `id`. Colunas: 9. Uso: 200 linhas em produção (contagem exata de 22/11/2026).

Chaves estrangeiras:

| Coluna | Destino | Ao excluir |
| --- | --- | --- |
| `proposta_candidata_id` | [`proposta_candidata`](radar.md#proposta_candidata).`id` | CASCADE |

Restrições:

- Único `uq_evidencia_transferegov_proposta_caminho`: (proposta_candidata_id, caminho)

Colunas:

| Coluna | Tipo | Nulo | Descrição | Regra |
| --- | --- | --- | --- | --- |
| `id` | bigint | não | Identificador interno. | PK |
| `proposta_candidata_id` | bigint | não | Referência a `proposta_candidata.id`. | FK `proposta_candidata.id` (CASCADE) |
| `tipo_recurso` | texto | não | Tipo do recurso do TransfereGov capturado. **A confirmar.** |  |
| `chave_externa` | texto | não | Chave do recurso na fonte. |  |
| `caminho` | texto | não | Caminho do recurso na API. **A confirmar.** |  |
| `caminho_pai` | texto | sim | Caminho do recurso pai; nulo na raiz. **A confirmar.** |  |
| `payload` | jsonb | não | Resposta da API (JSON). |  |
| `hash_conteudo` | varchar(64) | não | Hash SHA-256 do payload. |  |
| `capturado_em` | timestamptz | não | Quando foi capturado. | padrão `now()` |

> [!warning] A confirmar
> Descrição inferida do nome ou sem fonte no código: `tipo_recurso`, `caminho`, `caminho_pai`.
