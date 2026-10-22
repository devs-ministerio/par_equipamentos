"""Lotes sintéticos nos tetos reais, inseridos somente na transação de teste."""

from sqlalchemy import insert

from app.db.models import Convenio, MacroCoverage, MunicipalityCoverage, PropostaCandidata
from app.repositories import cobertura_relatorio, convenios, propostas_candidatas_relatorio
from tests.fixtures_relatorios_merito import criar_execucao

TETOS = {"convenios": 5000, "propostas": 5000, "macros": 1000, "municipios": 10_000}
MODELOS = {
    "convenios": Convenio,
    "propostas": PropostaCandidata,
    "macros": MacroCoverage,
    "municipios": MunicipalityCoverage,
}


def criar_lote_limite(db, origem):
    execucao = criar_execucao(db, "QA_LIMITE", "__qa_limite__", 2099, publicada=True)
    linhas = [linha_limite(origem, n, execucao.id) for n in range(TETOS[origem])]
    db.execute(insert(MODELOS[origem]), linhas)
    db.flush()
    return execucao.id


def linha_limite(origem, indice, execution_id, municipio="AAAA sintético"):
    if origem == "convenios":
        return {
            "numero": f"QA_LIMITE_{indice:05}",
            "convenente_nome": "Instituição sintética",
            "uf": "AC",
            "municipio": municipio,
        }
    if origem == "propostas":
        return {
            "id_proposta": 9_800_000 + indice,
            "nm_proponente": "Proponente sintético",
            "ds_objeto": "Aquisição sintética para teste de exportação",
            "componente_batido": "Componente sintético",
            "cnpj_ente_recebedor": "00000000000001",
            "id_programa": 1,
            "nm_programa": "Programa sintético",
            "uf": "AC",
            "municipio": municipio,
        }
    base = {
        "execution_id": execution_id,
        "equipment_family": "QA_LIMITE",
        "state": "AC",
        "deficit_status": "not_available",
    }
    if origem == "macros":
        return {**base, "macro_code": f"Q{indice:05}", "macro_name": f"Macro {indice:05}"}
    return {
        **base,
        "ibge_code": str(9_800_000 + indice),
        "municipality_name": municipio,
    }


def consultar_lote(db, origem, execution_id, municipio=None):
    if origem == "convenios":
        return convenios.listar_convenios_filtrados(db, ufs=["AC"], municipio=municipio)
    if origem == "propostas":
        return propostas_candidatas_relatorio.listar_propostas_filtradas(db, ufs=["AC"], municipio=municipio)
    if origem == "macros":
        return cobertura_relatorio.listar_macro_coverage(db, execution_id=execution_id, ufs=["AC"])
    return cobertura_relatorio.listar_municipality_coverage(
        db, execution_id=execution_id, ufs=["AC"], municipio=municipio
    )
