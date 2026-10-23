"""Escrita em `convenio` ("Instrumentos firmados") pra origem sem número
oficial (FAF/TED/PERSUS I/PERSUS II/PRONON) -- correção 2026-09-18 do Plan
Mode monitoramento-ingestao. Compartilhado entre
`corrigir_escopo_instrumentos_firmados.py` (correção pontual dos 249
registros já carregados) e `importar_programas_monitoramento.py`/
`importar_planilha_monitoramento.py` (carga daqui pra frente), pra não
triplicar a mesma regra de mapeamento de campo.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Convenio
from app.equipamentos import classificar_descricoes
from app.services.equipamento_marcadores import DadosMarcador, registrar_marcadores

ORIGEM_ITEM_MANUAL_INICIAL = "carga_manual_inicial"
QUANTIDADE_ITEM_MANUAL = "1"
ORIGEM_VALOR_ITEM_GLOBAL = "valor global do instrumento (PERSUS I: um acelerador por instrumento)"


def valor_item_em_texto(valor: float | Decimal) -> str:
    """Mesmo formato do SICONV em lote ("5928266,99"), que o relatório já interpreta."""
    return f"{Decimal(str(valor)):.2f}".replace(".", ",")


def adicionar_item_manual_inicial(
    convenio: Convenio,
    descricao: str | None,
    origem_dado: str | None,
    valor_total: float | Decimal | None = None,
) -> None:
    """Inclui a evidência manual na mesma coleção de itens do plano.

    A estrutura continua sendo ``siconv_raw.itens_plano_aplicacao``, que é a
    fonte única dos marcadores de convênio. Os dois campos de proveniência
    deixam claro que este item não foi devolvido pela API SICONV.

    ``valor_total`` grava o valor do equipamento no próprio item
    (``VALOR_TOTAL_ITEM``), de onde o relatório o lê. Só é passado quando a
    equipe define a regra (PERSUS I: um acelerador por instrumento, valor global
    do instrumento) e nunca sobrescreve um valor já existente.
    """
    if not descricao or not descricao.strip():
        return
    bruto = dict(convenio.siconv_raw or {})
    itens = [dict(item) if isinstance(item, dict) else item for item in (bruto.get("itens_plano_aplicacao") or [])]
    descricao = descricao.strip()
    existente = next((i for i in itens if isinstance(i, dict) and i.get("DESCRICAO_ITEM") == descricao), None)
    if existente is None:
        existente = {
            "DESCRICAO_ITEM": descricao,
            "ORIGEM_ITEM": ORIGEM_ITEM_MANUAL_INICIAL,
            "FONTE_ITEM": origem_dado or "carga manual inicial",
            # Cada PERSUS, FAF e TED tem um único equipamento (regra da equipe).
            "QTD_ITEM": QUANTIDADE_ITEM_MANUAL,
        }
        itens.append(existente)
    if valor_total is not None and not existente.get("VALOR_TOTAL_ITEM"):
        existente["VALOR_TOTAL_ITEM"] = valor_item_em_texto(valor_total)
        existente["VALOR_ITEM_ORIGEM"] = ORIGEM_VALOR_ITEM_GLOBAL
    bruto["itens_plano_aplicacao"] = itens
    convenio.siconv_raw = bruto


# O componente/serviço "Radioterapia" não é equipamento e não deve virar
# marcador visual -- por isso esta lista NÃO reaproveita os 14 padrões de
# `frontend/src/lib/equipamento-tags.ts` (que classificam item bruto de
# SICONV/TransfereGov, fonte que FAF/TED/PERSUS/PRONON não têm) nem os de
# `importar_convenios_banco.py::PADROES_EQUIPAMENTO`, só os 4 equipamentos
# que já apareceram de fato em `equipamento_descricao` desta origem (achado
# 2026-09-19: Mamógrafo/Braquiterapia/Ultrassom ficavam SEM nenhum
# marcador em "Instrumentos firmados" -- só Acelerador Linear era
# reconhecido desde o POC original de 2026-09-03).
def espelhar_convenio(
    db: Session,
    *,
    numero: str,
    chave_origem: str,
    tipo_contratacao: str,
    tipologia: str | None,
    origem_dado: str | None,
    nome_convenente: str,
    cnpj_convenente: str | None,
    municipio: str | None,
    uf: str | None,
    cnes: str | None,
    programa: str | None,
    ano_instrumento: int | None,
    objeto: str | None,
    situacao: str | None,
    investimento: float | Decimal | None,
    equipamento_descricao: str | None,
    componente: str | None,
) -> Convenio:
    """Upsert por `chave_origem` (nunca por `numero` -- `numero` é
    aleatório pra estas origens e não pode ser reconstruído a partir da
    fonte na próxima execução)."""
    convenio = db.execute(select(Convenio).where(Convenio.chave_origem == chave_origem)).scalar_one_or_none()
    campos = dict(
        numero=numero,
        tipo_contratacao=tipo_contratacao,
        origem_dado=origem_dado,
        chave_origem=chave_origem,
        convenente_nome=nome_convenente,
        convenente_cnpj=cnpj_convenente,
        municipio=municipio,
        uf=uf,
        cnes=cnes,
        programa=programa,
        ano_instrumento=ano_instrumento,
        objeto=objeto,
        situacao=situacao,
        valor_global=(Decimal(str(investimento)) if investimento is not None else None),
        tipologia=tipologia,
        pagamentos_count=0,
        financeiro_fonte_confiavel=False,
    )
    # Ausência de ano na carga não é autorização para apagar uma referência
    # definida pela gestão (caso do PERSUS II ao entrar no monitoramento).
    # No insert, o modelo já persiste nulo naturalmente.
    if ano_instrumento is None:
        campos.pop("ano_instrumento")
    if convenio is None:
        convenio = Convenio(**campos)
        db.add(convenio)
    else:
        for campo, valor in campos.items():
            setattr(convenio, campo, valor)
    # Convenção da equipe: cada PERSUS I é um único acelerador, então o valor global
    # do instrumento é o valor do equipamento (a planilha não traz valor por item).
    adicionar_item_manual_inicial(
        convenio,
        equipamento_descricao,
        origem_dado,
        valor_total=investimento if tipo_contratacao == "PERSUS I" else None,
    )
    db.flush()
    evidencias = classificar_descricoes([equipamento_descricao or ""])
    registrar_marcadores(
        db=db,
        origem="convenio",
        origem_id=convenio.id,
        marcadores=[
            DadosMarcador(
                evidencia=evidencia,
                tipo_evidencia="programa" if tipo_contratacao == "PERSUS I" else "planilha",
                confianca=75 if tipo_contratacao == "PERSUS I" else 90,
                origem_dado=origem_dado,
            )
            for evidencia in evidencias
        ],
    )
    return convenio
