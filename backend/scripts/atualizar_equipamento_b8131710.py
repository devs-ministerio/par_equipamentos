"""ARQUIVO HISTÓRICO ONE-SHOT — não é pipeline operacional vigente.

Atualiza as colunas `Equipamento`/`Equipamentos secundários` da aba
"Batimento sistema 2026-09" de `data/B8131710.xlsx`, SÓ pras linhas
`Tipo de Contratação == "Convênio"` (409 das 463) -- pedido do usuário
2026-09-11: "atualize a coluna equipamento com o equipamento de maior
valor daquele convênio e no secundário coloque os outros equipamentos
prioritários" contra o rol prioritário abaixo (ROL_PRIORITARIO). FAF/TED/
PRONON ficam fora -- essas usam `NU_PROCESSO`/`NU_PROPOSTA` como
identificador (ver `importar_batimento_b8131710.py`), não `NR_CONVENIO`
SICONV, e não são o pedido.

Duas fontes, confirmadas ao vivo antes de escrever este script (decisão do
usuário, ver sessão):
  1. ITEM + VALOR por convênio -- SÓ existe no dump nacional do SICONV
     (`siconv_plano_aplicacao.csv`, já em cache local); a API do Portal da
     Transparência (`GET /convenios/numero`) devolve só um resumo do
     convênio inteiro (objeto genérico, valor global, convenente) -- SEM
     item nem valor por item, confirmado consultando o convênio 848278 ao
     vivo. `app/pipeline/portal_transparencia.py` fica só pra validar
     existência/situação (passo 2 abaixo), não pra equipamento.
  2. VALIDAÇÃO de existência/situação -- API do Portal da Transparência,
     1 chamada por convênio (mesmo uso já feito em `validar_convenios.py`).

Classificação de item contra o rol é por REGEX em texto livre
(`DESCRICAO_ITEM` do SICONV nunca teve código CATMAT/SIGEM completo
disponível pra nós -- mesma limitação já documentada em
`levantamento_convenios_oncologia.py`) -- procura os padrões MAIS
ESPECÍFICOS primeiro (ex. "Ressonância 3,0 T" antes do "Ressonância"
genérico) pra não perder a granularidade do rol quando o texto permite.
Quando o texto não discrimina nada mais fino, cai pro rótulo mais genérico
do próprio rol (nunca inventa um valor mais específico do que o texto
sustenta).

Coluna `Equipamento` (primário) = item de MAIOR valor unitário DENTRO DO
ROL (decisão do usuário 2026-09-11, 2ª rodada: a 1ª versão pegava o maior
valor SEM restrição e isso promovia equipamento genérico de hospital --
ventilador pulmonar, aparelho de anestesia, cama elétrica, até um trecho
de texto de obra civil -- pra coluna Equipamento em 86 das 409 linhas
(21%), porque item auxiliar às vezes tem valor unitário cadastrado maior
que o do próprio equipamento oncológico no mesmo convênio). Só cai pro
maior valor GERAL (fora do rol) quando o convênio não tem NENHUM item do
rol -- nunca deixa a célula vazia enquanto houver algum item, mesmo fora
do rol. Coluna `Equipamentos secundários` = outros rótulos do ROL
(excluindo o que virou primário), únicos, juntados com " · " (mesmo
separador já usado na planilha antes desta rodada); "Vários" quando não
sobra nenhum outro rótulo do rol (decisão do usuário 2026-09-11: cobre
tanto "só tem o item principal" quanto "tem outros itens, mas nenhum do
rol").

Decisão do usuário 2026-09-11: RECALCULAR as 409 linhas do zero (não só
preencher célula vazia) -- os valores já preenchidos antes vinham de uma
classificação anterior (14 categorias genéricas, não este rol de 20
itens), então não são compatíveis.

6 linhas "Convênio" sem `NR_CONVENIO` numérico de verdade (3 sem
identificador nenhum, 3 com código alfanumérico tipo "7AACRU") ficam DE
FORA -- sem identificador não dá pra buscar no SICONV nem validar na API,
mesmo achado já documentado em `importar_batimento_b8131710.py`.

Uso: python -m scripts.atualizar_equipamento_b8131710 (de dentro de
backend/, venv ativo). Sem escrita no banco -- só na planilha. Gera
relatório em scripts/output/atualizacao_equipamento_b8131710_relatorio.json
(convênios sem item no SICONV, sem match no Portal da Transparência, etc.)
pra revisão manual.
"""
from __future__ import annotations

import csv
import io
import json
import re
import time
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

import openpyxl
import requests

from app.pipeline.portal_transparencia import ChaveApiAusenteError, _sessao_com_retry, buscar_convenio_por_numero

PLANILHA = Path(__file__).parent.parent.parent / "data" / "B8131710.xlsx"
ABA = "Batimento sistema 2026-09"
DIR_CACHE = Path(__file__).parent / "output" / "cache"
DIR_SAIDA = Path(__file__).parent / "output"

COL_CONVENIO = "Convênio"
COL_EQUIPAMENTO = "Equipamento"
COL_SECUNDARIOS = "Equipamentos secundários"
COL_TIPO = "Tipo de Contratação"

# Rol prioritário fornecido pelo usuário 2026-09-11, na ordem que ele
# mandou (Rastreamento / Diagnóstico / Tratamento) -- ordem NÃO importa pra
# classificação (isso é feito por especificidade do regex, ver
# `_PADROES_ROL` abaixo), só documenta o rol de origem.
ROL_PRIORITARIO = [
    "Mamógrafo (Convencional e Digital)",
    "Colposcópio",
    "Sistema de Vídeo Endoscópio Flexível",
    "Sistema de Vídeo Endoscopia Rígida",
    "Endoscópio Rígido",
    "Endoscópio Flexível (Fibroendoscopia)",
    "Ultrassom Diagnóstico sem Aplicação Transesofágica",
    "Simulador/Tomógrafo para Radioterapia",
    "Tomógrafo Computadorizado (até 16 canais)",
    "Ressonância Magnética (RM)",
    "Ressonância Nuclear Magnética até 0,5 T",
    "Ressonância Nuclear Magnética 1,5 T",
    "Ressonância Nuclear Magnética 3,0 T",
    "PET-CT",
    "Câmara Cintilográfica (Gama Câmara)",
    "Acelerador Linear (Básico – Intermediário)",
    "Acelerador Linear (Recursos avançados com IGRT 3D)",
    "Braquiterapia com Sistema de Controle Remoto",
    "Arco cirúrgico",
    "Cirurgia Robótica",
]

# Ordem IMPORTA -- do mais especifico pro mais generico (primeiro match
# vence). Texto ja normalizado (maiusculo, sem acento) antes de checar.
_PADROES_ROL: list[tuple[str, re.Pattern]] = [
    ("Sistema de Vídeo Endoscópio Flexível", re.compile(r"SISTEMA\s*DE\s*VIDEO\s*ENDOSCOP\w*\s*FLEX")),
    ("Sistema de Vídeo Endoscopia Rígida", re.compile(r"SISTEMA\s*DE\s*VIDEO\s*ENDOSCOP\w*\s*RIGID")),
    ("Endoscópio Flexível (Fibroendoscopia)", re.compile(r"ENDOSCOP\w*\s*FLEX|FIBROENDOSCOP|FIBROSCOP")),
    ("Endoscópio Rígido", re.compile(r"ENDOSCOP\w*\s*RIGID")),
    ("Colposcópio", re.compile(r"COLPOSCOPIO")),
    ("Mamógrafo (Convencional e Digital)", re.compile(r"MAMOGRAFO")),
    ("Simulador/Tomógrafo para Radioterapia", re.compile(r"SIMULADOR.*RADIOTERAPIA|TOMOGRAFO.*RADIOTERAPIA|SIMULADOR\s*(DE\s*)?TOMOGRAF")),
    ("Ressonância Nuclear Magnética 3,0 T", re.compile(r"RESSONANC.*\b3(?:[.,]0)?\s*T(?:ESLA)?\b")),
    ("Ressonância Nuclear Magnética 1,5 T", re.compile(r"RESSONANC.*\b1[.,]5\s*T(?:ESLA)?\b")),
    ("Ressonância Nuclear Magnética até 0,5 T", re.compile(r"RESSONANC.*\b0[.,]5\s*T(?:ESLA)?\b")),
    ("Ressonância Magnética (RM)", re.compile(r"RESSONANC")),
    ("PET-CT", re.compile(r"PET[\s/\-]*CT\b")),
    ("Câmara Cintilográfica (Gama Câmara)", re.compile(r"GAMA\s*CAMARA|CAMARA\s*CINTILOGR|\bSPECT\b")),
    ("Tomógrafo Computadorizado (até 16 canais)", re.compile(r"TOMOGRAF")),
    ("Acelerador Linear (Recursos avançados com IGRT 3D)", re.compile(r"ACELERADOR\s*LINEAR.*(IGRT|AVANCAD|\b3D\b)")),
    ("Acelerador Linear (Básico – Intermediário)", re.compile(r"ACELERADOR\s*LINEAR")),
    ("Braquiterapia com Sistema de Controle Remoto", re.compile(r"BRAQUITERAPIA")),
    ("Arco cirúrgico", re.compile(r"ARCO\s*CIRURGICO|\bARCO[\s\-]?C\b|ARCO\s*EM\s*C\b")),
    ("Cirurgia Robótica", re.compile(r"CIRURGIA\s*ROBOTICA|ROBO\s*CIRURGICO|SISTEMA\s*ROBOTICO")),
    # Ultrassom checado por último -- "ULTRASSONOGRAFO"/"ULTRA-SOM" tambem
    # contam (nao so "ULTRASSOM" exato); exclusao de "transesofagico" (o rol
    # pede "sem aplicação transesofágica") e feita a parte, em
    # `classificar()` -- lookahead nao serve aqui porque o termo pode vir
    # ANTES OU DEPOIS de "ultrassom" no texto livre do SICONV.
    ("Ultrassom Diagnóstico sem Aplicação Transesofágica", re.compile(r"ULTRA[\s\-]*S{1,2}O(M\b|NOGRAF)")),
]


def _normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.strip())
    return s.upper()


def classificar(descricao: str) -> str | None:
    """Rótulo do ROL_PRIORITARIO que bate com a descrição do item, ou None
    se nenhum padrão bater (item fora do rol -- normal, SICONV cobre muito
    mais que so os 20 itens do rol)."""
    desc_norm = _normalizar(descricao)
    for rotulo, padrao in _PADROES_ROL:
        if padrao.search(desc_norm):
            # "sem aplicação transesofágica" e' explicito no rol -- exclui
            # SO quando o texto diz "COM ... transesofagico" (o oposto do
            # rol). "SEM ... transesofagico" e' o proprio rotulo por
            # extenso, nao motivo de exclusao -- bug real visto 2026-09-11
            # (script excluia os dois casos, "SEM" incluido, achado
            # revisando a distribuicao apos a 1a rodada).
            if rotulo.startswith("Ultrassom") and re.search(r"\bCOM\b.{0,30}TRANSESOFAG", desc_norm):
                return None
            return rotulo
    return None


def _linhas_csv_do_zip(caminho: Path):
    zf = zipfile.ZipFile(caminho)
    membro = zf.namelist()[0]
    texto = io.TextIOWrapper(zf.open(membro), encoding="utf-8-sig", newline="")
    leitor = csv.reader(texto, delimiter=";")
    cabecalho = next(leitor)
    return cabecalho, leitor


def _valor(s: str | None) -> float:
    if not s:
        return 0.0
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return 0.0


def _ler_convenios_alvo() -> tuple[dict[str, int], set[str], list[str]]:
    """Lê a planilha e devolve (linhas cruas pra edição, set de nr_convenio
    alvo) -- só linhas `Tipo de Contratação == "Convênio"` com um
    `Convênio` numérico de verdade (exclui os 6 sem identificador
    utilizável, ver docstring do módulo)."""
    wb = openpyxl.load_workbook(PLANILHA, data_only=True)
    ws = wb[ABA]
    header = [c.value for c in ws[1]]
    idx = {h: i for i, h in enumerate(header) if isinstance(h, str)}

    alvo_num: set[str] = set()
    sem_identificador: list[str] = []
    for linha_num in range(2, ws.max_row + 1):
        tipo = ws.cell(row=linha_num, column=idx[COL_TIPO] + 1).value
        if (tipo or "").strip() != "Convênio":
            continue
        conv = ws.cell(row=linha_num, column=idx[COL_CONVENIO] + 1).value
        conv_str = str(conv).strip() if conv is not None else ""
        if conv_str.isdigit():
            alvo_num.add(conv_str)
        else:
            sem_identificador.append(f"linha {linha_num}: {conv!r}")
    wb.close()
    return idx, alvo_num, sem_identificador


def levantar_itens_por_convenio(alvo: set[str]) -> dict[str, list[dict]]:
    """Streama siconv_convenio.csv (pra saber quais ID_PROPOSTA pertencem
    aos convenios-alvo) e siconv_plano_aplicacao.csv (item+valor), sem
    carregar o dump nacional inteiro em memoria -- so guarda o que bate com
    `alvo`."""
    print(f"Lendo siconv_convenio.csv.zip (filtrando {len(alvo)} convênio-alvo)...")
    cab_conv, leitor_conv = _linhas_csv_do_zip(DIR_CACHE / "siconv_convenio.csv.zip")
    idx_nr = cab_conv.index("NR_CONVENIO")
    idx_prop = cab_conv.index("ID_PROPOSTA")
    proposta_para_convenio: dict[str, str] = {}
    encontrados_no_dump: set[str] = set()
    for linha in leitor_conv:
        if len(linha) != len(cab_conv):
            continue
        nr = linha[idx_nr]
        if nr in alvo:
            proposta_para_convenio[linha[idx_prop]] = nr
            encontrados_no_dump.add(nr)
    print(f"   {len(encontrados_no_dump)}/{len(alvo)} convênio-alvo achados no siconv_convenio.csv (o resto pode ser convênio recente demais pro dump, ou nao-SICONV).")

    print("Lendo siconv_plano_aplicacao.csv.zip (item + valor)...")
    cab_itens, leitor_itens = _linhas_csv_do_zip(DIR_CACHE / "siconv_plano_aplicacao.csv.zip")
    idx_prop_item = cab_itens.index("ID_PROPOSTA")
    idx_desc = cab_itens.index("DESCRICAO_ITEM")
    idx_valor_unit = cab_itens.index("VALOR_UNITARIO_ITEM")
    idx_valor_total = cab_itens.index("VALOR_TOTAL_ITEM")
    idx_qtd = cab_itens.index("QTD_ITEM")

    itens_por_convenio: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for linha in leitor_itens:
        total += 1
        if total % 1_000_000 == 0:
            print(f"   ... {total} linha(s) de item processada(s)")
        if len(linha) != len(cab_itens):
            continue
        nr = proposta_para_convenio.get(linha[idx_prop_item])
        if nr is None:
            continue
        valor_unit = _valor(linha[idx_valor_unit])
        valor_total = _valor(linha[idx_valor_total])
        itens_por_convenio[nr].append({
            "descricao": linha[idx_desc],
            "valor_unitario": valor_unit,
            "valor_total": valor_total,
            "qtd": linha[idx_qtd],
        })
    print(f"   {total} linha(s) de item no total; {len(itens_por_convenio)} convênio-alvo com item encontrado.")
    return dict(itens_por_convenio)


def validar_no_portal_transparencia(alvo: set[str]) -> dict[str, dict]:
    """1 chamada por convênio-alvo na API do Portal da Transparência --
    SÓ pra confirmar existência/situação (não tem item nem valor por item,
    ver docstring do módulo). Erro de config (chave ausente) aborta tudo;
    erro de rede numa linha não impede as demais."""
    print(f"Validando {len(alvo)} convênio(s) no Portal da Transparência...")
    sessao = _sessao_com_retry()
    resultado: dict[str, dict] = {}
    for i, numero in enumerate(sorted(alvo), 1):
        if i % 50 == 0:
            print(f"   ... {i}/{len(alvo)}")
        try:
            dado = buscar_convenio_por_numero(numero, session=sessao)
            resultado[numero] = {
                "encontrado": dado is not None,
                "situacao": dado.get("situacao") if dado else None,
                "objeto": (dado.get("dimConvenio") or {}).get("objeto") if dado else None,
            }
        except ChaveApiAusenteError:
            raise
        except requests.RequestException as e:
            resultado[numero] = {"encontrado": False, "erro": str(e)}
        time.sleep(0.05)
    encontrados = sum(1 for v in resultado.values() if v.get("encontrado"))
    print(f"   {encontrados}/{len(alvo)} confirmado(s) como existente(s) no Portal da Transparência.")
    return resultado


def montar_equipamento_secundario(itens: list[dict]) -> tuple[str | None, str]:
    """(equipamento primário, equipamentos secundários) pra 1 convênio --
    ver docstring do módulo pra regra completa.

    Primário = maior valor DENTRO do rol prioritário (decisão do usuário
    2026-09-11, depois de ver que "maior valor sem restrição" promovia
    equipamento genérico de hospital -- ventilador, aparelho de anestesia,
    cama elétrica -- e até texto de obra civil pra coluna Equipamento em
    21% das linhas, porque item auxiliar às vezes tem valor unitário maior
    que o próprio equipamento oncológico no mesmo convênio). Só cai pro
    maior valor GERAL (fora do rol) quando o convênio não tem NENHUM item
    do rol -- nunca deixa a célula vazia enquanto houver algum item."""
    if not itens:
        return None, ""

    itens_no_rol = [it for it in itens if classificar(it["descricao"])]
    universo_principal = itens_no_rol or itens
    principal = max(universo_principal, key=lambda it: it["valor_unitario"] or it["valor_total"])
    rotulo_principal = classificar(principal["descricao"]) or principal["descricao"].strip().capitalize()

    rotulos_secundarios: list[str] = []
    for item in itens:
        if item is principal:
            continue
        rotulo = classificar(item["descricao"])
        if rotulo and rotulo != rotulo_principal and rotulo not in rotulos_secundarios:
            rotulos_secundarios.append(rotulo)
    secundario = " · ".join(rotulos_secundarios) if rotulos_secundarios else "Vários"
    return rotulo_principal, secundario


def run() -> None:
    idx, alvo, sem_identificador = _ler_convenios_alvo()
    print(f"{len(alvo)} convênio(s)-alvo (Tipo de Contratação == 'Convênio', identificador numérico).")
    if sem_identificador:
        print(f"{len(sem_identificador)} linha(s) 'Convênio' SEM identificador numérico -- ficam de fora:")
        for s in sem_identificador:
            print(f"   [AVISO] {s}")

    itens_por_convenio = levantar_itens_por_convenio(alvo)
    validacao_api = validar_no_portal_transparencia(alvo)

    wb = openpyxl.load_workbook(PLANILHA, data_only=False)
    ws = wb[ABA]

    sem_item_sispro: list[str] = []
    nao_confirmados_api: list[str] = []
    atualizados = 0

    for linha_num in range(2, ws.max_row + 1):
        tipo = ws.cell(row=linha_num, column=idx[COL_TIPO] + 1).value
        if (tipo or "").strip() != "Convênio":
            continue
        conv_cell = ws.cell(row=linha_num, column=idx[COL_CONVENIO] + 1)
        conv_str = str(conv_cell.value).strip() if conv_cell.value is not None else ""
        if not conv_str.isdigit():
            continue

        val = validacao_api.get(conv_str, {})
        if not val.get("encontrado"):
            nao_confirmados_api.append(conv_str)

        itens = itens_por_convenio.get(conv_str, [])
        if not itens:
            sem_item_sispro.append(conv_str)
            continue

        principal, secundario = montar_equipamento_secundario(itens)
        ws.cell(row=linha_num, column=idx[COL_EQUIPAMENTO] + 1, value=principal)
        ws.cell(row=linha_num, column=idx[COL_SECUNDARIOS] + 1, value=secundario)
        atualizados += 1

    wb.save(PLANILHA)
    print(f"\n{atualizados} linha(s) 'Convênio' atualizada(s) em {PLANILHA.name}.")
    print(f"{len(sem_item_sispro)} convênio-alvo SEM item no SICONV (célula deixada como estava, não apagada) -- ver relatório.")
    print(f"{len(nao_confirmados_api)} convênio-alvo NÃO confirmado(s) no Portal da Transparência (dado gravado mesmo assim, do SICONV) -- ver relatório.")

    DIR_SAIDA.mkdir(parents=True, exist_ok=True)
    relatorio = {
        "atualizados": atualizados,
        "sem_identificador_numerico": sem_identificador,
        "sem_item_no_sicomv": sem_item_sispro,
        "nao_confirmados_portal_transparencia": nao_confirmados_api,
        "validacao_api_completa": validacao_api,
    }
    caminho_relatorio = DIR_SAIDA / "atualizacao_equipamento_b8131710_relatorio.json"
    caminho_relatorio.write_text(json.dumps(relatorio, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Relatório completo em {caminho_relatorio}")


if __name__ == "__main__":
    run()
