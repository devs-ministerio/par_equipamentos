# Dados de monitoramento de equipamentos

JSON estático consumido por `src/pages/MonitoramentoEquipamentosPage.tsx`
(rota `/monitoramento-equipamentos`, sem link a partir do resto do app).
Não vem de nenhuma API chamada pelo frontend — são um snapshot gerado pelos
scripts do backend e copiado pra cá manualmente. Pra atualizar:

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
```

| Arquivo | Fonte | Chave de cruzamento |
|---|---|---|
| `convenios.json` | Portal da Transparência (`/convenios/numero`) | número do convênio (exato) |
| `siconv.json` | Dump bulk SICONV (`repositorio.dados.gov.br/seges/detru/`) | `NR_CONVENIO` (exato) |
| `transferegov.json` | API nova TransfereGov (`/parcerias`) | CNPJ do convenente (aproximação — não é o mesmo número de convênio, só o mesmo ente) |
| `componentes_oncologia.json` | API nova TransfereGov (`/parcerias/programa` + `/proposta`) | não é por convênio — FAF SAÚDE é instrumento novo, sem número legado |

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
