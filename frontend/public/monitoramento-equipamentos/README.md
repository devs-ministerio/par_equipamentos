# Dados de monitoramento de equipamentos

JSON estático consumido por `src/pages/MonitoramentoEquipamentosPage.tsx`
(rota `/monitoramento-equipamentos`, sem link a partir do resto do app).
Não vem de nenhuma API chamada pelo frontend — são um snapshot gerado pelos
scripts do backend e copiado pra cá manualmente. Pra atualizar:

```bash
cd backend
uv run python -m scripts.validar_convenios              # gera convenios_flat.json
uv run python -m scripts.coletar_siconv_legado           # gera siconv_legado.json
uv run python -m scripts.coletar_transferegov_relacional # gera transferegov_relacional.json

cp scripts/output/convenios_flat.json ../frontend/public/monitoramento-equipamentos/convenios.json
cp scripts/output/siconv_legado.json ../frontend/public/monitoramento-equipamentos/siconv.json
cp scripts/output/transferegov_relacional.json ../frontend/public/monitoramento-equipamentos/transferegov.json
```

| Arquivo | Fonte | Chave de cruzamento |
|---|---|---|
| `convenios.json` | Portal da Transparência (`/convenios/numero`) | número do convênio (exato) |
| `siconv.json` | Dump bulk SICONV (`repositorio.dados.gov.br/seges/detru/`) | `NR_CONVENIO` (exato) |
| `transferegov.json` | API nova TransfereGov (`/parcerias`) | CNPJ do convenente (aproximação — não é o mesmo número de convênio, só o mesmo ente) |

Snapshot gerado em 2026-09-03 pros 71 números de convênio de aquisição de
equipamento fornecidos pelo usuário. Ver `docs/monitoramento-equipamentos/`
(protótipos HTML standalone, anteriores a esta página React) pro histórico
de como esse dado foi descoberto/validado.
