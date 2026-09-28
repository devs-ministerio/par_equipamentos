"""Fontes adicionais de complementação do PERSUS I, além de
``Controle PERSUS.xlsx`` (abas Obras/Equipamentos/Inauguração/Datas, já
cobertas por `scripts/complementar_persus_monitoramento.py`).

Achado ao vivo 2026-09-27 (usuário, auditoria "qual a situação dos 92
PERSUS I"): 22 instrumentos nunca tinham sido promovidos ao monitoramento
interno e vários eventos de fase geral nunca tinham sido materializados
(evento físico com `fase_geral_id` de contexto não promove fase sozinho --
só um evento cujo PRÓPRIO `marco_id` é de grupo `fase_geral` promove, ver
docstring de `EventoMarco` em `app/db/models.py`). 4 fontes fecham isso:

1. ``Controle PERSUS.xlsx``, aba **Recebimentos** -- SCRA/Matrícula CNEN e
   datas de TRP/TRD/comissionamento por estabelecimento (match por
   UF+nome, sem CNES na aba). Promove instrumento quando ainda não existia
   e preenche `numero_documento` no evento de licença já registrado.
2. ``Controle PERSUS.xlsx``, abas **Pagamentos**/**Fiscalização** --
   pagamentos individuais de obra (match pelo código "Cod." da aba Obras,
   validado cruzado por UF + overlap de nome -- ver
   `docs/arquitetura/planmode-relatorios-2026-09-25.md`) e de fiscalização
   (match por nome+UF, fuzzy). Grava em `pagamento_obra_persus`.
3. ``Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx``, aba
   **CONVÊNIO** -- licença/inauguração/valor global por CNES direto (essa
   aba TEM CNES, ao contrário das outras 3). Promove os instrumentos que
   ainda faltavam.
4. ``Apresentação PER-SUS.xlsx`` (5 abas regionais: Norte/Nordeste/Centro
   Oeste/Sudeste/Sul) -- fonte MESTRE, 1 linha por convênio PERSUS I (as
   92 linhas batem 100% contra os 92 convênios do banco, por UF+nome,
   desempatando por tipologia+valor global quando ambíguo -- ver o caso
   real "Casa de Saúde Santa Marcelina", 2 convênios com o mesmo CNES).
   Valida a licença já registrada (algumas divergências são uma 2ª licença
   histórica -- renovação CNEN, mantida como evento adicional, nunca
   sobrescreve) e completa os instrumentos que ainda não tinham nenhuma
   fonte com data.

Cada fonte só ADICIONA evento -- nunca sobrescreve o que já existe (mesma
filosofia append-only do domínio, `EventoMarco`/`AcaoMonitoramento`).
Idempotente: roda de novo sobre o mesmo estado sem duplicar (checa
`instrumento_id + marco_id + data_ocorrencia` antes de inserir).

PERSUS II fica INTENCIONALMENTE fora deste script -- achado ao vivo
2026-09-27 (usuário): os 50 convênios PERSUS II têm `situacao="Em
contratação"` sem exceção, sem obra/equipamento/licença pra registrar
ainda (ver nota equivalente em `app/services/relatorios.py::
_secao_monitoramento_interno`).

Uso (de dentro de backend/, venv ativo):
    uv run python -m scripts.complementar_persus_fontes_extras --dry-run
    uv run python -m scripts.complementar_persus_fontes_extras
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
from collections import defaultdict
from collections.abc import Sequence
from datetime import date, datetime
from pathlib import Path

import openpyxl
from sqlalchemy.orm import Session

from app.db.base import SessionLocal
from app.db.models import Convenio, EventoMarco, InstrumentoEquipamento, MarcoCatalogo, PagamentoObraPersus
from app.pipeline.texto import normalizar_texto, parsear_valor_brasileiro
from scripts.complementar_persus_monitoramento import _cnes, _texto

ROOT = Path(__file__).resolve().parents[2]
ARQUIVO_CONTROLE = ROOT / "data/Controle PERSUS.xlsx"
ARQUIVO_ENTREGAS = ROOT / "data/Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx"
ARQUIVO_APRESENTACAO = ROOT / "docs/monitoramento-equipamentos/Apresentação PER-SUS.xlsx"

_REGIOES_APRESENTACAO = ["Norte", "Nordeste", "Centro Oeste", "Sudeste", "Sul"]

# Marco físico/regulatório -> fase geral que ele confirma, quando tem
# `data_ocorrencia` real. `cronograma_previsao_inauguracao` só promove
# "Concluído" com data REAL (inauguração de fato) -- com só `data_prevista`
# não materializa fase nenhuma, fica só como cronograma futuro.
_MAPA_MARCO_FASE = {
    "cronograma_chegada_porto": "fase_equipamento_em_aquisicao",
    "cronograma_obra_inicio": "fase_em_andamento",
    "cronograma_instalacao_inicio": "fase_comissionamento",
    "cronograma_instalacao_fim": "fase_comissionamento",
    "cronograma_comissionamento": "fase_comissionamento",
    "cronograma_trp": "fase_comissionamento",
    "cronograma_trd": "fase_equipamento_entregue",
    "cronograma_entrega": "fase_equipamento_entregue",
    "regulatorio_licenca_operacao": "fase_equipamento_entregue",
    "regulatorio_matricula_cnen": "fase_equipamento_entregue",
    "cronograma_previsao_inauguracao": "fase_concluido",
}


def _melhor_candidato_por_nome(
    nome_planilha: str,
    uf: str | None,
    pool: Sequence[Convenio],
    *,
    tipologia: str | None = None,
    valor: float | None = None,
) -> Convenio | None:
    """Casa um nome de hospital da planilha contra o `Convenio` real --
    restrito à mesma UF quando informada (nunca casa entre UFs diferentes
    nesse caso); `uf=None` busca no universo inteiro (única situação onde
    isso é seguro: aba "Fiscalização" não tem coluna de UF pra restringir).
    Prioridade: nome exato -> substring em qualquer direção -> similaridade
    textual (`difflib`, corte 0.75 com folga mínima de 0.05 pro 2º
    colocado, pra não aceitar "quase empate"). Ambiguidade (>1 candidato)
    desempata por tipologia, depois por valor global exato -- nunca escolhe
    um entre vários sem critério."""
    alvo_nome = normalizar_texto(nome_planilha)
    pool_uf = [c for c in pool if normalizar_texto(c.uf or "") == normalizar_texto(uf)] if uf else list(pool)

    exatos = [c for c in pool_uf if normalizar_texto(c.convenente_nome) == alvo_nome]
    candidatos = exatos
    if len(candidatos) > 1:
        if tipologia:
            por_tipologia = [c for c in candidatos if c.tipologia == tipologia]
            if len(por_tipologia) == 1:
                return por_tipologia[0]
        if valor is not None:
            por_valor = [c for c in candidatos if c.valor_global and abs(float(c.valor_global) - valor) < 1]
            if len(por_valor) == 1:
                return por_valor[0]
        return None
    if len(candidatos) == 1:
        return candidatos[0]

    contem = [
        c
        for c in pool_uf
        if alvo_nome in normalizar_texto(c.convenente_nome) or normalizar_texto(c.convenente_nome) in alvo_nome
    ]
    if len(contem) == 1:
        return contem[0]

    pontuados = sorted(
        ((difflib.SequenceMatcher(None, alvo_nome, normalizar_texto(c.convenente_nome)).ratio(), c) for c in pool_uf),
        key=lambda par: -par[0],
    )
    if not pontuados:
        return None
    melhor_score, melhor = pontuados[0]
    segundo_score = pontuados[1][0] if len(pontuados) > 1 else 0.0
    if melhor_score >= 0.75 and (melhor_score - segundo_score) >= 0.05:
        return melhor
    return None


def _materializar_fase_geral(db: Session, instrumento_id: int, marcos: dict[str, MarcoCatalogo]) -> int:
    """Recalcula e garante o evento de fase_geral mais avançado a partir dos
    eventos físicos/regulatórios já registrados pro instrumento -- mesmo
    mecanismo de `_fases_ocorridas`/`_registrar_eventos` do módulo irmão
    (`complementar_persus_monitoramento.py`), generalizado aqui pra
    qualquer marco mapeado em `_MAPA_MARCO_FASE`. Necessário porque um
    evento físico com `fase_geral_id` de CONTEXTO nunca promove a fase
    sozinho -- só um evento cujo `marco_id` é ele mesmo do grupo
    `fase_geral` conta pro cálculo (`app/repositories/monitoramento.py::
    mapa_eventos_por_instrumento`). Idempotente: só insere transição que
    ainda não existe (mesmo marco + mesma data)."""
    marcos_por_id = {m.id: m for m in marcos.values()}
    eventos = db.query(EventoMarco).filter(EventoMarco.instrumento_id == instrumento_id).all()
    fases_ocorridas: dict[str, date] = {}
    for evento in eventos:
        marco = marcos_por_id.get(evento.marco_id)
        if marco is None or marco.grupo.value == "fase_geral" or evento.data_ocorrencia is None:
            continue
        fase_codigo = _MAPA_MARCO_FASE.get(marco.codigo)
        if fase_codigo is None:
            continue
        anterior = fases_ocorridas.get(fase_codigo)
        if anterior is None or evento.data_ocorrencia > anterior:
            fases_ocorridas[fase_codigo] = evento.data_ocorrencia

    criados = 0
    for fase_codigo, data_evento in fases_ocorridas.items():
        fase = marcos.get(fase_codigo)
        if fase is None:
            continue
        ja_existe = (
            db.query(EventoMarco)
            .filter(
                EventoMarco.instrumento_id == instrumento_id,
                EventoMarco.marco_id == fase.id,
                EventoMarco.data_ocorrencia == data_evento,
            )
            .first()
        )
        if ja_existe is not None:
            continue
        db.add(
            EventoMarco(
                instrumento_id=instrumento_id,
                marco_id=fase.id,
                fase_geral_id=None,
                data_ocorrencia=data_evento,
                observacao="Fase geral consolidada a partir dos marcos físicos/regulatórios registrados.",
            )
        )
        criados += 1
    return criados


def _evento_ja_existe(db: Session, instrumento_id: int, marco_id: int, data_ocorrencia: date | None) -> bool:
    return (
        db.query(EventoMarco)
        .filter(
            EventoMarco.instrumento_id == instrumento_id,
            EventoMarco.marco_id == marco_id,
            EventoMarco.data_ocorrencia == data_ocorrencia,
        )
        .first()
        is not None
    )


def _criar_instrumento_a_partir_do_convenio(
    convenio: Convenio, origem: str, situacao: str | None = None
) -> InstrumentoEquipamento:
    return InstrumentoEquipamento(
        nr_convenio=convenio.numero,
        chave_origem=convenio.chave_origem,
        cnpj_convenente=convenio.convenente_cnpj,
        nome_convenente=convenio.convenente_nome,
        municipio=convenio.municipio,
        uf=convenio.uf,
        cnes=convenio.cnes,
        programa=convenio.programa,
        ano_instrumento=convenio.ano_instrumento,
        tipo_contratacao=convenio.tipo_contratacao,
        origem_dado=origem,
        tipologia=convenio.tipologia,
        investimento_aquisicao=convenio.valor_global,
        situacao_programa=situacao or convenio.situacao,
        natureza_servico=convenio.objeto,
        equipamento_descricao="Acelerador linear",
    )


# ---------------------------------------------------------------------
# 1. Controle PERSUS.xlsx, aba Recebimentos.
# ---------------------------------------------------------------------


def _processar_recebimentos(
    db: Session,
    convenios: list[Convenio],
    instrumentos_por_chave: dict[str, InstrumentoEquipamento],
    marcos: dict[str, MarcoCatalogo],
    resultado: dict[str, int],
) -> None:
    wb = openpyxl.load_workbook(ARQUIVO_CONTROLE, data_only=True)
    origem = f"Controle PERSUS.xlsx (aba Recebimentos) - sha256:{hashlib.sha256(ARQUIVO_CONTROLE.read_bytes()).hexdigest()[:12]}"
    ws = wb["Recebimentos"]
    marco_licenca = marcos["regulatorio_licenca_operacao"]

    for numero_linha, linha in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not linha or not linha[3]:
            continue
        uf, unidade = linha[3], linha[5]
        convenio = _melhor_candidato_por_nome(unidade, uf, convenios)
        if convenio is None:
            resultado["recebimentos_sem_dono"] += 1
            continue

        instrumento = instrumentos_por_chave.get(convenio.chave_origem or "")
        obs = f"Importado de {origem}, linha {numero_linha}."
        matricula = _texto(linha[12]) or None
        scra = _texto(linha[13]) or None

        if instrumento is None:
            # Só promove se sobrar algo pra registrar -- nunca cria
            # instrumento vazio, sem nenhuma evidência temporal.
            tem_alguma_data = any(isinstance(linha[i], datetime) for i in (7, 8, 9, 10, 11))
            if not tem_alguma_data:
                continue
            instrumento = _criar_instrumento_a_partir_do_convenio(convenio, origem)
            db.add(instrumento)
            db.flush()
            instrumentos_por_chave[convenio.chave_origem or convenio.numero] = instrumento
            resultado["instrumentos_promovidos"] += 1

        if isinstance(linha[10], datetime) and not _evento_ja_existe(
            db, instrumento.id, marco_licenca.id, linha[10].date()
        ):
            db.add(
                EventoMarco(
                    instrumento_id=instrumento.id,
                    marco_id=marco_licenca.id,
                    fase_geral_id=marcos["fase_equipamento_entregue"].id,
                    data_ocorrencia=linha[10].date(),
                    numero_documento=scra or matricula,
                    observacao=obs,
                )
            )
            resultado["eventos_licenca"] += 1

        if matricula:
            marco_matricula = marcos["regulatorio_matricula_cnen"]
            data_ref = linha[10].date() if isinstance(linha[10], datetime) else None
            if not _evento_ja_existe(db, instrumento.id, marco_matricula.id, data_ref):
                db.add(
                    EventoMarco(
                        instrumento_id=instrumento.id,
                        marco_id=marco_matricula.id,
                        fase_geral_id=marcos["fase_equipamento_entregue"].id,
                        data_ocorrencia=data_ref,
                        numero_documento=matricula,
                        observacao=obs,
                    )
                )
                resultado["eventos_matricula"] += 1

        resultado["recebimentos_processados"] += 1


# ---------------------------------------------------------------------
# 2. Controle PERSUS.xlsx, abas Pagamentos e Fiscalização.
# ---------------------------------------------------------------------


def _mapa_codigo_obra_para_convenio(convenios: list[Convenio]) -> dict[str, Convenio]:
    wb = openpyxl.load_workbook(ARQUIVO_CONTROLE, data_only=True)
    por_cnes = {c.cnes: c for c in convenios if c.cnes}
    ws = wb["Obras"]
    resultado: dict[str, Convenio] = {}
    for linha in ws.iter_rows(min_row=3, values_only=True):
        if not linha or not linha[0]:
            continue
        cnes = _cnes(linha[2])
        convenio = por_cnes.get(cnes) if cnes else None
        if convenio is not None:
            resultado[_texto(linha[0])] = convenio
    return resultado


def _processar_pagamentos_obra(
    db: Session,
    codigo_obra_para_convenio: dict[str, Convenio],
    instrumentos_por_chave: dict[str, InstrumentoEquipamento],
    resultado: dict[str, int],
) -> None:
    wb = openpyxl.load_workbook(ARQUIVO_CONTROLE, data_only=True)
    origem = f"Controle PERSUS.xlsx (aba Pagamentos) - sha256:{hashlib.sha256(ARQUIVO_CONTROLE.read_bytes()).hexdigest()[:12]}"
    ws = wb["Pagamentos"]

    for numero_linha, linha in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not linha or not linha[0]:
            continue
        cod = _texto(linha[0])
        convenio = codigo_obra_para_convenio.get(cod)
        if convenio is None:
            resultado["pagamentos_sem_dono"] += 1
            continue
        instrumento = instrumentos_por_chave.get(convenio.chave_origem or convenio.numero)
        if instrumento is None:
            resultado["pagamentos_sem_dono"] += 1
            continue

        chave_origem = (
            "pagobra-" + hashlib.md5(f"{cod}|{linha[1]}|{linha[6]}|{linha[10]}|{numero_linha}".encode()).hexdigest()
        )
        if db.query(PagamentoObraPersus).filter(PagamentoObraPersus.chave_origem == chave_origem).first() is not None:
            continue
        db.add(
            PagamentoObraPersus(
                instrumento_id=instrumento.id,
                tipo="obra",
                codigo_obra=cod,
                nup_pagamento=_texto(linha[1]) or None,
                fornecedor_nome=_texto(linha[4]) or None,
                fornecedor_cnpj=_texto(linha[5]) or None,
                data_nota_fiscal=linha[6].date() if isinstance(linha[6], datetime) else None,
                data_pagamento=linha[11].date() if isinstance(linha[11], datetime) else None,
                valor=parsear_valor_brasileiro(linha[10]),
                origem_dado=f"{origem}, linha {numero_linha}.",
                chave_origem=chave_origem,
            )
        )
        resultado["pagamentos_obra_criados"] += 1


def _processar_pagamentos_fiscalizacao(
    db: Session,
    convenios: list[Convenio],
    instrumentos_por_chave: dict[str, InstrumentoEquipamento],
    resultado: dict[str, int],
) -> None:
    wb = openpyxl.load_workbook(ARQUIVO_CONTROLE, data_only=True)
    origem = f"Controle PERSUS.xlsx (aba Fiscalização) - sha256:{hashlib.sha256(ARQUIVO_CONTROLE.read_bytes()).hexdigest()[:12]}"
    ws = wb["Fiscalização"]

    for numero_linha, linha in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not linha or not linha[0] or not linha[3]:
            continue
        # "SOLUÇÃO" às vezes é texto administrativo solto (ex. "Reajustes"),
        # nunca um nome de hospital -- sem UF pra restringir aqui (a aba não
        # tem essa coluna), então busca no universo PERSUS I inteiro (mesmo
        # matcher único, `uf=None`).
        convenio = _melhor_candidato_por_nome(str(linha[3]), None, convenios)
        if convenio is None:
            resultado["fiscalizacao_sem_dono"] += 1
            continue
        instrumento = instrumentos_por_chave.get(convenio.chave_origem or convenio.numero)
        if instrumento is None:
            resultado["fiscalizacao_sem_dono"] += 1
            continue

        chave_origem = (
            "fiscobra-" + hashlib.md5(f"{linha[0]}|{linha[5]}|{linha[7]}|{numero_linha}".encode()).hexdigest()
        )
        if db.query(PagamentoObraPersus).filter(PagamentoObraPersus.chave_origem == chave_origem).first() is not None:
            continue
        db.add(
            PagamentoObraPersus(
                instrumento_id=instrumento.id,
                tipo="fiscalizacao",
                nup_pagamento=_texto(linha[0]) or None,
                data_nota_fiscal=linha[5].date() if isinstance(linha[5], datetime) else None,
                data_pagamento=linha[8].date() if isinstance(linha[8], datetime) else None,
                valor=parsear_valor_brasileiro(linha[7]) or parsear_valor_brasileiro(linha[2]),
                origem_dado=f"{origem}, linha {numero_linha}.",
                chave_origem=chave_origem,
            )
        )
        resultado["pagamentos_fiscalizacao_criados"] += 1


# ---------------------------------------------------------------------
# 3. Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx, aba CONVÊNIO.
# ---------------------------------------------------------------------


def _processar_entregas_convenio(
    db: Session,
    convenios_por_cnes: dict[str, list[Convenio]],
    instrumentos_por_chave: dict[str, InstrumentoEquipamento],
    marcos: dict[str, MarcoCatalogo],
    resultado: dict[str, int],
) -> None:
    wb = openpyxl.load_workbook(ARQUIVO_ENTREGAS, data_only=True)
    origem = (
        f"Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx (aba CONVÊNIO) - "
        f"sha256:{hashlib.sha256(ARQUIVO_ENTREGAS.read_bytes()).hexdigest()[:12]}"
    )
    ws = wb["CONVÊNIO"]
    marco_licenca = marcos["regulatorio_licenca_operacao"]
    marco_inauguracao = marcos["cronograma_previsao_inauguracao"]

    for numero_linha, linha in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not linha or not linha[2]:
            continue
        cnes = _cnes(linha[2])
        candidatos = convenios_por_cnes.get(cnes or "", [])
        if len(candidatos) != 1:
            resultado["entregas_convenio_ambiguo_ou_sem_dono"] += 1
            continue
        convenio = candidatos[0]
        if (convenio.chave_origem or convenio.numero) in instrumentos_por_chave:
            continue

        situacao = _texto(linha[8])
        data_licenca = linha[7] if isinstance(linha[7], datetime) else None
        inaugurado_em = linha[10] if isinstance(linha[10], datetime) else None
        previsao = linha[9] if isinstance(linha[9], datetime) else None
        if not (data_licenca or inaugurado_em or previsao):
            continue

        instrumento = _criar_instrumento_a_partir_do_convenio(convenio, origem, situacao)
        instrumento.investimento_aquisicao = parsear_valor_brasileiro(linha[12]) or convenio.valor_global
        db.add(instrumento)
        db.flush()
        instrumentos_por_chave[convenio.chave_origem or convenio.numero] = instrumento
        resultado["instrumentos_promovidos"] += 1

        obs = f"Importado de {origem}, linha {numero_linha}."
        if data_licenca:
            db.add(
                EventoMarco(
                    instrumento_id=instrumento.id,
                    marco_id=marco_licenca.id,
                    fase_geral_id=marcos["fase_equipamento_entregue"].id,
                    data_ocorrencia=data_licenca.date(),
                    numero_documento=_texto(linha[14]) or None,
                    observacao=obs,
                )
            )
        real = inaugurado_em if ("INAUGURAD" in situacao.upper() and inaugurado_em) else None
        if marco_inauguracao and (real or previsao):
            db.add(
                EventoMarco(
                    instrumento_id=instrumento.id,
                    marco_id=marco_inauguracao.id,
                    fase_geral_id=marcos["fase_concluido"].id,
                    data_ocorrencia=real.date() if real else None,
                    data_prevista=previsao.date() if (previsao and not real) else None,
                    observacao=obs,
                )
            )


# ---------------------------------------------------------------------
# 4. Apresentação PER-SUS.xlsx -- fonte mestre, valida e completa.
# ---------------------------------------------------------------------


def _ler_apresentacao_persus() -> list[dict[str, object]]:
    wb = openpyxl.load_workbook(ARQUIVO_APRESENTACAO, data_only=True)
    linhas: list[dict[str, object]] = []
    for nome_aba in _REGIOES_APRESENTACAO:
        ws = wb[nome_aba]
        todas = list(ws.iter_rows(values_only=True))
        header_idx = next(i for i, r in enumerate(todas) if r and "Unidade Hospitalar" in r)
        header = todas[header_idx]
        indices = {campo: header.index(campo) for campo in header if campo}
        for linha in todas[header_idx + 1 :]:
            if not linha or not linha[indices["Unidade Hospitalar"]]:
                continue
            linhas.append(
                {
                    "tipologia": linha[indices["Tipologia"]],
                    "municipio": linha[indices["Município"]],
                    "uf": linha[indices["Estado"]],
                    "unidade": linha[indices["Unidade Hospitalar"]],
                    "licenca": linha[indices["Licença de Operação"]],
                    "valor": linha[indices["Investimento total MS"]],
                    "inauguracao": linha[indices["Data Inauguração"]],
                    "situacao": linha[indices["Situação"]],
                }
            )
    return linhas


def _processar_apresentacao_persus(
    db: Session,
    convenios: list[Convenio],
    instrumentos_por_chave: dict[str, InstrumentoEquipamento],
    marcos: dict[str, MarcoCatalogo],
    resultado: dict[str, int],
) -> None:
    origem = f"Apresentação PER-SUS.xlsx - sha256:{hashlib.sha256(ARQUIVO_APRESENTACAO.read_bytes()).hexdigest()[:12]}"
    marco_licenca = marcos["regulatorio_licenca_operacao"]
    marco_inauguracao = marcos["cronograma_previsao_inauguracao"]

    for linha in _ler_apresentacao_persus():
        valor = parsear_valor_brasileiro(linha["valor"])
        convenio = _melhor_candidato_por_nome(
            str(linha["unidade"]),
            str(linha["uf"]),
            convenios,
            tipologia=_texto(linha["tipologia"]) or None,
            valor=valor,
        )
        if convenio is None:
            resultado["apresentacao_sem_dono"] += 1
            continue

        licenca = linha["licenca"] if isinstance(linha["licenca"], datetime) else None
        inauguracao = linha["inauguracao"] if isinstance(linha["inauguracao"], datetime) else None
        situacao = _texto(linha["situacao"])
        inaugurada = "INAUGURAD" in situacao.upper()

        chave = convenio.chave_origem or convenio.numero
        instrumento = instrumentos_por_chave.get(chave)
        obs = f"Importado de {origem}."
        if instrumento is None:
            if not (licenca or inauguracao):
                continue
            instrumento = _criar_instrumento_a_partir_do_convenio(convenio, origem, situacao)
            db.add(instrumento)
            db.flush()
            instrumentos_por_chave[chave] = instrumento
            resultado["instrumentos_promovidos"] += 1

        if licenca and not _evento_ja_existe(db, instrumento.id, marco_licenca.id, licenca.date()):
            db.add(
                EventoMarco(
                    instrumento_id=instrumento.id,
                    marco_id=marco_licenca.id,
                    fase_geral_id=marcos["fase_equipamento_entregue"].id,
                    data_ocorrencia=licenca.date(),
                    observacao=obs,
                )
            )
            resultado["eventos_licenca_validados_ou_completados"] += 1

        # "INAUGURADO" com data própria de inauguração -- caso comum.
        # "INAUGURADO" SEM data própria (achado ao vivo -- Instituto do
        # Câncer do Ceará/Piracicaba) -- usa a licença mais recente como
        # proxy (mesma regra já aprovada pelo usuário 2026-09-27: "normalmente
        # usamos a data da licença como data de inauguração").
        real = inauguracao
        if inaugurada and real is None and licenca is not None:
            real = licenca
        if inaugurada and real and not _evento_ja_existe(db, instrumento.id, marco_inauguracao.id, real.date()):
            db.add(
                EventoMarco(
                    instrumento_id=instrumento.id,
                    marco_id=marco_inauguracao.id,
                    fase_geral_id=marcos["fase_concluido"].id,
                    data_ocorrencia=real.date(),
                    observacao=obs,
                )
            )


# ---------------------------------------------------------------------
# Orquestração.
# ---------------------------------------------------------------------


def executar(*, dry_run: bool = False) -> dict[str, int]:
    resultado: dict[str, int] = defaultdict(int)
    with SessionLocal() as db:
        convenios = db.query(Convenio).filter(Convenio.chave_origem.like("PERSUS1-%")).all()
        instrumentos_por_chave = {
            (i.chave_origem or i.nr_convenio): i
            for i in db.query(InstrumentoEquipamento)
            .join(Convenio, Convenio.numero == InstrumentoEquipamento.nr_convenio)
            .filter(Convenio.chave_origem.like("PERSUS1-%"))
            .all()
        }
        marcos = {m.codigo: m for m in db.query(MarcoCatalogo).all()}
        convenios_por_cnes: dict[str, list[Convenio]] = defaultdict(list)
        for convenio in convenios:
            if convenio.cnes:
                convenios_por_cnes[convenio.cnes].append(convenio)

        _processar_recebimentos(db, convenios, instrumentos_por_chave, marcos, resultado)

        codigo_obra_para_convenio = _mapa_codigo_obra_para_convenio(convenios)
        _processar_pagamentos_obra(db, codigo_obra_para_convenio, instrumentos_por_chave, resultado)
        _processar_pagamentos_fiscalizacao(db, convenios, instrumentos_por_chave, resultado)

        _processar_entregas_convenio(db, convenios_por_cnes, instrumentos_por_chave, marcos, resultado)
        _processar_apresentacao_persus(db, convenios, instrumentos_por_chave, marcos, resultado)

        for instrumento in instrumentos_por_chave.values():
            resultado["eventos_fase_geral_criados"] += _materializar_fase_geral(db, instrumento.id, marcos)

        if dry_run:
            db.rollback()
        else:
            db.commit()
    print(("SIMULACAO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in sorted(resultado.items())))
    return dict(resultado)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    argumentos = parser.parse_args()
    executar(dry_run=argumentos.dry_run)
