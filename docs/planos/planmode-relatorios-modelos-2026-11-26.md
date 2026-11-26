# Relatórios Equipamentos, Instrumentos e Propostas — Modelos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar os relatórios Excel/Word de Equipamentos, Instrumentos e Propostas nos modelos aprovados (Simplificado = resumo estratégico, Completo = acompanhamento), com a mesma extração servindo prévia, Excel e Word.

**Architecture:** O serviço `relatorios_monitorados` passa a devolver, além de `colunas/linhas` (aba Registros, usada pela prévia), um cabeçalho, indicadores, quebras, abas extras e legenda. Os valores são montados por funções puras sobre dataclasses de contexto (testáveis sem banco); consultas novas ficam em repositório próprio. `app/reports/monitorados.py` só formata (xlsx com várias abas e legenda no rodapé; Word em nota informativa).

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, openpyxl, python-docx, pytest; React + TS + vitest (só rótulos e tipo da prévia).

**Spec:** modelos aprovados na conversa de 26/11/2026 (resumidos em "Modelos aprovados" abaixo); desenho visual em https://claude.ai/artifact/1XVziHnfgiFmrH2UKqaz7z. Plano-mãe: `docs/planos/planmode-relatorios-paridade-2026-11-24.md`.

## Global Constraints

- Commits **sem** `Co-Authored-By` e sem "Generated with Claude Code" (regra do CLAUDE.md; vale mais que lembretes do harness). Commitar ao fechar cada task. **Nada vai ao remoto** (sem push/PR/merge).
- Produção é só leitura. Toda verificação usa o clone local (`DATABASE_URL`/`TEST_DATABASE_URL` locais). Antes de qualquer consulta, `select current_database(), current_user` em heredoc `<<'SQL'`.
- Teste novo que usa `SessionLocal()` fica em arquivo `*_db.py` **já listado** em `backend/tests/conftest.py::_DB_TEST_MODULES`. Este plano só estende `test_relatorios_monitorados_db.py` (já listado). Não criar arquivo `_db.py` novo.
- macOS: `sed -i` BSD falha (editar com a ferramenta de edição ou python); `timeout` não existe.
- Router → Service → Repository. Repository: função solta, `db` posicional, nunca commita. Service: `db` keyword-only.
- Arquivo > 200 linhas se divide por responsabilidade. Prettier via `npx`; `ruff`/`mypy` têm baseline: rodar nos arquivos tocados, achado novo é regressão.
- Regras de conteúdo: Fonte do cabeçalho **sem** TransfereGov e sem "monitoramento interno": Equipamentos `SISGEO · SICONV · RENEM · CNES`; Instrumentos `SISGEO · SICONV · CNES`; Propostas `SISGEO`. Sem nota de cobertura de dados. Município com `capitalizar_nome`; **instituição nunca é capitalizada** (CLAUDE.md). Instituição = nome do estabelecimento no CNES, senão o convenente. Valor ausente é célula vazia, nunca zero. Legenda no **rodapé** da aba, fora do intervalo do filtro e depois de uma linha em branco. Cabeçalho da tabela na linha 1, com filtro e painel congelado. Nome do arquivo leva o recorte.
- Filtro "Todos os Equipamentos em Oncologia" substitui "Todas as famílias/Todos os equipamentos" no texto de filtros e no front.
- "Situação (Monitoramento)" é a fase do acompanhamento interno (`InstrumentoComFase.fase_atual`); "Situação (Site)" é a situação oficial do convênio (campo definido na Task 0).
- Datas: Em operação mostra a data da entrega; "Data de Previsão/Inauguração" mostra a inauguração realizada ou, nas demais situações, a previsão. A data de conclusão do monitoramento só aparece em Instrumentos, e só quando não há data de inauguração.

## Modelos aprovados (resumo)

**Equipamentos · Simplificado (16 colunas):** Instrumento, CNES, Estabelecimento de Saúde, Município, UF, Região, Equipamento, Situação (Equipamento), Situação (Site), Situação (Monitoramento), Qtd, Valor do Equipamento, Data de Entrega do Equipamento, Data de Previsão/Inauguração, Status da Inauguração, Técnico Responsável.
**Equipamentos · Completo (25 colunas):** Instrumento, CNES, Estabelecimento de Saúde, Município, UF, Região, Contratação, Equipamento, Descrição do item no plano (com código), Situação (Equipamento), Situação (Site), Situação (Monitoramento), Qtd, Valor do Equipamento, Data de Entrega do Equipamento, Data de Previsão/Inauguração, Status da Inauguração, Nº do Processo, Ano do Instrumento, Início da Vigência, Fim da Vigência, Marca, Modelo, Série, Técnico Responsável. Abas: Resumo, Registros.
**Instrumentos · Simplificado (14):** Instrumento, CNES, Estabelecimento de Saúde, Município, UF, Região, Contratação, Situação (Site), Situação (Monitoramento), Valor Global, Valor Repassado, Data de Inauguração, Data de Conclusão do Monitoramento, Técnico Responsável.
**Instrumentos · Completo (34 + abas):** ver `COLUNAS_INSTRUMENTO_COMPLETO` na Task 7. Abas: Resumo, Instrumentos, Financeiro, Ações em aberto. **Sem** aba Histórico de marcos.
**Propostas · Simplificado (10):** Proponente, CNES, Município, UF, Região, Programa, Equipamento, Situação da Proposta, Valor Global da Proposta, Data da Proposta. **Completo (16):** Nº da Proposta, Proponente, CNPJ do Proponente, CNES, Município, UF, Região, Programa, Componente, Equipamento, Objeto, Situação da Proposta, Valor Global da Proposta, Data da Proposta, Dias desde a Proposta, Status da Revisão. Abas: Resumo, Propostas. Escopo: carteira em tramitação (propostas sem parceria).

## Ordem de execução (revisão do Codex, 26/11/2026)

Fechar **Equipamentos de ponta a ponta antes de Instrumentos e Propostas**: Tasks 0 a 6, depois as partes de Equipamentos das Tasks 9, 10 e 11 (escrita dos arquivos, rótulo no front e a conferência dos arquivos de Equipamentos, Excel e Word). **Ponto de parada com validação do usuário** nesse momento. Só então as Tasks 7 (Instrumentos) e 8 (Propostas), e a conferência final dos 12 arquivos.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `backend/app/services/relatorios_modelo.py` (novo) | Dataclasses `Tabela`, `RelatorioMonitorado`, `ContextoInstrumento`; `slug_recorte`, `nome_arquivo`, `descrever_filtros`, `cabecalho`, `quebra_por` |
| `backend/app/repositories/relatorios_contexto.py` (novo) | Consultas: convênios por número, nomes do CNES, descrições e valores por família, ações abertas |
| `backend/app/services/relatorios_contexto.py` (novo) | `carregar_contextos`: monta `ContextoInstrumento` |
| `backend/app/services/relatorios_equipamentos_modelo.py` (novo) | Fatos, linhas, resumo e legenda de Equipamentos |
| `backend/app/services/relatorios_instrumentos_modelo.py` (novo) | Linhas, financeiro, ações, resumo e legenda de Instrumentos |
| `backend/app/services/relatorios_propostas_modelo.py` (novo) | Linhas, resumo e legenda de Propostas |
| `backend/app/services/relatorios_monitorados.py` (mod.) | Orquestra os três modelos; reexporta `Celula`, `RelatorioMonitorado` |
| `backend/app/reports/xlsx_builder.py` (mod.) | `rodape` em `escrever_aba_tabela`; `escrever_aba_blocos` |
| `backend/app/reports/monitorados.py` (mod.) | Excel multi-aba e Word em nota informativa |
| `backend/app/schemas_monitoramento.py`, `services/fatos_instrumento.py` (mod.) | `previsao_inauguracao` em `EtapasInstrumentoRead` |
| `backend/app/routers/relatorios.py` (mod.) | Nome de arquivo com recorte; tipo `propostas` |
| `frontend/src/components/features/relatorio-filtros-controles.tsx`, `services/relatorios.ts`, `relatorio-carteira.tsx` (mod.) | Rótulo e tipo da prévia de Propostas |

> **Pré-requisito:** o worktree `.codex-work/fluxo` tem ~41 arquivos do Codex sem commit (camada `fatos_instrumento`, `relatorios_monitorados`, prévias, Painel). Este plano parte desse estado. **Confirmar com o usuário que esse trabalho foi commitado** (ou autorizar commitar) antes da Task 1. Não commitar arquivos do Codex junto com os desta entrega.

---

### Task 0: Verificações que fixam três nomes

**Files:** nenhum (só leitura; registrar o resultado nesta seção do plano).

- [ ] **Step 1: Registrar a decisão sobre a "Situação (Site)" (já tomada)**

Revisão do Codex (26/11/2026): em Dados oficiais a tela prioriza a **fase interna** e só usa `convenio.situacao` como alternativa. Para as duas colunas do relatório ficam separadas: **Situação (Site) = `convenio.situacao`** (situação oficial) e **Situação (Monitoramento) = fase interna** (`InstrumentoComFase.fase_atual`). `SITUACAO_SITE_CAMPO = "situacao"` (Task 5). Conferir só que `grep -n "situacao" backend/app/schemas_convenios.py` confirma o campo.

- [ ] **Step 2: Conferir o que é `valor_repasse` no clone local (achado do Codex: em 237 convênios o repasse pactuado supera o desembolsado; os dois campos são distintos)**

```bash
cd backend && uv run python - <<'PY'
from sqlalchemy import text
from app.db.base import SessionLocal
with SessionLocal() as db:
    print(db.execute(text("select current_database(), current_user")).all())
    print(db.execute(text("""select count(*) filter (where valor_repasse is not null) repasse,
        count(*) filter (where valor_desembolsado is not null) desembolsado,
        count(*) filter (where valor_repasse = valor_desembolsado) iguais,
        count(*) filter (where valor_repasse > valor_desembolsado) maior from convenio""")).all())
PY
```

Expected: `maior` próximo de 237 no clone, confirmando que `valor_repasse` é o valor pactuado: manter os rótulos distintos "Valor de Repasse Pactuado" e "Valor Repassado" na aba Financeiro. **Preservar a regra existente de desembolso integral das cargas manuais** (ler `_valor_global_confiavel` e o uso de `financeiro_fonte_confiavel` antes de implementar a Task 7; não recalcular nem substituir esse valor).

- [ ] **Step 3: Commit (somente se o plano foi atualizado com os resultados)**

```bash
git add docs/planos/planmode-relatorios-modelos-2026-11-26.md
git commit -m "docs(relatorios): registra campos de situação e repasse verificados"
```

---

### Task 1: Recorte Brasil de Equipamentos: regressão e filtro visível

O arquivo `relatorio-equipamentos_monitorados-brasil-*.xlsx` trouxe 92 unidades, todas PERSUS I, enquanto só SP tem 27 de Convênio.

**Achado do Codex (26/11/2026, clone local):** sem filtro, prévia e Excel do Brasil devolvem **533 unidades** (424 Convênio, 92 PERSUS I, 14 FAF, 3 TED); com o filtro `PERSUS I`, ambos devolvem exatamente 92. Logo, a consulta não tem defeito: o arquivo baixado veio com o filtro de contratação ativo, e nada no arquivo mostrava isso. A correção é de transparência, já coberta pelo nome do arquivo com recorte (Task 3) e pela linha **Filtros** do Resumo, que passa a listar a contratação escolhida. Esta task só fixa a regressão e confere o que a interface envia.

**Files:**
- Test: `backend/tests/test_relatorios_monitorados_db.py`
- Verificar (sem alterar, salvo se o passo 2 achar divergência): `frontend/src/components/features/relatorio-previa-exportacao.tsx`, `frontend/src/services/relatorios.ts`

- [ ] **Step 1: Confirmar o achado no clone local**

```bash
cd backend && uv run python - <<'PY'
from collections import Counter
from dataclasses import replace
from app.db.base import SessionLocal
from app.services.relatorios_filtro import FiltroRelatorio
from app.services.relatorios_monitorados import montar_relatorio_monitorado
with SessionLocal() as db:
    base = FiltroRelatorio(escopo="brasil")
    for rotulo, f in (("sem filtro", base), ("PERSUS I", replace(base, tipo_contratacao="PERSUS I"))):
        r = montar_relatorio_monitorado(db=db, tipo="equipamentos_monitorados", nivel="completo", filtro=f)
        coluna = r.colunas.index("Contratação")
        print(rotulo, r.total, Counter(l[coluna] for l in r.linhas))
PY
```

Expected: `sem filtro` com as quatro contratações (~533 unidades) e `PERSUS I` com 92. (Antes da Task 6 o Completo ainda tem `Contratação` na posição 5; o código acima funciona nas duas versões.)

- [ ] **Step 2: Conferir o que a interface envia**

Na tela de Relatórios, escolher Brasil sem filtro, abrir a aba de rede e conferir que `GET /relatorios/previa` e `GET /relatorios` **não** levam `tipo_contratacao`. Se levarem sem o usuário ter escolhido, o defeito está no hook de filtros (`use-relatorio-instrumentos-filtros.ts`); corrigir lá e acrescentar um teste de vitest.

- [ ] **Step 3: Escrever o teste de regressão**

Em `backend/tests/test_relatorios_monitorados_db.py`, seguir o padrão das fixtures já existentes no arquivo (ler as primeiras 80 linhas). Criar dois instrumentos monitorados com itens controlados, um `Convênio` em SP e um `PERSUS I` em RS, e afirmar:

```python
def test_recorte_brasil_inclui_todas_as_contratacoes(db_com_dois_instrumentos):
    relatorio = montar_relatorio_monitorado(
        db=db_com_dois_instrumentos,
        tipo="equipamentos_monitorados",
        nivel="simplificado",
        filtro=FiltroRelatorio(escopo="brasil"),
    )
    assert {linha[5] for linha in relatorio.linhas} == {"Convênio", "PERSUS I"}
```

(Ajustar o índice 5 após a Task 6, quando a coluna Contratação sair do Simplificado: usar o nome da coluna via `relatorio.colunas.index("Contratação")` no Completo.)

- [ ] **Step 4: Rodar o teste**

Run: `cd backend && uv run pytest tests/test_relatorios_monitorados_db.py::test_recorte_brasil_inclui_todas_as_contratacoes -v`
Expected: PASS (a consulta já está correta; o teste só impede regressão). Se falhar, o diagnóstico do Codex não se confirma no ambiente de teste: investigar `listar_monitorados_para_relatorio` antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_relatorios_monitorados_db.py
git commit -m "test(relatorios): regressão do recorte Brasil de equipamentos"
```

---

### Task 2: Excel com legenda no rodapé e aba Resumo em blocos

**Files:**
- Modify: `backend/app/reports/xlsx_builder.py`
- Test: `backend/tests/test_xlsx_builder_rodape.py` (novo, sem banco)

**Interfaces:**
- Produces: `escrever_aba_tabela(..., rodape: Sequence[Sequence[Any]] = ())` e `escrever_aba_blocos(pasta, titulo, blocos: Sequence[BlocoAba]) -> Worksheet` com `@dataclass(frozen=True) class BlocoAba: titulo: str | None; colunas: Sequence[str]; linhas: Sequence[Sequence[Any]]`.

- [ ] **Step 1: Write the failing test**

```python
"""Legenda no rodapé fica fora do filtro; Resumo empilha blocos."""

from io import BytesIO

from openpyxl import load_workbook

from app.reports import xlsx_builder


def _abrir(pasta):
    return load_workbook(BytesIO(xlsx_builder.gerar_bytes(pasta)))


def test_rodape_fica_depois_de_linha_em_branco_e_fora_do_filtro():
    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_tabela(
        pasta, "Registros", ["A", "B"], [["1", "2"], ["3", "4"]], rodape=[["Legenda", ""], ["A", "primeira coluna"]]
    )
    aba = _abrir(pasta)["Registros"]
    assert aba.auto_filter.ref == "A1:B3"
    assert aba.freeze_panes == "A2"
    assert [c.value for c in aba[4]] == [None, None]
    assert aba["A5"].value == "Legenda"
    assert aba["B6"].value == "primeira coluna"


def test_aba_blocos_empilha_titulo_colunas_e_linhas():
    pasta = xlsx_builder.nova_pasta()
    xlsx_builder.escrever_aba_blocos(
        pasta,
        "Resumo",
        [
            xlsx_builder.BlocoAba(None, ["Campo", "Valor"], [["Recorte", "Brasil"]]),
            xlsx_builder.BlocoAba("Por situação", ["Situação", "Unidades"], [["Em operação", 63]]),
        ],
    )
    aba = _abrir(pasta)["Resumo"]
    valores = [[c.value for c in linha] for linha in aba.iter_rows(max_col=2)]
    assert valores[0] == ["Campo", "Valor"]
    assert ["Por situação", None] in valores
    assert ["Em operação", 63] in valores
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_xlsx_builder_rodape.py -v`
Expected: FAIL (`rodape`/`BlocoAba` inexistentes).

- [ ] **Step 3: Implement**

Em `xlsx_builder.py`: adicionar `from dataclasses import dataclass`, a dataclass e a função; e em `escrever_aba_tabela` aceitar `rodape` logo após o loop de linhas e **antes** de `freeze_panes`/`auto_filter`:

```python
@dataclass(frozen=True)
class BlocoAba:
    titulo: str | None
    colunas: Sequence[str]
    linhas: Sequence[Sequence[Any]]


def escrever_aba_blocos(pasta: Workbook, titulo: str, blocos: Sequence[BlocoAba]) -> Worksheet:
    """Aba de resumo: blocos de tabela empilhados, separados por uma linha em branco."""
    aba = pasta.create_sheet(title=titulo[:31])
    largura = max((len(b.colunas) for b in blocos), default=1)
    for indice, bloco in enumerate(blocos):
        if indice:
            aba.append([])
        if bloco.titulo:
            aba.append([bloco.titulo])
            aba.cell(row=aba.max_row, column=1).font = Font(bold=True)
        aba.append(list(bloco.colunas))
        for celula in aba[aba.max_row]:
            celula.fill = _COR_CABECALHO
            celula.font = _FONTE_CABECALHO
        for linha in bloco.linhas:
            aba.append(list(linha))
    for coluna in range(1, largura + 1):
        letra = get_column_letter(coluna)
        maior = max((len(str(c.value)) for c in aba[letra] if c.value is not None), default=8)
        aba.column_dimensions[letra].width = min(maior + 2, _LARGURA_MAXIMA_COLUNA)
    return aba
```

Na assinatura de `escrever_aba_tabela` acrescentar `rodape: Sequence[Sequence[Any]] = ()`, e depois do `for numero_linha...` (antes de `aba.freeze_panes`):

```python
    if rodape:
        aba.append([])
        for linha in rodape:
            aba.append(list(linha))
        aba.cell(row=len(linhas) + 3, column=1).font = Font(bold=True)
```

O `auto_filter.ref` já usa `len(linhas) + 1`, portanto o rodapé fica fora. Atualizar `aba.print_area` para incluir as linhas do rodapé: `len(linhas) + 1 + (len(rodape) + 1 if rodape else 0)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_xlsx_builder_rodape.py tests/test_xlsx_builder.py -v`
Expected: PASS (o segundo arquivo cobre a regressão; se o nome diferir, `ls tests | grep xlsx`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/reports/xlsx_builder.py backend/tests/test_xlsx_builder_rodape.py
git commit -m "feat(relatorios): legenda no rodapé e aba de resumo em blocos"
```

---

### Task 3: Modelo comum (dataclasses, nome do arquivo, filtros, quebras)

**Files:**
- Create: `backend/app/services/relatorios_modelo.py`
- Test: `backend/tests/test_relatorios_modelo.py`

**Interfaces:**
- Produces: `Celula`, `Tabela`, `RelatorioMonitorado`, `ContextoInstrumento`, `slug_recorte(filtro) -> str`, `nome_arquivo(tipo: str, filtro, nivel, formato) -> str`, `descrever_filtros(filtro, *, situacoes=(), fases=()) -> str`, `cabecalho(filtro, *, referencia: date, fonte: str, filtros: str) -> tuple[tuple[str, str], ...]`, `quebra_por(titulo, rotulo, valores, *, ordem=None) -> Tabela`, `ROTULO_TODOS_EQUIPAMENTOS = "Todos os Equipamentos em Oncologia"`.

- [ ] **Step 1: Write the failing test**

```python
from datetime import date

from app.services.relatorios_filtro import FiltroRelatorio
from app.services.relatorios_modelo import (
    cabecalho,
    descrever_filtros,
    nome_arquivo,
    quebra_por,
    slug_recorte,
)


def test_slug_do_recorte():
    assert slug_recorte(FiltroRelatorio(escopo="brasil")) == "BRASIL"
    assert slug_recorte(FiltroRelatorio(escopo="uf", uf="mg")) == "MG"
    assert slug_recorte(FiltroRelatorio(escopo="regiao", regiao="Sudeste")) == "regiao-sudeste"
    assert slug_recorte(FiltroRelatorio(escopo="municipio", municipio="São Paulo", uf="SP")) == "municipio-sao-paulo-SP"
    assert slug_recorte(FiltroRelatorio(escopo="cnes", cnes="2237601")) == "cnes-2237601"


def test_nome_do_arquivo_leva_recorte_e_nivel():
    f = FiltroRelatorio(escopo="uf", uf="MG")
    assert nome_arquivo("equipamentos", f, "simplificado", "xlsx") == "relatorio-equipamentos-MG-simplificado.xlsx"


def test_filtros_padrao_de_equipamentos():
    assert descrever_filtros(FiltroRelatorio(escopo="brasil")) == (
        "Todos os Equipamentos em Oncologia · todas as contratações"
    )
    assert descrever_filtros(FiltroRelatorio(escopo="brasil", equipamento="Mamógrafo", tipo_contratacao="PERSUS I")) == (
        "Mamógrafo · PERSUS I"
    )


def test_cabecalho_tem_quatro_campos():
    linhas = cabecalho(FiltroRelatorio(escopo="uf", uf="MG"), referencia=date(2026, 11, 26), fonte="SISGEO", filtros="x")
    assert linhas == (
        ("Recorte", "UF MG"),
        ("Filtros", "x"),
        ("Referência", "26/11/2026"),
        ("Fonte", "SISGEO"),
    )


def test_quebra_conta_e_soma_total():
    tabela = quebra_por("Por UF", "UF", ["MG", "MG", "SP"])
    assert tabela.colunas == ("UF", "Total", "%")
    assert tabela.linhas == [("MG", 2, "67%"), ("SP", 1, "33%"), ("Total", 3, "100%")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_modelo.py -v`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

```python
"""Estruturas e utilidades comuns aos modelos de relatório de Equipamentos, Instrumentos e Propostas."""

import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date

from app.services.relatorios_filtro import FiltroRelatorio, Nivel

Celula = str | int | float | date | None
ROTULO_TODOS_EQUIPAMENTOS = "Todos os Equipamentos em Oncologia"


@dataclass(frozen=True)
class Tabela:
    titulo: str
    colunas: tuple[str, ...]
    linhas: list[tuple[Celula, ...]]
    colunas_data: tuple[str, ...] = ()
    colunas_moeda: tuple[str, ...] = ()
    legenda: tuple[tuple[str, str], ...] = ()


@dataclass(frozen=True)
class RelatorioMonitorado:
    titulo: str
    colunas: tuple[str, ...]
    linhas: list[tuple[Celula, ...]]
    total: int
    unidade: str
    criterios: tuple[str, ...] = ()
    cabecalho: tuple[tuple[str, str], ...] = ()
    indicadores: tuple[tuple[str, Celula], ...] = ()
    quebras: tuple[Tabela, ...] = ()
    abas: tuple[Tabela, ...] = ()
    legenda: tuple[tuple[str, str], ...] = ()
    colunas_data: tuple[str, ...] = ()
    colunas_moeda: tuple[str, ...] = ()
    arquivo_base: str = "relatorio"


@dataclass(frozen=True)
class ContextoInstrumento:
    numero: str
    cnes: str | None
    estabelecimento: str | None
    municipio: str | None
    uf: str | None
    regiao: str | None
    contratacao: str | None
    situacao_site: str | None
    situacao_monitoramento: str | None
    numero_processo: str | None
    ano: int | None
    inicio_vigencia: date | None
    fim_vigencia: date | None
    tecnico: str | None


def _ascii(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return "-".join(sem_acento.lower().split())


def slug_recorte(filtro: FiltroRelatorio) -> str:
    if filtro.escopo == "brasil":
        return "BRASIL"
    if filtro.escopo == "uf":
        return (filtro.uf or "").upper()
    if filtro.escopo == "regiao":
        return f"regiao-{_ascii(filtro.regiao or '')}"
    if filtro.escopo == "municipio":
        return f"municipio-{_ascii(filtro.municipio or '')}-{(filtro.uf or '').upper()}"
    return f"cnes-{filtro.cnes}"


def nome_arquivo(tipo: str, filtro: FiltroRelatorio, nivel: Nivel, formato: str) -> str:
    return f"relatorio-{tipo}-{slug_recorte(filtro)}-{nivel}.{formato}"


def descrever_filtros(
    filtro: FiltroRelatorio, *, situacoes: Sequence[str] = (), fases: Sequence[str] = ()
) -> str:
    partes = [filtro.equipamento or ROTULO_TODOS_EQUIPAMENTOS]
    partes.append(filtro.tipo_contratacao or "todas as contratações")
    if situacoes:
        partes.append(", ".join(situacoes))
    if fases:
        partes.append(", ".join(fases))
    if filtro.programa:
        partes.append(filtro.programa)
    return " · ".join(partes)


def cabecalho(
    filtro: FiltroRelatorio, *, referencia: date, fonte: str, filtros: str
) -> tuple[tuple[str, str], ...]:
    return (
        ("Recorte", filtro.titulo()),
        ("Filtros", filtros),
        ("Referência", referencia.strftime("%d/%m/%Y")),
        ("Fonte", fonte),
    )


def quebra_por(
    titulo: str, rotulo: str, valores: Iterable[str], *, ordem: Sequence[str] | None = None
) -> Tabela:
    contagem = Counter(valores)
    total = sum(contagem.values())
    chaves = [k for k in ordem if k in contagem] if ordem else sorted(contagem, key=lambda k: (-contagem[k], k))
    linhas: list[tuple[Celula, ...]] = [(k, contagem[k], f"{round(contagem[k] / total * 100)}%") for k in chaves]
    linhas.append(("Total", total, "100%" if total else "0%"))
    return Tabela(titulo, (rotulo, "Total", "%"), linhas)
```

Nota: o recorte de `FiltroRelatorio.titulo()` produz `UF MG`/`Brasil`; o teste do cabeçalho usa `UF MG`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_relatorios_modelo.py -v`
Expected: PASS.

- [ ] **Step 5: Mover as dataclasses antigas**

Em `relatorios_monitorados.py`, remover as definições locais de `Celula` e `RelatorioMonitorado` e importar de `relatorios_modelo` (`from app.services.relatorios_modelo import Celula, RelatorioMonitorado  # noqa: F401`). Rodar `uv run pytest tests/test_relatorios_monitorados.py -q`: PASS (os campos novos têm default).

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/relatorios_modelo.py backend/app/services/relatorios_monitorados.py backend/tests/test_relatorios_modelo.py
git commit -m "feat(relatorios): modelo comum, nome de arquivo com recorte e quebras"
```

---

### Task 4: Previsão de inauguração e Status da Inauguração

**Files:**
- Modify: `backend/app/schemas_monitoramento.py:42-56`, `backend/app/services/fatos_instrumento.py`
- Create: `backend/app/services/relatorios_inauguracao.py`
- Test: `backend/tests/test_relatorios_inauguracao.py`

**Interfaces:**
- Produces: `EtapasInstrumentoRead.previsao_inauguracao: date | None = None`; `inauguracao_da_linha(etapa: EtapasInstrumentoRead, situacao: str) -> tuple[date | None, str | None]` onde `situacao` é uma de `"planejado" | "entregue" | "em_operacao" | "cancelado"`; `status_do_instrumento(etapa) -> str | None`.

- [ ] **Step 1: Write the failing test**

```python
from datetime import date

from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.relatorios_inauguracao import inauguracao_da_linha, status_do_instrumento


def _etapa(**campos):
    return EtapasInstrumentoRead(nr_convenio="1", **campos)


def test_em_operacao_realizada_mostra_data_da_inauguracao():
    e = _etapa(inauguracao=date(2026, 2, 20), modo_operacao="inaugurada")
    assert inauguracao_da_linha(e, "em_operacao") == (date(2026, 2, 20), "Realizada")


def test_dispensada_e_pela_entrega_ficam_sem_data():
    assert inauguracao_da_linha(_etapa(modo_operacao="dispensada"), "em_operacao") == (None, "Dispensada")
    assert inauguracao_da_linha(_etapa(modo_operacao="pela_entrega"), "em_operacao") == (None, "Pela entrega")


def test_entregue_a_inaugurar_mostra_previsao():
    e = _etapa(previsao_inauguracao=date(2026, 12, 15))
    assert inauguracao_da_linha(e, "entregue") == (date(2026, 12, 15), "Prevista")


def test_sem_previsao_fica_vazio():
    assert inauguracao_da_linha(_etapa(), "entregue") == (None, None)


def test_planejado_so_mostra_previsao_e_cancelado_nada():
    e = _etapa(inauguracao=date(2026, 2, 20), previsao_inauguracao=date(2027, 1, 10), modo_operacao="inaugurada")
    assert inauguracao_da_linha(e, "planejado") == (date(2027, 1, 10), "Prevista")
    assert inauguracao_da_linha(e, "cancelado") == (None, None)


def test_status_do_instrumento_segue_a_mesma_regra():
    assert status_do_instrumento(_etapa(inauguracao=date(2026, 2, 20), modo_operacao="inaugurada")) == "Realizada"
    assert status_do_instrumento(_etapa(previsao_inauguracao=date(2026, 12, 15))) == "Prevista"
    assert status_do_instrumento(_etapa()) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_inauguracao.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

`schemas_monitoramento.py`, em `EtapasInstrumentoRead`: `previsao_inauguracao: date | None = None` (aditivo; o contrato com o front segue compatível). Em `fatos_instrumento.carregar_etapas`, no `EtapasInstrumentoRead(...)`, passar `previsao_inauguracao=previsao`.

`relatorios_inauguracao.py`:

```python
"""Data de Previsão/Inauguração e Status da Inauguração, por situação da linha."""

from datetime import date

from app.schemas_monitoramento import EtapasInstrumentoRead


def status_do_instrumento(etapa: EtapasInstrumentoRead) -> str | None:
    return _regra(etapa, realizada_vale=True)[1]


def inauguracao_da_linha(etapa: EtapasInstrumentoRead, situacao: str) -> tuple[date | None, str | None]:
    if situacao == "cancelado":
        return None, None
    return _regra(etapa, realizada_vale=situacao == "em_operacao")


def _regra(etapa: EtapasInstrumentoRead, *, realizada_vale: bool) -> tuple[date | None, str | None]:
    if realizada_vale:
        if etapa.modo_operacao == "dispensada":
            return None, "Dispensada"
        if etapa.modo_operacao == "pela_entrega":
            return None, "Pela entrega"
        if etapa.inauguracao:
            return etapa.inauguracao, "Realizada"
    if etapa.previsao_inauguracao:
        return etapa.previsao_inauguracao, "Prevista"
    return None, None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_relatorios_inauguracao.py tests/test_fatos_instrumento.py -q`
Expected: PASS (se o segundo arquivo não existir, rodar `uv run pytest -q -k etapas`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas_monitoramento.py backend/app/services/fatos_instrumento.py backend/app/services/relatorios_inauguracao.py backend/tests/test_relatorios_inauguracao.py
git commit -m "feat(relatorios): previsão de inauguração e status da inauguração"
```

---

### Task 5: Consultas e contexto por instrumento

**Files:**
- Create: `backend/app/repositories/relatorios_contexto.py`, `backend/app/services/relatorios_contexto.py`
- Test: `backend/tests/test_relatorios_contexto.py` (puro), cobertura de banco em `test_relatorios_monitorados_db.py`

**Interfaces:**
- Produces (repositório): `convenios_por_numero(db, numeros: set[str]) -> dict[str, Convenio]`; `nomes_cnes(db, cnes: set[str]) -> dict[str, str]`; `descricoes_por_familia(db, instrumento_ids: set[int]) -> dict[tuple[int, str], str]`; `valores_por_familia(db, instrumento_ids: set[int]) -> dict[tuple[int, str], tuple[float, int]]` e `valor_unitario_por_item(db, instrumento_ids: set[int]) -> dict[int, float]`; `acoes_abertas(db, instrumento_ids: set[int]) -> dict[int, list[AcaoMonitoramento]]`.
- Produces (serviço): `SITUACAO_SITE_CAMPO: str`; `contexto_do(instrumento, fase, convenio, nome_cnes) -> ContextoInstrumento`; `carregar_contextos(db, recorte: list[InstrumentoComFase]) -> dict[str, ContextoInstrumento]`.

- [ ] **Step 1: Write the failing test (puro)**

```python
from datetime import date
from types import SimpleNamespace

from app.services.relatorios_contexto import contexto_do


def _instr(**c):
    base = dict(nr_convenio="1", cnes="2237601", municipio="PORTO ALEGRE", uf="RS", tipo_contratacao="Convênio",
                nome_convenente="HOSPITAL X", ano_instrumento=2018, tecnico_titular="Ana")
    base.update(c)
    return SimpleNamespace(**base)


def test_estabelecimento_do_cnes_tem_prioridade_e_municipio_e_capitalizado():
    c = contexto_do(_instr(), "Concluído", None, "Hospital de Clínicas de Porto Alegre")
    assert c.estabelecimento == "Hospital de Clínicas de Porto Alegre"
    assert c.municipio == "Porto Alegre"
    assert c.regiao == "Sul"


def test_sem_cnes_usa_o_convenente():
    c = contexto_do(_instr(cnes=None), "Concluído", None, None)
    assert c.estabelecimento == "HOSPITAL X"


def test_dados_do_convenio_quando_existe():
    convenio = SimpleNamespace(numero_processo="25000.1/2018-11", situacao="Em execução",
                               data_inicio_vigencia=date(2018, 3, 15), data_final_vigencia=date(2027, 3, 15))
    c = contexto_do(_instr(), "Aguardando repasse", convenio, None)
    assert (c.numero_processo, c.situacao_site, c.fim_vigencia) == ("25000.1/2018-11", "Em execução", date(2027, 3, 15))
    assert c.situacao_monitoramento == "Aguardando repasse"
    assert c.ano == 2018
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_contexto.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement o serviço**

```python
"""Contexto por instrumento: o que os três modelos de relatório repetem em cada linha."""

from sqlalchemy.orm import Session

from app.geo_reference import REGIAO_POR_UF
from app.pipeline.texto import capitalizar_nome
from app.repositories import relatorios_contexto as repo
from app.services.monitoramento_instrumentos import InstrumentoComFase
from app.services.relatorios_modelo import ContextoInstrumento

# Task 0, passo 1: situação oficial do convênio (a fase interna fica em Situação (Monitoramento)).
SITUACAO_SITE_CAMPO = "situacao"


def contexto_do(instrumento, fase: str | None, convenio, nome_cnes: str | None) -> ContextoInstrumento:
    uf = (instrumento.uf or "").upper() or None
    return ContextoInstrumento(
        numero=instrumento.nr_convenio,
        cnes=instrumento.cnes,
        estabelecimento=nome_cnes or instrumento.nome_convenente,
        municipio=capitalizar_nome(instrumento.municipio),
        uf=uf,
        regiao=REGIAO_POR_UF.get(uf) if uf else None,
        contratacao=instrumento.tipo_contratacao,
        situacao_site=getattr(convenio, SITUACAO_SITE_CAMPO, None) if convenio else None,
        situacao_monitoramento=fase,
        numero_processo=convenio.numero_processo if convenio else None,
        ano=instrumento.ano_instrumento,
        inicio_vigencia=convenio.data_inicio_vigencia if convenio else None,
        fim_vigencia=convenio.data_final_vigencia if convenio else None,
        tecnico=instrumento.tecnico_titular,
    )


def carregar_contextos(db: Session, recorte: list[InstrumentoComFase]) -> dict[str, ContextoInstrumento]:
    instrumentos = [i.instrumento for i in recorte]
    convenios = repo.convenios_por_numero(db, {i.nr_convenio for i in instrumentos})
    nomes = repo.nomes_cnes(db, {i.cnes for i in instrumentos if i.cnes})
    return {
        c.instrumento.nr_convenio: contexto_do(
            c.instrumento, c.fase_atual, convenios.get(c.instrumento.nr_convenio), nomes.get(c.instrumento.cnes or "")
        )
        for c in recorte
    }
```

- [ ] **Step 4: Implement o repositório**

```python
"""Consultas de apoio aos relatórios monitorados. Só leitura."""

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AcaoMonitoramento, CnesEstabelecimento, Convenio, EquipamentoCatalogo, ItemPlano
from app.repositories.itens_equipamento import ROTULO_FAMILIA_POR_VALOR
from app.repositories.monitoramento import listar_acoes_por_instrumentos


def convenios_por_numero(db: Session, numeros: set[str]) -> dict[str, Convenio]:
    if not numeros:
        return {}
    return {c.numero: c for c in db.scalars(select(Convenio).where(Convenio.numero.in_(numeros)).order_by(Convenio.id))}


def nomes_cnes(db: Session, cnes: set[str]) -> dict[str, str]:
    if not cnes:
        return {}
    consulta = select(CnesEstabelecimento.cnes, CnesEstabelecimento.nome_estabelecimento).where(
        CnesEstabelecimento.cnes.in_(cnes)
    )
    return {c: n for c, n in db.execute(consulta)}


def _familia():
    return func.coalesce(EquipamentoCatalogo.nome, ROTULO_FAMILIA_POR_VALOR)


def descricoes_por_familia(db: Session, instrumento_ids: set[int]) -> dict[tuple[int, str], str]:
    if not instrumento_ids:
        return {}
    consulta = (
        select(ItemPlano.instrumento_id, _familia(), ItemPlano.descricao)
        .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(ItemPlano.instrumento_id.in_(instrumento_ids), ItemPlano.controla_unidade.is_(True), ItemPlano.ativo.is_(True))
        .order_by(ItemPlano.instrumento_id, ItemPlano.id)
    )
    agrupado: dict[tuple[int, str], list[str]] = defaultdict(list)
    for instrumento, familia, descricao in db.execute(consulta):
        if descricao and descricao not in agrupado[(int(instrumento), str(familia))]:
            agrupado[(int(instrumento), str(familia))].append(descricao)
    return {chave: "; ".join(valores) for chave, valores in agrupado.items()}


def valores_por_familia(db: Session, instrumento_ids: set[int]) -> dict[tuple[int, str], tuple[float, int]]:
    """(valor total, quantidade planejada) da família, só quando TODOS os itens ativos controlados têm valor.

    Família com algum item sem preço fica de fora: o valor não é inventado nem misturado com itens de preços diferentes."""
    if not instrumento_ids:
        return {}
    consulta = (
        select(
            ItemPlano.instrumento_id,
            _familia(),
            func.sum(ItemPlano.valor_total),
            func.sum(ItemPlano.quantidade_planejada),
            func.count(ItemPlano.id),
            func.count(ItemPlano.valor_total),
        )
        .outerjoin(EquipamentoCatalogo, EquipamentoCatalogo.id == ItemPlano.catalogo_id)
        .where(
            ItemPlano.instrumento_id.in_(instrumento_ids),
            ItemPlano.controla_unidade.is_(True),
            ItemPlano.ativo.is_(True),
        )
        .group_by(ItemPlano.instrumento_id, _familia())
    )
    return {
        (int(i), str(f)): (float(v), int(q))
        for i, f, v, q, itens, com_valor in db.execute(consulta)
        if itens == com_valor and v is not None and q
    }


def valor_unitario_por_item(db: Session, instrumento_ids: set[int]) -> dict[int, float]:
    """Valor de uma unidade de cada item (valor do item ÷ quantidade planejada); item sem preço não aparece."""
    if not instrumento_ids:
        return {}
    consulta = select(ItemPlano.id, ItemPlano.valor_total, ItemPlano.quantidade_planejada).where(
        ItemPlano.instrumento_id.in_(instrumento_ids),
        ItemPlano.ativo.is_(True),
        ItemPlano.valor_total.is_not(None),
        ItemPlano.quantidade_planejada > 0,
    )
    return {int(i): float(v) / int(q) for i, v, q in db.execute(consulta)}


def acoes_abertas(db: Session, instrumento_ids: set[int]) -> dict[int, list[AcaoMonitoramento]]:
    por_instrumento = listar_acoes_por_instrumentos(db, sorted(instrumento_ids))
    return {i: [a for a in acoes if a.data_conclusao is None] for i, acoes in por_instrumento.items()}
```

- [ ] **Step 5: Teste de banco**

Em `test_relatorios_monitorados_db.py`, ler as fixtures existentes e acrescentar um teste que cria um `CnesEstabelecimento`, um `InstrumentoEquipamento` com esse CNES e outro sem, chama `carregar_contextos` e afirma: nome do CNES no primeiro, nome do convenente no segundo, `regiao` preenchida.

Run: `cd backend && uv run pytest tests/test_relatorios_contexto.py tests/test_relatorios_monitorados_db.py -q`
Expected: PASS (o segundo exige `TEST_DATABASE_URL` local; ver "Teste de banco novo" no CLAUDE.md).

- [ ] **Step 6: Commit**

```bash
git add backend/app/repositories/relatorios_contexto.py backend/app/services/relatorios_contexto.py backend/tests
git commit -m "feat(relatorios): contexto por instrumento e consultas de apoio"
```

---

### Task 6: Modelo de Equipamentos

**Files:**
- Create: `backend/app/services/relatorios_equipamentos_modelo.py`
- Modify: `backend/app/services/relatorios_monitorados.py` (substituir `_linhas_equipamentos` e as constantes de coluna)
- Test: `backend/tests/test_relatorios_equipamentos_modelo.py`

**Interfaces:**
- Consumes: `ContextoInstrumento`, `inauguracao_da_linha`, `Tabela`, `quebra_por`, `cabecalho`.
- Produces: `FatoEquipamento` (dataclass), `COLUNAS_EQUIPAMENTO_SIMPLIFICADO`, `COLUNAS_EQUIPAMENTO_COMPLETO`, `linha_equipamento(fato, completo: bool) -> tuple[Celula, ...]`, `resumo_equipamentos(fatos, *, escopo: str, referencia: date) -> tuple[tuple[tuple[str, Celula], ...], tuple[Tabela, ...]]` (indicadores, quebras), `LEGENDA_EQUIPAMENTOS`.

- [ ] **Step 1: Write the failing test**

```python
from datetime import date

from app.services.relatorios_equipamentos_modelo import (
    COLUNAS_EQUIPAMENTO_COMPLETO,
    COLUNAS_EQUIPAMENTO_SIMPLIFICADO,
    FatoEquipamento,
    linha_equipamento,
    resumo_equipamentos,
)
from app.services.relatorios_modelo import ContextoInstrumento


def _ctx(**c):
    base = dict(numero="1", cnes="2237601", estabelecimento="Hospital A", municipio="Belo Horizonte", uf="MG",
                regiao="Sudeste", contratacao="Convênio", situacao_site="Em execução",
                situacao_monitoramento="Concluído", numero_processo="25000.1/2018-11", ano=2018,
                inicio_vigencia=date(2018, 3, 15), fim_vigencia=date(2027, 3, 15), tecnico="Ana")
    base.update(c)
    return ContextoInstrumento(**base)


def _fato(**c):
    base = dict(contexto=_ctx(), equipamento="Acelerador Linear", descricao_item="011807 - Acelerador Linear",
                situacao="em_operacao", quantidade=1, valor=5_100_000.0, data_entrega=date(2026, 1, 10),
                data_previsao_inauguracao=date(2026, 2, 20), status_inauguracao="Realizada",
                marca="Varian", modelo="Halcyon", serie="2526")
    base.update(c)
    return FatoEquipamento(**base)


def test_numero_de_colunas_aprovado():
    assert len(COLUNAS_EQUIPAMENTO_SIMPLIFICADO) == 16
    assert len(COLUNAS_EQUIPAMENTO_COMPLETO) == 25
    assert COLUNAS_EQUIPAMENTO_COMPLETO[8] == "Descrição do item no plano"
    assert COLUNAS_EQUIPAMENTO_COMPLETO[14:17] == (
        "Data de Entrega do Equipamento",
        "Data de Previsão/Inauguração",
        "Status da Inauguração",
    )


def test_linha_simplificada_e_completa_seguem_as_colunas():
    f = _fato()
    assert len(linha_equipamento(f, completo=False)) == 16
    completo = linha_equipamento(f, completo=True)
    assert len(completo) == 25
    assert completo[COLUNAS_EQUIPAMENTO_COMPLETO.index("Marca")] == "Varian"
    assert completo[COLUNAS_EQUIPAMENTO_COMPLETO.index("Nº do Processo")] == "25000.1/2018-11"


def test_resumo_conta_unidades_e_destaca_aceleradores():
    fatos = [
        _fato(quantidade=2),
        _fato(situacao="planejado", quantidade=3, equipamento="Mamógrafo"),
        _fato(situacao="entregue", quantidade=1),
    ]
    indicadores, quebras = resumo_equipamentos(fatos, escopo="uf", referencia=date(2026, 11, 26))
    mapa = dict(indicadores)
    assert mapa["Unidades"] == 6
    assert mapa["Em operação"] == 2 and mapa["Planejado"] == 3 and mapa["Entregue, a inaugurar"] == 1
    assert mapa["Aceleradores Lineares"] == "3 (2 em operação, 1 faltantes)"
    assert [q.titulo for q in quebras][:4] == [
        "Por situação",
        "Por equipamento",
        "Por UF",
        "Por contratação",
    ]


def test_valor_entregue_ignora_planejado_e_cancelado():
    fatos = [
        _fato(situacao="em_operacao", valor=100.0),
        _fato(situacao="entregue", valor=50.0),
        _fato(situacao="planejado", valor=30.0),
        _fato(situacao="cancelado", valor=999.0),
    ]
    _, quebras = resumo_equipamentos(fatos, escopo="uf", referencia=date(2026, 11, 26))
    valores = next(q for q in quebras if q.titulo == "Valor do equipamento")
    assert valores.linhas == [("Planejado", 30.0), ("Entregue", 150.0)]


def test_quebra_por_estabelecimento_em_recorte_de_municipio():
    _, quebras = resumo_equipamentos([_fato()], escopo="municipio", referencia=date(2026, 11, 26))
    assert quebras[2].titulo == "Por estabelecimento"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_equipamentos_modelo.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

```python
"""Linhas, resumo e legenda do relatório de Equipamentos."""

from collections import Counter
from dataclasses import dataclass
from datetime import date, timedelta

from app.services.relatorios_modelo import Celula, ContextoInstrumento, Tabela, quebra_por

ROTULOS = {
    "planejado": "Planejado",
    "entregue": "Entregue, a inaugurar",
    "em_operacao": "Em operação",
    "cancelado": "Cancelado",
}
ORDEM_SITUACAO = tuple(ROTULOS.values())

COLUNAS_EQUIPAMENTO_SIMPLIFICADO = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Região", "Equipamento",
    "Situação (Equipamento)", "Situação (Site)", "Situação (Monitoramento)", "Qtd", "Valor do Equipamento",
    "Data de Entrega do Equipamento", "Data de Previsão/Inauguração", "Status da Inauguração", "Técnico Responsável",
)
COLUNAS_EQUIPAMENTO_COMPLETO = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Região", "Contratação", "Equipamento",
    "Descrição do item no plano", "Situação (Equipamento)", "Situação (Site)", "Situação (Monitoramento)", "Qtd",
    "Valor do Equipamento", "Data de Entrega do Equipamento", "Data de Previsão/Inauguração",
    "Status da Inauguração", "Nº do Processo", "Ano do Instrumento", "Início da Vigência", "Fim da Vigência",
    "Marca", "Modelo", "Série", "Técnico Responsável",
)
DATAS = ("Data de Entrega do Equipamento", "Data de Previsão/Inauguração", "Início da Vigência", "Fim da Vigência")
MOEDA = ("Valor do Equipamento",)

LEGENDA_EQUIPAMENTOS = (
    ("Situação (Equipamento)", "Planejado, Entregue a inaugurar, Em operação ou Cancelado."),
    ("Situação (Site)", "Situação oficial do instrumento nos dados importados."),
    ("Situação (Monitoramento)", "Fase do acompanhamento interno."),
    ("Data de Entrega do Equipamento", "Data em que o equipamento foi entregue. Vazia se ainda não entregue."),
    (
        "Data de Previsão/Inauguração",
        "Em operação: inauguração realizada. Entregue a inaugurar e Planejado: previsão, se houver.",
    ),
    ("Status da Inauguração", "Realizada, Prevista, Dispensada ou Pela entrega."),
    (
        "Nota",
        "Alguns equipamentos podem ter a inauguração dispensada. Eles contam como Em operação e ficam sem data.",
    ),
)


@dataclass(frozen=True)
class FatoEquipamento:
    contexto: ContextoInstrumento
    equipamento: str
    descricao_item: str | None
    situacao: str
    quantidade: int
    valor: float | None
    data_entrega: date | None
    data_previsao_inauguracao: date | None
    status_inauguracao: str | None
    marca: str | None = None
    modelo: str | None = None
    serie: str | None = None


def linha_equipamento(f: FatoEquipamento, *, completo: bool) -> tuple[Celula, ...]:
    c = f.contexto
    base = (c.numero, c.cnes, c.estabelecimento, c.municipio, c.uf, c.regiao)
    situacoes = (ROTULOS[f.situacao], c.situacao_site, c.situacao_monitoramento)
    datas = (f.data_entrega, f.data_previsao_inauguracao, f.status_inauguracao)
    if not completo:
        return (*base, f.equipamento, *situacoes, f.quantidade, f.valor, *datas, c.tecnico)
    return (
        *base, c.contratacao, f.equipamento, f.descricao_item, *situacoes, f.quantidade, f.valor, *datas,
        c.numero_processo, c.ano, c.inicio_vigencia, c.fim_vigencia, f.marca, f.modelo, f.serie, c.tecnico,
    )


def resumo_equipamentos(
    fatos: list[FatoEquipamento], *, escopo: str, referencia: date
) -> tuple[tuple[tuple[str, Celula], ...], tuple[Tabela, ...]]:
    por_situacao = Counter[str]()
    for f in fatos:
        por_situacao[ROTULOS[f.situacao]] += f.quantidade
    aceleradores = Counter[str]()
    for f in fatos:
        if f.equipamento == "Acelerador Linear":
            aceleradores[f.situacao] += f.quantidade
    total_ac = sum(aceleradores.values())
    faltantes = aceleradores["planejado"] + aceleradores["entregue"]
    indicadores: tuple[tuple[str, Celula], ...] = (
        ("Unidades", sum(por_situacao.values())),
        *((r, por_situacao[r]) for r in ORDEM_SITUACAO),
        ("Aceleradores Lineares", f"{total_ac} ({aceleradores['em_operacao']} em operação, {faltantes} faltantes)"),
    )
    expandido = lambda chave: [chave(f) for f in fatos for _ in range(f.quantidade)]  # noqa: E731
    geografia = (
        quebra_por("Por estabelecimento", "Estabelecimento de Saúde", expandido(lambda f: f.contexto.estabelecimento or ""))
        if escopo in ("municipio", "cnes")
        else quebra_por(
            "Por região" if escopo == "brasil" else "Por UF",
            "Região" if escopo == "brasil" else "UF",
            expandido(lambda f: (f.contexto.regiao if escopo == "brasil" else f.contexto.uf) or ""),
        )
    )
    if escopo == "brasil":
        geografia = Tabela("Por UF", geografia.colunas, geografia.linhas)
    quebras = [
        quebra_por("Por situação", "Situação (Equipamento)", expandido(lambda f: ROTULOS[f.situacao]), ordem=ORDEM_SITUACAO),
        quebra_por("Por equipamento", "Equipamento", expandido(lambda f: f.equipamento)),
        geografia,
        quebra_por("Por contratação", "Contratação", expandido(lambda f: f.contexto.contratacao or "")),
    ]
    agenda = _agenda(fatos, referencia)
    if agenda:
        quebras.append(agenda)
    valores = _valores(fatos)
    if valores:
        quebras.append(valores)
    return indicadores, tuple(quebras)


def _agenda(fatos: list[FatoEquipamento], referencia: date) -> Tabela | None:
    previstos = {
        f.contexto.numero: f.data_previsao_inauguracao
        for f in fatos
        if f.status_inauguracao == "Prevista" and f.data_previsao_inauguracao
    }
    if not previstos:
        return None
    linhas = [
        (f"Em {dias} dias", sum(1 for d in previstos.values() if referencia <= d <= referencia + timedelta(days=dias)))
        for dias in (30, 60, 90)
    ]
    return Tabela("Agenda de inaugurações", ("Prazo", "Instrumentos"), linhas)


def _valores(fatos: list[FatoEquipamento]) -> Tabela | None:
    com_valor = [f for f in fatos if f.valor is not None and f.situacao != "cancelado"]
    if not com_valor:
        return None
    planejado = sum(f.valor for f in com_valor if f.situacao == "planejado")
    entregue = sum(f.valor for f in com_valor if f.situacao in ("entregue", "em_operacao"))
    return Tabela(
        "Valor do equipamento", ("Situação", "Valor"), [("Planejado", planejado), ("Entregue", entregue)],
        colunas_moeda=("Valor",),
    )
```

Observação (revisão do Codex): `FatoEquipamento.valor` é o valor **total da linha**, nunca uma média por família. Linha de unidade entregue usa o valor do **item vinculado à unidade** (`valor_unitario_por_item`). Linha agregada (planejado, cancelado e Simplificado) usa `valor_total_da_família × quantidade_da_linha ÷ quantidade_planejada_da_família`, e só quando todos os itens da família têm preço (`valores_por_familia`); senão fica vazia. O indicador **Entregue** soma apenas `entregue` e `em_operacao`.

- [ ] **Step 4: Integrar em `relatorios_monitorados.py`**

Em `_montar`, ramo `equipamentos`: substituir `_linhas_equipamentos` por uma função que monta `list[FatoEquipamento]`:

1. `contextos = carregar_contextos(db, recorte)`; `etapas` já carregadas (`carregar_etapas`).
2. `descricoes = repo.descricoes_por_familia(db, ids)`; `por_familia = repo.valores_por_familia(db, ids)`; `por_item = repo.valor_unitario_por_item(db, ids)`.
3. Para cada `(instrumento_id, familia, planejado, entregue, cancelado)` e cada situação com quantidade > 0 (mesma lógica de `quantidades` atual), criar `FatoEquipamento` com:
   - linha agregada: `valor = total * quantidade / planejado_bruto` com `(total, planejado_bruto) = por_familia[(identificador, familia)]`, ou `None` se a família não está em `por_familia`;
   - `descricao_item = descricoes.get((identificador, familia))`;
   - `data_previsao_inauguracao, status_inauguracao = inauguracao_da_linha(etapa, situacao)`;
   - `data_entrega`: no Completo, para a situação de entrega, uma linha por unidade (`listar_unidades_entregues`, com `descricao_item`, `marca`, `modelo`, `numero_serie`, `data_entrega`, quantidade 1 e `valor = por_item.get(unidade["item_id"])`; incluir `item_id` na consulta de `listar_unidades_entregues`); nas demais e no Simplificado, `min(data_entrega)` das unidades da `(numero, familia)` só para situações `entregue`/`em_operacao`, senão `None`.
   - Carregar unidades nos **dois** níveis (hoje só no Completo) para o Simplificado ter a data.
4. Aplicar `situacoes` e `filtro.equipamento` como hoje. Montar `RelatorioMonitorado` com `colunas = COLUNAS_*`, `linhas = [linha_equipamento(f, completo=completo) for f in fatos]`, `total = sum(f.quantidade ...)`, `cabecalho(...)`, `indicadores/quebras` de `resumo_equipamentos(...)`, `legenda=LEGENDA_EQUIPAMENTOS`, `colunas_data=DATAS`, `colunas_moeda=MOEDA`, `arquivo_base="equipamentos"`. Fonte: `SISGEO · SICONV · RENEM · CNES`. Filtros: `descrever_filtros(filtro, situacoes=...)`.

Como `relatorios_monitorados.py` já tem 182 linhas, mover o ramo de equipamentos para `relatorios_equipamentos_modelo.py::montar_equipamentos(...)` (função que recebe `db`, `recorte`, `etapas`, `filtro`, `situacoes`, `completo`, `referencia`) e deixar `_montar` só despachando.

- [ ] **Step 5: Atualizar os testes existentes**

`tests/test_relatorios_monitorados.py` indexa `linha[-1]` para Instrumentos (`Fase`); será atualizado na Task 7. Para Equipamentos, ajustar os asserts que usavam índices fixos para `relatorio.colunas.index("Situação (Equipamento)")`.

Run: `cd backend && uv run pytest tests/test_relatorios_equipamentos_modelo.py tests/test_relatorios_monitorados.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services backend/tests
git commit -m "feat(relatorios): modelo de equipamentos com datas, status e resumo estratégico"
```

---

### Task 7: Modelo de Instrumentos

**Files:**
- Create: `backend/app/services/relatorios_instrumentos_modelo.py`
- Modify: `backend/app/services/relatorios_monitorados.py` (ramo de instrumentos)
- Test: `backend/tests/test_relatorios_instrumentos_modelo.py`; atualizar `test_relatorios_monitorados.py` (Fase → colunas novas)

**Interfaces:**
- Consumes: `ContextoInstrumento`, `EtapasInstrumentoRead`, `status_do_instrumento`, `repo.acoes_abertas`.
- Produces: `COLUNAS_INSTRUMENTO_SIMPLIFICADO` (14), `COLUNAS_INSTRUMENTO_COMPLETO` (34), `COLUNAS_FINANCEIRO`, `COLUNAS_ACOES`, `linha_instrumento_simplificada(ctx, etapa, valores)`, `linha_instrumento_completa(...)`, `linha_financeiro(...)`, `linha_acao(ctx, acao, referencia)`, `datas_do_instrumento(etapa) -> tuple[date | None, date | None]`, `resumo_instrumentos(contextos, ...)`.

- [ ] **Step 1: Write the failing test**

```python
from datetime import date
from types import SimpleNamespace

from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.relatorios_instrumentos_modelo import (
    COLUNAS_ACOES,
    COLUNAS_FINANCEIRO,
    COLUNAS_INSTRUMENTO_COMPLETO,
    COLUNAS_INSTRUMENTO_SIMPLIFICADO,
    datas_do_instrumento,
    linha_acao,
)
from app.services.relatorios_modelo import ContextoInstrumento


def test_numero_de_colunas_aprovado():
    assert len(COLUNAS_INSTRUMENTO_SIMPLIFICADO) == 14
    assert len(COLUNAS_INSTRUMENTO_COMPLETO) == 34
    assert COLUNAS_INSTRUMENTO_SIMPLIFICADO[7:9] == ("Situação (Site)", "Situação (Monitoramento)")
    assert "Valor Repassado" in COLUNAS_INSTRUMENTO_SIMPLIFICADO
    assert "Valor Desembolsado" not in COLUNAS_INSTRUMENTO_COMPLETO
    assert COLUNAS_FINANCEIRO[3] == "Valor de Repasse Pactuado"
    assert COLUNAS_FINANCEIRO[6] == "Valor Repassado"
    assert len(COLUNAS_ACOES) == 11


def test_conclusao_so_aparece_sem_inauguracao():
    com = EtapasInstrumentoRead(nr_convenio="1", inauguracao=date(2017, 12, 22), conclusao=date(2026, 10, 29))
    sem = EtapasInstrumentoRead(nr_convenio="2", conclusao=date(2026, 10, 29))
    assert datas_do_instrumento(com) == (date(2017, 12, 22), None)
    assert datas_do_instrumento(sem) == (None, date(2026, 10, 29))


def test_acao_vencida_e_no_prazo():
    ctx = ContextoInstrumento("1", "2237601", "Hospital", "Porto Alegre", "RS", "Sul", "Convênio", None, None,
                              "25000.1/2010-77", 2010, None, None, "Ana")
    vencida = SimpleNamespace(descricao="Solicitar", responsavel="Ana", data_prevista=date(2026, 11, 10))
    no_prazo = SimpleNamespace(descricao="Confirmar", responsavel="Convenente", data_prevista=date(2026, 12, 26))
    sem_prazo = SimpleNamespace(descricao="Revisar", responsavel=None, data_prevista=None)
    ref = date(2026, 11, 26)
    assert linha_acao(ctx, vencida, ref)[9] == "Vencida"
    assert linha_acao(ctx, no_prazo, ref)[9] == "No prazo"
    assert linha_acao(ctx, sem_prazo, ref)[9] == "Sem prazo"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_instrumentos_modelo.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

```python
"""Linhas, abas e resumo do relatório de Instrumentos."""

from datetime import date

from app.schemas_monitoramento import EtapasInstrumentoRead
from app.services.relatorios_modelo import Celula, ContextoInstrumento

COLUNAS_INSTRUMENTO_SIMPLIFICADO = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Região", "Contratação", "Situação (Site)",
    "Situação (Monitoramento)", "Valor Global", "Valor Repassado", "Data de Inauguração",
    "Data de Conclusão do Monitoramento", "Técnico Responsável",
)
COLUNAS_INSTRUMENTO_COMPLETO = (
    "Instrumento", "CNES", "Estabelecimento de Saúde", "CNPJ do Convenente", "Município", "UF", "Região",
    "Contratação", "Situação (Site)", "Situação (Monitoramento)",
    "Equipamentos", "Qtd Planejada", "Qtd Entregue", "Qtd em Operação", "% Entregue",
    "Data de Publicação", "Data do Último Repasse", "Data de Entrega do Equipamento", "Data de Inauguração",
    "Data de Conclusão do Monitoramento", "Status da Inauguração",
    "Nº do Processo", "Ano do Instrumento", "Início da Vigência", "Fim da Vigência",
    "Valor Global", "Valor Repassado",
    "Técnico Responsável", "Técnico Suplente", "Nível de Monitoramento", "Responsável pela Execução", "Contato",
    "Ações abertas", "Última Movimentação",
)
COLUNAS_FINANCEIRO = (
    "Instrumento", "Estabelecimento de Saúde", "Valor Global", "Valor de Repasse Pactuado", "Contrapartida",
    "Empenhado", "Valor Repassado", "Pago a Fornecedor", "Saldo em Conta", "Valor do Equipamento", "Valor da Obra",
    "Prestação de Contas", "Ordem de Pagamento",
)
COLUNAS_ACOES = (
    "Nº do Processo", "Instrumento", "CNES", "Estabelecimento de Saúde", "Município", "UF", "Ação", "Responsável",
    "Data Prevista", "Situação da Ação", "Técnico Responsável",
)
DATAS_INSTRUMENTO = (
    "Data de Inauguração", "Data de Conclusão do Monitoramento", "Data de Publicação", "Data do Último Repasse",
    "Data de Entrega do Equipamento", "Início da Vigência", "Fim da Vigência", "Última Movimentação",
)
MOEDA_INSTRUMENTO = ("Valor Global", "Valor Repassado")
MOEDA_FINANCEIRO = tuple(c for c in COLUNAS_FINANCEIRO if c.startswith(("Valor", "Contrap", "Empen", "Pago", "Saldo")))

LEGENDA_INSTRUMENTOS = (
    ("Situação (Site)", "Situação oficial do instrumento nos dados importados."),
    ("Situação (Monitoramento)", "Fase do acompanhamento interno."),
    ("Data de Inauguração", "Quando existe."),
    (
        "Data de Conclusão do Monitoramento",
        "Só aparece quando não há inauguração e indica o encerramento do acompanhamento, não uma inauguração.",
    ),
    ("Valor Repassado", "Valor já repassado ao convenente. Vazio quando não há fonte confiável."),
)


def datas_do_instrumento(etapa: EtapasInstrumentoRead) -> tuple[date | None, date | None]:
    """(Data de Inauguração, Data de Conclusão do Monitoramento): a conclusão só vale sem inauguração."""
    if etapa.inauguracao:
        return etapa.inauguracao, None
    return None, etapa.conclusao


def linha_acao(ctx: ContextoInstrumento, acao, referencia: date) -> tuple[Celula, ...]:
    if acao.data_prevista is None:
        situacao = "Sem prazo"
    else:
        situacao = "Vencida" if acao.data_prevista < referencia else "No prazo"
    return (
        ctx.numero_processo, ctx.numero, ctx.cnes, ctx.estabelecimento, ctx.municipio, ctx.uf, acao.descricao,
        acao.responsavel, acao.data_prevista, situacao, ctx.tecnico,
    )
```

Acrescentar no mesmo arquivo (ou em `relatorios_instrumentos_linhas.py` se passar de 200 linhas) as funções de linha, todas puras sobre os objetos já carregados:

```python
def valores_do_convenio(convenio, instrumento) -> dict[str, float | None]:
    """Valores só com financeiro confiável; sem fonte confiável, vazio."""
    from app.services.relatorios_filtro import _valor_global_confiavel

    if convenio is None or not convenio.financeiro_fonte_confiavel:
        return {k: None for k in ("global", "repasse_pactuado", "contrapartida", "empenhado", "repassado", "pago", "saldo")}
    f = lambda v: float(v) if v is not None else None  # noqa: E731
    return {
        "global": _valor_global_confiavel(convenio),
        "repasse_pactuado": f(convenio.valor_repasse), "contrapartida": f(convenio.valor_contrapartida),
        "empenhado": f(convenio.valor_empenhado), "repassado": f(convenio.valor_desembolsado),
        "pago": f(convenio.valor_pago_fornecedor), "saldo": f(convenio.valor_saldo_conta),
    }
```

e `linha_instrumento_simplificada`, `linha_instrumento_completa`, `linha_financeiro` seguindo exatamente a ordem das tuplas de colunas acima (`Equipamentos` = `"; ".join(f"{familia} ({n})" if n > 1 else familia ...)`, `Qtd Planejada` = soma do planejado líquido, `Qtd Entregue` = soma do entregue, `Qtd em Operação` = entregue se `etapa.modo_operacao` senão 0, `% Entregue` = `round(entregue / planejado * 100)` com `%` ou vazio se planejado 0, `Última Movimentação` = `data_ocorrencia` do evento ativo mais recente de `monitoramento.listar_eventos_por_instrumentos`, `Ações abertas` = `len(acoes_abertas.get(instrumento.id, []))`). Cada função recebe os dicionários já carregados, nunca o `db`.

`resumo_instrumentos`: indicadores `Instrumentos` e uma entrada por situação (`quebra_por("Por situação", "Situação (Monitoramento)", ...)`), quebras por contratação, por UF (Região no Brasil, Estabelecimento em município/CNES) e a tabela "Valores" com `Valor Global` e `Valor Repassado` somados (só instrumentos com valor). Sem alertas.

- [ ] **Step 4: Integrar**

Em `relatorios_monitorados.py`, ramo de instrumentos: carregar `contextos`, `etapas`, `convenios` (`repo.convenios_por_numero`), `acoes_abertas`, eventos (para Última Movimentação) e as famílias (`resumo_com_cancelamentos_por_familia`); montar `colunas/linhas` do nível, e no Completo `abas = (Tabela("Instrumentos"... já é Registros), Tabela("Financeiro", ...), Tabela("Ações em aberto", ...))`. **Não** criar aba de histórico. Fonte `SISGEO · SICONV · CNES`. Remover os critérios antigos de fase da coluna final: a coluna final deixa de ser a fase.

- [ ] **Step 5: Atualizar `test_relatorios_monitorados.py`**

O teste usa `linha[-1]` como fase (instrumentos) em prévia, Excel e Word. Trocar por `relatorio.colunas.index("Situação (Monitoramento)")` na prévia (`previa["colunas"].index(...)`) e no Excel (`next(...)` da linha de cabeçalho de `Registros`). O `monkeypatch` de `carregar_etapas` retorna `[]`: trocar por `lambda **_: [EtapasInstrumentoRead(nr_convenio=str(i)) for i in range(1, 4)]` e monkeypatchar também `carregar_contextos` com contextos fictícios, pois a nova montagem exige ambos para cada instrumento.

Run: `cd backend && uv run pytest tests/test_relatorios_instrumentos_modelo.py tests/test_relatorios_monitorados.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services backend/tests
git commit -m "feat(relatorios): modelo de instrumentos com financeiro e ações em aberto"
```

---

> **Decisão do usuário (26/11/2026):** Propostas é a **carteira em tramitação**, isto é, só propostas sem parceria, como o filtro Etapa "Proposta" já faz. Propostas com parceria já aparecem como instrumentos Celebrados e não são contadas duas vezes. Por isso a coluna **Parceria Vinculada** **não existe** e o recorte usa `_propostas(db, replace(filtro, etapa="propostas"))`.

### Task 8: Modelo de Propostas e tipo `propostas`

**Files:**
- Create: `backend/app/services/relatorios_propostas_modelo.py`
- Modify: `backend/app/services/relatorios_filtro.py` (`TipoRelatorio`), `backend/app/services/relatorios_monitorados.py` (`TipoMonitorado`, `TIPOS_MONITORADOS`, despacho)
- Test: `backend/tests/test_relatorios_propostas_modelo.py`

**Interfaces:**
- Produces: `COLUNAS_PROPOSTA_SIMPLIFICADO` (10), `COLUNAS_PROPOSTA_COMPLETO` (16), `linha_proposta(p, *, completo, referencia, cnes_estabelecimento=None)`, `resumo_propostas(propostas)`, `montar_propostas(db, nivel, filtro, referencia) -> RelatorioMonitorado`.

- [ ] **Step 1: Write the failing test**

```python
from datetime import date
from types import SimpleNamespace

from app.services.relatorios_propostas_modelo import (
    COLUNAS_PROPOSTA_COMPLETO,
    COLUNAS_PROPOSTA_SIMPLIFICADO,
    linha_proposta,
)


def _p(**c):
    base = dict(id_proposta=123, nm_proponente="Município de Exemplo", cnpj_ente_recebedor="00000000000100",
                cnes="2000001", municipio="CIDADE X", uf="MG", nm_programa="Programa Exemplo",
                componente_batido="Componente A", equipamento_detectado="Mamógrafo", ds_objeto="Aquisição",
                situacao_proposta="Proposta aprovada", vl_global_proposta=900000, data_proposta=date(2025, 9, 3),
                status="revisada")
    base.update(c)
    return SimpleNamespace(**base)


def test_numero_de_colunas_aprovado():
    assert len(COLUNAS_PROPOSTA_SIMPLIFICADO) == 10
    assert len(COLUNAS_PROPOSTA_COMPLETO) == 16
    assert "Parceria Vinculada" not in COLUNAS_PROPOSTA_COMPLETO


def test_linha_simplificada_usa_proponente_e_regiao():
    linha = linha_proposta(_p(), completo=False, referencia=date(2026, 11, 26))
    assert linha[0] == "Município de Exemplo"
    assert linha[2] == "Cidade X" and linha[4] == "Sudeste"
    assert len(linha) == 10


def test_linha_completa_calcula_dias():
    linha = linha_proposta(_p(), completo=True, referencia=date(2026, 11, 26))
    mapa = dict(zip(COLUNAS_PROPOSTA_COMPLETO, linha))
    assert mapa["Dias desde a Proposta"] == 449
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_propostas_modelo.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

```python
"""Linhas, resumo e legenda do relatório de Propostas. Fonte: SISGEO."""

from datetime import date

from app.geo_reference import REGIAO_POR_UF
from app.pipeline.texto import capitalizar_nome
from app.services.relatorios_modelo import Celula, Tabela, quebra_por

COLUNAS_PROPOSTA_SIMPLIFICADO = (
    "Proponente", "CNES", "Município", "UF", "Região", "Programa", "Equipamento", "Situação da Proposta",
    "Valor Global da Proposta", "Data da Proposta",
)
COLUNAS_PROPOSTA_COMPLETO = (
    "Nº da Proposta", "Proponente", "CNPJ do Proponente", "CNES", "Município", "UF", "Região", "Programa",
    "Componente", "Equipamento", "Objeto", "Situação da Proposta", "Valor Global da Proposta", "Data da Proposta",
    "Dias desde a Proposta", "Status da Revisão",
)
DATAS_PROPOSTA = ("Data da Proposta",)
MOEDA_PROPOSTA = ("Valor Global da Proposta",)
LEGENDA_PROPOSTAS = (
    ("Valor Global da Proposta", "Valor global informado na proposta."),
    ("Dias desde a Proposta", "Dias entre a data da proposta e a data de referência do relatório."),
)


def linha_proposta(p, *, completo: bool, referencia: date) -> tuple[Celula, ...]:
    uf = (p.uf or "").upper() or None
    regiao = REGIAO_POR_UF.get(uf) if uf else None
    municipio = capitalizar_nome(p.municipio)
    valor = float(p.vl_global_proposta) if p.vl_global_proposta is not None else None
    if not completo:
        return (
            p.nm_proponente, p.cnes, municipio, uf, regiao, p.nm_programa, p.equipamento_detectado,
            p.situacao_proposta, valor, p.data_proposta,
        )
    dias = (referencia - p.data_proposta).days if p.data_proposta else None
    return (
        p.id_proposta, p.nm_proponente, p.cnpj_ente_recebedor, p.cnes, municipio, uf, regiao, p.nm_programa,
        p.componente_batido, p.equipamento_detectado, p.ds_objeto, p.situacao_proposta, valor, p.data_proposta,
        dias, p.status,
    )


def resumo_propostas(propostas) -> tuple[tuple[tuple[str, Celula], ...], tuple[Tabela, ...]]:
    total = sum(float(p.vl_global_proposta or 0) for p in propostas)
    indicadores = (("Propostas", len(propostas)), ("Valor Global", total))
    situacao = quebra_por("Por situação", "Situação da Proposta", (p.situacao_proposta or "" for p in propostas))
    valor: dict[str, float] = {}
    for p in propostas:
        valor[p.situacao_proposta or ""] = valor.get(p.situacao_proposta or "", 0.0) + float(p.vl_global_proposta or 0)
    por_valor = Tabela(
        "Valor por situação", ("Situação da Proposta", "Valor Global"), sorted(valor.items()), colunas_moeda=("Valor Global",)
    )
    return indicadores, (
        situacao,
        por_valor,
        quebra_por("Por programa", "Programa", (p.nm_programa or "" for p in propostas)),
        quebra_por("Por UF", "UF", ((p.uf or "").upper() for p in propostas)),
        quebra_por("Por equipamento", "Equipamento", (p.equipamento_detectado or "" for p in propostas)),
    )
```

`montar_propostas` usa `_propostas(db, filtro)` (já existente em `relatorios_recorte`), monta cabeçalho com fonte `SISGEO` e filtros `descrever_filtros` (para propostas, o primeiro item é o programa ou "todos os programas": criar variante `descrever_filtros_propostas` em `relatorios_modelo` que devolve `"Todas as situações · todos os programas"` por padrão, reaproveitando `filtro.situacao`/`filtro.programa`). Sem `etapa`: todas as propostas do recorte.

Em `relatorios_filtro.py`: `TipoRelatorio` ganha `"propostas"`. Em `relatorios_monitorados.py`: `TipoMonitorado` ganha `"propostas"`, `TIPOS_MONITORADOS` também, e `_montar` despacha `tipo == "propostas"` para `montar_propostas`. A prévia (`/relatorios/previa`) passa a atender `tipo_relatorio=propostas` pelo mesmo caminho dos demais; o ramo `instrumentos_repasse` + `etapa=propostas` com 2 colunas permanece por compatibilidade com o contrato atual.

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_relatorios_propostas_modelo.py tests/test_relatorios_monitorados.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services backend/tests/test_relatorios_propostas_modelo.py
git commit -m "feat(relatorios): modelo de propostas e tipo de relatório propostas"
```

---

### Task 9: Escrita do Excel e do Word, e nome do arquivo na rota

**Files:**
- Modify: `backend/app/reports/monitorados.py`, `backend/app/routers/relatorios.py`, `backend/app/services/relatorios.py` (dispatch já cobre `TIPOS_MONITORADOS`; incluir `propostas`)
- Test: `backend/tests/test_relatorios_monitorados_arquivos.py` (puro, sem banco), ajustar `test_relatorios_contracts.py`

**Interfaces:**
- Consumes: `RelatorioMonitorado` completo (cabeçalho, indicadores, quebras, abas, legenda).
- Produces: `gerar_monitorados(relatorio, *, formato, recorte) -> bytes` (assinatura mantida).

- [ ] **Step 1: Write the failing test**

```python
from datetime import date
from io import BytesIO

from docx import Document
from openpyxl import load_workbook

from app.reports.monitorados import gerar_monitorados
from app.services.relatorios_modelo import RelatorioMonitorado, Tabela


def _relatorio():
    return RelatorioMonitorado(
        titulo="Equipamentos", colunas=("A", "Data"), linhas=[("x", date(2026, 1, 10))], total=1, unidade="unidades",
        cabecalho=(("Recorte", "MG"), ("Filtros", "f"), ("Referência", "26/11/2026"), ("Fonte", "SISGEO")),
        indicadores=(("Unidades", 1),),
        quebras=(Tabela("Por situação", ("Situação", "Total", "%"), [("Em operação", 1, "100%"), ("Total", 1, "100%")]),),
        abas=(Tabela("Ações em aberto", ("Ação",), [("Enviar parecer",)]),),
        legenda=(("A", "primeira coluna"),),
        colunas_data=("Data",),
    )


def test_excel_tem_resumo_registros_e_abas_extras_com_legenda_no_rodape():
    pasta = load_workbook(BytesIO(gerar_monitorados(_relatorio(), formato="xlsx", recorte="MG")))
    assert pasta.sheetnames == ["Resumo", "Registros", "Ações em aberto"]
    resumo = [[c.value for c in linha] for linha in pasta["Resumo"].iter_rows(max_col=2)]
    assert ["Fonte", "SISGEO"] in resumo and ["Em operação", 1] in resumo
    registros = pasta["Registros"]
    assert registros.auto_filter.ref == "A1:B2"
    assert registros["A4"].value == "Legenda"


def test_word_simplificado_e_nota_sem_tabela_de_registros():
    doc = Document(BytesIO(gerar_monitorados(_relatorio(), formato="docx", recorte="MG")))
    texto = "\n".join(p.text for p in doc.paragraphs)
    assert "SISGEO" in texto and "26/11/2026" in texto
    assert len(doc.tables) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_relatorios_monitorados_arquivos.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement `gerar_monitorados`**

Excel:

```python
def _xlsx(r: RelatorioMonitorado) -> bytes:
    pasta = xlsx_builder.nova_pasta()
    blocos = [
        xlsx_builder.BlocoAba(None, ["Campo", "Valor"], [list(c) for c in r.cabecalho]),
        xlsx_builder.BlocoAba("Indicadores", ["Indicador", "Valor"], [list(i) for i in r.indicadores]),
        *(xlsx_builder.BlocoAba(q.titulo, q.colunas, q.linhas) for q in r.quebras),
    ]
    xlsx_builder.escrever_aba_blocos(pasta, "Resumo", blocos)
    rodape = [["Legenda", ""], *([c, t] for c, t in r.legenda)] if r.legenda else []
    xlsx_builder.escrever_aba_tabela(
        pasta, "Registros", list(r.colunas), r.linhas, colunas_data=list(r.colunas_data),
        colunas_moeda=list(r.colunas_moeda), rodape=rodape,
    )
    for aba in r.abas:
        xlsx_builder.escrever_aba_tabela(
            pasta, aba.titulo, list(aba.colunas), aba.linhas, colunas_data=list(aba.colunas_data),
            colunas_moeda=list(aba.colunas_moeda),
        )
    return xlsx_builder.gerar_bytes(pasta)
```

(O parâmetro `colunas_moeda` do Excel do Resumo é aplicado depois com `number_format` nas linhas de "Valor"; se o formato monetário no Resumo for necessário, passar pelas `colunas_moeda` do bloco em `escrever_aba_blocos`. Os valores `Valor`/`Valor Global` do Resumo vão como `float` e ganham `FORMATO_MOEDA` nas células cujo cabeçalho é `Valor` ou `Valor Global`.)

Word, nota informativa (Simplificado) e nota + registros (Completo): reaproveitar `docx_builder.novo_documento(titulo, paisagem=True)`, `adicionar_cabecalho_institucional`, `adicionar_paragrafo`, `adicionar_tabela`/`gerar_bytes_tabelados` e `adicionar_fonte`. O texto: uma frase com os indicadores (`"Em {referência}, {total} {unidade} ..."`), a primeira quebra como tabela, os demais indicadores como parágrafos curtos, e `adicionar_fonte(documento, f"Recorte: {recorte} · Referência: {data} · Fonte: {fonte}")`. No Completo, acrescentar a tabela de Registros depois da nota. O teste acima exige 1 tabela no Simplificado.

Rota: em `routers/relatorios.py`, trocar

```python
nome_arquivo = f"relatorio-{tipo_relatorio}-{escopo}-{nivel}.{formato}"
```

por

```python
from app.services.relatorios_modelo import nome_arquivo as montar_nome_arquivo

rotulo = {"equipamentos_monitorados": "equipamentos", "instrumentos_monitorados": "instrumentos", "propostas": "propostas"}.get(
    tipo_relatorio, tipo_relatorio
)
nome_arquivo = montar_nome_arquivo(rotulo, filtro, nivel, formato)
```

O nome muda também para `instrumentos_repasse`/`analise_merito` (agora com o recorte real em vez de `escopo`). Atualizar os testes que afirmam `Content-Disposition` (`grep -rn "filename=" backend/tests`).

- [ ] **Step 4: Run tests**

Run: `cd backend && uv run pytest tests/test_relatorios_monitorados_arquivos.py tests/test_relatorios_contracts.py tests/test_relatorios_monitorados.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app backend/tests
git commit -m "feat(relatorios): Excel multi-aba com legenda no rodapé, Word em nota informativa e arquivo com recorte"
```

---

### Task 10: Frontend (rótulo e prévia de Propostas)

**Files:**
- Modify: `frontend/src/components/features/relatorio-filtros-controles.tsx:96`, `frontend/src/services/relatorios.ts`, `frontend/src/components/features/relatorio-carteira.tsx`
- Test: `frontend/src/components/features/relatorio-previas.test.tsx`

- [ ] **Step 1: Localizar os pontos de mudança**

```bash
cd frontend
grep -n "Todos os equipamentos" src/components/features/relatorio-filtros-controles.tsx
grep -n "instrumentos_repasse\|equipamentos_monitorados\|instrumentos_monitorados" src/services/relatorios.ts src/components/features/relatorio-carteira.tsx src/components/features/relatorio-previa-exportacao.tsx
```

- [ ] **Step 2: Write the failing test**

Em `relatorio-previas.test.tsx`, acrescentar um teste que renderiza o controle de equipamento sem seleção e espera o texto `Todos os Equipamentos em Oncologia`, e outro que aciona a aba Propostas e espera que a requisição use `tipo_relatorio=propostas` (seguir o padrão dos testes vizinhos para o mock do `httpClient`).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/features/relatorio-previas.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement**

Trocar `"Todos os equipamentos"` por `"Todos os Equipamentos em Oncologia"` em `relatorio-filtros-controles.tsx`. Em `services/relatorios.ts`, incluir `"propostas"` na união de tipos aceitos pela prévia e pelo download; em `relatorio-carteira.tsx`, a aba Propostas passa a pedir `tipo_relatorio=propostas` à prévia e ao download. A tabela de prévia já lê `colunas/linhas` do servidor, portanto as novas colunas aparecem sem mais mudanças.

- [ ] **Step 5: Run checks**

```bash
cd frontend && npx vitest run && npx tsc -b && npm run lint && npx prettier --check src/components/features/relatorio-*.tsx src/services/relatorios.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(relatorios): rótulo de equipamentos e prévia de propostas no novo modelo"
```

---

### Task 11: Documentação, verificação final e conferência dos arquivos

**Files:**
- Modify: `CLAUDE.md` (seção "Relatórios Excel/Word"), `docs/planos/planmode-relatorios-paridade-2026-11-24.md` (marcar o que esta entrega fecha)
- Test: suíte completa

- [ ] **Step 1: Atualizar o CLAUDE.md**

Na seção "Relatórios Excel/Word", substituir a nota desatualizada da página por: modelos Simplificado (nota para decisão) e Completo (acompanhamento); Equipamentos/Instrumentos/Propostas com Resumo + Registros (+ Financeiro e Ações em aberto em Instrumentos); legenda no rodapé; arquivo com recorte; `Situação (Site)` contra `Situação (Monitoramento)`; Fonte sem monitoramento interno. Manter o arquivo enxuto (rótulos curtos, sem narrativa).

- [ ] **Step 2: Verificação completa**

```bash
cd backend && uv run pytest -q && uv run ruff check app/services app/reports app/repositories app/routers/relatorios.py && uv run mypy app/services/relatorios_modelo.py app/services/relatorios_contexto.py
cd ../frontend && npm run test && npm run lint && npx tsc -b
```

Expected: suíte verde; `ruff`/`mypy` sem achado novo fora do baseline. Testes de banco exigem `TEST_DATABASE_URL` local.

- [ ] **Step 3: Gerar os 12 arquivos no clone local e conferir contra os modelos**

Gerar, via API local, **três tipos** (Equipamentos MG, Instrumentos RS, Propostas Brasil) × **dois níveis** × **dois formatos** (xlsx e docx) = 12 arquivos, e conferir:

```bash
cd backend && uv run python - <<'PY'
from openpyxl import load_workbook
import glob
for f in sorted(glob.glob("/caminho/gerado/relatorio-*.xlsx")):
    wb = load_workbook(f)
    for ws in wb:
        print(f.split("/")[-1], ws.title, ws.max_column, ws.freeze_panes, ws.auto_filter.ref,
              [type(c.value).__name__ for c in ws[2]][:6])
PY
```

Excel (6 arquivos): abas e número de colunas iguais aos "Modelos aprovados"; tipos de célula corretos (datas como data, valores como número com formato monetário, CNES como texto); filtro e painel congelado só na tabela; legenda depois de uma linha em branco no fim da aba; Brasil de Equipamentos sem filtro com mais de uma contratação; nenhuma data de conclusão do monitoramento junto de data de inauguração.

Word (6 arquivos): abrir com `python-docx` e comparar os indicadores e a primeira quebra com os mesmos números da prévia (`GET /relatorios/previa`) e do Resumo do Excel do mesmo recorte; o Simplificado tem uma tabela de síntese, o Completo acrescenta a de registros.

- [ ] **Step 4: Conferir `credencial-local.txt` fora do commit e commitar**

```bash
git status --short | grep -i credencial || echo ok
git add CLAUDE.md docs/planos
git commit -m "docs(relatorios): documenta os modelos de equipamentos, instrumentos e propostas"
```

---

## Self-Review

**Cobertura da spec**
- Fonte sem monitoramento interno/TransfereGov: Global Constraints + Tasks 6–8. ✔
- Quatro quebras (situação, equipamento, UF/região, contratação) + aceleradores, agenda e valor: Task 6. ✔
- Colunas Equipamentos (Simplificado 16/Completo 25, Descrição com código, Nº do Processo antes do Ano, Vigência antes de Marca, sem Ações): Task 6. ✔
- Status da Inauguração e duas colunas de data: Tasks 4 e 6. ✔
- Legenda no rodapé; Resumo em blocos: Tasks 2 e 9. ✔
- Instrumentos (Situação (Site)/(Monitoramento), Valor Repassado, datas inauguração/conclusão, Financeiro, Ações em aberto, sem Histórico, sem alertas): Task 7. ✔
- Propostas 10/16 colunas, fonte SISGEO, tipo próprio: Task 8. ✔
- Nome do arquivo com recorte; linhas diferentes sem justificativa; Brasil: Tasks 1 e 3. ✔
- Município capitalizado: Tasks 5 e 8 (`capitalizar_nome`). ✔
- Word em nota informativa: Task 9. ✔
- Rótulo "Todos os Equipamentos em Oncologia": Tasks 3 e 10. ✔

**Placeholders:** a Task 1 depende do diagnóstico (causa desconhecida) e declara os candidatos e o teste; a Task 7 descreve as funções de linha em prosa com a ordem exata das colunas em vez de repetir 34 campos (as tuplas de coluna são a fonte única). Se o executor preferir, escrever as funções com teste de ordem por `zip(COLUNAS, linha)`, como nos testes de Equipamentos.

**Consistência de tipos:** `FatoEquipamento.valor` é o valor total da linha (item vinculado da unidade, ou valor da família proporcional à quantidade) tanto no resumo quanto na linha; `ContextoInstrumento` tem os mesmos 14 campos em todos os testes; `inauguracao_da_linha` recebe a chave de situação (`"planejado" | "entregue" | "em_operacao" | "cancelado"`), igual a `FatoEquipamento.situacao` e a `ROTULOS`.

**Riscos conhecidos:** `valor_repasse` (rótulo "Pactuado") depende da Task 0; `SITUACAO_SITE_CAMPO` depende da Task 0; os testes de banco exigem Postgres local; o worktree tem trabalho do Codex sem commit, que deve ser commitado antes.
