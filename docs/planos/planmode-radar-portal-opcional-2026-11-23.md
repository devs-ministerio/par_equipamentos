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
- Mapa de campos (SICONV): número do instrumento = sequencial de `NR_PROPOSTA` + `/` + `ANO` do convênio, ano = `ANO` (regra do Portal confirmada na fase 1; `NR_PROPOSTA` puro só coincide quando proposta e convênio são do mesmo ano); objeto = `OBJETO_PROPOSTA`; convenente = `NM_PROPONENTE` e `IDENTIF_PROPONENTE`; município, UF e IBGE = `MUNIC_PROPONENTE`, `UF_PROPONENTE`, `COD_MUNIC_IBGE`; processo e vigência = `NR_PROCESSO`, `DIA_INIC_VIGENC_CONV`, `DIA_FIM_VIGENC_CONV`.
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
- Ano: a fase 1 mostrou que o Portal usa o `ANO` do convênio, não o da proposta (ver resultado da fase 1).

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

## Resultado da fase 1 (23/11/2026, só leitura)
- Cadastro só com SICONV existe e é completo para 7AAFRI (Portal "não encontrado") e 7AAFSX (Portal com número e objeto vazios): número, objeto, CNPJ, nome, município, UF, IBGE, processo e publicação.
- Onde o Portal responde, CNPJ, município, UF, IBGE e objeto batem com o SICONV em todos os casos (10 convênios). Processo bate onde os dois têm valor. Nome divergiu em 1 de 10, com CNPJ igual.
- Número e ano: o Portal usa o sequencial da proposta com o `ANO` do convênio (94266/2013 vira 94266/2014 com `ANO` 2014). Correção do que o diagnóstico anterior assumiu (`NR_PROPOSTA` puro). Há 934 convênios do MS (2,8% de 33.249) com `ANO` diferente do ano da proposta. Exceção legada: 709655 (Portal `00850/2009`).
- Limites: 10 convênios comparados com o Portal, os 6 casos de ano divergente da amostra local do diagnóstico não estavam disponíveis (usei outros da base nacional), e a projeção completa (`ProjecaoCarteiraLegado`) ainda não foi instanciada.

## Resultado da fase 2 (23/11/2026)
- Portal passou a ser opcional na recaptura e na aprovação. `compor_portal` (`scripts/coletar_recaptura_legado.py`) monta o cadastro pelo SICONV (`origem_cadastro="siconv"`) e, quando o Portal responde, usa o Portal onde ele tem valor e o SICONV para preencher vazios (`complementado_do_siconv`). CNPJ divergente é conflito. O nome da instituição é sempre o do SICONV e o CNPJ é a chave de conferência.
- A publicação registrada no SICONV segue obrigatória (recaptura e aprovação). A conferência de data com o Portal só vale quando a origem do cadastro é o Portal.
- Front: o botão Aprovar deixa de depender de `confirmacao_portal`; só falta recaptura.
- Card do Radar mostra o número do processo como marcador "Processo · …", ao lado de Novo e Portal pendente (`numero_processo`, lido do cadastro da última recaptura).
- Mesa de trabalho ganhou o filtro "Responsável" (técnico titular do SISGEO, com a opção "Sem responsável").
- Pendente: Manual Deploy no Render e rodar `tarefa=recaptura` para os candidatos com Portal não encontrado (7AAFRI e de novembro); confirmar a regra institucional com a área responsável.
