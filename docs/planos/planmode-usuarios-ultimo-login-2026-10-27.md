# Plano — último login na gestão de usuários

- Estado: aprovado explicitamente pelo usuário em 27/10/2026.
- Objetivo: coluna “Último acesso”, botão de gerenciamento só com ícone e
  remoção do cabeçalho visível “Ações”, também no layout mobile.
- Definição confirmada pelo usuário: último login bem-sucedido, não presença
  ou última atividade; exibir data/hora no fuso America/Sao_Paulo.
- Diagnóstico: login já registra `auth/login_sucesso` em `audit_log` na mesma
  transação da sessão; listagem atual não expõe esse dado.
- Fonte: maior `AuditLog.created_at` por usuário, somente `entity_name=auth`
  e `action=login_sucesso`; falhas, refresh e alterações administrativas não contam.
- Query em lote limitada aos IDs da página, aproveitando índice existente de
  usuário/data; preservar busca, filtros, ordenação e paginação. Sem N+1.
- Backend: repository e service de usuários, DTO específico para itens da
  listagem e router fino; manter `UserRead` dos demais fluxos inalterado.
- Segurança: informação somente no endpoint administrativo já protegido;
  não expor IP, detalhes de auditoria, sessão, token ou credencial.
- Frontend: schema Zod do service e `usuarios-lista.tsx`; reaproveitar ícone
  Settings2/Button e preservar o diálogo atual e a navegação por teclado.
- Botão com nome acessível por usuário e tooltip; cabeçalho da ação somente
  para leitor de tela. Sem texto “Gerenciar” ou “Ações” visível na tabela.
- Sem histórico: “Sem registro”, sem afirmar que a pessoa nunca acessou.
- Compatibilidade: backend antigo sem campo retorna “Indisponível”; campo
  nulo do backend atualizado retorna “Sem registro”. Não inventar datas.
- Visual: tokens, Public Sans e densidade atuais; coluna adicional na tabela
  e dado correspondente nos cards mobile. Conferir 400px e 768px.
- Testes SQL reais em banco descartável: maior login, tentativa falha posterior,
  ausência de histórico, isolamento de usuário, paginação e permissões admin.
- Testes frontend: data/fuso, ausente/nulo, botão sem rótulo visível, abertura
  do diálogo e layout responsivo com HTTP sintético.
- Validar lint, tipos, testes/cobertura, build e gates do PR antes do merge.
- Publicação: integração compatível, deploy manual do backend no Render,
  deploy frontend na Vercel e conferência operacional; sem migrations.
- Riscos: histórico pode ser incompleto; não reconstruir logins por aproximação.
- Rollback: reverter código e republicar; não alterar auditoria ou credenciais.
- Encerramento batch, matriz e frentes futuras permanecem em segundo plano.
