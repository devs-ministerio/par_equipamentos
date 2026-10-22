"""Instrumentos sintéticos com dados e contrastes de histórico append-only."""

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AcaoMonitoramento,
    CnesEstabelecimento,
    Convenio,
    EquipamentoCatalogo,
    EquipamentoMarcador,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    MarcoGrupo,
    User,
)


def criar_carteira_preenchida(db: Session, quantidade: int) -> list[InstrumentoEquipamento]:
    usuario = User(name="Responsável QA cadastrado", email="qa-carga@example.com", password_hash="!sem-login")
    catalogo = EquipamentoCatalogo(codigo="qa_carga", nome="Equipamento QA carga", prioritario=False)
    auxiliar = EquipamentoCatalogo(codigo="qa_carga_auxiliar", nome="Equipamento QA auxiliar", prioritario=False)
    db.add_all([usuario, catalogo, auxiliar, CnesEstabelecimento(cnes="0000810", nome_estabelecimento="Unidade QA")])
    db.flush()
    marcos = list(db.scalars(select(MarcoCatalogo).order_by(MarcoCatalogo.ordem)))
    fase = next(m for m in marcos if m.grupo == MarcoGrupo.fase_geral)
    entrega = next(m for m in marcos if m.codigo == "cronograma_entrega")
    inauguracao = next(m for m in marcos if m.codigo == "cronograma_previsao_inauguracao")
    instrumentos = []
    for n in range(quantidade):
        convenio = Convenio(
            numero=f"QA_CARGA_{n:04}",
            convenente_nome=f"Instituição QA {n:04}",
            uf="AC",
            municipio="Cidade QA",
            cnes="0000810" if n == 0 else None,
            valor_global=0,
            valor_repasse=0,
            siconv_raw={
                "itens_plano_aplicacao": [
                    {"DESCRICAO_ITEM": f"Item QA {n}/0", "VALOR_TOTAL_ITEM": "0,00"},
                    {"DESCRICAO_ITEM": f"Item QA {n}/1"},
                ]
            },
        )
        inst = InstrumentoEquipamento(
            nr_convenio=convenio.numero,
            nome_convenente=convenio.convenente_nome,
            uf="AC",
            municipio="Cidade QA",
            cnes=convenio.cnes,
            tipo_contratacao="Convênio",
            componente="Componente QA",
        )
        db.add_all([convenio, inst])
        db.flush()
        instrumentos.append(inst)
        for item in range(2):
            db.add(
                EquipamentoMarcador(
                    equipamento_catalogo_id=catalogo.id if item == 0 else auxiliar.id,
                    convenio_id=convenio.id,
                    descricao_original=f"Item QA {n}/{item}",
                    tipo_evidencia="item_orcamentario",
                    relacao="aquisicao",
                    confianca=100,
                    chave_evidencia=f"qa_{n}_{item}",
                )
            )
        instante = datetime(2026, 1, 2, tzinfo=timezone.utc)
        eventos = [
            EventoMarco(
                instrumento_id=inst.id, marco_id=fase.id, data_ocorrencia=date(2026, 1, 1), created_at=instante
            ),
            EventoMarco(
                instrumento_id=inst.id,
                marco_id=entrega.id,
                fase_geral_id=fase.id,
                data_ocorrencia=date(2026, 1, 2),
                observacao=f"Entrega QA {n:04}",
                created_at=instante,
            ),
            EventoMarco(
                instrumento_id=inst.id,
                marco_id=inauguracao.id,
                fase_geral_id=fase.id,
                data_prevista=date(2027, 1, 3),
                observacao=f"Previsão QA {n:04}",
                created_at=instante,
            ),
        ]
        db.add_all(eventos)
        db.flush()
        db.add_all(
            [
                EventoMarco(
                    instrumento_id=inst.id,
                    marco_id=entrega.id,
                    fase_geral_id=fase.id,
                    data_ocorrencia=date(2026, 1, 1),
                    observacao="HISTORICO_EVENTO_EXCLUIDO",
                    deletado_em=instante,
                ),
                EventoMarco(
                    instrumento_id=inst.id,
                    marco_id=entrega.id,
                    fase_geral_id=fase.id,
                    data_ocorrencia=date(2026, 1, 1),
                    observacao="HISTORICO_EVENTO_SUBSTITUIDO",
                    substituido_por_id=eventos[1].id,
                ),
            ]
        )
        acoes = [
            AcaoMonitoramento(
                instrumento_id=inst.id,
                descricao=f"Pendente QA {n:04}",
                responsavel="Responsável QA legado",
                data_prevista=date(2027, 2, 1),
                created_at=instante,
            ),
            AcaoMonitoramento(
                instrumento_id=inst.id,
                descricao=f"Concluída QA {n:04}",
                responsavel_id=usuario.id,
                data_conclusao=date(2026, 2, 1),
                created_at=instante,
            ),
        ]
        db.add_all(acoes)
        db.flush()
        db.add_all(
            [
                AcaoMonitoramento(instrumento_id=inst.id, descricao="HISTORICO_ACAO_EXCLUIDA", deletado_em=instante),
                AcaoMonitoramento(
                    instrumento_id=inst.id, descricao="HISTORICO_ACAO_SUBSTITUIDA", substituido_por_id=acoes[1].id
                ),
            ]
        )
    db.flush()
    return instrumentos
