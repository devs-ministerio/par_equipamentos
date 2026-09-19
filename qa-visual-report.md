# Relatório de QA visual — SIGEO

Data: 2026-09-19  
Ambiente: frontend local `http://localhost:5173` + backend local `http://localhost:8000`  
Credencial usada: `admin@sigeo.local` (senha não registrada neste relatório)

## Resultado

| Funcionalidade | Status | Evidência |
|---|---|---|
| Login com credenciais fornecidas | Passou | Captura visual da tela de login e redirecionamento para `/monitoramento-equipamentos` exibida durante a sessão |
| Dados oficiais — instrumentos e repasses | Passou | Rota `/monitoramento-equipamentos`; KPIs e lista paginada renderizados |
| Monitoramento interno — mesa de trabalho | Passou | Rota `/monitoramento-equipamentos/instrumentos`; KPIs, filtros e tabela renderizados |
| Painel de gestão | Passou | Rota `/monitoramento-equipamentos/painel`; KPIs, distribuição, composição e agenda renderizados |
| Logout | Passou | Redirecionamento confirmado para `/login` |
| Validação visual de campos inválidos | Não executado | O fluxo solicitado não exigia alteração de dados e a sessão foi mantida em escopo somente leitura |
| Responsividade 375×812 e 1920×1080 | Parcial | Desktop observado; o navegador disponível nesta sessão não expôs controle de viewport para concluir a matriz mobile/desktop solicitada |
| Menu responsivo | Passou | Em viewport estreito, o header virou menu hambúrguer; Dados oficiais, Monitoramento interno, Painel, Usuários e Sair ficaram acessíveis |
| Detalhe de instrumento | Passou | Rota `/monitoramento-equipamentos/instrumentos/25000000145202506` carregou cadastro, equipamento, CNEN, cronograma, ações e linha do tempo |
| Acordeões do detalhe | Passou | Fase e cronograma, Ações e Linha do tempo expandiram/recolheram corretamente |
| Validação de nova ação vazia | Passou | Ao tentar adicionar sem descrição, apareceu a mensagem visual `Descreva o que precisa ser feito.` e nenhuma ação foi criada |
| Dashboard de análise de mérito | Passou | Rota `/dashboard` carregou filtros, KPIs, tabela de macrorregiões e tabela de estabelecimentos |
| Mapa de cobertura | Parcial | Rota `/mapa` carregou Leaflet, filtros, zoom e tabelas; o recorte local exibiu estado vazio de estabelecimentos geocodificados |
| Relatórios e metodologia | Passou | Rota `/relatorios` carregou metodologia, fontes e exportações desabilitadas com explicação |
| Administração de usuários | Passou | Rota `/admin/usuarios`, filtro de perfil, tabela e diálogo de novo usuário carregaram; validação vazia exibiu erros |
| Filtro de monitorados | Passou | Checkbox alterou o recorte de 581 para 91 instrumentos e recalculou KPIs |
| Filtro de tipo de contratação | Passou | Seleção FAF alterou o recorte para 12 instrumentos |
| Busca textual | Passou | Busca `FUNDES` reduziu o resultado para 1 instrumento |
| Recuperação de acesso | Passou | `/esqueci-senha` carregou e exibiu `Preencha este campo.` ao enviar vazio |
| Ativação de conta | Passou | `/ativar` carregou e exibiu validação de senhas vazias/inválidas |
| Redefinição de senha | Passou | `/redefinir-senha` carregou formulário de nova senha |
| Rota inexistente | Passou | Exibiu página “Página não encontrada” com retorno aos Dados Oficiais |
| Suíte automatizada frontend | Passou | 14 arquivos / 60 testes Vitest passaram; lint e build passaram |
| Suíte automatizada backend | Passou com skips | 61 passaram, 80 foram pulados por dependências de banco/fixtures, 1 warning de depreciação |

## Observações visuais

- A autenticação inicialmente falhou ao acessar por `127.0.0.1`, porque o preflight CORS retornou `400`. Reabrindo pela origem configurada `localhost`, o login passou. Isso é uma sensibilidade de ambiente/origem, não uma falha de credencial.
- A tela de monitoramento apresentou dados reais e consistentes visualmente: 91 instrumentos, filtros por fase/técnico/UF/tipo de contratação e tabela densa sem sobreposição aparente no viewport observado.
- O painel executivo apresentou 91 instrumentos, execução média de 77%, investimento monitorado e agenda crítica com links navegáveis.
- A captura `fullPage` do monitoramento/painel mostrou repetição de alguns blocos na parte inferior. Como a árvore de acessibilidade contém apenas uma instância dos componentes, isso deve ser reproduzido em uma captura por viewport/rolagem antes de ser tratado como defeito do produto; pode ser efeito do stitching da captura longa.
- Na repetição de 2026-09-19, o comportamento foi reproduzido no painel responsivo: `Agenda crítica` e `Qualidade do acompanhamento` aparecem novamente mais abaixo. A árvore de acessibilidade continua listando uma única ocorrência, portanto o problema pode estar no mecanismo de captura longa ou em conteúdo duplicado fora da árvore acessível.
- No monitoramento responsivo, a tabela permanece visualmente muito estreita: convenente e UF/município quebram/truncam agressivamente e as colunas à direita deixam de ficar visíveis no recorte observado. É um ponto de usabilidade mobile que merece correção ou rolagem horizontal explícita.
- O ambiente local contém dados residuais de testes automatizados na administração de usuários (105 usuários, incluindo vários `pytest-criado-*`). Isso polui a tela e deve ser limpo apenas com uma decisão explícita sobre o banco local; não removi dados para preservar o estado do usuário.
- O mapa carregou corretamente, mas o recorte atual não possui estabelecimentos geocodificados; a aplicação apresenta uma mensagem de estado vazio em vez de quebrar.
- As exportações de PDF e Excel aparecem desabilitadas com a explicação “Exportação temporariamente indisponível”; portanto não são funcionalidade operacional disponível neste ambiente.

## Console e API

- Backend respondeu `200` em `/health`.
- O único erro de API observado foi o `OPTIONS /auth/login` com `400` na origem `127.0.0.1`; após usar `localhost`, o login completou.
- Não foram observados erros visuais bloqueantes nas rotas autenticadas.

## Próximos testes recomendados

1. Repetir a matriz visual com viewport explícito `375×812` e `1920×1080`.
2. Reproduzir o bloco duplicado usando screenshots de viewport e rolagem incremental, para separar bug de renderização de artefato de captura.
3. Ajustar a tabela mobile para rolagem horizontal acessível ou converter colunas secundárias em detalhe expansível.
4. Adicionar um teste E2E de login usando a origem canônica `localhost` para evitar falso negativo de CORS.
