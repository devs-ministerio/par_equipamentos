# Plan Mode: Radar, confirmação do Portal e ruído de avisos (22/11/2026)

Estado: plano para aprovação. Nada deste documento foi implementado.

## 1. Por que este plano existe

Três sintomas apareceram juntos na leitura de produção de 21/11/2026 e têm causas diferentes, mas o mesmo defeito de método: **uma falha pequena e local derruba ou polui um processo inteiro, e ninguém é avisado do que importa.**

| Sintoma | Evidência (produção, só leitura) |
| --- | --- |
| A rodada `descoberta-siconv` termina "parcial" e o workflow fica vermelho todo dia | `fonte_captura` 216, 225 e 234 (19, 20 e 21/11): `candidatos_sem_confirmacao = 8`, uma `confirmacoes_inconclusivas` |
| O convênio `7AAFSX` nunca aparece no Radar | Não existe em `candidato_legado` (19 candidatos, 12 confirmados, 7 "não encontrado") |
| 80 a 110 avisos `atualizacao_api` por dia | 83 convênios distintos em 24 h; o texto é só formatação: `000.969 → 969`, `969 → 000.969` |

## 2. Causas raiz

**A. Confirmação do Portal (7AAFSX).**
- O Portal devolve para `7AAFSX` um registro com `dimConvenio.numero` e `dimConvenio.objeto` vazios. O erro registrado é `string_too_short` nesses dois campos.
- A confirmação só usa `dimConvenio.codigo` e `dataPublicacao` (`confirmar_no_portal`), mas valida o registro inteiro com `DimConvenioPortal`, que exige `numero` e `objeto` não vazios. O contrato é mais rígido do que a finalidade.
- Falha de contrato de um candidato vira `confirmacoes_inconclusivas`, o candidato é descartado da publicação e a rodada termina com `ValueError` no fim. O candidato fica invisível e o alerta é o workflow vermelho.
- Se houver revalidações pendentes, todas são adiadas por causa de um único registro ruim (raio de impacto maior que a falha).
- Dos 19 candidatos, 7 estão "não encontrado no Portal", o mais antigo desde 27/10. A fila só lista candidato confirmado, então esses 7 e o `7AAFSX` não aparecem para ninguém. Não há política de envelhecimento.

**B. Ruído de avisos.**
- `mesmo_valor` (`app/services/espelho_diff.py`) tolera zeros à esquerda só quando os dois lados são somente dígitos. `000.969` e `969` não passam, então o valor oscila entre duas grafias (a fonte alterna) e vira "mudança" todo dia.
- A mesma rodada cria um aviso por convênio e o envia a titular, suplente, gestor e admin. Em 21/11 foram 83 avisos `atualizacao_api` contra 10 `edicao_manual`.
- O aviso real se perde no meio do volume.

**C. Observabilidade.**
- Rodada "parcial" por três dias seguidos não gerou ação: workflow vermelho é o único sinal, e a mesma cor serve para falha estrutural e para falha conhecida de um registro.
- `fonte_indisponivel` mistura causas (4 por dia, PET-CT, tratado como item à parte).

## 3. Princípios do método

1. **Descobrir e confirmar são etapas separadas.** Confirmar no Portal enriquece; falhar em confirmar nunca impede o candidato de ser registrado.
2. **Contrato por finalidade.** Cada consumidor valida só o que usa. O contrato completo continua exigido onde o dado entra de fato (recaptura e aprovação).
3. **Estado explícito por candidato**, em vez de exceção que derruba a rodada.
4. **Comparar valores canônicos.** Identificador é comparado depois de normalizado, e a comparação é idempotente (rodar duas vezes com o mesmo dado não gera mudança).
5. **Aviso só para o que é material**, agrupado quando o volume passa de um limite (o padrão já existe nas propostas: `LIMITE_AVISOS_INDIVIDUAIS = 10`).
6. **Falha conhecida não é falha nova.** O workflow só fica vermelho para falha estrutural ou nova; falha persistente de um registro vira quarentena visível, com idade e reaviso semanal.
7. **Teste de caracterização antes do conserto**, com os casos reais de produção, e replay do conserto contra dado real em leitura antes de qualquer gravação.

## 4. Blocos de trabalho

Cada bloco fecha com testes, atualização do mapa e do CLAUDE.md, e commit local.

**Bloco 1. Comparação canônica de identificadores (baixo risco, maior ganho).**
- Lista fechada de campos identificadores (`NR_*`, `NR_DL`, número de documento) comparados sem separadores (`.`, `/`, `-`, espaço) e sem zeros à esquerda. Valores, datas e textos livres continuam com igualdade exata.
- Testes de caracterização com os pares reais: `000.969`/`969`, `02`/`002`, `092013`/`00092013`, `0022015`/`022015`, e um teste de idempotência por convênio.
- Sem migration, sem dado novo.

**Bloco 2. Política de avisos do SICONV.**
- Mudança de identificador ou formatação nunca notifica.
- Titular e suplente recebem aviso individual por convênio deles (mudança material). Gestor e admin recebem um resumo por rodada quando houver mais de 10 convênios alterados.
- Sem aviso retroativo; os 83 de 21/11 ficam como estão.

**Bloco 3. Confirmação do Portal por finalidade e isolada por candidato.**
- DTO mínimo para confirmar (`codigo` e `dataPublicacao`); o completo permanece em recaptura e aprovação.
- Novo estado `inconclusivo` em `confirmacao_portal` (migration que amplia o CHECK; o CHECK de `data_publicacao` continua válido). O candidato passa a ser **registrado** mesmo com Portal incompleto, e não aprovável até confirmar (regra já existente).
- Falha de contrato de um candidato não adia as revalidações dos demais.
- Teste com um "registro esqueleto" do Portal (campos presentes e vazios).

**Bloco 4. Status da rodada, quarentena e visibilidade.**
- Rodada termina `ok` com `quarentena` quando só há falha persistente já conhecida; `parcial`/erro só para falha nova ou estrutural (fonte fora, schema do dump mudou, conflito de revisão).
- Aviso a gestor e admin na primeira ocorrência e reaviso semanal com a idade (dedup por `chave_dedup`).
- Monitor do admin e contador do gestor mostram "aguardando publicação no Portal" com a idade em dias (ex.: `7AAFRI`, 25 dias), sem rejeitar nada automaticamente.

**Bloco 5. Documentação.**
- Mapa do Radar em revisão 2 (estados do candidato, confirmação por finalidade, política de rodada, política de avisos, normalização).
- CLAUDE.md, runbook de atualizações e README do `docs/mermaid`.

Ordem sugerida: 1, 2, 3, 4, 5. Os blocos 1 e 2 não precisam de migration e já resolvem o ruído; o 3 exige migration e entra no release de schema.

## 5. Decisões de produto pendentes

1. Candidato com Portal incompleto ou não encontrado deve ter uma **aba "Aguardando Portal"** somente leitura na central, ou só contagem e idade no monitor? Recomendação: aba somente leitura, para o gestor ver o que está parado.
2. Falha conhecida de um registro deve deixar o workflow **verde com quarentena visível**? Recomendação: sim, com reaviso semanal.
3. Política de avisos do SICONV: individual para titular e suplente, resumo para gestor e admin? Recomendação: sim.

## 6. Riscos e como mitigar

- Normalizar demais pode esconder mudança real de identificador. Mitigação: lista fechada de campos e testes com pares que **devem** continuar diferentes (`969` e `970`).
- Registrar candidato com Portal incompleto muda a fila. Mitigação: continua fora da fila de aprovação; entra só na aba somente leitura.
- Migration do bloco 3. Mitigação: segue a ordem do runbook (backup, migration, deploy); só amplia um CHECK.
- Nenhuma gravação em produção neste plano. Replay só em leitura.

## 7. Fora do escopo

Pipelines de cobertura (ElastiCNES e `fonte_indisponivel` de PET-CT), recaptura em produção e a causa de a fonte alternar a grafia do identificador (apenas tratamos o efeito).
