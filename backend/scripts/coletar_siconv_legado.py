"""Baixa e filtra o dump CSV bulk do SICONV legado na fonte oficial atual
(api-publica.transferegov.gestao.gov.br/downloads) pelos numeros de convenio do
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

Fonte substituída conforme Comunicado Transferegov 23/2026; o endereço antigo
continuava respondendo HTTP 200 com arquivos de julho. Não usar como fallback.
Nomes remotos são mapeados em scripts/fontes_siconv.py, inclusive o plano
de aplicação detalhado; nomes lógicos abaixo preservam o contrato interno.
Tabelas relevantes pro monitoramento de equipamento:
  siconv_convenio.csv          -- 1 linha por convenio (situacao, valores agregados, saldo em conta)
  siconv_empenho.csv           -- N por convenio, keyed por NR_CONVENIO (ID_EMPENHO, NR_EMPENHO)
  siconv_desembolso.csv        -- N por convenio (ID_DESEMBOLSO, valor e data de cada repasse)
  siconv_licitacao.csv         -- N por convenio (ID_LICITACAO, modalidade, valor, status)
  siconv_termo_aditivo.csv     -- N por convenio (ID_SOLICITACAO, alteracoes de valor/prazo)
  siconv_pagamento.csv         -- N por convenio, keyed por NR_CONVENIO -- quem recebeu (
                                   NOME_FORNECEDOR, IDENTIF_FORNECEDOR ja mascarado na fonte,
                                   ex. "***54671***"), quanto (VL_PAGO) e quando (DATA_PAG).
                                   Achado 2026-09-09 a pedido do usuario ("o valor pago ao
                                   fornecedor?"). ~344MB comprimido, ~7,36 milhoes de linha
                                   nacional -- confirmado real contra os 403 convenios: 1.600
                                   pagamento(s) em 290 convenios, soma bate de perto com
                                   VL_DESEMBOLSADO_CONV (ex. convenio 895596: soma pagamentos
                                   R$5.791.640,07 vs desembolsado R$5.791.631,80).
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
ativo). Baixa ~650MB no total na 1a vez (siconv_plano_aplicacao ~280MB +
siconv_pagamento ~344MB sao os maiores) -- pode demorar alguns minutos,
depois fica em cache local (scripts/output/cache/transferegov_atual/). Grava em
scripts/output/siconv_legado.json.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import uuid4

import requests

from scripts.fontes_siconv import url_arquivo

TIMEOUT = 300

ARQUIVOS = [
    "siconv_convenio",
    "siconv_empenho",
    "siconv_desembolso",
    "siconv_licitacao",
    "siconv_termo_aditivo",
    "siconv_pagamento",
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


# Namespace novo impede reaproveitar silenciosamente o cache do endpoint
# substituído. O cache histórico é preservado, mas não usado pela fonte atual.
DIR_CACHE = Path(__file__).parent / "output" / "cache" / "transferegov_atual"


def _sessao_com_retry() -> requests.Session:
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    session = requests.Session()
    retry = Retry(total=5, backoff_factor=3, status_forcelist=[429, 500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _baixar_zip(nome: str, *, atualizar_cache: bool = False, diretorio_cache: Path | None = None) -> bytes:
    """Cache local em scripts/output/cache/transferegov_atual/ (compartilhado com
    levantamento_convenios_oncologia.py) -- siconv_plano_aplicacao.csv.zip
    e siconv_pagamento.csv.zip sozinhos sao ~280-340MB, sem necessidade de
    rebaixar toda vez que o universo de convenios
    (scripts/output/convenios_flat.json) cresce. Baixa em streaming com
    retry (achado 2026-09-09: `requests.get(...).content` de uma vez cai
    com timeout/broken pipe em arquivo desse tamanho -- resolvido baixando
    em chunk pra disco, como `curl --retry` ja fazia manualmente)."""
    url_arquivo(nome)  # Valida catálogo também antes da leitura de cache local.
    cache = diretorio_cache if diretorio_cache is not None else DIR_CACHE
    caminho = cache / f"{nome}.csv.zip"
    if caminho.exists() and not atualizar_cache:
        print(f"   (cache) {nome}.csv.zip ja baixado.")
        return caminho.read_bytes()
    cache.mkdir(parents=True, exist_ok=True)
    # Retry do HTTPAdapter não alcança iter_content: uma queda após os
    # headers exige reiniciar o corpo inteiro, nunca anexar ao arquivo parcial.
    # Pasta exclusiva evita colisão entre jobs e mantém o último ZIP íntegro.
    with TemporaryDirectory(prefix=".siconv-download-", dir=cache) as temporario:
        destino = Path(temporario) / "snapshot.zip"
        for tentativa in range(3):
            try:
                _transferir_zip(nome, destino)
                break
            except (requests.exceptions.ChunkedEncodingError, requests.ConnectionError, requests.Timeout):
                if tentativa == 2:
                    raise
        with zipfile.ZipFile(destino) as arquivo:
            if not arquivo.namelist() or arquivo.testzip() is not None:
                raise ValueError(f"ZIP inválido recebido para {nome}")
        destino.replace(caminho)
    return caminho.read_bytes()


def _transferir_zip(nome: str, destino: Path) -> None:
    from scripts.download_siconv import transferir_zip

    # O proxy respondeu com arquivo de ontem mesmo com no-cache. Identificador
    # opaco por transferência evita cache compartilhado, sem dados do usuário;
    # permanece igual entre partes/fallback para não alterar sua identidade.
    url = f"{url_arquivo(nome)}?sigeo_snapshot={uuid4().hex}"
    with _sessao_com_retry() as sessao:
        transferir_zip(url=url, destino=destino, sessao=sessao, timeout=TIMEOUT)


@contextmanager
def _linhas_csv_do_zip(
    conteudo_zip: bytes, *, justificativa_ta: bool = False
) -> Iterator[tuple[list[str], Iterator[list[str]]]]:
    """CSV único e estrito; recurso fechado inclusive quando a leitura falha."""
    with zipfile.ZipFile(io.BytesIO(conteudo_zip)) as arquivo:
        membros = [nome for nome in arquivo.namelist() if not nome.endswith("/")]
        if len(membros) != 1 or not membros[0].lower().endswith(".csv"):
            raise ValueError("Snapshot SICONV deve conter exatamente um CSV.")
        with arquivo.open(membros[0]) as binario, io.TextIOWrapper(binario, encoding="utf-8-sig", newline="") as texto:
            leitor = csv.reader(texto, delimiter=";", strict=True)
            cabecalho = next(leitor, [])
            if not cabecalho or any(not nome.strip() for nome in cabecalho) or len(set(cabecalho)) != len(cabecalho):
                raise ValueError("Cabeçalho SICONV ausente, vazio ou duplicado.")

            def linhas_validas() -> Iterator[list[str]]:
                for linha in leitor:
                    # Única reparação histórica documentada: texto livre final
                    # de JUSTIFICATIVA_TA, nunca deslocar campos de outra tabela.
                    if justificativa_ta and cabecalho[-1] == "JUSTIFICATIVA_TA" and len(linha) > len(cabecalho):
                        linha = linha[: len(cabecalho) - 1] + [";".join(linha[len(cabecalho) - 1 :])]
                    if len(linha) != len(cabecalho):
                        raise ValueError("Snapshot SICONV contém linha truncada ou ambígua.")
                    yield linha

            yield cabecalho, linhas_validas()


def _filtrar_por_numero_convenio(
    nome: str, numeros: set[str], *, atualizar_cache: bool = False
) -> list[dict[str, str]]:
    registros: list[dict[str, str]] = []
    if not numeros:
        return registros
    print(f"Baixando {nome}.csv.zip...")
    with _linhas_csv_do_zip(
        _baixar_zip(nome, atualizar_cache=atualizar_cache), justificativa_ta=nome == "siconv_termo_aditivo"
    ) as (cabecalho, leitor):
        idx_convenio = cabecalho.index("NR_CONVENIO")
        for linha in leitor:
            if linha[idx_convenio] in numeros:
                registros.append(dict(zip(cabecalho, linha, strict=True)))
    print(f"   {len(registros)} linha(s) de {nome}.")
    return registros


def _filtrar_plano_aplicacao_por_id_proposta(
    ids_proposta: set[str], *, atualizar_cache: bool = False
) -> list[dict[str, str]]:
    """`siconv_plano_aplicacao.csv.zip` e o maior arquivo do dump (~280MB
    comprimido, >1GB descomprimido) -- filtra em streaming, nunca materializa
    o CSV inteiro na memoria."""
    registros: list[dict[str, str]] = []
    if not ids_proposta:
        return registros
    print("Baixando siconv_plano_aplicacao.csv.zip (maior arquivo, pode demorar)...")
    with _linhas_csv_do_zip(_baixar_zip("siconv_plano_aplicacao", atualizar_cache=atualizar_cache)) as (
        cabecalho,
        leitor,
    ):
        idx_proposta = cabecalho.index("ID_PROPOSTA")
        for linha in leitor:
            if linha[idx_proposta] in ids_proposta:
                registros.append(dict(zip(cabecalho, linha, strict=True)))
    print(f"   {len(registros)} item(ns) de plano de aplicacao.")
    return registros


def _filtrar_programa_proposta_por_id_proposta(ids_proposta: set[str]) -> dict[str, str]:
    """siconv_programa_proposta.csv: 1 linha por (ID_PROPOSTA, ID_PROGRAMA).
    Devolve so o PRIMEIRO ID_PROGRAMA achado por proposta -- na pratica uma
    proposta tem 1 so (confirmado nos 2 convenios de teste), mas o arquivo
    fonte pode ter mais de 1 linha pra mesma proposta (regiao/UF
    duplicada), entao usa o primeiro e ignora o resto em vez de decidir
    qual e "o certo"."""
    programa_de_proposta: dict[str, str] = {}
    if not ids_proposta:
        return programa_de_proposta
    print("Baixando siconv_programa_proposta.csv.zip...")
    with _linhas_csv_do_zip(_baixar_zip("siconv_programa_proposta")) as (cabecalho, leitor):
        idx_prop = cabecalho.index("ID_PROPOSTA")
        idx_prog = cabecalho.index("ID_PROGRAMA")
        for linha in leitor:
            if linha[idx_prop] in ids_proposta and linha[idx_prop] not in programa_de_proposta:
                programa_de_proposta[linha[idx_prop]] = linha[idx_prog]
    print(f"   {len(programa_de_proposta)} proposta(s) com programa resolvido.")
    return programa_de_proposta


def _filtrar_programa_por_id(ids_programa: set[str]) -> dict[str, dict[str, str]]:
    """siconv_programa.csv: catalogo, mas com linha duplicada por
    regiao/UF pro mesmo ID_PROGRAMA (confirmado -- mesmo NOME_PROGRAMA
    repetido) -- guarda so a primeira ocorrencia de cada ID_PROGRAMA."""
    programas: dict[str, dict[str, str]] = {}
    if not ids_programa:
        return programas
    print("Baixando siconv_programa.csv.zip...")
    with _linhas_csv_do_zip(_baixar_zip("siconv_programa")) as (cabecalho, leitor):
        idx_id = cabecalho.index("ID_PROGRAMA")
        for linha in leitor:
            if linha[idx_id] in ids_programa and linha[idx_id] not in programas:
                programas[linha[idx_id]] = dict(zip(cabecalho, linha, strict=True))
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
    itens_por_convenio: dict[str, list[dict[str, str]]] = {}
    for item in itens_plano:
        nr = convenio_de_proposta.get(item["ID_PROPOSTA"])
        if nr:
            itens_por_convenio.setdefault(nr, []).append(item)

    resultado: list[dict[str, Any]] = []
    for convenio in por_arquivo["siconv_convenio"]:
        nr = convenio["NR_CONVENIO"]
        id_programa = programa_de_proposta.get(convenio.get("ID_PROPOSTA", ""))
        resultado.append(
            {
                "convenio": convenio,
                "programa": programas_por_id.get(id_programa) if id_programa else None,
                "empenhos": [e for e in por_arquivo["siconv_empenho"] if e["NR_CONVENIO"] == nr],
                "desembolsos": [d for d in por_arquivo["siconv_desembolso"] if d["NR_CONVENIO"] == nr],
                "licitacoes": [
                    licitacao for licitacao in por_arquivo["siconv_licitacao"] if licitacao["NR_CONVENIO"] == nr
                ],
                "termos_aditivos": [t for t in por_arquivo["siconv_termo_aditivo"] if t["NR_CONVENIO"] == nr],
                "pagamentos": [p for p in por_arquivo["siconv_pagamento"] if p["NR_CONVENIO"] == nr],
                "itens_plano_aplicacao": itens_por_convenio.get(nr, []),
            }
        )

    SAIDA_JSON.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_JSON.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")

    faltantes = numeros_set - {entrada["convenio"]["NR_CONVENIO"] for entrada in resultado}
    print(f"\nConcluido: {len(resultado)}/{len(numeros)} convenio(s) encontrado(s) no dump SICONV.")
    if faltantes:
        print(f"   [AVISO] nao encontrados: {sorted(faltantes)}")
    print(f"Gravado em {SAIDA_JSON}")


if __name__ == "__main__":
    run()
