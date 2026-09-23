"""Importa a planilha REAL da equipe (`data/Monitoramento Base de Dados -
Convênio FAF TED.xlsx`, aba "Planilha Monitoramento") pro monitoramento
interno pos-repasse -- escala de 1 instrumento (948686, POC deliberado de
2026-09-03) pros que a equipe ja acompanha de verdade. Pedido do usuario
2026-09-09: "acho que você já pode atualizar todos os convênios que
existe monitoramento dentro dessa planilha".

IMPORTANTE (achado 2026-09-09, pedido explicito do usuario): esta
importacao e um BOOTSTRAP UNICO. Depois desta rodada, cadastro/eventos/
ações passam a viver so na aplicacao (PATCH/POST via
app/routers/monitoramento.py) -- este script NAO e pra rodar de novo como
sincronizacao recorrente com a planilha (rodar de novo sobrescreveria
edicao feita a mao no sistema pra campo que a planilha tambem preenche,
ex. tecnico_titular). Fica idempotente por seguranca/historico, nao como
convite pra reuso continuo.

Achados na planilha antes de escrever este script (133 linha com dado,
69 coluna):
  - So 105 das 133 linhas tem `REGISTRO/CÓDIGO NO SISTEMA TRANSFEREGOV`
    batendo com um nr_convenio real do nosso universo de 403 -- essas sao
    100% `TIPO DE CONTRATAÇÃO = "Convênio"`. Das outras 28 (achado
    2026-09-09, 2a rodada, pedido do usuario: "inclua nos tipos de
    contratação equivalentes"): sao `FAF` (23) ou `TED` (3) -- categoria
    de contratacao DIFERENTE (Fundo a Fundo/Termo de Execucao
    Descentralizada), que nunca teve numero TransfereGov porque nunca
    passou pelo SICONV. Resolvidas por identificador alternativo (ver
    `_resolver_identificador`) -- 4 continuam fora por nao terem NENHUM
    identificador utilizavel nem em `REGISTRO/CÓDIGO...` nem em `NUP SEI`
    (ambas colunas com placeholder "NI"/"NA").
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
    ESTABELECIMENTO confirma apos a entrega, hoje pelo evento de entrega,
    ver app/routers/monitoramento.py::registrar_evento). Os 4 campos
    `equipamento_*` fisicos ficam vazios na importacao em massa.
  - `TÉCNICO RESPONSÁVEL - TITULAR/SUPLENTE` (achado 2026-09-09, 2a
    rodada): vem com casing misto ("Leonardo Barsante" vs "SAMUEL") e
    'NA'/'NI' tratados como se fossem nome de tecnico de verdade --
    `_nome_padronizado` normaliza pra UPPER() e vira None quando for
    placeholder (nunca um tecnico "fantasma" na distribuicao do overview).
  - `TIPO DE CONTRATAÇÃO` vira `tipo_contratacao` (Convênio/FAF/TED),
    aplicado em toda linha (dentro ou fora do universo de 403).
  - `NOME DO RESPONSÁVEL TÉCNICO DA EXECUÇÃO / INSTITUIÇÃO` + `CONTATO...`
    (col. 42-43, achado 2026-09-09) viram `responsavel_execucao_nome/
    contato` -- opcionais, sao dado da INSTITUICAO/convenente, diferente
    de tecnico_titular/suplente (que sao da nossa equipe).
  - `ÚLTIMA AÇÃO MONITORAMENTO` (texto livre) + `DATA DA ÚLTIMA
    AÇÃO/REUNIÃO VIRTUAL` viram 1 AcaoMonitoramento CONCLUÍDA (ja
    aconteceu) SO quando a data e parseavel -- nos ~13 casos "NI"/"????"
    a acao NAO e criada (perder o texto e melhor que classificar errado
    como pendencia em aberto, dado que AcaoMonitoramento.data_conclusao
    nula = pendente por definicao). `PRÓXIMA REUNIÃO` (quando parseavel e
    no futuro) vira uma 2a acao PENDENTE separada.

Idempotente -- mesmo padrao de seed_monitoramento.py: upsert por
identificador (nr_convenio real ou NUP SEI, nunca duplica instrumento),
evento so criado se ainda nao existir um igual (mesmo marco + mesma
data/observacao), acao so criada se ainda nao existir uma com a mesma
descricao pro mesmo instrumento.

Uso: python -m scripts.importar_planilha_monitoramento (de dentro de
backend/, venv ativo, com DATABASE_URL configurada).
"""
from __future__ import annotations

import argparse
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import cast

import openpyxl
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import (
    AcaoMonitoramento,
    Convenio,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
)
from scripts.lib_monitoramento_convenio import espelhar_convenio

PLANILHA = Path(__file__).parent.parent.parent / "data" / "Monitoramento Base de Dados - Convênio FAF TED.xlsx"
ABA = "Planilha Monitoramento "  # espaco no final e do arquivo real, nao erro de digitacao

RE_DATA = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
PLACEHOLDERS = {"", "NI", "NA", "N/A", "SIM", "NÃO", "NAO", "SEM PREVISÃO", "SEM PREVISAO", "????"}
# So pras 2 colunas de identificador (REGISTRO/CÓDIGO... e NUP SEI) --
# "TED"/"NUP SEI" tambem aparecem la como texto solto no lugar de um
# numero/NUP de verdade (achado 2026-09-09, ver _resolver_identificador).
PLACEHOLDERS_IDENTIFICADOR = PLACEHOLDERS | {"TED", "NUP SEI"}

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


def _sem_placeholder(v) -> str | None:
    """`_texto` + filtro de placeholder, SEM upper() -- usada pra campo que
    deve ficar com a capitalização original da planilha quando tem valor
    de verdade (ex. "Convênio"), so vira None quando for placeholder tipo
    'NA'/'NI' (achado 2026-09-09: `tipo_contratacao` estava guardando o
    literal 'NA' como se fosse um tipo de contratação de verdade)."""
    s = _texto(v)
    if not s or s.upper() in PLACEHOLDERS:
        return None
    return s


def _nome_padronizado(v) -> str | None:
    """Mesmo corte de placeholder de `_texto`, mas em UPPER() -- achado
    2026-09-09 (pedido do usuario): tecnico_titular/suplente vinham com
    casing misto e 'NA'/'NI' contados como se fossem nome de tecnico de
    verdade. Usada so pra esses 2 campos (nomes de convenente/instituicao
    continuam como vem da fonte, ja sao uppercase na maioria das APIs)."""
    s = _texto(v)
    if not s or s.upper() in PLACEHOLDERS:
        return None
    return s.upper()


def _resolver_identificador(registro, nup_sei) -> str | None:
    """Resolve o identificador de um instrumento fora do universo de 403
    (achado 2026-09-09, 2a rodada: "inclua nos tipos de contratação
    equivalentes"). Tenta `REGISTRO/CÓDIGO NO SISTEMA TRANSFEREGOV`
    primeiro; se for placeholder ("TED"/"NI"/"NA"/"NUP SEI"/vazio), cai
    pra coluna `NUP SEI`. Se as duas forem placeholder, None -- nunca
    fabrica identificador.

    So mantem digitos (achado 2026-09-09, 3a rodada, pedido do usuario:
    "tirar os caracteres especiais do número dos faf e teds, mantenha
    apenas os números") -- primeira tentativa (troca "/" por "_") quebrava
    a leitura visual do numero; "só dígitos" tambem evita de vez qualquer
    problema de separador de path na URL (testado ao vivo contra o
    backend: `/` cru quebra a rota mesmo como `%2F`, ver historico deste
    arquivo). Nenhuma colisao entre os 15 identificadores ja resolvidos
    ao aplicar esse corte -- conferido antes de trocar."""
    for bruto in (registro, nup_sei):
        s = _texto(bruto)
        if s and s.upper() not in PLACEHOLDERS_IDENTIFICADOR:
            so_digitos = re.sub(r"\D", "", s)
            if so_digitos:
                return so_digitos
    return None


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


# Unificação finalidade->tipologia (Plan Mode monitoramento-evolucao
# 2026-09-19, decisão do usuário: "É a mesma tipologia, use para todos") --
# mesmo de-para fechado aplicado na migration pro dado já existente; este
# script é bootstrap único (não roda de novo), mas não pode escrever num
# campo que não existe mais no model.
_FINALIDADE_PARA_TIPOLOGIA = {
    "substituição": "EO",
    "ampliação": "A",
    "ampliação (cobalto)": "A",
}


def _tipologia_de_finalidade(v) -> str | None:
    s = _texto(v)
    if not s:
        return None
    return _FINALIDADE_PARA_TIPOLOGIA.get(s.lower())


def _cnpj_formatado(v) -> str:
    s = re.sub(r"\D", "", str(v or ""))
    if len(s) == 14:
        return f"{s[0:2]}.{s[2:5]}.{s[5:8]}/{s[8:12]}-{s[12:14]}"
    return _texto(v) or ""


def _valor_monetario(v) -> Decimal | None:
    """`VALOR TOTAL DE INVESTIMENTO (VALOR GLOBAL)` vem em dois formatos na
    planilha real: número puro (`8000000`) ou string formatada BR
    (`'R$ 1.990.263,00'`) -- achado 2026-09-19 ao carregar valor de
    investimento pros FAF/TED (campo nunca lido por este script até então).
    Nunca fabrica valor pra placeholder ('NI'/'NA'/vazio)."""
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return Decimal(str(v))
    s = _texto(v)
    if not s or s.upper() in PLACEHOLDERS:
        return None
    s = s.replace("R$", "").strip().replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _cnes_normalizado(v) -> str | None:
    """Preserva zeros à esquerda perdidos pelo Excel e só aceita 7 dígitos."""
    digitos = re.sub(r"\D", "", _texto(v) or "")
    if not digitos or len(digitos) > 7:
        return None
    return digitos.zfill(7)


def run(
    planilha: Path = PLANILHA,
    *,
    somente_ausentes: bool = False,
    dry_run: bool = False,
) -> dict[str, int]:
    """Importa a fonte escolhida.

    ``somente_ausentes`` preserva todo valor já mantido pela aplicação e é
    o modo obrigatório para reconciliar uma edição posterior da planilha.
    ``dry_run`` executa a mesma transação, imprime o resultado e faz rollback.
    """
    wb = openpyxl.load_workbook(planilha, data_only=True)
    # Contrato explícito da fonte: somente esta aba é operacional. As demais
    # abas do arquivo não participam da ingestão nem servem como fallback.
    ws = wb[ABA]
    header = [c.value for c in ws[1]]
    idx = {h: i for i, h in enumerate(header) if isinstance(h, str)}
    idx_inicio_fabricacao = 46  # posicional, ver COLUNAS_CRONOGRAMA docstring

    db = SessionLocal()
    try:
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

        # Lookup por chave_origem pro caminho FAF/TED (correção 2026-09-18)
        # -- identifica a linha já corrigida (nr_convenio aleatório) sem
        # depender do NUP SEI bater com o `nr_convenio` armazenado.
        instrumentos_por_chave = {
            i.chave_origem: i for i in db.execute(
                select(InstrumentoEquipamento).where(InstrumentoEquipamento.chave_origem.isnot(None))
            ).scalars()
        }
        convenios_por_chave = {
            c.chave_origem: c for c in db.execute(
                select(Convenio).where(Convenio.chave_origem.isnot(None))
            ).scalars()
        }
        criados, atualizados, campos_preenchidos, fora_do_universo, colisoes = 0, 0, 0, [], []
        campos_preenchidos_chaves: set[tuple[str, str]] = set()
        eventos_criados, acoes_criadas = 0, 0

        for linha in ws.iter_rows(min_row=2, values_only=True):
            if linha[0] is None and linha[3] is None:
                continue

            registro_raw = _texto(linha[idx["REGISTRO/CÓDIGO NO SISTEMA TRANSFEREGOV"]])
            nup_sei_raw = _texto(linha[idx["NUP SEI"]]) if "NUP SEI" in idx else None

            if registro_raw and registro_raw in convenios_validos:
                # Caminho normal: numero TransfereGov real, dentro do
                # universo de 403 (sempre "Convênio" nesse caso). Já tem
                # identidade estável por si só -- sem chave_origem.
                nr_convenio = registro_raw
                chave_origem = None
            else:
                # Achado 2026-09-09, 2a rodada (pedido do usuario: "inclua
                # nos tipos de contratação equivalentes"): FAF/TED nunca
                # tiveram numero TransfereGov -- resolve por NUP SEI (com
                # "/" trocado por "_", ver _resolver_identificador).
                identificador = _resolver_identificador(registro_raw, nup_sei_raw)
                if identificador is None:
                    fora_do_universo.append((registro_raw, nup_sei_raw, _texto(linha[idx["PROPONENTE / ENTIDADE"]])))
                    continue
                if identificador in convenios_validos:
                    # So checa contra o universo REAL de 403 (nunca deveria
                    # colidir, formatos bem diferentes, mas e barato checar
                    # antes de criar um Convênio duplicado sob identidade de
                    # NUP SEI). NAO checa contra `nossos_convenios` -- isso
                    # incluiria FAF/TED ja importados em rodada anterior, e
                    # reencontra-los de novo e upsert normal, nao colisao
                    # (achado 2026-09-09: bug real, 2a rodada da import
                    # tratava TODO FAF/TED ja existente como "colisão" e
                    # pulava em vez de atualizar).
                    colisoes.append((identificador, _texto(linha[idx["PROPONENTE / ENTIDADE"]])))
                    continue
                # FAF/TED têm identidade oficial (NUP SEI) mesmo sem número
                # TransfereGov -- decisão do usuário 2026-09-18: usar o NUP
                # SEI (dígitos) direto como identificador, sem indireção
                # (diferente de PERSUS/PRONON, que não têm NENHUM
                # identificador oficial -- só esses usam id aleatório, ver
                # importar_programas_monitoramento.py). `chave_origem` fica
                # igual a `nr_convenio` só pra dar uma chave estável ao
                # upsert de `convenio` (espelhar_convenio exige uma).
                nr_convenio = identificador
                chave_origem = identificador

            dados_instrumento = dict(
                nr_convenio=nr_convenio,
                chave_origem=chave_origem,
                cnpj_convenente=_cnpj_formatado(linha[idx["CNPJ"]]),
                nome_convenente=_texto(linha[idx["PROPONENTE / ENTIDADE"]]) or "",
                municipio=_texto(linha[idx["MUNICIPIO"]]),
                uf=_texto(linha[idx["UF"]]),
                cnes=_cnes_normalizado(linha[idx["CNES"]]),
                equipamento_descricao=_sem_placeholder(linha[idx["ID MODELO NO SIGEM/TRANSFEREGOV"]]),
                investimento_aquisicao=_valor_monetario(linha[idx["VALOR TOTAL DE INVESTIMENTO (VALOR GLOBAL)"]]) if "VALOR TOTAL DE INVESTIMENTO (VALOR GLOBAL)" in idx else None,
                componente=_texto(linha[idx["COMPONENTES DE FINANCIAMENTO - INVESTUSUS"]]),
                ano_instrumento=int(m.group()) if (v := _texto(linha[idx["ANO DO INSTRUMENTO"]])) and (m := re.search(r"\d{4}", v)) else None,
                tipo_contratacao=_sem_placeholder(linha[idx["TIPO DE CONTRATAÇÃO"]]) if "TIPO DE CONTRATAÇÃO" in idx else None,
                tecnico_titular=_nome_padronizado(linha[idx["TÉCNICO RESPONSÁVEL - TITULAR"]]),
                tecnico_suplente=_nome_padronizado(linha[idx["TÉCNICO RESPONSÁVEL - SUPLENTE"]]),
                nivel_monitoramento=_texto(linha[idx["NÍVEL DE MONITORAMENTO (ESTRATÉGICO, TÁTICO E SIMPLIFICADO)"]]),
                tipologia=_tipologia_de_finalidade(linha[idx["FINALIDADE"]]),
                responsavel_execucao_nome=_texto(linha[idx["NOME DO RESPONSÁVEL TÉCNICO DA EXECUÇÃO / INSTITUIÇÃO"]]) if "NOME DO RESPONSÁVEL TÉCNICO DA EXECUÇÃO / INSTITUIÇÃO" in idx else None,
                responsavel_execucao_contato=_texto(linha[idx["CONTATO DO RESPONSÁVEL TÉCNICO DA EXECUÇÃO / INSITUIÇÃO"]]) if "CONTATO DO RESPONSÁVEL TÉCNICO DA EXECUÇÃO / INSITUIÇÃO" in idx else None,
                modalidade_onco=_texto(linha[idx["MODALIDADE - ONCO"]]),
            )

            instrumento = (
                instrumentos_por_chave.get(chave_origem) if chave_origem is not None
                else db.query(InstrumentoEquipamento).filter_by(nr_convenio=nr_convenio).one_or_none()
            )
            if instrumento is None:
                instrumento = InstrumentoEquipamento(**dados_instrumento)
                db.add(instrumento)
                db.flush()
                if chave_origem is not None:
                    instrumentos_por_chave[chave_origem] = instrumento
                criados += 1
            else:
                # Achado 2026-09-19 (Boa Vista/RR, 25000083829202616): a
                # planilha as vezes lista MAIS DE UM equipamento pro mesmo
                # convenio em linhas separadas (ex. Mamografo + Ultrassom).
                # `equipamento_descricao` e coluna unica -- sobrescrever direto
                # perdia silenciosamente o equipamento da linha anterior. Faz
                # merge textual (nunca fabrica, so concatena o que a planilha
                # ja trouxe) ANTES do loop generico abaixo, que trataria isso
                # como upsert comum e perderia o mesmo jeito.
                nova_descricao = cast(str | None, dados_instrumento.get("equipamento_descricao"))
                descricao_atual = instrumento.equipamento_descricao
                if nova_descricao and (not descricao_atual or nova_descricao not in descricao_atual):
                    instrumento.equipamento_descricao = (
                        f"{descricao_atual} + {nova_descricao}" if descricao_atual else nova_descricao
                    )
                    campos_preenchidos += 1
                    campos_preenchidos_chaves.add((nr_convenio, "equipamento_descricao"))

                # Upsert -- so sobrescreve campo de CADASTRO (nao mexe em
                # equipamento_marca/modelo/numero_serie/vida_util_anos,
                # que sao pos-entrega e nao vem desta planilha).
                for campo, valor in dados_instrumento.items():
                    if campo == "equipamento_descricao":
                        continue  # tratado acima, com merge em vez de overwrite
                    valor_atual = getattr(instrumento, campo)
                    pode_atualizar = not somente_ausentes or valor_atual is None or valor_atual == ""
                    tem_valor_fonte = valor is not None and (not somente_ausentes or valor != "")
                    if campo not in ("nr_convenio", "chave_origem") and tem_valor_fonte and pode_atualizar:
                        setattr(instrumento, campo, valor)
                        campos_preenchidos += 1
                        campos_preenchidos_chaves.add((nr_convenio, campo))
                atualizados += 1

            # FAF/TED (identidade sintética) ganham espelho em `convenio`
            # ("Instrumentos firmados") -- decisão do usuário 2026-09-18:
            # continuam TAMBÉM no monitoramento interno, diferente de
            # PERSUS I concluído/PERSUS II/PRONON (só `convenio`, ver
            # importar_programas_monitoramento.py).
            if chave_origem is not None:
                tipo_contratacao = instrumento.tipo_contratacao
                if tipo_contratacao is None:
                    raise ValueError("Instrumento sem tipo de contratação não pode gerar espelho de convênio.")
                convenio_espelho = espelhar_convenio(
                    db,
                    numero=nr_convenio,
                    chave_origem=chave_origem,
                    tipo_contratacao=tipo_contratacao,
                    tipologia=None,
                    origem_dado=None,
                    nome_convenente=instrumento.nome_convenente,
                    cnpj_convenente=instrumento.cnpj_convenente,
                    municipio=instrumento.municipio,
                    uf=instrumento.uf,
                    cnes=instrumento.cnes,
                    programa=instrumento.programa,
                    ano_instrumento=instrumento.ano_instrumento,
                    objeto=instrumento.tipologia,
                    situacao=None,
                    investimento=instrumento.investimento_aquisicao,
                    equipamento_descricao=instrumento.equipamento_descricao,
                    componente=instrumento.componente,
                )
                convenios_por_chave[chave_origem] = convenio_espelho

            eventos_existentes = {
                (e.marco_id, e.data_ocorrencia, e.data_prevista, e.observacao)
                for e in db.query(EventoMarco).filter_by(instrumento_id=instrumento.id).all()
            }

            def _adicionar_evento(
                marco_codigo, data_ocorrencia=None, data_prevista=None,
                status_regulatorio=None, numero_documento=None, observacao=None,
            ):
                nonlocal eventos_criados
                marco = marcos_por_codigo.get(marco_codigo)
                if marco is None:
                    return
                chave = (marco.id, data_ocorrencia, data_prevista, observacao)
                if chave in eventos_existentes:
                    return
                db.add(EventoMarco(
                    instrumento_id=instrumento.id, marco_id=marco.id,
                    data_ocorrencia=data_ocorrencia, data_prevista=data_prevista,
                    status_regulatorio=status_regulatorio,
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
            ja_tem_fase = any(mid in {m.id for m in fases_por_rotulo.values()} for mid, _, _, _ in eventos_existentes)
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
                    if codigo == "cronograma_previsao_inauguracao":
                        _adicionar_evento(
                            codigo,
                            data_prevista=data,
                            observacao="Previsão importada da planilha de monitoramento.",
                        )
                    else:
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

            # A planilha pode repetir o mesmo instrumento em linhas
            # diferentes. Torna eventos/ações desta linha visíveis para a
            # consulta da próxima e preserva a idempotência dentro da mesma
            # transação (SessionLocal usa autoflush=False).
            db.flush()

        if dry_run:
            db.rollback()
            print("SIMULAÇÃO: transação revertida; nenhum dado foi alterado.")
        else:
            db.commit()
        resultado = {
            "instrumentos_criados": criados,
            "linhas_atualizadas": atualizados,
            "campos_preenchidos": campos_preenchidos,
            "eventos_criados": eventos_criados,
            "acoes_criadas": acoes_criadas,
            "rejeitados_sem_identificador": len(fora_do_universo),
            "colisoes": len(colisoes),
        }
        if somente_ausentes:
            print(
                f"Instrumentos: {criados} criado(s), {atualizados} linha(s) reconciliada(s), "
                f"{campos_preenchidos} campo(s) vazio(s) preenchido(s)."
            )
            if campos_preenchidos_chaves:
                campos_resumo = ", ".join(
                    f"{nr}:{campo}" for nr, campo in sorted(campos_preenchidos_chaves)
                )
                print("Campos vazios encontrados: " + campos_resumo)
        else:
            print(f"Instrumentos: {criados} criado(s), {atualizados} atualizado(s).")
        print(f"Eventos novos: {eventos_criados}. Ações novas: {acoes_criadas}.")
        print(f"Sem identificador utilizável (nem REGISTRO/CÓDIGO nem NUP SEI): {len(fora_do_universo)}")
        for registro, nup_sei, nome in fora_do_universo:
            print(f"   [AVISO] registro={registro!r} nup_sei={nup_sei!r} — {nome}")
        if colisoes:
            print(f"Colisão de identificador (pulado, já existe): {len(colisoes)}")
            for identificador, nome in colisoes:
                print(f"   [AVISO] {identificador!r} — {nome}")
        return resultado
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="executa a carga e reverte a transação")
    parser.add_argument(
        "--somente-ausentes",
        action="store_true",
        help="preenche somente campos de cadastro vazios, preservando edição posterior",
    )
    parser.add_argument("--planilha", type=Path, default=PLANILHA, help="fonte XLSX a importar")
    args = parser.parse_args()
    run(planilha=args.planilha, somente_ausentes=args.somente_ausentes, dry_run=args.dry_run)
