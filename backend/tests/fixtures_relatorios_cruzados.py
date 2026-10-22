"""Propostas e monitoramento sintéticos com o mesmo recorte de referência."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, PropostaCandidata
from tests.fixtures_relatorios_matriz import REGISTROS, criar_carteira_matriz


def criar_carteira_cruzada(db: Session) -> None:
    criar_carteira_matriz(db)
    marcos = {m.codigo: m for m in db.scalars(select(MarcoCatalogo))}
    for indice, registro in enumerate(REGISTROS):
        if not registro.oculto:
            db.add(
                PropostaCandidata(
                    id_proposta=9107001 + indice,
                    cnpj_ente_recebedor="00000000000001",
                    nm_proponente=f"Proponente sintético {registro.numero}",
                    municipio=registro.municipio,
                    uf=registro.uf,
                    cnes=registro.cnes,
                    ds_objeto="Aquisição sintética",
                    nm_programa="Programa da fonte nova",
                    id_programa=1,
                    componente_batido="Componente sintético",
                    vl_global_proposta=registro.global_,
                    situacao_proposta="Aprovada" if indice % 2 == 0 else "Em Análise",
                    data_proposta=date(registro.ano, 1, 31) if registro.ano else None,
                )
            )
        instrumento = InstrumentoEquipamento(
            nr_convenio=registro.numero,
            nome_convenente=f"Monitorado sintético {registro.numero}",
            municipio=registro.municipio,
            uf=registro.uf,
            cnes=registro.cnes,
            tipo_contratacao=registro.tipo,
            ano_instrumento=registro.ano,
        )
        db.add(instrumento)
        db.flush()
        # Duas conclusões reais, sempre com inauguração na mesma transação.
        if indice in (1, 2):
            assert registro.ano is not None
            concluido = marcos["fase_concluido"]
            db.add_all(
                [
                    EventoMarco(
                        instrumento_id=instrumento.id, marco_id=concluido.id, data_ocorrencia=date(registro.ano, 1, 31)
                    ),
                    EventoMarco(
                        instrumento_id=instrumento.id,
                        marco_id=marcos["cronograma_previsao_inauguracao"].id,
                        fase_geral_id=concluido.id,
                        data_ocorrencia=date(registro.ano, 1, 31),
                    ),
                ]
            )
    db.flush()
