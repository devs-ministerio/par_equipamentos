"""Carga pontual de 18 propostas PRONON de equipamento prioritário
(Acelerador Linear/Mamógrafo/PET-CT/Braquiterapia) achadas numa auditoria
manual contra a API TransfereGov Parcerias (2026-09-18) -- confirmadas por
leitura completa do `ds_objeto` de cada proposta, fora do escopo dos 8
componentes Fundo a Fundo que `job_descoberta_transferegov.py` varre todo
dia (PRONON é "Lei de incentivo à Saúde", instrumento diferente, nunca bate
no fuzzy-match desses 8 -- por isso nunca apareceu no radar sozinho).

Decisão do usuário: "PRONON" passa a ser um 9º valor válido de
`componente_batido`, ao lado dos 8 componentes Fundo a Fundo (ver
COMPONENTES_ALVO em levantamento_convenios_oncologia.py, que continua
intocado -- essa lista alimenta só o job de descoberta automática, não é
um enum de banco). Situação vinda da API mapeia pra status do Radar:
"Rejeitada" na fonte entra direto como `rejeitada` (já morreu, não pede
decisão da equipe); qualquer outra situação (Aprovada/Em Análise/Em
Elaboração) entra como `pendente` (aguardando revisão).

Idempotente por `id_proposta` (unique constraint já existe na tabela,
mesmo padrão de job_descoberta_transferegov.py). `--dry-run` faz rollback e
imprime o que seria feito.
"""
from __future__ import annotations

import argparse

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import PropostaCandidata, PropostaCandidataStatus
from app.pipeline.transferegov_parcerias import (
    _sessao_com_retry,
    buscar_itens_por_etapa,
    buscar_metas_por_proposta,
)

# (id_proposta, id_programa, nm_programa, cnpj, nome, uf, municipio,
#  equipamento_detectado, situacao_proposta, ds_objeto)
REGISTROS = [
    (617, 4, "Pronon - Serviços médico-assistenciais", "25112574000182",
     "ASSOCIACAO BENEFICENTE BOM SAMARITANO", "MG", "TEÓFILO OTONI", "Acelerador Linear", "Aprovada",
     "Ampliação da capacidade de tratamento oncológico com aquisição de acelerador linear avançado."),
    (1326, 11, "Pronon - Serviços médico-assistenciais (2º ciclo)", "09528436000122",
     "ASSOCIACAO BENEFICENTE HOSPITAL UNIVERSITARIO", "SP", "MARÍLIA", "Braquiterapia", "Em Elaboração",
     "Prestação de serviços médicos assistenciais, por meio da aquisição de um equipamento de Braquiterapia."),
    (9085, 11, "Pronon - Serviços médico-assistenciais (2º ciclo)", "00580644000104",
     "ASSOCIACAO DE COMBATE AO CANCER DO CENTRO OESTE DE MINAS", "MG", "DIVINÓPOLIS", "Mamografo", "Em Elaboração",
     "Aquisição de um mamógrafo digital, impressora Dry read e Fantoma para Mamografia."),
    (1294, 11, "Pronon - Serviços médico-assistenciais (2º ciclo)", "53221255003247",
     "ASSOCIACAO LAR SAO FRANCISCO DE ASSIS NA PROVIDENCIA DE DEUS", "SP", "PRESIDENTE PRUDENTE",
     "Acelerador Linear", "Em Análise",
     "Upgrade do acelerador linear Varian Clinac CX do Plano de Expansão da Radioterapia (PER-SUS) do HRPP."),
    (36510, 96, "Pronon - Prestação de Serviços Médico-Assistenciais", "53221255004995",
     "ASSOCIACAO LAR SAO FRANCISCO DE ASSIS NA PROVIDENCIA DE DEUS", "RJ", "RIO DE JANEIRO",
     "Acelerador Linear", "Rejeitada",
     "Aquisição de 01 equipamento de Acelerador Linear de Fótons destinado às sessões de "
     "Radioterapia a pacientes do SUS."),
    (36704, 96, "Pronon - Prestação de Serviços Médico-Assistenciais", "06300185000136",
     "ASSOCIACAO NOSSA CASA DE APOIO A PESSOAS COM CANCER", "CE", "FORTALEZA", "Acelerador Linear", "Rejeitada",
     "Aquisição de Acelerador Linear com IGRT 3D, Mamógrafo Digital e Pistolas para Biópsia Mamária."),
    (578, 4, "Pronon - Serviços médico-assistenciais", "66518267000930",
     "CENTRO DE ESTUDOS E PESQUISAS DR JOAO AMORIM", "SP", "SÃO PAULO", "Acelerador Linear", "Em Elaboração",
     "Aquisição de um acelerador linear para implantação de serviço de radioterapia no "
     "Hospital Estadual Dr. Albano da Franca Rocha Sobrinho."),
    (386, 4, "Pronon - Serviços médico-assistenciais", "18720938000141",
     "FUNDACAO DE DESENVOLVIMENTO DA PESQUISA", "MG", "BELO HORIZONTE", "PET/CT", "Rejeitada",
     "Modernização do CTMM com aquisição de um novo equipamento PET/CT de última geração."),
    (44927, 96, "Pronon - Prestação de Serviços Médico-Assistenciais", "49150352002409",
     "FUNDACAO PIO XII", "TO", "PALMAS", "Braquiterapia", "Aprovada",
     "Ampliação de equipamentos de alta complexidade incluindo 1 equipamento de braquiterapia "
     "(Fundação Pio XII Palmas)."),
    (321, 4, "Pronon - Serviços médico-assistenciais", "91616805000110",
     "HOSPITAL SAO JOAO BATISTA", "RS", "NOVA PRATA", "Mamografo", "Aprovada",
     "Substituição do equipamento de mamografia obsoleto no Hospital São João Batista."),
    (514, 4, "Pronon - Serviços médico-assistenciais", "20959292000100",
     "IRMANDADE NOSSA SENHORA DAS DORES", "MG", "ITABIRA", "Acelerador Linear", "Aprovada",
     "Aquisição de upgrade do acelerador linear do plano de expansão da radioterapia (PER-SUS) pacote 02."),
    (9105, 11, "Pronon - Serviços médico-assistenciais (2º ciclo)", "15153745000168",
     "SANTA CASA DE MISERICORDIA DA BAHIA", "BA", "SALVADOR", "Acelerador Linear", "Rejeitada",
     "Aquisição e instalação de acelerador linear no Hospital Santa Izabel."),
    (54, 4, "Pronon - Serviços médico-assistenciais", "43751502000167",
     "SANTA CASA DE MISERICORDIA DE ARACATUBA", "SP", "ARAÇATUBA", "Acelerador Linear", "Rejeitada",
     "Aquisição de um novo e moderno acelerador linear para terapias com radiação ionizante."),
    (507, 4, "Pronon - Serviços médico-assistenciais", "01619790000150",
     "SANTA CASA DE MISERICORDIA DE GOIANIA", "GO", "GOIÂNIA", "Mamografo", "Rejeitada",
     "Ampliação de ofertas diagnósticas incluindo aquisição de mamógrafo, entre outros equipamentos."),
    (36947, 96, "Pronon - Prestação de Serviços Médico-Assistenciais", "55990451000105",
     "SANTA CASA DE MISERICORDIA E BENEFICENCIA PORTUGUESA", "SP", "RIBEIRÃO PRETO",
     "Acelerador Linear", "Aprovada",
     "Substituição do Acelerador Linear para Ampliação e Qualificação da Assistência Oncológica do SUS."),
    (509, 4, "Pronon - Serviços médico-assistenciais", "61590410000124",
     "SOCIEDADE BENEFICENTE DE SENHORAS - HOSPITAL SIRIO LIBANES", "SP", "SÃO PAULO",
     "Braquiterapia", "Rejeitada",
     "Ampliar o acesso de pacientes SUS ao tratamento de braquiterapia."),
    (1265, 11, "Pronon - Serviços médico-assistenciais (2º ciclo)", "61590410000124",
     "SOCIEDADE BENEFICENTE DE SENHORAS - HOSPITAL SIRIO LIBANES", "SP", "SÃO PAULO",
     "Acelerador Linear", "Em Elaboração",
     "Aquisição e instalação de um novo acelerador linear no Hospital Sírio-Libanês."),
    (212, 4, "Pronon - Serviços médico-assistenciais", "92404789000164",
     "SOCIEDADE BENEFICENTE DO HOSPITAL DE CARIDADE", "RS", "FREDERICO WESTPHALEN", "Mamografo", "Aprovada",
     "Aquisição de equipamento de mamografia (digital) para o Hospital Divina Providência."),
]


def _status_de(situacao: str) -> PropostaCandidataStatus:
    return PropostaCandidataStatus.rejeitada if situacao == "Rejeitada" else PropostaCandidataStatus.pendente


def executar(*, dry_run: bool) -> dict[str, int]:
    resultado = {"criados": 0, "ja_existentes": 0}
    sessao = _sessao_com_retry()
    with SessionLocal() as db:
        for (id_proposta, id_programa, nm_programa, cnpj, nome, uf, municipio,
             equipamento, situacao, objeto) in REGISTROS:
            existente = db.execute(
                select(PropostaCandidata).where(PropostaCandidata.id_proposta == id_proposta)
            ).scalar_one_or_none()
            if existente is not None:
                resultado["ja_existentes"] += 1
                continue

            metas = buscar_metas_por_proposta(sessao, id_proposta)
            for meta in metas:
                for etapa in meta.get("etapas_proposta", []):
                    etapa["itens"] = buscar_itens_por_etapa(sessao, etapa["id_etapa_proposta"])

            db.add(PropostaCandidata(
                id_proposta=id_proposta,
                cnpj_ente_recebedor=cnpj,
                nm_proponente=nome,
                municipio=municipio,
                uf=uf,
                ds_objeto=objeto,
                nm_programa=nm_programa,
                id_programa=id_programa,
                componente_batido="PRONON",
                equipamento_detectado=equipamento,
                vl_global_proposta=None,
                situacao_proposta=situacao,
                data_proposta=None,
                metas_resumo={"metas": metas, "origem": "Auditoria manual 2026-09-18 · API TransfereGov Parcerias"},
                cnes=None,
                tem_parceria=False,
                cd_parceria=None,
                status=_status_de(situacao),
            ))
            resultado["criados"] += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    print(("SIMULAÇÃO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in resultado.items()))
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    executar(dry_run=args.dry_run)
