
# Constituição Frontend IA v2.0

## 1. Filosofia do Projeto

Este documento define as regras obrigatórias para qualquer implementação frontend realizada por IA.

### Objetivos

- Código limpo, reutilizável e escalável.
- Interfaces com aparência profissional, evitando "cara de IA".
- Padronização entre todos os projetos React/Next.js.

---

## 2. PLAN MODE (Obrigatório)

Antes de gerar qualquer código (exceto correções triviais de 1 linha), a IA deve apresentar um plano contendo:

### Objetivo

- O que será implementado.
- Impacto esperado.

### Arquivos afetados

- src/components/...
- src/hooks/...
- src/services/...
- src/types/...

### Estratégia

- Componentes reutilizados.
- Componentes novos.
- Hooks.
- Tipos.

### Estado

- Props
- Context
- Zustand
- TanStack Query

### UX

- Loading
- Error
- Empty
- Success
- Responsividade (ver Seção 14 — obrigatório em qualquer tela, não é opcional)
- Acessibilidade

### Riscos

- Breaking changes.
- Migração.
- Componentes compartilhados afetados.

A implementação só começa após aprovação do plano.

### Formato do Plano

- O plano deve ser **conciso e direto ao ponto**, em formato de tópicos (bullet points), com **no máximo 30-40 linhas**.
- Não incluir código no plano — apenas estrutura lógica, decisões e caminhos de arquivos.
- Priorizar clareza sobre exaustividade: detalhar apenas o que muda o resultado ou exige aprovação.

---

## 3. Arquitetura

### Estrutura recomendada

```text
src/
├── app/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── feedback/
│   └── features/
├── hooks/
├── services/
├── lib/
├── types/
├── utils/
└── styles/
```

### Responsabilidade Única

- Componentes apenas apresentam UI.
- Hooks concentram lógica.
- Services concentram chamadas HTTP.

### Nomenclatura de Arquivos

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Componentes/Páginas | `kebab-case.tsx` | `user-profile-card.tsx` |
| Hooks | `useCamelCase.ts` (arquivo e export) | `useUserProfile.ts` → `useUserProfile` |
| Services | `kebab-case.ts` | `users.ts`, `user-projects.ts` |
| Schemas Zod | `lib/validations/[feature].ts` | `lib/validations/user.ts` |
| Types | `kebab-case.ts` | `user.ts` |

Nunca misturar convenções dentro do mesmo diretório (ex.: `UserCard.tsx` ao lado de `user-list.tsx`).

---

## 4. Design System

### Obrigatório reutilizar

- Shadcn/UI
- Radix UI
- Lucide React

Nunca recriar botão, modal, dialog ou input existente.

### Obrigatório sobrescrever (não usar o default do `shadcn init`)

O visual "cru" do shadcn (o que todo mundo reconhece como "cara de IA") vem de ninguém
sobrescrever os defaults dele. Antes da primeira tela, o `globals.css`/`tailwind.config`
do projeto **precisa** substituir:

| Default do shadcn | Nunca manter | Substituir por |
|---|---|---|
| Fonte `Inter` (ou nenhuma definida) | Inter, Space Grotesk | Par de fontes do projeto (ver `starter-kit/src/styles/theme.css`) |
| `--radius: 0.5rem` global | mesmo radius em todo componente | Escala própria — ex.: botões/inputs com radius menor que cards |
| Cinza neutro puro (`--muted`, `--border`) | cinza sem viés de matiz | Cinza com leve viés de matiz na direção do accent |
| `shadow-sm`/`shadow` em cards estáticos | sombra em todo `Card` | Sombra reservada a overlay/modal/dropdown; card estático usa borda |
| Paleta base sem accent customizado | primary = azul default | Accent definido em `starter-kit/src/lib/design-tokens.ts` (Seção 5) |

> Modelo pronto para copiar: `starter-kit/src/styles/theme.css` — substitui o `globals.css` gerado
> pelo `shadcn init` já com esses 5 pontos resolvidos, para a IA nunca partir do template cru.

### Tema

- **Sempre light** — não implementar dark mode por padrão. Só criar `.dark`/`prefers-color-scheme` se o projeto pedir explicitamente.
- `<a>` sem sublinhado por default (`text-decoration: none` global) — sublinhado só quando for uma decisão deliberada (link em texto corrido), nunca deixar o default do navegador vazar em nav/botão/card.
- Header/navbar: fundo e borda podem ir de ponta a ponta, mas o **conteúdo** (logo, nav, ações) fica dentro do mesmo container e gutter do `<main>` — nunca mais largo ou mais estreito que o corpo da página.

### Tokens

Sempre utilizar tokens do tema.

**Cores**

- background
- foreground
- card
- muted
- border
- destructive
- primary

**Radius**

- sm
- md
- lg
- xl

**Espaçamento**

Grid de 8 pontos.

**Tipografia**

| Uso | Classe |
|------|--------|
| H1 | text-3xl font-bold |
| H2 | text-2xl font-semibold |
| H3 | text-xl font-semibold |
| Body | text-base |
| Caption | text-sm text-muted-foreground |

---

## 5. Identidade Visual e Anti-AI UI Rules

### Antes de gerar UI (obrigatório no Plan Mode)

Definir explicitamente, em 1 linha cada:

- **Cor de destaque** (accent) do projeto — tom composto e não óbvio (verde-oliva, laranja queimado, violeta, mostarda), nunca o azul default do Bootstrap/shadcn. Usar com extrema moderação: só CTA primário e foco.
- **Par tipográfico** (display + corpo) com escala agressiva — título grande, `font-bold`/`font-extrabold` + `tracking-tight`, corpo limpo e legível. Nunca Inter/Roboto sozinha em tudo.
- **Um elemento de assinatura visual** do produto (ex.: borda lateral colorida em itens ativos, divisor estrutural, estilo específico de badge) — reaproveitado de forma consistente, não decorativo aleatório.
- **Densidade de informação** alvo (compacta tipo dashboard/admin vs. respirada tipo marketing) — muda padding, tamanho de fonte e whitespace em toda a tela.

Sem essas 3 definições, a IA aplica o default do design system "cru" e o resultado fica genérico. Isso é a principal causa da "cara de IA".

> Modelo de referência: `starter-kit/src/lib/design-tokens.ts` (copiar para `lib/design-tokens.ts` no início do projeto e preencher os 3 campos).

### Nunca (causas diretas de "cara de IA")

- Todo conteúdo dentro de `Card` (listas, formulários, textos simples não precisam de card).
- Ícone ao lado de todo título/label sem função (decorativo puro).
- Gradiente ou glassmorphism sem justificativa de marca.
- Sombra pesada (`shadow-lg`/`shadow-xl`) em elementos estáticos — reservar para overlays/modais.
- Tudo centralizado vertical e horizontalmente na tela (layout de "slide", não de produto).
- Grid perfeitamente simétrico quando o conteúdo tem hierarquia (ex.: 3 colunas idênticas para dados de peso desigual).
- Copy genérico de placeholder ("Lorem", "Título aqui", "Descrição da funcionalidade") em vez de copy real do domínio.
- Paleta usando só tons de cinza + 1 azul padrão sem accent definido.

### Sempre

- Hierarquia visual por tamanho/peso/cor — não por caixa ao redor de tudo.
- Layout assimétrico quando o conteúdo justifica (ex.: coluna principal maior que sidebar).
- Um único acento de cor usado com intenção (CTA, estado ativo, destaque) — não múltiplas cores decorativas.
- Estados reais de dado (muitos itens, 1 item, 0 itens, erro) considerados no layout, não só o "caso feliz" com 3-4 itens de exemplo.
- Fundo levemente aquecido (off-white puxado para creme/bege) em vez de branco puro; dark mode puxado para azul/marrom profundo em vez de preto puro.
- Microinteração de 150ms (`transition-colors`/`transition-shadow` ease-in-out) em hover, foco e clique — nunca estado estático sem feedback tátil.
- Anel de foco customizado (`ring-1 ring-primary` ou equivalente) no lugar do outline azul default do navegador.

### Estruturas em vez de "card em tudo"

- Preferir divisor fino (`border-border`) + grid estrutural a card flutuante com sombra — estética editorial/Swiss, não "SaaS genérico".
- Separar seções por bloco de cor sólida (`bg-muted`) em vez de elevação por sombra.
- Tabelas e listas densas: linhas divididas por borda de 1px, cabeçalho com peso tipográfico forte, zero sombra — nunca cada linha dentro do próprio card.

**Exceção deliberada — cards são permitidos, mas só em 1 nível.** Quando o projeto pede cards
(visual mais tátil, menos editorial puro), a regra é **elevação por grupo de resultado, nunca por
elemento dentro do grupo**: 1 card envolve o item inteiro (ex.: um card por convênio, um card
único agrupando toda a row de métricas), e por dentro continua tudo estruturado por borda/divisor
— nunca um card dentro de outro card. Usar a classe `.card-group` do `starter-kit/src/styles/theme.css` (borda +
`--shadow-card`, sombra de 1 nível só — não `shadow-lg`) e uma faixa de accent de 3px como
assinatura no topo, no lugar da régua preta reta.

### Caixa alta (UPPERCASE) — só em labels curtas

- `text-transform: uppercase` **nunca** em conteúdo de leitura (descrição de programa, nome de órgão/entidade, tipo de item, objeto de contrato) — sempre Sentence case, é o que o usuário efetivamente lê.
- UPPERCASE permitido só em rótulo curto de dado (cabeçalho de tabela, label de campo, badge, eyebrow): `text-[10px]` (`0.625rem`) + `tracking-wider` (`letter-spacing: .08em`), sempre em `--muted-foreground`.
- Regra prática: se o texto tem mais de ~4 palavras ou é frase, não é label — não leva uppercase.

### Grid de metadados (identificação/detalhes)

- Padding generoso na seção (mínimo `1.5rem`), nunca comprimido.
- Grade de 4 colunas (2 em mobile) — nunca 5+ colunas, quebra a leitura.
- Cada campo: label curta (`text-[10px]`, cor `--muted-foreground`) em cima, valor em cor de texto principal (`--foreground`, não `--muted-foreground`) logo abaixo — o contraste entre os dois é o que dá hierarquia, não tamanho de fonte.

### Tabelas: alinhamento numérico e abas

- Coluna numérica (qtd, valor unitário, valor total) **sempre** `text-align: right` no `<th>` e no `<td>` — nunca numérico alinhado à esquerda.
- Aba ativa em grupo de tabs: `border-bottom` de 2px na cor do accent + peso de fonte maior — nunca fundo sólido/escuro na aba ativa (isso é o padrão datado que estamos evitando).

> Modelo de referência: `starter-kit/src/styles/theme.css` já traz um exemplo de tabela editorial (`.table-editorial`) seguindo essa regra.

---

## 6. Componentes

### Regras

- Máximo recomendado: 200 linhas.
- Separar responsabilidades.
- Extrair subcomponentes.

### Props

Sempre tipadas.

Nunca usar any.

---

## 7. Hooks

Toda lógica assíncrona fica em hooks.

Exemplo:

- useUsers
- useLoginForm
- useProjects

Hooks retornam estado, loading, error e ações.

---

## 8. Tipagem

### Obrigatório

- Interface.
- Type.
- Zod Infer.

### Proibido

- any
- as any

### Contratos de API

- Todo payload recebido da API **deve** ser validado com Zod Schema na camada de `services/`, antes de retornar ao hook/UI.
- Tipos usados na UI derivam do schema (`z.infer<typeof schema>`) — nunca tipos manuais desacoplados do contrato real do backend.
- Resposta que falha na validação do schema é tratada como erro (não repassar dado não confiável adiante).

---

## 9. Serviços

Nenhum fetch dentro do componente.

```ts
services/users.ts
services/projects.ts
```

Sempre usar try/catch.

Fluxo obrigatório do service:

```ts
async function getUser(id: string) {
  const res = await api.get(`/users/${id}`);
  return userSchema.parse(res.data); // valida e tipa via Zod
}
```

### Erros

- Erro de service nunca sobe cru para a UI — normalizar em um formato único antes de retornar ao hook.
- Padrão: `class ApiError extends Error { status?: number }`, lançado no catch do service.
- Hook captura `ApiError` e expõe `error` tipado (nunca `unknown`/`any`) para o componente.

---

## 10. Estado Global

### Preferência

1. TanStack Query
2. Zustand
3. Context API

Evitar Context para dados frequentemente atualizados.

---

## 11. Formulários

Stack padrão

- React Hook Form.
- Zod.
- @hookform/resolvers.

Campos devem possuir:

- Label.
- Mensagem de erro.
- Helper text.

### Organização dos Schemas

- Proibido declarar `z.object({...})` de formulário dentro do arquivo do componente.
- Schemas Zod de formulário/validação ficam em `lib/validations/[feature].ts` (ou `types/` para tipos derivados reutilizados fora de forms).
- O componente apenas importa o schema e usa `zodResolver(schema)`.

---

## 12. UX Obrigatória

### Loading

Preferir Skeleton.

### Empty

Mensagem + CTA.

### Error

Alert + botão tentar novamente.

### Success

Toast.

### Botões

Estados:

- normal
- loading
- disabled
- success

---

## 13. Feedback Visual

Toda ação deve possuir feedback.

- Salvar.
- Excluir.
- Atualizar.
- Copiar.
- Upload.

---

## 14. Responsividade (obrigatório, não opcional)

Toda tela entregue **precisa** funcionar nos breakpoints abaixo antes de ser considerada pronta —
isso vale mesmo quando não foi pedido explicitamente, é padrão da casa, igual TypeScript sem `any`.

### Mobile First

Breakpoints mínimos: 320px, 375px, 768px, 1024px, 1440px.
Verificação mínima obrigatória: **400px** (referência de "tela de celular estreita") — se quebra
aí, não está pronto.

### Regras técnicas (checáveis, não "boa prática")

- **Gutter lateral mínimo de 16px** em qualquer largura — padding no `body`/wrapper externo, nunca
  `padding` shorthand que zera os lados (`padding-block` para o vertical).
- **Zero scroll horizontal na página** — só tabela, diagrama ou bloco de código largo pode rolar
  lateralmente, e sempre dentro do próprio container (`overflow-x: auto`), nunca a página inteira.
- Nenhum elemento com `min-width` maior que a tela — isso é a causa nº 1 de scroll horizontal
  escondido que só aparece em produção.
- Unidades relativas (`rem`, `%`, `fr`, `clamp()`) em vez de `px` fixo para layout — `px` fixo só em
  borda/radius/sombra, nunca em largura de container.
- Grid/flex de N colunas **sempre** com regra de quebra para 1–2 colunas em mobile — nunca uma grade
  fixa de 4+ colunas sem `@media` ou `auto-fit`/`auto-fill`.
- Imagem e qualquer box com `aspect-ratio` levam `max-width: 100%`.
- Row de métricas/tiles (ver Seção 6): a mesma regra de faixa de altura fixa vale em todos os
  breakpoints — não só desktop.
- `min-h-screen` preferido a altura fixa em `px`/`vh` bruto.

### Antes de considerar a tela pronta

Redimensionar (ou emular) a viewport para 400px e 768px e confirmar visualmente — não basta o
código "parecer" responsivo, tem que ser visto rodando nesses tamanhos.

---

## 15. Acessibilidade

Obrigatório WCAG AA.

Checklist:

- aria-label.
- aria-describedby.
- aria-invalid.
- Focus visível.
- Navegação por teclado.
- Escape fecha modal.
- Enter envia formulário.

---

## 16. Performance

### Obrigatório

- Lazy loading.
- Dynamic import.
- next/image.
- Virtualização acima de 100 itens.

### Memoização

Somente quando necessário.

### TanStack Query

Configurar:

- staleTime
- retry
- invalidateQueries
- optimistic updates

---

## 17. Segurança

> Política completa e detalhada em [constituicao_seguranca.md](../seguranca/constituicao_seguranca.md).
> Esta seção é o checklist mínimo de aplicação no frontend — em caso de dúvida ou cenário não
> coberto aqui (auth, CORS, LGPD, rate limit, headers), consultar o documento compartilhado.

- [ ] Nunca `dangerouslySetInnerHTML`/`innerHTML` com dado não sanitizado.
- [ ] Todo dado validado (schema Zod) antes de enviar à API — nunca payload não tipado.
- [ ] Token/sessão nunca em `localStorage` sem avaliação de risco de XSS — preferir cookie `httpOnly`/`secure`/`SameSite`.
- [ ] Nenhum segredo/chave de API embutido no bundle do client — tudo que vai pro frontend é público por definição.
- [ ] Ocultação de UI por permissão/role é só UX — nunca tratada como controle de acesso real (o backend sempre valida de novo).
- [ ] Dado sensível (CPF, dado financeiro) nunca logado no console nem exposto em URL/querystring.
- [ ] Mensagem de erro exibida ao usuário nunca repassa detalhe técnico cru vindo da API (stack trace, SQL, path de servidor).

---

## 18. Testes

> Política completa em [constituicao_qualidade.md](../qualidade/constituicao_qualidade.md) (pirâmide
> de testes, edge cases obrigatórios, política de mock, cobertura mínima). Esta seção é o resumo de
> aplicação no frontend.

- [ ] Hook testado nos casos de sucesso e de falha de service (estado, loading, error, ação).
- [ ] Componente com lógica testado pelo comportamento visível ao usuário, não por detalhe interno de implementação.
- [ ] Service com erro de API normalizado corretamente em `ApiError`, schema Zod rejeitando payload malformado testado.
- [ ] Nenhum mock do próprio hook/componente sob teste — só fronteira externa (fetch, timer, storage) é mockada.

---

## 19. Fluxo de Implementação

1. Tipos e dados.
2. UI mockada.
3. Integração.
4. Validação.

### Validação obrigatória

```bash
pnpm lint
pnpm typecheck
pnpm test
```

---

## 20. Checklist de Entrega

- [ ] Plan aprovado.
- [ ] Accent, assinatura visual e densidade definidos (Seção 5).
- [ ] Sem erros TypeScript.
- [ ] Sem warnings ESLint.
- [ ] Loading implementado.
- [ ] Error implementado.
- [ ] Empty implementado.
- [ ] Success implementado.
- [ ] Responsivo — testado (visualmente, não só "no código") em 400px e 768px.
- [ ] Sem scroll horizontal na página (só container isolado, com `overflow-x: auto`).
- [ ] Sem console.log.
- [ ] Sem código morto.
- [ ] Componentes reutilizados.
- [ ] Hooks separados da UI.
- [ ] Acessível.
- [ ] Performance validada.
