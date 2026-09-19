/**
 * lib/design-tokens.ts
 *
 * Modelo de referência para a Seção 5 (Identidade Visual e Anti-AI UI Rules)
 * da constiuicao_frontend.md.
 *
 * Objetivo: dar à IA um ponto de partida CONCRETO em vez de descrição em texto.
 * Preencha os 3 campos obrigatórios antes de gerar qualquer tela do projeto.
 *
 * Não é um sistema de tema runtime — é a "assinatura" declarada do projeto,
 * que a IA deve consultar (e respeitar) ao gerar componentes.
 */

export const designTokens = {
  /**
   * 1. ACCENT — cor de destaque do produto.
   * Deve ser diferente do azul default do shadcn. Usada com intenção:
   * CTA primário, estado ativo/selecionado, indicadores de progresso.
   * Nunca decorativa (não colorir ícones, bordas ou fundos "porque sim").
   */
  accent: {
    name: "Âmbar",
    value: "oklch(0.75 0.15 70)", // AJUSTAR — trocar pela cor real do produto
    tailwindVar: "--accent", // mapear no tema shadcn (app/globals.css)
    usage: [
      "Botão primário (bg-accent)",
      "Item ativo em navegação (border-l-2 border-accent)",
      "Foco de input (ring-accent)",
    ],
  },

  /**
   * 2. ASSINATURA VISUAL — um elemento repetido de forma consistente
   * que torna o produto reconhecível. Escolher APENAS UM e reaproveitar
   * em toda a aplicação (não inventar um novo por tela).
   */
  signature: {
    name: "Borda lateral de estado",
    description:
      "Cards/linhas de lista com estado (ativo, erro, sucesso) recebem " +
      "border-l-4 na cor correspondente, em vez de badge ou ícone extra.",
    example: "border-l-4 border-l-accent pl-4", // estado ativo
  },

  /**
   * 3. DENSIDADE — controla padding, tamanho de fonte e whitespace
   * em toda a aplicação. Escolher um perfil e aplicar consistentemente.
   */
  density: {
    profile: "compact", // "compact" | "comfortable"
    // compact  -> dashboards, admin, tabelas de dados densas
    // comfortable -> marketing, onboarding, telas com pouco dado por vez
    scale: {
      compact: { paddingCard: "p-4", gap: "gap-3", textBody: "text-sm" },
      comfortable: { paddingCard: "p-6", gap: "gap-6", textBody: "text-base" },
    },
  },
} as const;

/**
 * Tokens herdados da Seção 4 (Design System) — não redefinir, apenas referenciar.
 * Mantidos aqui só para o LLM ver o conjunto completo em um único arquivo.
 */
export const baseTokens = {
  colors: ["background", "foreground", "card", "muted", "border", "destructive", "primary"],
  radius: ["sm", "md", "lg", "xl"],
  spacingGrid: 8, // px
  typography: {
    h1: "text-3xl font-bold",
    h2: "text-2xl font-semibold",
    h3: "text-xl font-semibold",
    body: "text-base",
    caption: "text-sm text-muted-foreground",
  },
} as const;
