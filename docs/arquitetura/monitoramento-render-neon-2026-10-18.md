# Monitoramento Render/Neon — 18/10/2026

## Escopo e motivo

Separar vivacidade HTTP de prontidão do banco. O `/health` existente faz
`SELECT 1`; usado pelo Render e pelo Ping de cinco minutos, impede que o
Neon suspenda por inatividade. Não alterar autenticação, Radar ou schema.

## Configuração pretendida

- Render `healthCheckPath`: `/health/live`, sem dependência de sessão/DB.
- New Relic, monitor existente: GET `/health/live`, cinco minutos, São Paulo,
  validação TLS preservada. Mede processo HTTP, não disponibilidade funcional.
- Prontidão: manter GET `/health` com `SELECT 1`. Monitor separado de uma hora,
  São Paulo e TLS válido; preservar alertas APM de erro/latência e ausência de
  telemetria. A detecção sintética do banco pode levar até uma hora, além da
  janela de avaliação do alerta; erros de tráfego real continuam observáveis.
- Uma região evita acordar o banco em horários diferentes por localidade.
- Nunca apontar os monitores para a rota nova antes de seu deploy retornar 200.

## Neon Free

O banco precisa poder suspender após cinco minutos sem consultas. Não manter
um monitor SQL de cinco minutos. Ao mínimo de 0,25 CU, atividade contínua
equivale a 180–186 CU-h/mês, acima dos 100 CU-h anunciados no Free.
Uma consulta por hora seguida de cinco minutos ativos equivale a cerca de
15–15,5 CU-h/mês em isolamento. É estimativa, não garantia: inicialização,
autoscaling, usuários, polling, jobs e sobreposição alteram o consumo.

Monitor do banco é útil para detectar falhas sem usuários conectados, mas não
é necessário para manter Render ou Neon ativos. Não desativar observabilidade
da aplicação para economizar; medir consumo após o ajuste antes de voltar ao
Free. O plano Build temporário não substitui essa avaliação.

## Validação e publicação

Testes da rota proíbem abertura de conexão e resolução de `get_db`; uma falha
sintética do banco mantém `/health` com erro e `/health/live` com sucesso.
Schema e dados não são modificados. Publicar apenas a branch isolada baseada
em `45126f3`, passando CI antes de produção. Trocar os destinos externos
somente após verificar o endpoint publicado; inspecionar alertas do monitor
de prontidão separadamente, pois a janela de dez minutos anterior não serve
para acumular duas falhas de um monitor horário.

## Rollback

Antes de retirar a rota, restaurar o monitor externo e health check do Render
para `/health`, verificar a prontidão e então reverter o commit pelo fluxo
normal. Isso retorna o consumo anterior; não muda schema, cookies ou dados.
Não fazer rollback para um destino `/health/live` ausente na versão anterior.

## Fontes

- https://render.com/docs/health-checks
- https://neon.com/docs/introduction/compute-lifecycle
- https://neon.com/blog/neon-free-plan-1-gb-per-project

Este arquivo descreve o alvo; só evidência pós-deploy confirma aplicação
externa. Testes locais não comprovam troca de configuração nos provedores.
