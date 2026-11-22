# Mapas Mermaid do SISGEO

Pasta de mapas de fluxo lidos do código. Cada mapa cobre um módulo, tem revisão e data, e serve para a equipe validar o comportamento e apontar funcionalidade ou código sem uso.

## Índice

| Mapa | Escopo | Revisão |
| --- | --- | --- |
| [monitoramento-interno.md](monitoramento-interno.md) | Mesa de trabalho, detalhe do instrumento, itens, entregas, conclusão, licença, avisos | 4, 22/11/2026 |
| [radar-instrumentos.md](radar-instrumentos.md) | Radar de instrumentos: descoberta SICONV, Portal, triagem, recaptura, aprovação, avisos e popup, fontes externas, sequências de API, decisão pendente sobre o Portal, workflow | 3, 22/11/2026 |
| [banco-de-dados.md](banco-de-dados.md) | Banco de dados: 50 tabelas por domínio, ligações com e sem chave estrangeira, estado de uso em produção | 1, 22/11/2026 |

## Convenções

Nome do arquivo: `<modulo>.md` em kebab-case, sem data (a data fica no título). Primeira linha: `# Mapa do <módulo> (revisão N, de dd/mm/aaaa)`.

Estrutura de cada mapa: objetivo e escopo, seções numeradas com um diagrama cada, depois "Registro de funcionalidades", "Código sem uso" e "Limites desta análise". O que foi inferido e não confirmado no código vai como `> [!warning] A confirmar`.

Cores: azul `#2A4D9B` para telas, âmbar `#C98A00` para perfis, cinza tracejado para o que está desligado ou sem uso.

Regra de manutenção: mudou o fluxo no código, atualiza o mapa no mesmo commit e sobe a revisão.

## Validar

O validador renderiza todos os blocos ```mermaid de um arquivo e falha se algum não compilar. Precisa de Node e do pacote `mermaid` instalado no diretório de trabalho do script.

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
