# Mapas Mermaid do SISGEO

Pasta de mapas de fluxo lidos do código. Cada mapa cobre um módulo, tem revisão e data, e serve para a equipe validar o comportamento e apontar funcionalidade ou código sem uso.

## Índice

| Mapa | Escopo | Revisão |
| --- | --- | --- |
| [monitoramento-interno.md](monitoramento-interno.md) | Mesa de trabalho, detalhe do instrumento, itens, entregas, conclusão, licença, avisos | 6, 24/11/2026 |
| [radar-instrumentos.md](radar-instrumentos.md) | Radar de instrumentos: descoberta SICONV, Portal, triagem, recaptura, aprovação, avisos e popup, fontes externas, sequências de API, Portal opcional, workflow | 4, 23/11/2026 |
| [banco-de-dados.md](banco-de-dados.md) | Banco de dados: 50 tabelas por domínio, ligações com e sem chave estrangeira, estado de uso em produção | 2, 23/11/2026 |
| [dados-oficiais.md](dados-oficiais.md) | Página Dados oficiais: abas Instrumentos/Programas e Linhas de financiamento, escopo | 1, 27/11/2026 |
| [relatorios.md](relatorios.md) | Relatórios do monitoramento: tipos, compatibilidade com a etapa, prévia e download | 1, 27/11/2026 |
| [analise-de-merito.md](analise-de-merito.md) | Painel geral, Dashboard, Mapa e Relatórios de mérito, origem dos dados e regras SUS | 1, 27/11/2026 |
| [acesso-e-administracao.md](acesso-e-administracao.md) | Login, sessão, convite e redefinição, guardas de rota, usuários, auditoria | 1, 27/11/2026 |

## Abrir direto no GitHub

Cada link abre o diagrama na própria seção. No GitHub, passar o mouse sobre o diagrama mostra os controles de zoom e arraste, que ajudam quando ele aparece pequeno no Mac.

### Radar de instrumentos

Arquivo inteiro: [radar-instrumentos.md](radar-instrumentos.md)

- [1. Visão de ponta a ponta](radar-instrumentos.md#1-visão-de-ponta-a-ponta)
- [2. Acesso e telas](radar-instrumentos.md#2-acesso-e-telas)
- [3. Descoberta SICONV (job diário)](radar-instrumentos.md#3-descoberta-siconv-job-diário)
- [4. Critério de escopo (o que vira candidato)](radar-instrumentos.md#4-critério-de-escopo-o-que-vira-candidato)
- [5. Confirmação no Portal da Transparência](radar-instrumentos.md#5-confirmação-no-portal-da-transparência)
- [6. Persistência e avisos](radar-instrumentos.md#6-persistência-e-avisos)
- [7. Recaptura, prova e revalidação](radar-instrumentos.md#7-recaptura-prova-e-revalidação)
- [8. Estados do candidato e decisões](radar-instrumentos.md#8-estados-do-candidato-e-decisões)
- [9. Aprovação (transação única)](radar-instrumentos.md#9-aprovação-transação-única)
- [10. Lista, filtros e paginação](radar-instrumentos.md#10-lista-filtros-e-paginação)
- [11. Propostas do TransfereGov (job e aba)](radar-instrumentos.md#11-propostas-do-transferegov-job-e-aba)
- [12. Workflow, cron e proteções](radar-instrumentos.md#12-workflow-cron-e-proteções)
- [15. Avisos do espelho SICONV e popup de detalhe](radar-instrumentos.md#15-avisos-do-espelho-siconv-e-popup-de-detalhe)
- [16. Fontes externas e suas APIs](radar-instrumentos.md#16-fontes-externas-e-suas-apis)
- [17. Fluxos de API (sequências)](radar-instrumentos.md#17-fluxos-de-api-sequências)
- [18. Radar antes do Portal](radar-instrumentos.md#18-radar-antes-do-portal-implementado-em-22112026-aprovar-deixou-de-exigir-o-portal-em-2311-seção-23)
- [23. Portal opcional na recaptura e na aprovação](radar-instrumentos.md#23-portal-opcional-na-recaptura-e-na-aprovação-23112026)

### Monitoramento interno

Arquivo inteiro: [monitoramento-interno.md](monitoramento-interno.md)

- [1. Telas e navegação](monitoramento-interno.md#1-telas-e-navegação)
- [2. Estrutura da página de detalhe](monitoramento-interno.md#2-estrutura-da-página-de-detalhe)
- [3. Fase do acompanhamento (calculada, nunca escolhida)](monitoramento-interno.md#3-fase-do-acompanhamento-calculada-nunca-escolhida)
- [4. Itens, entregas e unidades](monitoramento-interno.md#4-itens-entregas-e-unidades)
- [5. Concluir e reabrir o acompanhamento](monitoramento-interno.md#5-concluir-e-reabrir-o-acompanhamento)
- [6. Licença de operação (por estabelecimento CNES)](monitoramento-interno.md#6-licença-de-operação-por-estabelecimento-cnes)
- [7. Registros append-only (eventos, ações, documentos)](monitoramento-interno.md#7-registros-append-only-eventos-ações-documentos)
- [8. Quem pode fazer o quê](monitoramento-interno.md#8-quem-pode-fazer-o-quê)
- [9. Radar de instrumentos (revisão 2)](monitoramento-interno.md#9-radar-de-instrumentos-revisão-2)
- [10. Avisos e jobs](monitoramento-interno.md#10-avisos-e-jobs)
- [14. Painel de gestão e Meu painel](monitoramento-interno.md#14-painel-de-gestão-e-meu-painel-24112026)

### Dados oficiais, relatórios, mérito e acesso

- [Dados oficiais: estrutura da página](dados-oficiais.md#1-estrutura-da-página)
- [Relatórios: da tela ao arquivo](relatorios.md#1-da-tela-ao-arquivo)
- [Análise de mérito: telas e navegação](analise-de-merito.md#1-telas-e-navegação)
- [Acesso: telas e guardas de rota](acesso-e-administracao.md#1-telas-e-guardas-de-rota)

### Banco de dados

Arquivo inteiro: [banco-de-dados.md](banco-de-dados.md)

- [2. Cobertura](banco-de-dados.md#2-cobertura)
- [3. Carteira e monitoramento](banco-de-dados.md#3-carteira-e-monitoramento)
- [4. Itens e entregas](banco-de-dados.md#4-itens-e-entregas)
- [5. Radar de instrumentos](banco-de-dados.md#5-radar-de-instrumentos)
- [6. Acesso e avisos](banco-de-dados.md#6-acesso-e-avisos)

## Convenções

Nome do arquivo: `<modulo>.md` em kebab-case, sem data (a data fica no título). Primeira linha: `# Mapa do <módulo> (revisão N, de dd/mm/aaaa)`.

Estrutura dos mapas de fluxo (Radar e Monitoramento): objetivo e escopo, seções numeradas com um diagrama cada, depois "Registro de funcionalidades", "Código sem uso" e "Limites desta análise". O mapa do banco é por domínio e termina em "Estado de uso das tabelas". O que foi inferido e não confirmado no código vai como `> [!warning] A confirmar`.

Cores: azul `#2A4D9B` para telas, âmbar `#C98A00` para perfis, cinza tracejado para o que está desligado ou sem uso.

Regra de manutenção: mudou o fluxo no código, atualiza o mapa no mesmo commit e sobe a revisão.

## Validar

O validador analisa (`mermaid.parse`) todos os blocos ```mermaid de um arquivo e imprime o erro de cada bloco inválido, mas o script não define código de saída diferente de zero; confira a última linha ("N blocos, M com erro"). Precisa de Node e do pacote `mermaid` instalado no diretório de trabalho do script.

```bash
node docs/mermaid/validar.mjs docs/mermaid/radar-instrumentos.md
```

## Modelo para um mapa novo

```markdown
# Mapa do <módulo> (revisão 1, de dd/mm/aaaa)

Objetivo: ...
Escopo: ...

## 1. Telas e navegação

(diagrama)

## N. Registro de funcionalidades

## N+1. Código sem uso

## N+2. Limites desta análise
```
