"""Instrumento sintético com marcos reais do catálogo e tarefas extensas."""

from datetime import date, timedelta

from sqlalchemy import select

from app.db.models import (
    AcaoMonitoramento,
    CnesEstabelecimento,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    MarcoGrupo,
)


def criar_monitoramento_longo(db):
    db.add(CnesEstabelecimento(cnes="0000788", nome_estabelecimento="Unidade sintética de paginação"))
    db.flush()
    instrumento = InstrumentoEquipamento(
        nr_convenio="QA_LONGO_001",
        nome_convenente="Instituição sintética para validação de tabelas longas",
        cnes="0000788",
        uf="AC",
        municipio="Cidade sintética",
        tipo_contratacao="FAF",
    )
    db.add(instrumento)
    db.flush()
    catalogo = list(db.scalars(select(MarcoCatalogo).order_by(MarcoCatalogo.ordem, MarcoCatalogo.id)))
    fase = next(m for m in catalogo if m.grupo == MarcoGrupo.fase_geral)
    db.add(EventoMarco(instrumento_id=instrumento.id, marco_id=fase.id, data_ocorrencia=date(2026, 1, 1)))
    marcos = [m for m in catalogo if m.grupo != MarcoGrupo.fase_geral]
    for n, marco in enumerate(marcos):
        regulatorio = marco.grupo == MarcoGrupo.regulatorio
        db.add(
            EventoMarco(
                instrumento_id=instrumento.id,
                marco_id=marco.id,
                fase_geral_id=fase.id,
                data_ocorrencia=date(2026, 1, 2) + timedelta(days=n),
                status_regulatorio="Em diligência" if regulatorio else None,
                numero_documento=f"1234567890{n:06}" if regulatorio else None,
                data_validade=date(2027, 12, 31) if regulatorio else None,
            )
        )
    acoes = []
    for n in range(12):
        descricao = (
            f"Tarefa sintética {n:03}: "
            + (
                "Conferir a documentação de entrega e os comprovantes encaminhados pela instituição, "
                "registrando a análise técnica e a pendência de resposta. "
            )
            * 2
        )
        acoes.append(descricao)
        db.add(
            AcaoMonitoramento(
                instrumento_id=instrumento.id,
                descricao=descricao,
                responsavel="Equipe sintética",
                data_prevista=date(2027, 1, 31),
            )
        )
    db.flush()
    return [fase.rotulo, *(m.rotulo for m in marcos)], acoes
