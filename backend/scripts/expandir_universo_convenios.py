"""Estende `convenios_flat.json` (o arquivo que `coletar_siconv_legado.py`,
`coletar_transferegov_relacional.py` e a pagina /monitoramento-equipamentos
leem) com numeros de convenio novos -- hoje, os achados de
`levantamento_convenios_oncologia.py` (322 convenios com item de
equipamento oncologico no dump nacional do SICONV, contra os 209 ja
conhecidos antes).

`convenios_flat.json` nao tinha nenhum script que o gerasse (achado
2026-09-08 -- so era lido por outros 2 scripts, nunca escrito por nenhum;
o arquivo veio de uma transformacao manual de sessao anterior). Esse script
fecha essa lacuna: busca no Portal da Transparencia (/convenios/numero) so
os numeros que AINDA NAO estao no arquivo, achata pro mesmo formato
(ConvenioPortal no frontend) e faz merge -- idempotente, roda de novo sem
duplicar nem re-buscar o que ja tem.

Uso: python -m scripts.expandir_universo_convenios (de dentro de backend/,
venv ativo, com PORTAL_TRANSPARENCIA_API_KEY no .env).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from app.pipeline import portal_transparencia

DIR_SAIDA = Path(__file__).parent / "output"
CONVENIOS_FLAT = DIR_SAIDA / "convenios_flat.json"


def _achatar(dado: dict) -> dict:
    """Mesmo formato que convenios_flat.json ja usa (ConvenioPortal no
    frontend) -- ver docstring de app/pipeline/portal_transparencia.py pro
    porque do sigla/nome trocado em `uf`."""
    convenente = dado.get("convenente") or {}
    municipio = dado.get("municipioConvenente") or {}
    uf = municipio.get("uf") or {}
    orgao = dado.get("orgao") or {}
    unidade_gestora = dado.get("unidadeGestora") or {}
    subfuncao = dado.get("subfuncao") or {}
    funcao = subfuncao.get("funcao") or {}
    tipo_instrumento = dado.get("tipoInstrumento") or {}
    dim = dado.get("dimConvenio") or {}
    return {
        "numero": dim.get("codigo"),
        "numero_instrumento": dim.get("numero"),
        "objeto": dim.get("objeto"),
        "situacao": dado.get("situacao"),
        "data_publicacao": dado.get("dataPublicacao"),
        "data_inicio_vigencia": dado.get("dataInicioVigencia"),
        "data_final_vigencia": dado.get("dataFinalVigencia"),
        "data_conclusao": dado.get("dataConclusao"),
        "data_ultima_liberacao": dado.get("dataUltimaLiberacao"),
        "convenente_nome": convenente.get("nome"),
        "convenente_cnpj": convenente.get("cnpjFormatado"),
        "convenente_tipo": convenente.get("tipo"),
        "municipio": municipio.get("nomeIBGE"),
        "codigo_ibge": municipio.get("codigoIBGE"),
        "uf": uf.get("nome"),  # sic -- API troca sigla/nome, ver docstring acima
        "regiao": municipio.get("nomeRegiao"),
        "orgao": orgao.get("nome"),
        "unidade_gestora": unidade_gestora.get("nome"),
        "subfuncao": subfuncao.get("descricaoSubfuncap"),
        "funcao": funcao.get("descricaoFuncao"),
        "tipo_instrumento": tipo_instrumento.get("descricao"),
        "valor": dado.get("valor"),
        "valor_liberado": dado.get("valorLiberado"),
        "valor_contrapartida": dado.get("valorContrapartida"),
        "valor_ultima_liberacao": dado.get("valorDaUltimaLiberacao"),
        "numero_processo": dado.get("numeroProcesso"),
    }


def expandir(numeros_novos: set[str]) -> None:
    atuais = json.loads(CONVENIOS_FLAT.read_text(encoding="utf-8")) if CONVENIOS_FLAT.exists() else []
    numeros_atuais = {c["numero"] for c in atuais}
    faltando = sorted(numeros_novos - numeros_atuais)
    print(f"Ja tinha {len(numeros_atuais)} convenio(s). Faltam buscar {len(faltando)}.")

    session = portal_transparencia._sessao_com_retry()
    encontrados, nao_encontrados, com_erro = 0, [], []
    for i, numero in enumerate(faltando, 1):
        try:
            dado = portal_transparencia.buscar_convenio_por_numero(numero, session=session)
        except Exception as e:
            com_erro.append((numero, str(e)))
            continue
        if dado is None:
            nao_encontrados.append(numero)
            continue
        atuais.append(_achatar(dado))
        encontrados += 1
        if i % 25 == 0:
            print(f"   [{i}/{len(faltando)}] ...")
        time.sleep(0.15)

    print(f"Encontrados: {encontrados}. Nao encontrados: {len(nao_encontrados)}. Com erro: {len(com_erro)}.")
    if nao_encontrados:
        print(f"   [AVISO] nao encontrados no Portal da Transparencia: {nao_encontrados}")
    if com_erro:
        print(f"   [AVISO] erro de consulta: {com_erro}")

    CONVENIOS_FLAT.write_text(json.dumps(atuais, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Gravado: {len(atuais)} convenio(s) total em {CONVENIOS_FLAT}")


def run() -> None:
    equip = json.loads((DIR_SAIDA / "levantamento_equipamento_por_convenio.json").read_text(encoding="utf-8"))
    numeros = {c["nr_convenio"] for lista in equip.values() for c in lista}
    print(f"{len(numeros)} numero(s) de convenio no levantamento de equipamento (todos os anos).")
    expandir(numeros)


if __name__ == "__main__":
    run()
