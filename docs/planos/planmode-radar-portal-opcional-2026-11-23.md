# Plan Mode: Radar com Portal opcional (23/11/2026)

Constituições: backend §§2–6, 9–12; qualidade; segurança §4. Estado: **aguardando aprovação**. Nada de código antes dela.

## Objetivo
- Recapturar e aprovar candidato sem esperar o Portal da Transparência. O Portal vira enriquecimento; a prova mínima vem do SICONV.
- Fase 1 (prova de conceito, só leitura): montar a projeção da carteira só com SICONV para 7AAFRI, 7AAFSX e os 6 casos de ano divergente, sem gravar no banco.
- Fase 2 (só após o resultado da fase 1 e o seu ok): mudar o fluxo.

## Arquivos afetados
- Contratos: `schemas_prova_recaptura_legado.py` (portal opcional), `schemas_projecao_legado.py` (campo de origem do cadastro).
- Service: `projecao_legado.py` (Portal primeiro, SICONV como fallback), `recapturas_legado.py`, `revisao_legado.py`, `prova_recaptura_legado.py` (gate do Portal sai; publicação do SICONV entra).
- Script: `coletar_recaptura_legado.py` (aceita Portal ausente ou incompleto). Sem Repository novo.
- Frontend: `candidato-legado-triagem.tsx` (Aprovar libera com a recaptura, sem exigir o Portal).
- Fase 1: `scripts/poc_projecao_sem_portal.py` (descartável, só leitura, sem banco).

## Estratégia
- Mapa de campos (SICONV): número e ano do instrumento = `NR_PROPOSTA` (igual ao Portal nas 11 recapturas; o `ANO` do convênio é o campo errado); objeto = `OBJETO_PROPOSTA`; convenente = `NM_PROPONENTE` e `IDENTIF_PROPONENTE`; município, UF e IBGE = `MUNIC_PROPONENTE`, `UF_PROPONENTE`, `COD_MUNIC_IBGE`; processo e vigência = `NR_PROCESSO`, `DIA_INIC_VIGENC_CONV`, `DIA_FIM_VIGENC_CONV`.
- Portal presente e íntegro: continua mandando nos campos que já manda. Ausente ou incompleto: SICONV preenche, com a origem registrada em cada campo.
- Campos só do Portal (situação, tipo de convenente, conclusão, última liberação) ficam vazios sem bloquear.
- Publicação comprovada = `DIA_PUBL_CONV` do SICONV preenchido, com convênio celebrado no escopo vigente. Hash e aprovação humana com técnico titular seguem iguais.

## Dados
- Sem migration: a origem fica no `payload_oficial` e na projeção. A confirmar na fase 1 se `convenio.siconv_raw` basta para registrar a origem.
- Requisição e resposta do Radar não mudam de formato; o contrato é só aditivo.

## Resiliência
- Fail-fast: sem `DIA_PUBL_CONV` ou `NR_PROPOSTA`, a recaptura recusa com erro de domínio claro (409).
- Portal indisponível deixa de falhar a recaptura; divergência material entre Portal e SICONV (CNPJ, publicação) continua recusando.
- Idempotência da recaptura e do lote da CI preservada (uma por descoberta).

## Riscos
- Decisão institucional: confirmar com a área responsável que a regra do SISGEO não exige o Portal (a norma consultada não exige).
- Sem o Portal, nada checa o DOU de forma independente; avaliar campo "publicação conferida" na aprovação.
- Nome da instituição divergiu em 2 de 71; precisa de regra explícita de fonte (proposta do SICONV, com CNPJ como chave).
- Ano: usar `NR_PROPOSTA` mantém os relatórios; medido só em 11 de produção, a fase 1 amplia a amostra.

## Testes e validação
- Unidade da projeção por fonte (Portal completo, Portal vazio, sem Portal), contrato da prova e recusas; sem mockar o domínio.
- Teste de banco (`_db.py`, na lista do conftest) de recaptura → prova → aprovação sem Portal.
- `ruff`, `mypy`, `pytest` nos arquivos tocados, e `vitest`/`tsc` no frontend.

## O que muda para quem consome
- Gestor e admin: Aprovar libera após a recaptura mesmo com o Portal "não encontrado". O card passa a mostrar a origem do cadastro.
- API: mesma forma; menos 409 por ausência do Portal.

## Decisões que preciso de você
1. Aprovar a fase 1 (só leitura, sem gravar).
2. Quem confirma a regra institucional antes da fase 2.
3. Regra do nome da instituição (proposta do SICONV como padrão).
