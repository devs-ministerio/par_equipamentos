# Instruções Globais do Agente

Este repositório é o conjunto de constituições que qualquer IA (agente de código, copiloto,
assistente de chat) deve seguir ao trabalhar em projetos desta organização. Este arquivo é o
ponto de entrada — carregado automaticamente por ferramentas que suportam a convenção `AGENTS.md`
(Codex, Cursor, Aider, Copilot) e referenciado pelo `CLAUDE.md` para o Claude Code.

As constituições completas não cabem inteiras em um system prompt — este arquivo é o resumo
operacional. **Antes de implementar algo na área correspondente, abra e siga o documento
completo**, não confie só neste resumo para decisões de detalhe.

---

## 1. Índice — qual constituição consultar

| Você está mexendo em... | Consulte |
|---|---|
| Componente, hook, service de UI, formulário, tela | [frontend/constiuicao_frontend.md](frontend/constiuicao_frontend.md) |
| Rota, service de negócio, repository, contrato de API | [backend/constituicao_backend.md](backend/constituicao_backend.md) |
| Schema, migração, query, índice, transação | [database/constituicao_database.md](database/constituicao_database.md) |
| Dockerfile, workflow de CI/CD, deploy, observabilidade | [devops/constituicao_devops.md](devops/constituicao_devops.md) |
| Teste (unidade/integração/E2E), cobertura, code review | [qualidade/constituicao_qualidade.md](qualidade/constituicao_qualidade.md) |
| Autenticação, autorização, dado sensível, segredo, CORS | [seguranca/constituicao_seguranca.md](seguranca/constituicao_seguranca.md) |

A maioria das tarefas toca mais de uma linha da tabela — leia todas as que se aplicam antes de
implementar (ex.: novo endpoint autenticado = backend + segurança + qualidade).

---

## 2. Regra Transversal: PLAN MODE

Nenhuma das constituições permite código direto para qualquer mudança não trivial. Antes de
implementar, apresente um plano conciso (bullet points, **máximo 30-40 linhas, sem código**) com:
objetivo, arquivos afetados, estratégia, riscos, e o que muda para quem consome o resultado. A
implementação só começa após aprovação do plano. Correção trivial de 1 linha é a única exceção.

Cada constituição detalha o formato do plano específico da sua área (dados/UX no frontend,
contrato/resiliência no backend, modelagem/migração no database, rollout/rollback no devops, dado
sensível/superfície exposta na segurança, estratégia de teste na qualidade).

### 2.1 Ciclo de Aplicação em Base de Código Existente

Ao auditar/aplicar estas constituições sobre uma base de código já existente (não um projeto novo
começando do zero), a aplicação segue três etapas sequenciais, repetidas por área (database,
backend, frontend, devops, segurança, qualidade):

1. **Diagnóstico** — leitura do código real, sem alterar nada, produzindo um documento
   `diagnostico-constituicao-<area>-<data>.md`: inventário, achados e nota de conformidade por
   critério objetivo (comando executado, grep, teste rodado) — nunca por impressão.
2. **Avaliação** — confronto do diagnóstico com o texto exato da constituição da área e com o
   Núcleo Duro (Seção 3): o que o diagnóstico comprovou corretamente, o que ficou sem evidência, o
   que está duplicado entre áreas, e ajuste de nota quando a evidência não sustenta o valor
   atribuído. Por padrão é um arquivo próprio (`avaliacao-diagnostico-<area>-<data>.md`); pode ser
   incorporado como seção dentro do próprio `diagnostico-constituicao-<area>-<data>.md` quando
   pedido explicitamente, desde que fique claramente identificado como a etapa de Avaliação, não
   misturado sem título ao texto do Diagnóstico original.
3. **Plan Mode** — só depois da avaliação, o plano de implementação no formato da Seção 2 da
   constituição da área, cobrindo os achados pendentes, em `planmode-<area>-<data>.md`. A
   implementação só começa após aprovação explícita deste plano — sem exceção para "é uma correção
   pequena" quando o item nasceu de um diagnóstico.

Quando uma mudança já tiver sido aplicada antes deste ciclo existir (drift histórico, correção feita
sem plano formal), o diagnóstico registra o que foi feito e o Plan Mode seguinte cobre só o que
resta — nunca reabrir migração/código já aplicado e validado apenas para "ter plano formal depois
do fato".

### 2.2 Ordem de implementação entre áreas

Quando os Plan Mode de mais de uma área estiverem aprovados e prontos para execução, a ordem de
implementação segue a dependência real entre camadas, não a ordem em que os diagnósticos foram
escritos:

```text
database → segurança & auth → backend → frontend → qualidade & testes → devops & observabilidade
```

Motivo: schema/constraint (database) é a fundação que backend e segurança consultam; autenticação/
autorização (segurança & auth) precisa existir antes do backend fechar rota por rota, porque muda a
assinatura de dependência de cada endpoint; backend estabiliza contrato antes do frontend consumir;
qualidade & testes fecham cobertura de contrato depois que o contrato parou de mudar; devops &
observabilidade (CI gate, logging, deploy) vêm por último porque monitoram/travam o que já está
estável, não o que ainda está em movimento. Uma área posterior nunca bloqueia o início de uma
anterior — a ordem é de conclusão/estabilização, não uma fila estritamente serial quando duas áreas
não compartilham dependência (ex.: frontend pode iterar em paralelo a qualidade & testes do
backend, desde que não dependam do mesmo contrato ainda instável).

---

## 3. O Núcleo Duro (vale em qualquer área)

Estas regras aparecem, de alguma forma, em todas as 6 constituições — são o critério mínimo
inegociável, independente do domínio:

- **Nomeação de domínio real, nunca genérica.** `data`, `handleStuff`, `info`, tabela sem relação,
  teste sem nome descritivo — tudo isso é "cara de IA" e é proibido.
- **Contrato explícito, nunca solto.** Tipo derivado de schema (Zod/Pydantic), coluna com tipo
  estrito, resposta de API validada — nunca `any`/`dict` genérico, nunca `jsonb` como escape de
  modelagem.
- **Erro tratado, nunca cru.** Hierarquia de erro de domínio, resposta sem stack trace, sem
  detalhe de infraestrutura vazado ao cliente.
- **Segredo só via variável de ambiente/secret manager**, nunca hardcoded, nunca versionado, nunca
  logado.
- **Autorização sempre no backend/banco** (Service, Repository, constraint) — ocultação de UI é
  conveniência, nunca controle de acesso real.
- **Teste que afirma algo real.** Nunca `expect(true).toBe(true)`, nunca mock da própria unidade
  sob teste — só fronteira externa é mockada (ver [qualidade](qualidade/constituicao_qualidade.md), Seção 7).
- **Gate automatizado é o portão de verdade.** Lint, typecheck, teste e scan de segurança bloqueiam
  merge — "parece bom" de quem revisou não substitui o pipeline verde.
- **Reversibilidade antes de destruir.** Migração com rollback, deploy com estratégia de reversão,
  backup confirmado antes de operação destrutiva — nunca ação irreversível sem plano aprovado.

---

## 4. Como Responder Quando as Regras Conflitam

1. A constituição da área específica tem prioridade sobre este resumo.
2. [constituicao_seguranca.md](seguranca/constituicao_seguranca.md) tem prioridade sobre qualquer
   atalho de conveniência de outra constituição — em dúvida de segurança, o mais restritivo vence.
3. Instrução explícita do usuário nesta conversa tem prioridade sobre qualquer constituição — mas
   sinalize o desvio (“isso contraria a constituição de X, seguir mesmo assim?”) antes de agir,
   exceto quando o próprio usuário já reconheceu o trade-off.
4. Cenário não coberto por nenhuma constituição: aplicar o Núcleo Duro (Seção 3) e o bom senso de
   engenharia — e propor, ao final, que o gap seja incorporado à constituição correspondente.

---

## 5. Manutenção Deste Conjunto

Estas 6 constituições devem permanecer sincronizadas entre si (links cruzados, sem duplicação
divergente) e livres de arquivo órfão/exemplo desatualizado. Ao propor uma mudança estrutural
nova (nova área, novo documento), atualizar este índice (Seção 1) na mesma alteração.
