# Dados de monitoramento de equipamentos

**Achado 2026-09-16 ("parar de usar json estático, coloque tudo no
banco"): `src/pages/MonitoramentoEquipamentosPage.tsx` NÃO lê mais
`convenios.json`/`siconv.json`/`transferegov.json` -- consome
`GET /convenios` (`backend/app/routers/convenios.py`, tabela `Convenio`).**
Os 3 JSON abaixo continuam existindo, mas só como formato intermediário
de saída dos scripts de coleta/descoberta -- entrada de
`scripts/importar_convenios_banco.py`, que faz o merge (mesma regra de
qual fonte vence em cada campo que o antigo `mesclar-convenios.ts` client-
side fazia, agora em Python) e grava na tabela `Convenio` de onde a API
lê. Pra atualizar o universo de convênios (convênio novo publicado,
situação/valor mudou etc.):

```bash
cd backend
uv run python -m scripts.levantamento_convenios_oncologia  # varre o dump nacional SICONV +
                                                             # TransfereGov, gera
                                                             # levantamento_equipamento_por_convenio.json
                                                             # e levantamento_componente_por_programa.json
uv run python -m scripts.expandir_universo_convenios       # busca no Portal da Transparencia so os
                                                             # numeros NOVOS achados acima, faz merge em
                                                             # convenios_flat.json (idempotente)
uv run python -m scripts.coletar_siconv_legado              # atualiza siconv_legado.json pro universo
                                                              # inteiro de convenios_flat.json
uv run python -m scripts.coletar_transferegov_relacional    # atualiza transferegov_relacional.json
                                                              # (idem, por CNPJ de convenios_flat.json)

# extrai so os componentes-alvo (com proposta) de
# levantamento_componente_por_programa.json pra componentes_oncologia.json
# -- ver bloco no fim de scripts/levantamento_convenios_oncologia.py ou
# rodar o trecho equivalente inline.

cp scripts/output/convenios_flat.json ../frontend/public/monitoramento-equipamentos/convenios.json
cp scripts/output/siconv_legado.json ../frontend/public/monitoramento-equipamentos/siconv.json
cp scripts/output/transferegov_relacional.json ../frontend/public/monitoramento-equipamentos/transferegov.json
cp scripts/output/componentes_oncologia.json ../frontend/public/monitoramento-equipamentos/componentes_oncologia.json

# Passo que IMPORTA de verdade (os cp acima só preparam o input) -- lê os
# 3 JSON, resolve CNES (múltiplos sinais, ver docstring de resolver_cnes)
# e faz upsert na tabela `Convenio` (por `numero`, idempotente). GET
# /convenios já serve tudo daqui pra frente, incluindo cnes/
# cnes_nome_estabelecimento -- nao precisa mais propagar nada de volta
# pro convenios.json (`scripts/exportar_cnes_para_json.py` fica só como
# utilitário, caso algo volte a depender do JSON estático).
uv run python -m scripts.importar_convenios_banco
```

| Arquivo/tabela | Fonte | Chave de cruzamento |
|---|---|---|
| `convenios.json` | Portal da Transparência (`/convenios/numero`) | número do convênio (exato) |
| `siconv.json` | Dump bulk SICONV (`repositorio.dados.gov.br/seges/detru/`) | `NR_CONVENIO` (exato) |
| `transferegov.json` | API nova TransfereGov (`/parcerias`) | CNPJ do convenente (aproximação — não é o mesmo número de convênio, só o mesmo ente) |
| `componentes_oncologia.json` | API nova TransfereGov (`/parcerias/programa` + `/proposta`) | não é por convênio — FAF SAÚDE é instrumento novo, sem número legado |
| `Convenio.cnes`/`cnes_nome_estabelecimento` (tabela) | tabela `CnesEstabelecimento` (banco, ver `scripts/importar_convenios_banco.py::resolver_cnes`) | resolvido por CNPJ/planilha/nome contra o parquet `s3://dept-oncologia-dados/silver/cnes_estabelecimentos.parquet` -- 357/403 hoje, `null` nos outros 46 (sem 1 CNES único por natureza) |

Snapshot original gerado em 2026-09-03 pros 71 números de convênio de
aquisição de equipamento fornecidos pelo usuário — ver
`docs/monitoramento-equipamentos/` (protótipos HTML standalone, anteriores
a esta página React) pro histórico de como esse dado foi
descoberto/validado. Estendido em 2026-09-08 (fase de descoberta, decisão
do usuário: só fonte API, sem depender de planilha interna da equipe) via
`scripts/levantamento_convenios_oncologia.py` — varredura do dump NACIONAL
do SICONV por item de equipamento oncológico (não só os convênios já
conhecidos), achando 228 números novos, e por `programa`/`proposta` do
TransfereGov pros 8 "componente" de financiamento pedidos. Ver docstring
desse script pro porquê de cada decisão de fonte/casamento — inclui um
achado real sobre a paginação da API do TransfereGov (`pagina` é o
parâmetro que funciona, não `page`/`page_number`/`offset`, que a própria
API ecoa sem avisar que estão sendo ignorados).
