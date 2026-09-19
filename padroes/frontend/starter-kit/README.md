# Starter Kit — Constituição Frontend

Ponto de partida pronto para gerar um projeto novo seguindo as regras de
`constiuicao_frontend.md` (raiz do repo). Copie esta pasta `starter-kit/` para
dentro do projeto novo (ou use o conteúdo de `src/` como base do seu `src/`)
e siga os passos abaixo antes de gerar a primeira tela.

## Setup (fazer nesta ordem)

1. **Tema** — copiar `src/styles/theme.css` por cima do `globals.css` do
   projeto (mantém as camadas `@tailwind`).
2. **Tokens** — copiar `src/lib/design-tokens.ts` para o projeto e preencher
   os 3 campos obrigatórios (`accent`, `signature`, `density`) com a
   identidade real do produto. Depois, em `theme.css`, ajustar `--primary`
   (HSL) para o mesmo valor de `designTokens.accent`.
3. **Fonte** — trocar o `@import` do Google Fonts em `theme.css` pela fonte
   real do projeto, se não for usar Space Grotesk.
4. Gerar a 1ª tela só depois dos passos 1–3 concluídos (Seção 5 da
   constituição: nunca gerar UI sem tokens definidos).

## Estrutura

```
src/
├── components/
│   ├── features/
│   │   └── resultado-card.tsx   # componente de referência (ver abaixo)
│   ├── ui/                      # primitivos shadcn (a preencher via `shadcn add`)
│   ├── layout/                  # header, sidebar, shells
│   ├── forms/                   # formulários compostos
│   └── feedback/                # empty state, error state, skeleton
├── hooks/
│   └── useResultados.ts         # toda lógica assíncrona fica em hook (Seção 7)
├── lib/
│   ├── design-tokens.ts         # identidade visual do projeto (Seção 5)
│   ├── errors.ts                # ApiError normalizado (Seção 9)
│   └── validations/
│       └── resultado.ts         # schemas Zod — fonte da verdade dos tipos (Seção 8)
├── services/
│   └── resultados.ts            # fetch + validação Zod, nunca chamado direto do componente
├── styles/
│   └── theme.css                # globals.css customizado (Seção 4)
├── types/
│   └── resultado.ts             # tipos sempre via z.infer, nunca declarados à mão
└── utils/
```

## `ResultadoCard` — componente de referência

`src/components/features/resultado-card.tsx` combina os padrões prontos do
`theme.css` num caso real: "1 resultado com métricas + identificação + itens"
(convênio, pedido, processo, contrato...). Usa:

- `.card-group` — elevação seletiva por grupo (só no container mais externo).
- `.kpi-row` / `.kpi` — métricas em faixas de altura fixa, nunca desalinham.
- `.meta-grid` — grid de identificação/detalhes (label acima, valor com
  contraste total abaixo).
- `.tabs` — aba ativa por borda inferior, nunca fundo escuro.
- `.table-editorial` + `.table-scroll` — tabela sem sombra, sem scroll de
  página inteira.
- `.badge` — estado do resultado (monitorado / em análise / concluído).

Para reaproveitar em outro domínio: trocar o schema Zod em
`lib/validations/resultado.ts` pelo shape real (`kpis`, `identificacao`,
`itensPlano` continuam genéricos o suficiente para a maioria dos casos), e o
tipo em `types/resultado.ts` é atualizado automaticamente via `z.infer`.

## Fluxo de dados (Seção 7/9)

```
service (fetch + zod.parse) → hook (estado/loading/error) → componente (só consome)
```

Nenhum `fetch` dentro de componente. Todo payload de API é validado com Zod
na camada de `services/` antes de subir ao hook — se a validação falhar, vira
`ApiError` (via `toApiError`), nunca o erro cru do fetch/Zod.

## Próximos passos ao iniciar um projeto novo

- [ ] Preencher `lib/design-tokens.ts` com a identidade real (accent, assinatura, densidade)
- [ ] Ajustar `--primary` em `theme.css` para bater com o accent
- [ ] `shadcn add` dos primitivos necessários em `components/ui/`
- [ ] Trocar o schema de `resultado` pelo domínio real do projeto
- [ ] Apagar este README de exemplo ou adaptá-lo ao projeto
