"""Baixa e filtra o dump CSV bulk do SICONV legado
(repositorio.dados.gov.br/seges/detru/) pelos numeros de convenio do
scripts/validar_convenios.py, e monta um JSON relacional por convenio.

Por que este caminho em vez da API nova do TransfereGov (`/parcerias`, ver
app/pipeline/transferegov_parcerias.py): aquela API usa IDs proprios
(id_proposta pequeno, ex. 86) sem nenhum campo de numero de convenio legado
-- so da pra cruzar por CNPJ do convenente, o que e uma aproximacao (mesmo
ente, nao necessariamente a mesma transacao). O dump SICONV usa
`NR_CONVENIO` diretamente como chave em quase toda tabela -- cruzamento
EXATO, sem aproximacao. Sugestao do usuario (2026-09-03): varios ids mais
granulares (ID_PROPOSTA, ID_EMPENHO, ID_ITEM_PAD, ID_LICITACAO,
ID_DESEMBOLSO, ID_SOLICITACAO) vêm exatamente desse dump, nao da API nova.

Tabelas baixadas (das 44 disponiveis no repositorio -- essas sao as
relevantes pro monitoramento de equipamento; ver o diretorio completo em
https://repositorio.dados.gov.br/seges/detru/ se precisar de mais):
  siconv_convenio.csv          -- 1 linha por convenio (situacao, valores agregados, saldo em conta)
  siconv_empenho.csv           -- N por convenio, keyed por NR_CONVENIO (ID_EMPENHO, NR_EMPENHO)
  siconv_desembolso.csv        -- N por convenio (ID_DESEMBOLSO, valor e data de cada repasse)
  siconv_licitacao.csv         -- N por convenio (ID_LICITACAO, modalidade, valor, status)
  siconv_termo_aditivo.csv     -- N por convenio (ID_SOLICITACAO, alteracoes de valor/prazo)
  siconv_plano_aplicacao.csv   -- N por ID_PROPOSTA (nao por NR_CONVENIO!), item de despesa
                                   detalhado (ID_ITEM_PAD, descricao, quantidade, valor)
                                   -- arquivo fonte tem >1GB descomprimido, filtrado em streaming
                                   linha a linha (nunca carregado inteiro em memoria).
  siconv_programa_proposta.csv -- 1 linha por (ID_PROPOSTA, ID_PROGRAMA) -- so usada pra resolver
                                   o ID_PROGRAMA de cada convenio (via ID_PROPOSTA), nao entra
                                   no resultado final.
  siconv_programa.csv          -- catalogo de programa (ID_PROGRAMA -> NOME_PROGRAMA,
                                   ACAO_ORCAMENTARIA, etc) -- achado 2026-09-08 depois do
                                   usuario perguntar "no SICONV cada convenio nao tem
                                   programa?". Confirmado real e EXATO por ID_PROPOSTA (nao
                                   aproximacao por CNPJ como o TransfereGov) contra os 2
                                   convenios ja conhecidos: 948686 -> "...AÇÃO 8535 -
                                   RADIOTERAPIA..."; 971195 -> "...CONTROLE DO CÂNCER -
                                   HOSPITAL HABILITADO NA ALTA COMPLEXIDADE EM ONCOLOGIA"
                                   (bate quase literal com um dos 8 componentes PNPCC).
Decisao 2026-09-09: so entra no universo o que o Portal da Transparencia
confirma (`convenios_flat.json`) -- ou seja, so convenio ASSINADO. Entre
2026-09-08 e 2026-09-09 o pipeline chegou a incluir tambem convenio
achado so no dump SICONV sem entrada no Portal (`siconv_proposta.csv` como
fallback de identidade, campo `identidadeFonte` no front) -- conferido que
quase todos (38 de 41) desses ainda estavam em fase de PROPOSTA/plano de
trabalho (`SIT_PROPOSTA`), nao convenio formalizado. Revertido a pedido do
usuario: "Vamos manter apenas o que esta no portal mesmo. Convenios
assinados." `siconv_proposta.csv` nao e mais buscado.

Particularidade de parsing: `siconv_termo_aditivo.csv` tem `JUSTIFICATIVA_TA`
como ultimo campo, texto livre SEM aspas e as vezes contendo ";" dentro do
texto -- isso quebra um split ingenuo. Corrigido fazendo split com limite
(N-1 cortes), sobrando o resto (com ";" internos preservados) inteiro no
ultimo campo.

Uso: python -m scripts.coletar_siconv_legado (de dentro de backend/, venv
ativo). Baixa ~230MB no total (a maior parte e o zip do plano de aplicacao,
~280MB comprimido) -- pode demorar alguns minutos. Grava em
scripts/output/siconv_legado.json.
"""
from __future__ import annotations

import csv
import io
import json
import zipfile
from pathlib import Path

import requests

BASE_URL = "https://repositorio.dados.gov.br/seges/detru"
TIMEOUT = 300

ARQUIVOS = [
    "siconv_convenio",
    "siconv_empenho",
    "siconv_desembolso",
    "siconv_licitacao",
    "siconv_termo_aditivo",
]

SAIDA_JSON = Path(__file__).parent / "output" / "siconv_legado.json"
NUMEROS_CONVENIO_JSON = Path(__file__).parent / "output" / "convenios_flat.json"


def _numeros_convenio() -> list[str]:
    """So o que o Portal da Transparencia confirmou (`convenios_flat.json`)
    -- ou seja, so convenio assinado. Ver decisao 2026-09-09 na docstring
    do modulo (revertido de uma uniao com levantamentos nacionais que
    incluia convenio ainda em fase de proposta/plano de trabalho)."""
    convenios = json.loads(NUMEROS_CONVENIO_JSON.read_text(encoding="utf-8"))
    return [c["numero"] for c in convenios]


DIR_CACHE = Path(__file__).parent / "output" / "cache"


def _baixar_zip(nome: str) -> bytes:
    """Cache local em scripts/output/cache/ (compartilhado com
    levantamento_convenios_oncologia.py) -- siconv_plano_aplicacao.csv.zip
    sozinho e ~280MB, sem necessidade de rebaixar toda vez que o universo
    de convenios (scripts/output/convenios_flat.json) cresce."""
    caminho = DIR_CACHE / f"{nome}.csv.zip"
    if caminho.exists():
        print(f"   (cache) {nome}.csv.zip ja baixado.")
        return caminho.read_bytes()
    resp = requests.get(f"{BASE_URL}/{nome}.csv.zip", timeout=TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    DIR_CACHE.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(resp.content)
    return resp.content


def _linhas_csv_do_zip(conteudo_zip: bytes) -> tuple[list[str], "csv.reader"]:
    """Zip do SICONV tem 1 arquivo dentro, mas o nome nem sempre bate com o
    nome do zip (ex. siconv_plano_aplicacao.csv.zip -> contem
    siconv_plano_aplicacao_detalhado.csv) -- pega sempre o primeiro (e unico)
    membro, nao assume nome."""
    zf = zipfile.ZipFile(io.BytesIO(conteudo_zip))
    membro = zf.namelist()[0]
    texto = io.TextIOWrapper(zf.open(membro), encoding="utf-8-sig", newline="")
    leitor = csv.reader(texto, delimiter=";")
    cabecalho = next(leitor)
    return cabecalho, leitor


def _filtrar_por_numero_convenio(nome: str, numeros: set[str]) -> list[dict[str, str]]:
    print(f"Baixando {nome}.csv.zip...")
    cabecalho, leitor = _linhas_csv_do_zip(_baixar_zip(nome))
    idx_convenio = cabecalho.index("NR_CONVENIO")
    n_campos = len(cabecalho)
    registros = []
    for linha in leitor:
        if len(linha) > n_campos:
            # campo de texto livre no final (ex. JUSTIFICATIVA_TA) com ";"
            # nao escapado -- reagrupa o excedente no ultimo campo.
            linha = linha[: n_campos - 1] + [";".join(linha[n_campos - 1 :])]
        if len(linha) < n_campos:
            continue  # linha truncada/corrompida -- descarta, nunca inventa campo
        if linha[idx_convenio] in numeros:
            registros.append(dict(zip(cabecalho, linha)))
    print(f"   {len(registros)} linha(s) de {nome}.")
    return registros


def _filtrar_plano_aplicacao_por_id_proposta(ids_proposta: set[str]) -> list[dict[str, str]]:
    """`siconv_plano_aplicacao.csv.zip` e o maior arquivo do dump (~280MB
    comprimido, >1GB descomprimido) -- filtra em streaming, nunca materializa
    o CSV inteiro na memoria."""
    print("Baixando siconv_plano_aplicacao.csv.zip (maior arquivo, pode demorar)...")
    cabecalho, leitor = _linhas_csv_do_zip(_baixar_zip("siconv_plano_aplicacao"))
    idx_proposta = cabecalho.index("ID_PROPOSTA")
    registros = []
    for linha in leitor:
        if len(linha) != len(cabecalho):
            continue
        if linha[idx_proposta] in ids_proposta:
            registros.append(dict(zip(cabecalho, linha)))
    print(f"   {len(registros)} item(ns) de plano de aplicacao.")
    return registros


def _filtrar_programa_proposta_por_id_proposta(ids_proposta: set[str]) -> dict[str, str]:
    """siconv_programa_proposta.csv: 1 linha por (ID_PROPOSTA, ID_PROGRAMA).
    Devolve so o PRIMEIRO ID_PROGRAMA achado por proposta -- na pratica uma
    proposta tem 1 so (confirmado nos 2 convenios de teste), mas o arquivo
    fonte pode ter mais de 1 linha pra mesma proposta (regiao/UF
    duplicada), entao usa o primeiro e ignora o resto em vez de decidir
    qual e "o certo"."""
    print("Baixando siconv_programa_proposta.csv.zip...")
    cabecalho, leitor = _linhas_csv_do_zip(_baixar_zip("siconv_programa_proposta"))
    idx_prop = cabecalho.index("ID_PROPOSTA")
    idx_prog = cabecalho.index("ID_PROGRAMA")
    programa_de_proposta: dict[str, str] = {}
    for linha in leitor:
        if len(linha) != len(cabecalho):
            continue
        if linha[idx_prop] in ids_proposta and linha[idx_prop] not in programa_de_proposta:
            programa_de_proposta[linha[idx_prop]] = linha[idx_prog]
    print(f"   {len(programa_de_proposta)} proposta(s) com programa resolvido.")
    return programa_de_proposta


def _filtrar_programa_por_id(ids_programa: set[str]) -> dict[str, dict[str, str]]:
    """siconv_programa.csv: catalogo, mas com linha duplicada por
    regiao/UF pro mesmo ID_PROGRAMA (confirmado -- mesmo NOME_PROGRAMA
    repetido) -- guarda so a primeira ocorrencia de cada ID_PROGRAMA."""
    print("Baixando siconv_programa.csv.zip...")
    cabecalho, leitor = _linhas_csv_do_zip(_baixar_zip("siconv_programa"))
    idx_id = cabecalho.index("ID_PROGRAMA")
    programas: dict[str, dict[str, str]] = {}
    for linha in leitor:
        if len(linha) != len(cabecalho):
            continue
        if linha[idx_id] in ids_programa and linha[idx_id] not in programas:
            programas[linha[idx_id]] = dict(zip(cabecalho, linha))
    print(f"   {len(programas)} programa(s) resolvido(s).")
    return programas


def run() -> None:
    numeros = _numeros_convenio()
    numeros_set = set(numeros)
    print(f"Filtrando dump SICONV pelos {len(numeros)} numero(s) de convenio ja validados...")

    por_arquivo = {nome: _filtrar_por_numero_convenio(nome, numeros_set) for nome in ARQUIVOS}

    ids_proposta = {c["ID_PROPOSTA"] for c in por_arquivo["siconv_convenio"] if c.get("ID_PROPOSTA")}
    itens_plano = _filtrar_plano_aplicacao_por_id_proposta(ids_proposta)

    # Programa -- achado 2026-09-08, exato por ID_PROPOSTA (ver docstring
    # do modulo). Resolve em 2 passos: proposta -> id_programa -> nome.
    programa_de_proposta = _filtrar_programa_proposta_por_id_proposta(ids_proposta)
    programas_por_id = _filtrar_programa_por_id(set(programa_de_proposta.values()))

    # Agrupa tudo por NR_CONVENIO (chave em comum de quase toda tabela --
    # plano_aplicacao/programa entram via ID_PROPOSTA, resolvido no dict `convenio_de_proposta`).
    convenio_de_proposta = {c["ID_PROPOSTA"]: c["NR_CONVENIO"] for c in por_arquivo["siconv_convenio"]}
    itens_por_convenio: dict[str, list[dict]] = {}
    for item in itens_plano:
        nr = convenio_de_proposta.get(item["ID_PROPOSTA"])
        if nr:
            itens_por_convenio.setdefault(nr, []).append(item)

    resultado = []
    for convenio in por_arquivo["siconv_convenio"]:
        nr = convenio["NR_CONVENIO"]
        id_programa = programa_de_proposta.get(convenio.get("ID_PROPOSTA", ""))
        resultado.append({
            "convenio": convenio,
            "programa": programas_por_id.get(id_programa) if id_programa else None,
            "empenhos": [e for e in por_arquivo["siconv_empenho"] if e["NR_CONVENIO"] == nr],
            "desembolsos": [d for d in por_arquivo["siconv_desembolso"] if d["NR_CONVENIO"] == nr],
            "licitacoes": [l for l in por_arquivo["siconv_licitacao"] if l["NR_CONVENIO"] == nr],
            "termos_aditivos": [t for t in por_arquivo["siconv_termo_aditivo"] if t["NR_CONVENIO"] == nr],
            "itens_plano_aplicacao": itens_por_convenio.get(nr, []),
        })

    SAIDA_JSON.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_JSON.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")

    faltantes = numeros_set - {c["convenio"]["NR_CONVENIO"] for c in resultado}
    print(f"\nConcluido: {len(resultado)}/{len(numeros)} convenio(s) encontrado(s) no dump SICONV.")
    if faltantes:
        print(f"   [AVISO] nao encontrados: {sorted(faltantes)}")
    print(f"Gravado em {SAIDA_JSON}")


if __name__ == "__main__":
    run()
