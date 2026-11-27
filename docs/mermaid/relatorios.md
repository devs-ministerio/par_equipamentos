# Mapa dos relatórios do monitoramento (revisão 1, de 27/11/2026)

## Objetivo e escopo

Página `/monitoramento-equipamentos/relatorios`: carteira filtrada, prévia e download em Excel ou Word de três tipos (Equipamentos, Instrumentos, Propostas). Lido de `routers/relatorios.py`, `relatorio-carteira.tsx`, `relatorio-exportacao-carteira.tsx` e `services/relatorios_*`. Relatório de mérito está em [analise-de-merito.md](analise-de-merito.md).

## 1. Da tela ao arquivo

```mermaid
flowchart TD
  P["/monitoramento-equipamentos/relatorios"]:::tela --> F["Filtros da carteira<br/>escopo, etapa, situação, programa, período..."]
  F --> TP["Tipo de relatório"]:::tela
  TP --> CMP{"compativel(tipo, filtro)?"}
  CMP -- não --> DES["Opção desabilitada"]
  CMP -- sim --> POP["Popup: nível e formato"]:::tela
  POP --> PRE["GET /relatorios/previa"]
  POP --> DL["GET /relatorios?formato=xlsx|docx<br/>(10/min por sessão)"]
  DL --> MON["montar_relatorio_monitorado"]
  MON --> ARQ["Arquivo com nome por tipo, escopo e nível"]
  classDef tela fill:#2A4D9B,color:#fff,stroke:#2A4D9B
```

## 2. Regra de compatibilidade tipo × etapa

```mermaid
flowchart LR
  E{"Etapa do filtro"} -- "propostas" --> PR["Só Propostas"]
  E -- "monitorado" --> MO["Instrumentos e Equipamentos"]
  E -- "vazia" --> TD["Os três"]
  S{"situacao_origem"} -- "instrumento" --> NN["Nenhum tipo"]
  S -- "monitoramento" --> MO
  S -- "proposta" --> PR
```

## 3. O que cada tipo traz

```mermaid
flowchart TD
  EQ["Equipamentos<br/>(equipamentos_monitorados)"] --> N1["Nível Simplificado e Completo"]
  IN["Instrumentos<br/>(instrumentos_monitorados)"] --> N2["Só Completo (Simplificado desabilitado)"]
  PP["Propostas"] --> N3["Só Completo (Simplificado desabilitado)"]
  PP --> D["Tudo sem parceria formalizada;<br/>com parceria vira instrumento FAF"]
  N1 --> LIMPA["descartar_colunas_vazias<br/>(coluna sem dado some)"]
  N2 --> LIMPA
  N3 --> LIMPA
```

Equipamento usa o nome canônico do catálogo (ex.: "Mamógrafo"). Instrumento é exibido por `exibir_instrumento`, processo por `formatar_processo`, CNPJ por `formatar_cnpj`.

## 4. Rotas antigas

```mermaid
flowchart LR
  A["GET /relatorios/encerrados"]:::off
  B["GET /relatorios/entregues"]:::off
  classDef off fill:#eee,stroke:#888,stroke-dasharray:4 3,color:#555
```

## Registro de funcionalidades

| Funcionalidade | Onde | Estado |
| --- | --- | --- |
| Prévia | `/relatorios/previa` | ativo |
| Download xlsx/docx | `/relatorios` | ativo, 10/min por sessão |
| Equipamentos, Instrumentos, Propostas | `TipoRelatorio` | ativo |
| `instrumentos_repasse`, `analise_merito` | `TipoRelatorio` | ativo no backend; mérito tem tela própria |

## Código sem uso

> [!warning] A confirmar
> `/relatorios/encerrados` e `/relatorios/entregues` (com `relatorios_encerrados.py` e `relatorios_entregues.py`) não foram vistos sendo chamados pelo frontend. Confirmar antes de remover.

## Limites desta análise

> [!warning] A confirmar
> Conteúdo de cada coluna e aba dos arquivos não foi mapeado; o diagrama mostra só o fluxo e as regras de escolha. `situacao_origem=instrumento` desabilitar todos os tipos foi lido na função `compativel` do frontend.
