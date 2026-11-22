# Plan Mode — Monitoramento: confirmação de inauguração (2026-09-21) — executado

## Diagnóstico e decisão

- O caso `948695` ocorre porque registrar a fase geral **Concluído** não registra o marco físico `cronograma_previsao_inauguracao`; o resumo continua vendo somente a previsão vencida e a classifica como atrasada.
- Conclusão (`fase_concluido`) passa a exigir a confirmação da inauguração na mesma transação. A data real será a data de ocorrência informada para a conclusão; não haverá conclusão interna sem resposta explícita sobre inauguração.
- Se houver previsão pendente, a interface mostrará a previsão e a data real: mesma data confirma a inauguração; data diferente pede confirmação para registrar a inauguração na data real. Em ambos os casos o histórico preserva a previsão anterior e o novo evento append-only prova a realização.

## Bloco 0 — regra, contrato e dados existentes

- Criar um caso de uso/endpoint transacional de conclusão, autorizado a editor, que valide o marco `fase_concluido`, crie o evento de fase e crie/corrija o evento de inauguração com `data_ocorrencia`; emitir `AuditLog` com previsão anterior, data real e decisão do técnico.
- Para uma previsão sem realização, substituir o evento anterior por novo evento de inauguração (ciclo append-only já existente), nunca atualizar ou apagar a linha. Se não houver previsão, criar o evento de realização normalmente.
- Auditar `948695` e demais instrumentos em fase Concluído com inauguração prevista pendente; entregar relatório de reconciliação antes de qualquer correção em massa. Correções históricas exigem confirmação da equipe e usuário/autoria identificáveis.

## Bloco 1 — formulário e interface

- Ao registrar `fase_concluido`, abrir diálogo obrigatório de confirmação com previsão/data real; “Confirmar inauguração” envia a operação atômica e “Voltar” não cria nenhum evento.
- Exibir no detalhe somente a realização mais recente ativa do marco de inauguração; alinhar o seletor do frontend ao desempate backend por `(created_at, id)` para não reaparecer previsão obsoleta.
- Ocultar `Data prevista` para marcos de `fase_geral`; mantê-la para `cronograma_fisico` e `regulatorio`, inclusive nos modos criar e corrigir.

## Bloco 2 — validação de domínio e limpeza

- Rejeitar no backend `data_prevista` em marco de fase geral, tanto no POST quanto no PATCH append-only; registros legados continuam somente leitura.
- Manter `data_prevista` no schema de eventos por compatibilidade dos outros grupos, mas tornar a regra explícita no service e nos contratos/tipos do formulário.
- Remover condicionais, comentários e testes que assumem que uma fase Concluído pode coexistir silenciosamente com inauguração pendente; não alterar arquivos históricos de diagnóstico, apenas documentação de estado atual.

## Bloco 3 — métricas, documentação e testes

- Documentar que **Execução média** é a média aritmética do `execucao_fisica_pct_referencia` da fase geral ativa de cada instrumento com fase mapeada; não é média dos marcos físicos/regulatórios individuais.
- Documentar que **Licenças a vencer** são os eventos ativos mais recentes de Licença de Operação com `data_validade`, incluindo vencidas; o painel considera crítica validade em menos de 90 dias (`dias < 90`).
- Atualizar `AGENTS.md`, `docs/arquitetura/fluxo_requisicao.md`, `docs/database/modelo_er.{md,mermaid}` e comentários locais que descrevem previsão/conclusão.
- Cobrir unitariamente: mesma data, data divergente, cancelamento sem escrita, ausência de previsão, duplicidade/conflito, append-only, datas futuras, proibição de previsão em fase geral, resumo sem inauguração atrasada após confirmação, execução média e janela de licença.
- Executar `npm run test`, `npm run lint`, `npm run build`, `uv run pytest` dos módulos de monitoramento e `ruff`; finalizar com `rg` de referências mortas e marcar este plano como executado.
