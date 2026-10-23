# Inventário SIGEO → SISGEO — Bloco 0 (23/10/2026)

Mapa de ocorrências para o [plano de identidade SISGEO](planmode-identidade-sisgeo-2026-10-20.md). Somente leitura, sobre a `homologacao` alinhada à `master` (`553d18b`), com `git grep` (arquivos versionados, sem `package-lock.json` nem `uv.lock`). **Nenhuma troca foi feita.** A decisão do nome por extenso e da marca segue pendente do usuário.

## Números

- **187 arquivos** com a marca (`sigeo`/`sieo`, em qualquer caixa).
- Variantes: `SIGEO` 178, `Sigeo` 1, `sigeo…` 637 (quase todas identificadores técnicos), `SIEO` 3, `sieo` 11.
- Por área: testes do backend 40, documentação de arquitetura 39, scripts do backend 32, frontend (`src`) 26, backend (`app`) 14, workflows do GitHub 9, e2e 5, raiz 6; demais 1 a 2 arquivos cada.

## Classificação

### A. Apresentação — o que o usuário vê (trocar)

| Superfície | Onde |
|---|---|
| Título da aba e metadados | `frontend/index.html` (`<title>SIGEO</title>`) |
| Cabeçalho, rodapé e login | `app-header.tsx`, `app-footer.tsx`, `login-page.tsx` ("SIGEO", "Entrar no SIGEO"); página 404 em `App.tsx` |
| Mensagens e descrições | `useAuthSession.ts` (mensagem de cookies), `usuario-dialog-gerenciar.tsx`, `auditoria-page.tsx`, `account-action-forms.tsx` |
| E-mails de convite, redefinição e acesso | `backend/app/email.py` (nome do remetente "Sistema de Gestão de Equipamentos em Oncologia - SIGEO", pré-cabeçalhos, corpo, `<title>` e marca no HTML), assuntos em `routers/auth.py` e `services/usuarios.py` |
| Relatórios DOCX/XLSX | `reports/docx_builder.py` (rodapé "SIGEO · Página" e aviso "gerado automaticamente pelo SIGEO"), `services/relatorios.py` (fonte, "Cobertura publicada no SIGEO") |
| API (documentação automática) | `main.py` (título da FastAPI), docstrings |

### B. Documentação atual (atualizar junto)

`README.md`, `AGENTS.md`, `CLAUDE.md`, `backend/README.md`, `docs/metodologia-parametros.md` e `docs/arquitetura/runbook-devops.md`.

### C. Documentação histórica e de fonte (não alterar)

Os planos e diagnósticos datados em `docs/arquitetura/` (39 arquivos) registram decisões da época; trocar o nome neles reescreveria a história. Acrescentar apenas uma nota no `CLAUDE.md`: "SIGEO foi renomeado SISGEO em <data>".

### D. Identificadores técnicos — **não trocar** (quebrariam produção, dados ou histórico)

| Identificador | Motivo para manter |
|---|---|
| Cookies `sigeo_access`, `sigeo_refresh`, `sigeo_csrf` (cerca de 60 usos) | Renomear desloga todos e invalida a sessão; o path e o prefixo do proxy dependem deles |
| Roles `sigeo_runtime`, `sigeo_migration`, `sigeo_backup` (cerca de 220 usos) | Credenciais e permissões no Neon, scripts e secrets |
| Prefixo do R2 `sigeo/producao/...` e nomes de bucket/objetos | Backups existentes e a retenção dependem do prefixo |
| Grupo de concorrência `sigeo-production-database` (workflows) | Coordena backup e migração |
| Bancos e clones de teste `sigeo_*`, variáveis `SIGEO_LOCAL_*` | Scripts e proteções de homologação |
| `sigeo_token_conta_activate` e afins | Fragmento de URL e contratos do front |

### E. Externos ao repositório (decisão separada, opcional)

- **Render:** serviço `sieo-backend` (`sieo-backend.onrender.com`) já usa o nome **antigo "SIEO"**, não SIGEO. Renomear o serviço muda a URL e exige alterar `frontend/vercel.json`, CORS e monitores; não é necessário para a troca de marca.
- **Vercel:** projeto `par-equipamentos` e domínio `par-equipamentos.vercel.app`.
- **New Relic:** monitores e política chamados "SIGEO …" ("SIGEO API — health externo", "SIGEO — Produção"). Renomear é cosmético e pode ser feito no painel depois.
- **Repositório GitHub:** `par_equipamentos`.
- **Resíduos "SIEO" no código:** `pyproject.toml` (`name = "sieo-backend"`), `logging.getLogger("sieo")`, `render.yaml::name`, docstring de `models.py` e o `backend/README.md` (nome antigo do banco local). Tratar como uma decisão à parte; não faz parte de SIGEO → SISGEO.

### F. Testes (atualizar junto com A)

- Backend: 6 arquivos com a marca visível (por exemplo `test_email.py` assertando o assunto "Ative seu acesso ao SIGEO" e o eyebrow "Ação necessária no SIGEO"; `test_homologacao_local.py` com `"fromName": "SIGEO"`). Os usos de `SIGEO_LOCAL_*` são variáveis de ambiente e **ficam**.
- Frontend: 2 arquivos (testes de componentes e e2e que citam o título ou o texto de login).
- Tudo o mais é fixture de dado (`"Teste SIGEO"`) e pode ficar.

## Recomendação de execução (depois da decisão do nome)

1. Centralizar o nome numa constante por camada (frontend e backend) antes de trocar, para a próxima mudança ser de um ponto só.
2. Trocar A e F num único PR de apresentação, sem tocar em D.
3. Atualizar B e acrescentar a nota de C.
4. Aceite visual: desktop, celular, e-mail (clientes Gmail/Outlook), Word, Excel e a aba do navegador.
5. Só depois, se o usuário quiser, E (nomes externos).

## Decisões pendentes do usuário

1. **Nome por extenso do SISGEO** (hoje: "Sistema de Gestão de Equipamentos em Oncologia"; alterar a sigla não autoriza inventar a expansão).
2. **Marca:** manter o monograma "S" do favicon e do cabeçalho, ou criar uma nova.
3. **Se os nomes externos (E) entram** e se o resíduo "SIEO" é tratado junto.
