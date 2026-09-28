"""Carga da tabela `convenio` a partir dos 3 JSON estáticos atuais
(convenios_flat.json/siconv_legado.json/transferegov_relacional.json) --
achado 2026-09-16, pedido do usuário: "vamos parar de usar json estático,
coloque tudo no banco". Substitui o merge client-side de
`frontend/src/lib/mesclar-convenios.ts` (mesma regra de qual fonte vence em
cada campo, replicada aqui em Python) e já grava o CNES resolvido na
mesma carga (ver docstring da função `resolver_cnes` abaixo pro método
completo, validado ao vivo 2026-09-16 contra a base pública do CNES --
357 de 403 confirmados com múltiplos sinais independentes).

Uso: uv run python -m scripts.importar_convenios_banco (de dentro de
backend/, venv ativo, precisa dos 3 JSON em scripts/output/ -- ver
frontend/public/monitoramento-equipamentos/README.md pra como gerá-los).
Idempotente -- upsert por `numero`.
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path
from typing import cast

from sqlalchemy import Table, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento, Convenio
from app.equipamentos import classificar_descricoes, extrair_descricoes

# Achado ao vivo 2026-09-27 (usuário, convênio 922037 -- "valor global
# quebrado do portal"): esta função era uma cópia local que fazia
# `float(v)` direto, sem tratar vírgula decimal do SICONV bulk (ex.
# "VL_GLOBAL_CONV": "5928266,99" estourava `ValueError`, o campo virava
# `None` silenciosamente e o import caía pro Portal da Transparência, que
# pra 3 convênios tinha um valor ~10.000x menor). Consolidado no parser
# único (havia 3 cópias quase idênticas entre scripts/services).
from app.pipeline.texto import parsear_valor_brasileiro as _num_ou_none
from app.repositories.equipamento_marcadores import OrigemMarcador, catalogo_por_codigo
from app.services.equipamento_marcadores import DadosMarcador, registrar_marcadores

OUTPUT = Path(__file__).parent / "output"

# Mesmos 14 padrões de frontend/src/lib/equipamento-tags.ts -- se um mudar,
# atualizar os dois juntos (docstring de lá já avisa isso).
PADROES_EQUIPAMENTO: list[tuple[str, re.Pattern]] = [
    ("Acelerador Linear", re.compile(r"ACELERADOR\s*LINEAR")),
    ("Mamógrafo", re.compile(r"MAMOGRAFO")),
    ("PET/CT", re.compile(r"\bPET[\s/-]*CT\b")),
    ("Gama-câmara/SPECT", re.compile(r"GAMA\s*CAMARA|CAMARA\s*CINTILOGRAFICA|\bSPECT\b")),
    ("Braquiterapia", re.compile(r"BRAQUITERAPIA")),
    ("Ultrassom", re.compile(r"ULTRASSOM")),
    ("Endoscopia", re.compile(r"ENDOSCOP")),
    ("Tomógrafo", re.compile(r"TOMOGRAF")),
    ("Ressonância", re.compile(r"RESSONANC")),
    ("Radioterapia", re.compile(r"RADIOTERAPIA")),
    ("Raios X", re.compile(r"RAIOS\s*X")),
    ("Hemodiálise", re.compile(r"HEMODIALISE")),
    ("Angiografia", re.compile(r"ANGIOGRAF")),
    ("Cobalto", re.compile(r"COBALTO")),
]


def _norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s) if s is not None else "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").upper().strip()


def _norm_cnpj(s) -> str:
    return re.sub(r"\D", "", s or "")


def _data_siconv(v: str | None) -> date | None:
    if not v or v == "00000000" or len(v) != 8:
        return None
    try:
        return date(int(v[0:4]), int(v[4:6]), int(v[6:8]))
    except ValueError:
        return None


def _data_iso(v: str | None) -> date | None:
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10])
    except ValueError:
        return None


def _valor_pago_fornecedor(siconv_entrada: dict | None) -> tuple[float | None, int]:
    """Soma de VL_PAGO (siconv_pagamento) -- achado 2026-09-16, mesmo
    cálculo que `convenio-card.tsx` fazia no cliente a partir do payload
    cru, promovido pra coluna pra não depender de `siconv_raw` na camada 1
    (sempre visível) do card. `VL_PAGO` usa vírgula decimal ("3326,73"),
    diferente dos VL_*_CONV (ponto) -- mesma pegadinha documentada no
    front."""
    pagamentos = (siconv_entrada or {}).get("pagamentos", [])
    if not pagamentos:
        return None, 0
    total = sum(_num_ou_none((p.get("VL_PAGO") or "0").replace(",", ".")) or 0 for p in pagamentos)
    return total, len(pagamentos)


def _cnes_de_planilha() -> dict[str, str]:
    import openpyxl

    caminho = Path(__file__).parent.parent.parent / "data" / "Monitoramento Base de Dados - Convênio FAF TED.xlsx"
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb["Planilha Monitoramento "]
    resultado = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not any(r):
            continue
        if r[7] != "Convênio":
            continue
        registro = str(r[8]).strip() if r[8] else None
        cnes = str(r[5]).strip() if r[5] else None
        if registro and cnes:
            resultado[registro] = cnes.zfill(7)
    return resultado


# Resoluções manuais fechadas na sessão de validação 2026-09-16 -- fixa vs
# móvel (regra: prefere fixa) e nome/endereço confirmado via busca na web.
# Não é heurística re-executável -- lista fechada, documentada aqui pra
# reprodutibilidade, revisitar manualmente se o CNES mudar/for desativado.
_MANUAL = {
    "922620": "7068336",  # Fundação Pio XII Porto Velho -- Hospital de Amor Amazônia (fixa, não a carreta móvel)
    "7AACVL": "3966445",  # GACC Bahia -- unidade fixa (não a móvel)
    "972703": "3966445",
    "797270": "2748223",  # Hospital das Clínicas da Faculdade de Medicina de Botucatu
    "823874": "2748223",
    "836418": "0011746",  # Irmandade da Santa Casa de Misericórdia de Vitória
    # Fundação Educacional D. André Arcoverde -- matriz em Valença, único
    # CNES é em Barra do Piraí (confirmado via web).
    "997347": "8101353",
}
_NOME_ENDERECO = {
    "UNIVERSIDADE ESTADUAL DE CAMPINAS": "2079798",  # Hospital das Clínicas da UNICAMP
    "MONTE TABOR CENTRO ITALO BRASILEIRO DE PROM SANITARIA": "0003808",  # Hospital São Rafael
    "HOSPITAL COMUNITARIO SARANDI": "2235404",
}


def resolver_cnes(db, convenio: dict, planilha: dict[str, str]) -> tuple[str | None, str | None]:
    """(cnes, metodo) -- ordem de prioridade, validada ao vivo 2026-09-16
    contra a base pública (357/403 confirmados, ver relatório da sessão):
    1. Planilha da equipe (manual, mas cruzado 105/105 linhas contra
       município -- mais confiável que qualquer match automático).
    2. Resoluções manuais fechadas (`_MANUAL`/`_NOME_ENDERECO`).
    3. CNPJ do convenente == CNPJ de exatamente 1 estabelecimento no CNES.
    4. CNPJ bate com múltiplos estabelecimentos -- desempata por município
       (1 só no município do convênio) ou, empatando ainda, por unidade
       FIXA vs MÓVEL (prefere fixa -- decisão do usuário 2026-09-16).
    Sem match confiável -- fica None ("múltiplas unidades, requer
    confirmação da equipe", não adivinha)."""
    num = convenio["numero"]
    if num in planilha:
        return planilha[num], "planilha"
    if num in _MANUAL:
        return _MANUAL[num], "manual"
    nome_n = _norm(convenio.get("convenente_nome", ""))
    if nome_n in _NOME_ENDERECO:
        return _NOME_ENDERECO[nome_n], "nome_endereco"

    cnpj = _norm_cnpj(convenio.get("convenente_cnpj", ""))
    if not cnpj:
        return None, None
    candidatos = db.query(CnesEstabelecimento).filter(CnesEstabelecimento.cnpj == cnpj).all()
    if len(candidatos) == 1:
        return candidatos[0].cnes, "cnpj_exato"
    if len(candidatos) > 1:
        muni = _norm(convenio.get("municipio", ""))
        bate = [c for c in candidatos if _norm(c.municipio) == muni]
        if len(bate) == 1:
            return bate[0].cnes, "cnpj_multi_municipio"
        fixos = [
            c
            for c in bate
            if "MOVEL" not in _norm(c.nome_estabelecimento) and "CARRETA" not in _norm(c.nome_estabelecimento)
        ]
        if len(fixos) == 1:
            return fixos[0].cnes, "cnpj_multi_fixa_movel"
    return None, None


def run() -> None:
    portal = json.loads((OUTPUT / "convenios_flat.json").read_text(encoding="utf-8"))
    siconv = json.loads((OUTPUT / "siconv_legado.json").read_text(encoding="utf-8"))
    transferegov = json.loads((OUTPUT / "transferegov_relacional.json").read_text(encoding="utf-8"))

    siconv_por_numero = {e["convenio"]["NR_CONVENIO"]: e for e in siconv if e.get("convenio", {}).get("NR_CONVENIO")}
    transferegov_por_numero: dict[str, dict] = {}
    for ente in transferegov:
        for numero in ente.get("convenios_legados_relacionados", []):
            transferegov_por_numero[numero] = ente

    db = SessionLocal()
    try:
        planilha = _cnes_de_planilha()
        print(f"{len(planilha)} CNES da planilha (universo 403).")

        registros = []
        contagem_metodo: dict[str, int] = {}
        for p in portal:
            numero = p["numero"]
            s = siconv_por_numero.get(numero)
            sc = s.get("convenio") if s else None
            tg = transferegov_por_numero.get(numero)

            global_ = _num_ou_none(sc.get("VL_GLOBAL_CONV")) if sc else None
            desembolsado = _num_ou_none(sc.get("VL_DESEMBOLSADO_CONV")) if sc else None
            contrapartida = _num_ou_none(sc.get("VL_CONTRAPARTIDA_CONV")) if sc else None

            ni = p.get("numero_instrumento") or ""
            m = re.search(r"/(\d{4})", ni)
            ano: int | None
            if m:
                ano = int(m.group(1))
            else:
                # Alguns registros do Portal não trazem número de instrumento.
                # Nesses casos, a publicação é a melhor data oficial disponível
                # para manter o filtro anual completo, sem inventar vigência.
                data_publicacao = _data_iso(p.get("data_publicacao")) or _data_siconv(
                    sc.get("DIA_PUBL_CONV") if sc else None
                )
                ano = data_publicacao.year if data_publicacao else None

            cnes, metodo = resolver_cnes(db, p, planilha)
            if metodo:
                contagem_metodo[metodo] = contagem_metodo.get(metodo, 0) + 1
            valor_pago_fornecedor, pagamentos_count = _valor_pago_fornecedor(s)

            registros.append(
                dict(
                    numero=numero,
                    numero_instrumento=p.get("numero_instrumento"),
                    ano_instrumento=ano,
                    objeto=p.get("objeto"),
                    situacao=(sc.get("SIT_CONVENIO") if sc else None) or p.get("situacao"),
                    situacao_portal=p.get("situacao"),
                    situacao_contratacao=(sc.get("SITUACAO_CONTRATACAO") if sc else None) or None,
                    convenente_nome=p.get("convenente_nome") or "",
                    convenente_cnpj=p.get("convenente_cnpj") or "",
                    convenente_tipo=p.get("convenente_tipo"),
                    municipio=p.get("municipio"),
                    uf=p.get("uf"),
                    codigo_ibge=p.get("codigo_ibge"),
                    regiao=p.get("regiao"),
                    orgao=p.get("orgao"),
                    unidade_gestora=p.get("unidade_gestora"),
                    subfuncao=p.get("subfuncao"),
                    funcao=p.get("funcao"),
                    tipo_instrumento=p.get("tipo_instrumento"),
                    numero_processo=p.get("numero_processo"),
                    programa=(s.get("programa", {}) or {}).get("NOME_PROGRAMA") if s else None,
                    data_publicacao=_data_iso(p.get("data_publicacao"))
                    or _data_siconv(sc.get("DIA_PUBL_CONV") if sc else None),
                    data_inicio_vigencia=_data_iso(p.get("data_inicio_vigencia"))
                    or _data_siconv(sc.get("DIA_INIC_VIGENC_CONV") if sc else None),
                    data_final_vigencia=_data_iso(p.get("data_final_vigencia"))
                    or _data_siconv(sc.get("DIA_FIM_VIGENC_CONV") if sc else None),
                    data_conclusao=_data_iso(p.get("data_conclusao")),
                    data_ultima_liberacao=_data_iso(p.get("data_ultima_liberacao")),
                    valor_global=global_ if global_ is not None else _num_ou_none(p.get("valor")),
                    valor_repasse=_num_ou_none(sc.get("VL_REPASSE_CONV")) if sc else None,
                    valor_empenhado=_num_ou_none(sc.get("VL_EMPENHADO_CONV")) if sc else None,
                    valor_desembolsado=desembolsado
                    if desembolsado is not None
                    else _num_ou_none(p.get("valor_liberado")),
                    valor_contrapartida=contrapartida
                    if contrapartida is not None
                    else _num_ou_none(p.get("valor_contrapartida")),
                    valor_saldo_conta=_num_ou_none(sc.get("VL_SALDO_CONTA")) if sc else None,
                    valor_ultima_liberacao=_num_ou_none(p.get("valor_ultima_liberacao")),
                    financeiro_fonte_confiavel=sc is not None,
                    valor_pago_fornecedor=valor_pago_fornecedor,
                    pagamentos_count=pagamentos_count,
                    cnes=cnes,
                    cnes_metodo=metodo,
                    siconv_raw=s,
                    transferegov_raw=tg,
                )
            )

        tabela: Table = cast(Table, Convenio.__table__)
        for reg in registros:
            stmt = pg_insert(tabela).values(**reg)
            campos_update = {k: getattr(stmt.excluded, k) for k in reg if k != "numero"}
            stmt = stmt.on_conflict_do_update(index_elements=["numero"], set_=campos_update)
            db.execute(stmt)
        db.commit()

        catalogo = catalogo_por_codigo(db)
        chaves_existentes: set[tuple[OrigemMarcador, int, int, str]] = set()
        numeros = {registro["numero"] for registro in registros}
        for convenio in db.execute(select(Convenio).where(Convenio.numero.in_(numeros))).scalars():
            descricoes = extrair_descricoes(convenio.siconv_raw, {"DESCRICAO_ITEM", "descricao_item"})
            registrar_marcadores(
                db=db,
                origem="convenio",
                origem_id=convenio.id,
                marcadores=[
                    DadosMarcador(
                        evidencia=evidencia,
                        tipo_evidencia="item_orcamentario",
                        confianca=100,
                        origem_dado="API SICONV/TransfereGov",
                    )
                    for evidencia in classificar_descricoes(descricoes)
                ],
                catalogo=catalogo,
                chaves_existentes=chaves_existentes,
            )
        db.commit()

        print(f"Concluído: {len(registros)} convênio(s) gravado(s).")
        print(
            "CNES por método:",
            contagem_metodo,
            "-- total com CNES:",
            sum(contagem_metodo.values()),
            "/",
            len(registros),
        )
    finally:
        db.close()


if __name__ == "__main__":
    run()
