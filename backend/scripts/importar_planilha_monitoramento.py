"""Importa a planilha REAL da equipe (`data/Monitoramento Base de Dados -
Convênio FAF TED.xlsx`, aba "Planilha Monitoramento") pro monitoramento
interno pos-repasse -- escala de 1 instrumento (948686, POC deliberado de
2026-09-03) pros que a equipe ja acompanha de verdade. Pedido do usuario
2026-09-09: "acho que você já pode atualizar todos os convênios que
existe monitoramento dentro dessa planilha".

Achados na planilha antes de escrever este script (133 linha com dado,
69 coluna):
  - So 105 das 133 linhas tem `REGISTRO/CÓDIGO NO SISTEMA TRANSFEREGOV`
    batendo com um nr_convenio real do nosso universo de 403 (as outras
    28 tem NUP SEI/"TED"/"NI"/"NA" nessa coluna em vez de numero) -- essas
    28 ficam de fora, LOGADAS (nunca descartadas silenciosamente).
  - `FASE` bate quase 1:1 com os rotulos ja seedados em
    scripts/seed_monitoramento.py (CATALOGO) -- "NI" (59 linha) e None (21
    linha) significam "nao informado", NAO "Nao iniciado" (que e um valor
    DIFERENTE e raro, 1 linha so) -- nunca mapeado pra Nao iniciado por
    engano, so ignorado (sem evento de fase_geral criado).
  - Datas vem inconsistentes: `datetime` de verdade em boa parte, string
    solta "dd/mm/aaaa" em outra parte, e placeholder de "sem dado"
    ("NI"/"NA"/"Sem previsão"/"????"/vazio) no resto. So os 2 primeiros
    formatos viram data de verdade (`_parse_data`); o terceiro formato
    vira None SEM inventar substituto -- nunca fabrica uma data pra
    "Sem previsão".
  - `MARCA/MODELO` (col. 29) e o modelo da LICITAÇÃO/contratacao, NAO
    confirmacao de entrega real -- NUNCA popula `equipamento_marca/modelo`
    (que por decisao do usuario 2026-09-09 so se preenche quando o
    ESTABELECIMENTO confirma apos a entrega). Os 4 campos `equipamento_*`
    fisicos ficam vazios na importacao em massa, pra cadastro manual
    futuro real -- exatamente como ja e hoje pro 948686.
  - `ÚLTIMA AÇÃO MONITORAMENTO` (texto livre) + `DATA DA ÚLTIMA
    AÇÃO/REUNIÃO VIRTUAL` viram 1 AcaoMonitoramento CONCLUÍDA (ja
    aconteceu) SO quando a data e parseavel -- nos ~13 casos "NI"/"????"
    a acao NAO e criada (perder o texto e melhor que classificar errado
    como pendencia em aberto, dado que AcaoMonitoramento.data_conclusao
    nula = pendente por definicao). `PRÓXIMA REUNIÃO` (quando parseavel e
    no futuro) vira uma 2a acao PENDENTE separada.

Idempotente -- mesmo padrao de seed_monitoramento.py: upsert por
nr_convenio (nunca duplica instrumento), evento so criado se ainda nao
existir um igual (mesmo marco + mesma data/observacao), acao so criada se
ainda nao existir uma com a mesma descricao pro mesmo instrumento.

Uso: python -m scripts.importar_planilha_monitoramento (de dentro de
backend/, venv ativo, com DATABASE_URL configurada).
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

import openpyxl

from app.db.base import SessionLocal
from app.db.models import (
    AcaoMonitoramento,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
)

PLANILHA = Path(__file__).parent.parent.parent / "data" / "Monitoramento Base de Dados - Convênio FAF TED.xlsx"
ABA = "Planilha Monitoramento "  # espaco no final e do arquivo real, nao erro de digitacao

RE_DATA = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
PLACEHOLDERS = {"", "NI", "NA", "N/A", "SIM", "NÃO", "NAO", "SEM PREVISÃO", "SEM PREVISAO", "????"}

STATUS_MAP = {
    "deferido": "Deferido",
    "indeferido": "Indeferido",
    "em análise": "Em análise",
    "em analise": "Em análise",
    "analise": "Em análise",
    "em diligência": "Em diligência",
    "em diligencia": "Em diligência",
}

# Colunas regulatorio: (codigo do marco, indice numero_documento, indice status, indice data)
COLUNAS_REGULATORIO = [
    ("regulatorio_matricula_cnen", "MATRÍCULA CNEN", None, None),
    ("regulatorio_descomissionamento", "SCRA PARA LICENÇA DE ALTERAÇÃO DE OPERAÇÃO (DESCOMISSIONAMENTO)", "STATUS DESCOMISSIONAMENTO", None),
    ("regulatorio_modificacao_casamata", "SCRA PARA MODIFICAÇÃO/CASAMATA", "STATUS MOD. CASAMATA", None),
    ("regulatorio_licenca_operacao", "LICENÇA DE OPERAÇÃO / ALTERAÇÃO DE OPERAÇÃO", "STATUS LICENÇA DE OPERAÇÃO", "DATA LICENÇA DE OPERAÇÃO"),
]

# Colunas cronograma_fisico: (codigo do marco, nome da coluna) -- nome da
# 1a ("INÍCIO DA FABRICAÇÃO") nao usado pra lookup por header (celula do
# cabecalho na planilha real veio corrompida com uma data em vez de texto,
# achado 2026-09-09) -- essa 1 e resolvida por POSICAO (indice 46, logo
# apos "PRÓXIMA REUNIÃO ").
COLUNAS_CRONOGRAMA = [
    ("cronograma_chegada_porto", "CHEGADA NO BRASIL (PORTO)"),
    ("cronograma_entrega", "ENTREGA"),
    ("cronograma_instalacao_inicio", "INSTALAÇÃO - INÍCIO"),
    ("cronograma_instalacao_fim", "INSTALAÇÃO - FINAL"),
    ("cronograma_comissionamento", "COMISSIONAMENTO"),
    ("cronograma_obra_inicio", "Inico da Reforma/Obra"),
    ("cronograma_obra_ponto_critico", "Ponto Crítico"),
    ("cronograma_obra_fim", "Fim da reforma / Obra"),
    ("cronograma_previsao_inauguracao", "PREVISÃO DE INAUGURAÇÃO DO EMPREENDIMENTO / CONVENENTE"),
]


def _texto(v) -> str | None:
    if v is None:
        return None
    s = str(v).replace("\xa0", " ").strip()
    return s or None


def _parse_data(v) -> date | None:
    """So aceita datetime real ou string dd/mm/aaaa exata -- qualquer outra
    coisa (placeholder de "sem dado", texto misto com nota da empresa
    etc.) vira None, NUNCA uma data inventada."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = _texto(v)
    if not s or s.upper() in PLACEHOLDERS:
        return None
    m = RE_DATA.match(s)
    if not m:
        return None
    dia, mes, ano = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(ano, mes, dia)
    except ValueError:
        return None


def _normalizar_status(v) -> str | None:
    s = _texto(v)
    if not s or s.upper() in PLACEHOLDERS:
        return None
    return STATUS_MAP.get(s.lower(), s)


def _cnpj_formatado(v) -> str:
    s = re.sub(r"\D", "", str(v or ""))
    if len(s) == 14:
        return f"{s[0:2]}.{s[2:5]}.{s[5:8]}/{s[8:12]}-{s[12:14]}"
    return _texto(v) or ""


def run() -> None:
    wb = openpyxl.load_workbook(PLANILHA, data_only=True)
    ws = wb[ABA]
    header = [c.value for c in ws[1]]
    idx = {h: i for i, h in enumerate(header) if isinstance(h, str)}
    idx_inicio_fabricacao = 46  # posicional, ver COLUNAS_CRONOGRAMA docstring

    db = SessionLocal()
    try:
        nossos_convenios = {i.nr_convenio for i in db.query(InstrumentoEquipamento).all()}
        marcos_por_codigo = {m.codigo: m for m in db.query(MarcoCatalogo).all()}
        fases_por_rotulo = {m.rotulo: m for m in marcos_por_codigo.values() if m.grupo.value == "fase_geral"}

        # nr_convenio real (do nosso universo de convenios_flat.json, ja
        # carregado no banco como InstrumentoEquipamento so pro 948686 --
        # cross-referencia direto com o arquivo pra saber quais dos 403 sao
        # validos, sem precisar que ja exista instrumento seedado).
        import json
        convenios_validos = {
            c["numero"] for c in json.loads((Path(__file__).parent / "output" / "convenios_flat.json").read_text(encoding="utf-8"))
        }

        criados, atualizados, fora_do_universo = 0, 0, []
        eventos_criados, acoes_criadas = 0, 0

        for linha in ws.iter_rows(min_row=2, values_only=True):
            if linha[0] is None and linha[3] is None:
                continue

            nr_convenio_raw = _texto(linha[idx["REGISTRO/CÓDIGO NO SISTEMA TRANSFEREGOV"]])
            if not nr_convenio_raw or nr_convenio_raw not in convenios_validos:
                fora_do_universo.append((nr_convenio_raw, _texto(linha[idx["PROPONENTE / ENTIDADE"]])))
                continue
            nr_convenio = nr_convenio_raw

            dados_instrumento = dict(
                nr_convenio=nr_convenio,
                cnpj_convenente=_cnpj_formatado(linha[idx["CNPJ"]]),
                nome_convenente=_texto(linha[idx["PROPONENTE / ENTIDADE"]]) or "",
                municipio=_texto(linha[idx["MUNICIPIO"]]),
                uf=_texto(linha[idx["UF"]]),
                cnes=_texto(linha[idx["CNES"]]),
                equipamento_descricao=_texto(linha[idx["ID MODELO NO SIGEM/TRANSFEREGOV"]]),
                componente=_texto(linha[idx["COMPONENTES DE FINANCIAMENTO - INVESTUSUS"]]),
                ano_instrumento=int(m.group()) if (v := _texto(linha[idx["ANO DO INSTRUMENTO"]])) and (m := re.search(r"\d{4}", v)) else None,
                tecnico_titular=_texto(linha[idx["TÉCNICO RESPONSÁVEL - TITULAR"]]),
                tecnico_suplente=_texto(linha[idx["TÉCNICO RESPONSÁVEL - SUPLENTE"]]),
                nivel_monitoramento=_texto(linha[idx["NÍVEL DE MONITORAMENTO (ESTRATÉGICO, TÁTICO E SIMPLIFICADO)"]]),
                finalidade=_texto(linha[idx["FINALIDADE"]]),
                modalidade_onco=_texto(linha[idx["MODALIDADE - ONCO"]]),
            )

            instrumento = db.query(InstrumentoEquipamento).filter_by(nr_convenio=nr_convenio).one_or_none()
            if instrumento is None:
                instrumento = InstrumentoEquipamento(**dados_instrumento)
                db.add(instrumento)
                db.flush()
                criados += 1
            else:
                # Upsert -- so sobrescreve campo de CADASTRO (nao mexe em
                # equipamento_marca/modelo/numero_serie/vida_util_anos,
                # que sao pos-entrega e nao vem desta planilha).
                for campo, valor in dados_instrumento.items():
                    if campo != "nr_convenio" and valor is not None:
                        setattr(instrumento, campo, valor)
                atualizados += 1

            eventos_existentes = {
                (e.marco_id, e.data_ocorrencia, e.observacao)
                for e in db.query(EventoMarco).filter_by(instrumento_id=instrumento.id).all()
            }

            def _adicionar_evento(marco_codigo, data_ocorrencia=None, status_regulatorio=None, numero_documento=None, observacao=None):
                nonlocal eventos_criados
                marco = marcos_por_codigo.get(marco_codigo)
                if marco is None:
                    return
                chave = (marco.id, data_ocorrencia, observacao)
                if chave in eventos_existentes:
                    return
                db.add(EventoMarco(
                    instrumento_id=instrumento.id, marco_id=marco.id,
                    data_ocorrencia=data_ocorrencia, status_regulatorio=status_regulatorio,
                    numero_documento=numero_documento, observacao=observacao,
                ))
                eventos_existentes.add(chave)
                eventos_criados += 1

            # --- fase_geral ---
            # So 1 evento de fase_geral por instrumento faz sentido aqui
            # (e "onde ele esta agora", nao historico de transicao) -- se
            # ja existe QUALQUER evento pra algum marco de fase_geral (ex.
            # vindo do seed_monitoramento.py), nao duplica so por causa de
            # observacao diferente.
            fase_rotulo = _texto(linha[idx["FASE"]])
            marco_fase = fases_por_rotulo.get(fase_rotulo) if fase_rotulo else None
            ja_tem_fase = any(mid in {m.id for m in fases_por_rotulo.values()} for mid, _, _ in eventos_existentes)
            if marco_fase and not ja_tem_fase:
                _adicionar_evento(marco_fase.codigo, observacao="Importado de Planilha Monitoramento (FASE).")

            # --- cronograma_fisico ---
            data_fabricacao = _parse_data(linha[idx_inicio_fabricacao])
            if data_fabricacao:
                _adicionar_evento("cronograma_inicio_fabricacao", data_ocorrencia=data_fabricacao)
            for codigo, nome_coluna in COLUNAS_CRONOGRAMA:
                if nome_coluna not in idx:
                    continue
                bruto = linha[idx[nome_coluna]]
                data = _parse_data(bruto)
                if data:
                    _adicionar_evento(codigo, data_ocorrencia=data)
                else:
                    texto_bruto = _texto(bruto)
                    if texto_bruto and texto_bruto.upper() not in PLACEHOLDERS:
                        # Texto informativo mas nao parseavel como data limpa
                        # (ex. "17/01/2026 (23/02/2026 empresa)") -- guarda
                        # como observacao, nunca inventa data.
                        _adicionar_evento(codigo, observacao=f"Data original da planilha: {texto_bruto}")

            # --- regulatorio ---
            for codigo, col_num, col_status, col_data in COLUNAS_REGULATORIO:
                numero_doc = _texto(linha[idx[col_num]]) if col_num in idx else None
                if numero_doc and numero_doc.upper() in PLACEHOLDERS:
                    numero_doc = None
                status = _normalizar_status(linha[idx[col_status]]) if col_status and col_status in idx else None
                data_ev = _parse_data(linha[idx[col_data]]) if col_data and col_data in idx else None
                if numero_doc or status or data_ev:
                    _adicionar_evento(codigo, data_ocorrencia=data_ev, status_regulatorio=status, numero_documento=numero_doc)

            # --- Ações de monitoramento (separadas dos eventos) ---
            acoes_existentes = {
                a.descricao for a in db.query(AcaoMonitoramento).filter_by(instrumento_id=instrumento.id).all()
            }
            ultima_acao_texto = _texto(linha[idx["ÚLTIMA AÇÃO MONITORAMENTO"]])
            ultima_acao_data = _parse_data(linha[idx["DATA DA ÚLTIMA AÇÃO/REUNIÃO VIRTUAL"]])
            if ultima_acao_texto and ultima_acao_data and ultima_acao_texto not in acoes_existentes:
                db.add(AcaoMonitoramento(
                    instrumento_id=instrumento.id, descricao=ultima_acao_texto,
                    data_conclusao=ultima_acao_data,
                ))
                acoes_criadas += 1

            proxima_reuniao_data = _parse_data(linha[idx["PRÓXIMA REUNIÃO "]]) if "PRÓXIMA REUNIÃO " in idx else None
            if proxima_reuniao_data:
                descricao_reuniao = f"Próxima reunião ({proxima_reuniao_data.strftime('%d/%m/%Y')})"
                if descricao_reuniao not in acoes_existentes:
                    db.add(AcaoMonitoramento(
                        instrumento_id=instrumento.id, descricao=descricao_reuniao,
                        data_prevista=proxima_reuniao_data,
                    ))
                    acoes_criadas += 1

        db.commit()
        print(f"Instrumentos: {criados} criado(s), {atualizados} atualizado(s).")
        print(f"Eventos novos: {eventos_criados}. Ações novas: {acoes_criadas}.")
        print(f"Fora do universo (número não bate com nenhum dos 403): {len(fora_do_universo)}")
        for numero, nome in fora_do_universo:
            print(f"   [AVISO] {numero!r} — {nome}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
