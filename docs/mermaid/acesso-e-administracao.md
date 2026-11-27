# Mapa de acesso e administração (revisão 1, de 27/11/2026)

## Objetivo e escopo

Login, ativação de conta, recuperação de senha, sessão por cookies, guardas de rota, gestão de usuários e auditoria. Lido de `frontend/src/App.tsx`, `routers/auth.py`, `routers/usuarios.py`, `routers/auditoria.py` e `services/usuarios.py`.

## 1. Telas e guardas de rota

```mermaid
flowchart TD
  L["/login"]:::tela
  E["/esqueci-senha"]:::tela
  A["/ativar (link de convite)"]:::tela
  R["/redefinir-senha (link)"]:::tela
  P{"ProtectedRoute<br/>sessão válida?"}
  G{"GestaoRoute<br/>admin ou gestor"}
  AD{"AdminRoute<br/>só admin"}
  APP["Telas do app<br/>(/, /painel-geral, /dashboard, /mapa, /relatorios, monitoramento)"]:::tela
  RI["/monitoramento-equipamentos/revisao-itens"]:::tela
  U["/admin/usuarios"]:::tela
  AU["/admin/auditoria"]:::tela
  NF["* (não encontrada)"]:::tela
  P -- não --> L
  P -- sim --> APP
  APP --> G --> RI
  APP --> AD
  AD --> U
  AD --> AU
  L --> E
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

## 2. Login, sessão e renovação

```mermaid
sequenceDiagram
  participant F as Frontend
  participant API as API /auth
  participant DB as Banco
  F->>API: POST /auth/login (limite 5/min)
  API->>DB: confere senha (argon2id, rehash do legado)
  alt 10 falhas seguidas
    API-->>F: bloqueio de 15 min
  else ok
    API-->>F: cookies sigeo_access (20 min), sigeo_refresh, sigeo_csrf
  end
  F->>API: GET /auth/me
  F->>API: rota mutável com X-CSRF-Token
  Note over F,API: access expira: POST /auth/refresh (rotação atômica)
  F->>API: POST /auth/logout (revoga o refresh)
```

Idle de 2 h e teto absoluto de 24 h encerram a sessão. O `http-client.ts` serializa o refresh com mutex e repete a chamada uma vez.

## 3. Convite, ativação e redefinição

```mermaid
flowchart LR
  ADM["Admin cria usuário<br/>POST /usuarios"]:::perfil --> LK["Link de convite (7 dias)<br/>token no fragmento da URL"]
  LK --> ATV["/ativar<br/>POST /auth/ativar"]:::tela
  ATV --> SES["Sessão iniciada"]
  ESQ["/esqueci-senha<br/>POST /auth/esqueci-senha"]:::tela --> LK2["Link de redefinição (7 dias)"]
  ADM2["Admin: enviar-redefinicao / reenviar-convite"]:::perfil --> LK2
  LK2 --> RED["/redefinir-senha<br/>POST /auth/redefinir-senha"]:::tela
  RED --> SES
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
  classDef perfil fill:#C98A00,color:#fff,stroke:#C98A00
```

## 4. Gestão de usuários (só admin)

```mermaid
flowchart TD
  U["/admin/usuarios"]:::tela --> LST["GET /usuarios"]
  U --> NEW["POST /usuarios (convite)"]
  U --> ED["PATCH /usuarios/{id} (papel, dados)"]
  U --> IN["POST .../inativar"]
  U --> RE["POST .../reativar"]
  U --> EV["POST .../enviar-redefinicao e .../reenviar-convite"]
  ED --> R1{"alvo é o próprio admin?"}
  IN --> R1
  R1 -- sim --> X["Bloqueado: admin não se rebaixa nem se inativa"]
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

Papéis: `admin`, `gestor`, `colaborador`, `leitor`.

## 5. Auditoria

```mermaid
flowchart LR
  ACT["Ações de login, logout, ativação,<br/>edições e gestão de usuários"] --> LOG["log_action (app/audit.py)"] --> TAB[("AuditLog")]
  TAB --> API["GET /auditoria (paginado)"] --> TELA["/admin/auditoria"]:::tela
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

Ações de acesso gravadas: `login_sucesso`, `login_falha`, `login_bloqueado`, `logout`, `conta_ativada`.

## Registro de funcionalidades

| Funcionalidade | Onde | Estado |
| --- | --- | --- |
| Login com bloqueio e rate limit | `/auth/login` | ativo |
| Ativação, esqueci/redefinir senha | `/auth/*` | ativo |
| Gestão de usuários | `/usuarios` | ativo, só admin |
| Auditoria paginada | `/auditoria` | ativo, só admin |

## Código sem uso

Nada identificado nesta leitura.

## Limites desta análise

> [!warning] A confirmar
> A redefinição de senha (`/auth/redefinir-senha`) não foi vista gravando `AuditLog`. Filtros e colunas da tela de auditoria não foram detalhados. Texto de e-mail de convite não foi lido.
