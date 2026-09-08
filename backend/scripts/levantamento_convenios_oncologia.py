"""Levantamento nacional de convenios de equipamento/componente oncologico,
SO via API (decisao do usuario 2026-09-03: nao usar a planilha interna da
equipe como base -- so Portal da Transparencia/SICONV/TransfereGov). Fase de
DESCOBERTA pra equipe tecnica avaliar (rede ampla de proposito -- falso
positivo custa uma revisao manual, falso negativo custa nao saber que o
convenio existe).

Pedido original (2026-09-08): convenios que contemplam
  - 2023 (e outros anos, na pratica): 5 equipamentos --
    Acelerador Linear, Mamografo, PET/CT, Gama-camara/SPECT, Braquiterapia
  - 2024/2025/2026: 8 "componentes" de financiamento (REDE DE ATENCAO... /
    Politica Nacional de Prevencao e Controle do Cancer...)

Duas fontes, dois mecanismos bem diferentes:

1) EQUIPAMENTO -- campo `DESCRICAO_ITEM` do dump NACIONAL do SICONV
   (siconv_plano_aplicacao.csv, ~1GB descomprimido, todo o Brasil, nao so
   os convenios ja conhecidos). Cada linha ja e 1 item especifico -- sem o
   problema do "Varios" que a planilha da equipe tinha (quase metade dos
   890 registros la nao discriminava equipamento). Casamento por padrao de
   texto (normalizado, sem acento) -- nao existe uma tabela de codigo
   CATMAT/SIGEM completa que a gente tenha acesso direto, entao o codigo
   numerico prefixado na descricao ("010933-Acelerador Linear...") fica so
   como trilha de auditoria no resultado, nao como chave de busca.

   Cruza com siconv_convenio.csv (mesmo dump) por ID_PROPOSTA -> NR_CONVENIO
   + ANO, pra saber ano/situacao sem precisar de chamada nenhuma ao Portal
   da Transparencia.

2) COMPONENTE -- campo `programa.nm_programa` do TransfereGov (API nova,
   modulo Gestao de Parcerias). Achado tardio (2026-09-08): tem UM programa
   por componente por ANO (id_programa muda a cada ano) -- da pra casar
   EXATO por nome normalizado, nao precisa de aproximacao por texto livre
   em campo de justificativa como se pensou antes. So cobre 2025/2026 --
   2024 ("REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - ...") NAO tem
   `programa` equivalente no TransfereGov (conferido nos 176 programas
   inteiros) -- provavelmente porque esse formato de financiamento so
   comecou a virar `programa` no TransfereGov a partir de 2025. Pra 2024,
   nenhuma das 3 APIs tem campo equivalente (confirmado: Portal da
   Transparencia nao tem `componente` nem no convenio nem nos filtros do
   endpoint de lista `/convenios`; SICONV so tem categoria de despesa
   generica).

   IMPORTANTE sobre a paginacao do TransfereGov: os parametros documentados
   nas respostas (`page_number`, `offset`, `limit`) SAO ENGANOSOS -- so
   devolvem sempre a primeira pagina, nao importa o valor. O parametro que
   realmente pagina e `pagina` (em portugues, nao documentado no corpo da
   resposta). Confirmado ao vivo 2026-09-08 -- sem isso a paginacao "funciona"
   silenciosamente errado (sempre a pagina 1), perdendo 126 dos 176
   `programa` existentes.

Uso: python -m scripts.levantamento_convenios_oncologia (de dentro de
backend/, venv ativo, com PORTAL_TRANSPARENCIA_API_KEY no .env -- so usada
aqui pra log de progresso, a busca em si nao depende dela).

Le do cache local em scripts/output/cache/ se ja existir (baixado antes),
senao baixa (siconv_plano_aplicacao.csv.zip tem ~280MB -- so baixa 1x).
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

import requests

SICONV_BASE_URL = "https://repositorio.dados.gov.br/seges/detru"
TRANSFEREGOV_BASE_URL = "https://api-publica.transferegov.gestao.gov.br/parcerias"
TIMEOUT = 300

DIR_SAIDA = Path(__file__).parent / "output"
DIR_CACHE = DIR_SAIDA / "cache"

# Padroes de equipamento -- texto normalizado (maiusculo, sem acento) contra
# DESCRICAO_ITEM do SICONV. Rede ampla de proposito (fase de descoberta,
# nao de decisao final) -- prefere falso positivo (equipe revisa) a falso
# negativo (convenio nunca aparece pra ninguem ver).
PADROES_EQUIPAMENTO = {
    "Acelerador Linear": re.compile(r"ACELERADOR\s*LINEAR"),
    "Mamografo": re.compile(r"MAMOGRAFO"),
    "PET/CT": re.compile(r"\bPET[\s/\-]*CT\b"),
    "Gama-camara/SPECT": re.compile(r"GAMA\s*C[A]?MARA|C[A]?MARA\s*CINTILOGR[A]?FICA|\bSPECT\b"),
    "Braquiterapia": re.compile(r"BRAQUITERAPIA"),
}

# Palavras-chave pra achar o `programa` certo entre os 176 do TransfereGov --
# so um pre-filtro grosso (nome + objetivo), a lista final de "componente"
# de verdade (as 8 strings pedidas) e conferida a mao contra o nm_programa.
PALAVRAS_PROGRAMA_ONCOLOGIA = ["ONCOL", "CANCER", "CÂNCER", "PRONON", "PRONAS"]

# Os 8 "componente" pedidos pelo usuario (2024 REDE DE ATENCAO... + 2025
# Politica Nacional...). Casamento normalizado (sem acento, espaco unico,
# case-insensitive) contra `nm_programa` -- NAO por id_programa fixo (esses
# IDs mudam a cada ano novo `programa` e criado, e o proprio texto da API
# tem erro de digitacao real, ex. "patológia" em vez de "patológica",
# confirmado 2026-09-08 -- normalizar tambem colapsa isso por prefixo).
COMPONENTES_ALVO = [
    "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - AMBULATORIO PARA DIAGNOSTICO EM ONCOLOGIA",
    "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - HOSPITAL HABILITADO NA ALTA COMPLEXIDADE EM ONCOLOGIA",
    "REDE DE ATENCAO A PESSOA COM DOENCAS CRONICAS - SERVICO DE REFERENCIA PARA O DIAGNOSTICO DO CANCER DE MAMA (SDM)",
    "POLITICA NACIONAL DE PREVENCAO E CONTROLE DO CANCER - AMBULATORIO PARA DIAGNOSTICO EM ONCOLOGIA",
    "POLITICA NACIONAL DE PREVENCAO E CONTROLE DO CANCER - HOSPITAL HABILITADO NA ALTA COMPLEXIDADE EM ONCOLOGIA",
    "POLITICA NACIONAL DE PREVENCAO E CONTROLE DO CANCER - LABORATORIO DE ANATOMIA PATOLOGICA E/OU CITOPATOLOGIA",
    "POLITICA NACIONAL DE PREVENCAO E CONTROLE DO CANCER - SERVICO DE REFERENCIA PARA O DIAGNOSTICO DO CANCER DE MAMA (SDM)",
    "POLITICA NACIONAL DE PREVENCAO E CONTROLE DO CANCER - SERVICO DE REFERENCIA PARA O DIAGNOSTICO DO CANCER DE COLO DO UTERO (SRC)",
]


def _normalizar(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.strip())
    return s.upper()


def _componente_alvo_de(nm_programa: str) -> str | None:
    """Casa `nm_programa` (ja com erro de digitacao real da API as vezes)
    contra COMPONENTES_ALVO por normalizacao + prefixo em comum de pelo
    menos 90% dos caracteres -- tolera "patológia"/"patológica",
    "0 Política" (espaco por hifen perdido na fonte), "NO UTERO"/"DE COLO
    DO UTERO" etc. sem virar match falso com outro componente."""
    alvo_norm = _normalizar(nm_programa)
    # Remove ruido conhecido de formatacao que nao muda o sentido.
    alvo_norm = alvo_norm.replace("ATENCAO ESPECIALIZADA EM SAUDE", "").replace("ATENCAO ESPECIALIZADA A SAUDE", "")
    alvo_norm = re.sub(r"^[\s\-0]+", "", alvo_norm)
    melhor, melhor_score = None, 0.0
    for candidato in COMPONENTES_ALVO:
        # Razao de caracteres em comum (SequenceMatcher, sem dependencia externa).
        import difflib
        score = difflib.SequenceMatcher(None, alvo_norm, candidato).ratio()
        if score > melhor_score:
            melhor, melhor_score = candidato, score
    return melhor if melhor_score >= 0.75 else None


def _sessao_com_retry() -> requests.Session:
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry

    session = requests.Session()
    retry = Retry(total=3, backoff_factor=2, status_forcelist=[429, 500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def _baixar_zip_siconv(nome: str) -> Path:
    caminho = DIR_CACHE / f"{nome}.csv.zip"
    if caminho.exists():
        print(f"   (cache) {nome}.csv.zip ja baixado.")
        return caminho
    print(f"   Baixando {nome}.csv.zip...")
    resp = requests.get(f"{SICONV_BASE_URL}/{nome}.csv.zip", timeout=TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    DIR_CACHE.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(resp.content)
    return caminho


def _linhas_csv_do_zip(caminho: Path):
    zf = zipfile.ZipFile(caminho)
    membro = zf.namelist()[0]
    texto = io.TextIOWrapper(zf.open(membro), encoding="utf-8-sig", newline="")
    leitor = csv.reader(texto, delimiter=";")
    cabecalho = next(leitor)
    return cabecalho, leitor


def levantar_equipamento() -> dict[str, list[dict]]:
    """Varre o dump NACIONAL de itens do SICONV (nao so os convenios ja
    conhecidos) procurando os 5 equipamentos, depois cruza com
    siconv_convenio.csv pra saber NR_CONVENIO/ANO/situacao."""
    print("=== EQUIPAMENTO (dump nacional SICONV) ===")
    caminho_itens = _baixar_zip_siconv("siconv_plano_aplicacao")
    cabecalho, leitor = _linhas_csv_do_zip(caminho_itens)
    idx_desc = cabecalho.index("DESCRICAO_ITEM")

    itens_por_equip: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for linha in leitor:
        total += 1
        if len(linha) != len(cabecalho):
            continue
        desc_norm = _normalizar(linha[idx_desc])
        for equip, padrao in PADROES_EQUIPAMENTO.items():
            if padrao.search(desc_norm):
                itens_por_equip[equip].append(dict(zip(cabecalho, linha)))
                break
    print(f"   {total} linha(s) de item processadas.")

    caminho_convenio = _baixar_zip_siconv("siconv_convenio")
    cab_conv, leitor_conv = _linhas_csv_do_zip(caminho_convenio)
    convenio_por_proposta = {}
    for linha in leitor_conv:
        if len(linha) != len(cab_conv):
            continue
        d = dict(zip(cab_conv, linha))
        if d.get("ID_PROPOSTA"):
            convenio_por_proposta[d["ID_PROPOSTA"]] = d

    resultado: dict[str, list[dict]] = defaultdict(list)
    for equip, itens in itens_por_equip.items():
        vistos = set()
        for item in itens:
            idp = item["ID_PROPOSTA"]
            conv = convenio_por_proposta.get(idp)
            if conv is None or conv["NR_CONVENIO"] in vistos:
                continue
            vistos.add(conv["NR_CONVENIO"])
            resultado[equip].append({
                "nr_convenio": conv["NR_CONVENIO"],
                "ano": conv.get("ANO"),
                "sit_convenio": conv.get("SIT_CONVENIO"),
                "vl_global_conv": conv.get("VL_GLOBAL_CONV"),
                "ug_emitente": conv.get("UG_EMITENTE"),
                "id_proposta": idp,
                "item_descricao": item["DESCRICAO_ITEM"],
                "item_qtd": item.get("QTD_ITEM"),
                "item_valor_unitario": item.get("VALOR_UNITARIO_ITEM"),
                "confianca": "texto",  # nunca "codigo" -- nao temos tabela CATMAT/SIGEM completa
            })
        print(f"   {equip}: {len(resultado[equip])} convenio(s) unico(s)")
    return dict(resultado)


def _paginar_transferegov(endpoint: str, params: dict, sessao: requests.Session) -> list[dict]:
    """`pagina` (portugues) e o parametro que realmente avanca -- os nomes
    `page`/`page_number`/`offset` sao aceitos sem erro mas SEMPRE devolvem a
    pagina 1 (confirmado ao vivo 2026-09-08). Ver docstring do modulo."""
    registros = []
    pagina = 1
    while True:
        resp = sessao.get(f"{TRANSFEREGOV_BASE_URL}/{endpoint}", params={**params, "pagina": pagina, "limit": 50}, timeout=30)
        resp.raise_for_status()
        dados = resp.json()["data"]
        registros.extend(dados)
        if len(dados) < 50:
            break
        pagina += 1
        time.sleep(0.2)
    return registros


def levantar_componente() -> dict:
    """Enumera TODOS os `programa` do TransfereGov, acha os relacionados a
    cancer/oncologia, e busca as propostas de cada um. So cobre 2025/2026 --
    2024 nao tem `programa` equivalente (ver docstring do modulo)."""
    print("\n=== COMPONENTE (programa/proposta do TransfereGov) ===")
    sessao = _sessao_com_retry()
    programas = _paginar_transferegov("programa", {}, sessao)
    print(f"   {len(programas)} programa(s) no total (todos os anos, todos os temas).")

    alvo = [
        p for p in programas
        if any(k in _normalizar((p.get("nm_programa") or "") + " " + (p.get("ds_objetivo") or "")) for k in PALAVRAS_PROGRAMA_ONCOLOGIA)
    ]
    print(f"   {len(alvo)} programa(s) relacionados a cancer/oncologia (pre-filtro amplo).")

    resultado = {}
    for p in sorted(alvo, key=lambda x: (x.get("ano_programa") or 0, x.get("nm_programa") or "")):
        idp = p["id_programa"]
        componente = _componente_alvo_de(p.get("nm_programa") or "")
        propostas = _paginar_transferegov("proposta", {"id_programa": idp}, sessao)
        resultado[idp] = {"programa": p, "componente_alvo": componente, "propostas": propostas}
        marca = "★" if componente else " "
        print(f" {marca} {idp} ({p.get('ano_programa')}) {p.get('nm_programa', '')[:65]:65s} -> {len(propostas)} proposta(s)")
        time.sleep(0.2)
    n_alvo = sum(1 for v in resultado.values() if v["componente_alvo"])
    print(f"   {n_alvo} programa(s) batem com um dos 8 componentes-alvo (★ acima).")
    return resultado


def run() -> None:
    DIR_SAIDA.mkdir(parents=True, exist_ok=True)

    equipamento = levantar_equipamento()
    (DIR_SAIDA / "levantamento_equipamento_por_convenio.json").write_text(
        json.dumps(equipamento, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    componente = levantar_componente()
    (DIR_SAIDA / "levantamento_componente_por_programa.json").write_text(
        json.dumps(componente, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("\nGravado em scripts/output/levantamento_equipamento_por_convenio.json")
    print("Gravado em scripts/output/levantamento_componente_por_programa.json")


if __name__ == "__main__":
    run()
