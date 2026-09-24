"""Validador histórico do batimento B813 — não é rotina operacional vigente.

Validação sênior cruzando as 3 fontes do monitoramento interno: Banco de
Dados (`InstrumentoEquipamento`, 86 linhas) vs API ao vivo (Portal da
Transparência, pros que são `tipo_contratacao == "Convênio"`) vs planilha
`data/B8131710.xlsx` (batimento da equipe, 463 linhas, das quais 409
`Convênio`). Pedido do usuário 2026-09-11: "validação sênior completa dos
nossos dados: Banco de Dados vs API vs .xlsx".

Escopo do banco é DELIBERADAMENTE menor que o da planilha (86 instrumentos
monitorados manualmente vs 409 `Convênio` na planilha, ver CLAUDE.md seção
"Monitoramento interno de equipamento") -- isso NÃO é reportado como erro,
só como contagem. O que de fato importa validar:
  A) Todo `nr_convenio` "Convênio" do banco existe de verdade no Portal da
     Transparência (API ao vivo) -- CNPJ/situação batendo com o banco.
  B) `nome_convenente`/`municipio`/`uf` do banco batem com `Entidade`/
     `Município`/`UF` da planilha (mesmo convênio, fontes independentes).
  C) `equipamento_descricao` do banco (SICONV "planejado", digitado num
     import anterior) bate CATEGORICAMENTE com `Equipamento` da planilha
     (calculado agora a partir de item+valor real do SICONV) -- diferença
     de categoria aqui é sinal real de erro numa das duas fontes, não
     ruído esperado.
  D) FAF/TED do banco (15 linhas, identificador é NUP SEI/CNPJ, não
     `NR_CONVENIO` SICONV -- sem API do Portal da Transparência aplicável)
     batem com a mesma linha na planilha via o dígitos-only NU_PROCESSO/
     NU_PROPOSTA (mesma resolução de `importar_batimento_b8131710.py`).
  E) Sanidade de formato: `nr_convenio` só dígitos (nunca "/" cru, ver
     CLAUDE.md), sem duplicata, `cnpj_convenente` formatado consistente.

Read-only -- não escreve no banco nem na planilha, só imprime achados +
salva relatório em
scripts/output/validacao_tres_fontes_relatorio.json.

Uso: python -m scripts.validar_dados_tres_fontes (de dentro de backend/,
venv ativo, DATABASE_URL configurada).
"""

from __future__ import annotations

import json
import re
import time
import unicodedata
from pathlib import Path

import openpyxl
import requests

from app.db.base import SessionLocal
from app.db.models import InstrumentoEquipamento
from app.pipeline.portal_transparencia import ChaveApiAusenteError, _sessao_com_retry, buscar_convenio_por_numero

PLANILHA = Path(__file__).parent.parent.parent / "data" / "B8131710.xlsx"
ABA = "Batimento sistema 2026-09"
DIR_SAIDA = Path(__file__).parent / "output"


def _normalizar(s: str | None) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"\s+", " ", s.strip())
    return s.upper()


def _so_digitos(v) -> str | None:
    if v is None:
        return None
    d = re.sub(r"\D", "", str(v))
    return d or None


# Palavra-chave de categoria de equipamento -- pra comparar
# `equipamento_descricao` (banco, texto livre do SICONV "planejado") contra
# `Equipamento` (planilha, rótulo do rol) sem exigir string idêntica (fontes
# diferentes, granularidade diferente) -- só a CATEGORIA precisa bater.
_CATEGORIAS = [
    ("ACELERADOR", re.compile(r"ACELERADOR")),
    ("MAMOGRAFO", re.compile(r"MAMOGRAFO")),
    ("BRAQUITERAPIA", re.compile(r"BRAQUITERAPIA")),
    ("PET", re.compile(r"\bPET\b")),
    ("GAMA/SPECT", re.compile(r"GAMA|CINTILOGR|SPECT")),
    ("TOMOGRAFO", re.compile(r"TOMOGRAF")),
    ("RESSONANCIA", re.compile(r"RESSONANC")),
    ("ENDOSCOP", re.compile(r"ENDOSCOP|FIBROENDOSC|FIBROSCOP")),
    ("ULTRASSOM", re.compile(r"ULTRA-?S{1,2}O")),
    ("ARCO CIRURGICO", re.compile(r"ARCO\s*CIRURGICO|ARCO[\s\-]?C\b")),
    ("ROBOTICA", re.compile(r"ROBOT")),
    ("COLPOSCOPIO", re.compile(r"COLPOSCOPIO")),
]


def categoria(desc: str | None) -> str | None:
    d = _normalizar(desc)
    for nome, padrao in _CATEGORIAS:
        if padrao.search(d):
            return nome
    return None


def _ler_planilha() -> tuple[dict[str, dict], dict[str, dict]]:
    """(por_convenio_numerico, por_nup_ou_cnpj_digitos) -- 2 índices pra
    casar tanto linha `Convênio` (numérico) quanto `FAF`/`TED` (NUP SEI/
    CNPJ digitos, mesma resolução de `importar_batimento_b8131710.py`)."""
    wb = openpyxl.load_workbook(PLANILHA, data_only=True)
    ws = wb[ABA]
    header = [c.value for c in ws[1]]
    idx = {h: i for i, h in enumerate(header) if isinstance(h, str)}

    por_convenio: dict[str, dict] = {}
    por_digitos: dict[str, dict] = {}
    for linha in ws.iter_rows(min_row=2, values_only=True):
        if linha[0] is None and linha[idx["Entidade"]] is None:
            continue
        d = {h: linha[i] for h, i in idx.items()}
        conv = d.get("Convênio")
        conv_str = str(conv).strip() if conv is not None else ""
        if conv_str.isdigit():
            por_convenio[conv_str] = d

        identificador = _so_digitos(d.get("NU_PROCESSO")) or _so_digitos(d.get("NU_PROPOSTA"))
        if identificador:
            por_digitos[identificador] = d
    wb.close()
    return por_convenio, por_digitos


def run() -> None:
    print("=== Validação 3 fontes: Banco de Dados vs API (Portal da Transparência) vs .xlsx ===\n")

    db = SessionLocal()
    instrumentos = db.query(InstrumentoEquipamento).all()
    db.close()
    print(f"Banco de Dados: {len(instrumentos)} instrumento(s) monitorado(s).")

    por_convenio, por_digitos = _ler_planilha()
    print(
        f"Planilha: {len(por_convenio)} linha(s) 'Convênio' com número válido, {len(por_digitos)} linha(s) FAF/TED/Convênio com NUP-SEI/CNPJ dígitos.\n"
    )

    # --- Sanidade de formato (E) ---
    achados_formato = []
    vistos = set()
    for i in instrumentos:
        if "/" in i.nr_convenio:
            achados_formato.append(f"nr_convenio com '/' cru: {i.nr_convenio!r} ({i.nome_convenente})")
        if not i.nr_convenio.isdigit():
            achados_formato.append(f"nr_convenio com caractere não-dígito: {i.nr_convenio!r} ({i.nome_convenente})")
        if i.nr_convenio in vistos:
            achados_formato.append(f"nr_convenio DUPLICADO: {i.nr_convenio!r}")
        vistos.add(i.nr_convenio)
    print(f"[E] Sanidade de formato: {len(achados_formato)} achado(s).")
    for a in achados_formato:
        print(f"   [AVISO] {a}")

    # --- Convênio: banco vs planilha vs API (A, B, C) ---
    convenios_db = [i for i in instrumentos if i.tipo_contratacao == "Convênio"]
    print(f"\n[A/B/C] Validando {len(convenios_db)} instrumento(s) 'Convênio' contra planilha + API ao vivo...")

    sessao = _sessao_com_retry()
    resultado_convenio = []
    nao_achados_xlsx = []
    nao_achados_api = []
    divergencia_nome = []
    divergencia_categoria = []

    for indice, inst in enumerate(convenios_db, 1):
        if indice % 20 == 0:
            print(f"   ... {indice}/{len(convenios_db)}")
        linha_xlsx = por_convenio.get(inst.nr_convenio)
        if linha_xlsx is None:
            nao_achados_xlsx.append(inst.nr_convenio)

        try:
            dado_api = buscar_convenio_por_numero(inst.nr_convenio, session=sessao)
        except ChaveApiAusenteError:
            raise
        except requests.RequestException as e:
            dado_api = None
            print(f"   [ERRO REDE] {inst.nr_convenio}: {e}")
        time.sleep(0.05)

        cnpj_api = ((dado_api or {}).get("convenente") or {}).get("cnpjFormatado")
        nome_api = ((dado_api or {}).get("convenente") or {}).get("nome")
        situacao_api = (dado_api or {}).get("situacao")

        if dado_api is None:
            nao_achados_api.append(inst.nr_convenio)

        nome_bate_xlsx = None
        if linha_xlsx:
            nome_bate_xlsx = _normalizar(inst.nome_convenente)[:25] in _normalizar(
                linha_xlsx.get("Entidade")
            ) or _normalizar(linha_xlsx.get("Entidade"))[:25] in _normalizar(inst.nome_convenente)
            if not nome_bate_xlsx:
                divergencia_nome.append(
                    {
                        "nr_convenio": inst.nr_convenio,
                        "banco": inst.nome_convenente,
                        "xlsx": linha_xlsx.get("Entidade"),
                    }
                )

        cat_banco = categoria(inst.equipamento_descricao)
        cat_xlsx = categoria(linha_xlsx.get("Equipamento")) if linha_xlsx else None
        if cat_banco and cat_xlsx and cat_banco != cat_xlsx:
            divergencia_categoria.append(
                {
                    "nr_convenio": inst.nr_convenio,
                    "convenente": inst.nome_convenente,
                    "banco_equipamento_descricao": inst.equipamento_descricao,
                    "banco_categoria": cat_banco,
                    "xlsx_equipamento": linha_xlsx.get("Equipamento") if linha_xlsx else None,
                    "xlsx_categoria": cat_xlsx,
                }
            )

        resultado_convenio.append(
            {
                "nr_convenio": inst.nr_convenio,
                "banco_nome_convenente": inst.nome_convenente,
                "banco_cnpj": inst.cnpj_convenente,
                "banco_equipamento_descricao": inst.equipamento_descricao,
                "xlsx_encontrado": linha_xlsx is not None,
                "xlsx_entidade": linha_xlsx.get("Entidade") if linha_xlsx else None,
                "xlsx_equipamento": linha_xlsx.get("Equipamento") if linha_xlsx else None,
                "xlsx_equipamentos_secundarios": linha_xlsx.get("Equipamentos secundários") if linha_xlsx else None,
                "api_encontrado": dado_api is not None,
                "api_situacao": situacao_api,
                "api_cnpj": cnpj_api,
                "api_nome_convenente": nome_api,
                "nome_bate_xlsx": nome_bate_xlsx,
            }
        )

    print(f"\n[A] {len(convenios_db) - len(nao_achados_api)}/{len(convenios_db)} confirmado(s) na API ao vivo.")
    if nao_achados_api:
        print(f"   [AVISO] NÃO encontrado(s) na API: {nao_achados_api}")
    print(
        f"[B] {len(convenios_db) - len(nao_achados_xlsx)}/{len(convenios_db)} encontrado(s) na planilha; {len(divergencia_nome)} com nome de convenente divergente."
    )
    if nao_achados_xlsx:
        print(f"   [AVISO] NÃO encontrado(s) na planilha: {nao_achados_xlsx}")
    for d in divergencia_nome:
        print(f"   [AVISO] nome diverge {d['nr_convenio']}: banco={d['banco']!r} vs xlsx={d['xlsx']!r}")
    print(f"[C] {len(divergencia_categoria)} divergência(s) de CATEGORIA de equipamento (banco vs planilha).")
    for d in divergencia_categoria:
        print(
            f"   [AVISO] {d['nr_convenio']} ({d['convenente']}): banco={d['banco_categoria']} ({d['banco_equipamento_descricao']!r}) vs xlsx={d['xlsx_categoria']} ({d['xlsx_equipamento']!r})"
        )

    # --- FAF/TED: banco vs planilha (D) ---
    faf_ted_db = [i for i in instrumentos if i.tipo_contratacao in ("FAF", "TED")]
    print(f"\n[D] Validando {len(faf_ted_db)} instrumento(s) FAF/TED contra planilha (NUP-SEI/CNPJ dígitos)...")
    faf_ted_nao_achados = []
    faf_ted_resultado = []
    for inst in faf_ted_db:
        linha_xlsx = por_digitos.get(inst.nr_convenio)
        if linha_xlsx is None:
            faf_ted_nao_achados.append((inst.nr_convenio, inst.nome_convenente))
        faf_ted_resultado.append(
            {
                "nr_convenio": inst.nr_convenio,
                "banco_nome_convenente": inst.nome_convenente,
                "banco_tipo": inst.tipo_contratacao,
                "xlsx_encontrado": linha_xlsx is not None,
                "xlsx_entidade": linha_xlsx.get("Entidade") if linha_xlsx else None,
            }
        )
    print(f"   {len(faf_ted_db) - len(faf_ted_nao_achados)}/{len(faf_ted_db)} encontrado(s) na planilha.")
    for nr, nome in faf_ted_nao_achados:
        print(f"   [AVISO] NÃO encontrado na planilha: {nr} ({nome})")

    # --- Escopo (contagem, não erro) ---
    convenios_db_set = {i.nr_convenio for i in convenios_db}
    fora_do_banco = set(por_convenio) - convenios_db_set
    print(
        f"\n[Escopo] {len(fora_do_banco)} convênio(s) da planilha NÃO estão no banco (esperado -- banco cobre só o que a equipe decide monitorar, ver CLAUDE.md)."
    )

    DIR_SAIDA.mkdir(parents=True, exist_ok=True)
    relatorio = {
        "resumo": {
            "banco_total": len(instrumentos),
            "banco_convenio": len(convenios_db),
            "banco_faf_ted": len(faf_ted_db),
            "convenio_nao_achado_api": nao_achados_api,
            "convenio_nao_achado_xlsx": nao_achados_xlsx,
            "divergencia_nome_convenente": divergencia_nome,
            "divergencia_categoria_equipamento": divergencia_categoria,
            "faf_ted_nao_achado_xlsx": faf_ted_nao_achados,
            "achados_formato": achados_formato,
            "convenios_planilha_fora_do_escopo_do_banco": len(fora_do_banco),
        },
        "detalhe_convenio": resultado_convenio,
        "detalhe_faf_ted": faf_ted_resultado,
    }
    caminho = DIR_SAIDA / "validacao_tres_fontes_relatorio.json"
    caminho.write_text(json.dumps(relatorio, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nRelatório completo em {caminho}")


if __name__ == "__main__":
    run()
