"""Carga complementar de PRONON (2026-09-18): auditoria contra a API pública
TransfereGov Parcerias (`api-publica.transferegov.gestao.gov.br/parcerias`)
achou 18 entidades com proposta de aquisição real de equipamento prioritário
(Acelerador Linear/Mamógrafo/PET-CT/Gama-câmara-SPECT/Braquiterapia) nos
mesmos 3 ciclos PRONON que a carga original (`pronon.csv`, `importar_
programas_monitoramento.py`) não cobria -- confirmado por leitura manual do
`ds_objeto` completo de cada proposta (curadoria feita fora deste script,
excluindo capacitação/serviço de exame/menção genérica).

Cada linha é uma proposta -- nunca uma parceria formalizada ainda (nenhuma
tem `cd_parceria`/NUP SEI na API no momento da carga), por isso entra só em
`convenio` ("Instrumentos firmados"), nunca em `instrumento_equipamento`
(monitoramento interno é só pra quem a equipe decide acompanhar
ativamente -- ver CLAUDE.md).

Idempotente por `chave_origem` (f"PRONON-API-{id_proposta}"). `--dry-run`
faz rollback e imprime o que seria feito.
"""
from __future__ import annotations

import argparse

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Convenio
from scripts.lib_identificadores import gerar_identificador_aleatorio
from scripts.lib_monitoramento_convenio import espelhar_convenio

# (chave_origem, cnpj, nome, uf, municipio, programa, tags, situacao, objeto)
REGISTROS = [
    ("PRONON-API-617", "25112574000182", "ASSOCIACAO BENEFICENTE BOM SAMARITANO", "MG",
     "TEÓFILO OTONI", "Pronon - Serviços médico-assistenciais", ["Acelerador Linear"], "Aprovada",
     "Ampliação da capacidade de tratamento oncológico com aquisição de acelerador linear avançado."),
    ("PRONON-API-1326", "09528436000122", "ASSOCIACAO BENEFICENTE HOSPITAL UNIVERSITARIO", "SP",
     "MARÍLIA", "Pronon - Serviços médico-assistenciais (2º ciclo)", ["Braquiterapia"], "Em Elaboração",
     "Prestação de serviços médicos assistenciais, por meio da aquisição de um equipamento de Braquiterapia."),
    ("PRONON-API-36911", "60922168005307", "ASSOCIACAO CONGREGACAO DE SANTA CATARINA", "SC",
     "TUBARÃO", "Pronon - Prestação de Serviços Médico-Assistenciais", ["Acelerador Linear"], "Aprovada",
     "Modernização tecnológica com upgrade do acelerador linear e aquisição de tomógrafo computadorizado."),
    ("PRONON-API-9085", "00580644000104", "ASSOCIACAO DE COMBATE AO CANCER DO CENTRO OESTE DE MINAS", "MG",
     "DIVINÓPOLIS", "Pronon - Serviços médico-assistenciais (2º ciclo)", ["Mamógrafo"], "Em Elaboração",
     "Aquisição de um mamógrafo digital, impressora Dry read e Fantoma para Mamografia."),
    ("PRONON-API-1294", "53221255003247", "ASSOCIACAO LAR SAO FRANCISCO DE ASSIS NA PROVIDENCIA DE DEUS", "SP",
     "PRESIDENTE PRUDENTE", "Pronon - Serviços médico-assistenciais (2º ciclo)", ["Acelerador Linear"], "Em Análise",
     "Upgrade do acelerador linear Varian Clinac CX do Plano de Expansão da Radioterapia (PER-SUS) do HRPP."),
    ("PRONON-API-36510", "53221255004995", "ASSOCIACAO LAR SAO FRANCISCO DE ASSIS NA PROVIDENCIA DE DEUS", "RJ",
     "RIO DE JANEIRO", "Pronon - Prestação de Serviços Médico-Assistenciais", ["Acelerador Linear"], "Rejeitada",
     "Aquisição de 01 equipamento de Acelerador Linear de Fótons destinado às sessões de "
     "Radioterapia a pacientes do SUS."),
    ("PRONON-API-36704", "06300185000136", "ASSOCIACAO NOSSA CASA DE APOIO A PESSOAS COM CANCER", "CE",
     "FORTALEZA", "Pronon - Prestação de Serviços Médico-Assistenciais",
     ["Acelerador Linear", "Mamógrafo"], "Rejeitada",
     "Aquisição de Acelerador Linear com IGRT 3D, Mamógrafo Digital e Pistolas para Biópsia Mamária."),
    ("PRONON-API-578", "66518267000930", "CENTRO DE ESTUDOS E PESQUISAS DR JOAO AMORIM", "SP",
     "SÃO PAULO", "Pronon - Serviços médico-assistenciais", ["Acelerador Linear"], "Em Elaboração",
     "Aquisição de um acelerador linear para implantação de serviço de radioterapia no "
     "Hospital Estadual Dr. Albano da Franca Rocha Sobrinho."),
    ("PRONON-API-386", "18720938000141", "FUNDACAO DE DESENVOLVIMENTO DA PESQUISA", "MG",
     "BELO HORIZONTE", "Pronon - Serviços médico-assistenciais", ["PET/CT"], "Rejeitada",
     "Modernização do CTMM com aquisição de um novo equipamento PET/CT de última geração."),
    ("PRONON-API-44927", "49150352002409", "FUNDACAO PIO XII", "TO",
     "PALMAS", "Pronon - Prestação de Serviços Médico-Assistenciais", ["Braquiterapia"], "Aprovada",
     "Ampliação de equipamentos de alta complexidade incluindo 1 equipamento de braquiterapia "
     "(Fundação Pio XII Palmas)."),
    ("PRONON-API-321", "91616805000110", "HOSPITAL SAO JOAO BATISTA", "RS",
     "NOVA PRATA", "Pronon - Serviços médico-assistenciais", ["Mamógrafo"], "Aprovada",
     "Substituição do equipamento de mamografia obsoleto no Hospital São João Batista."),
    ("PRONON-API-514", "20959292000100", "IRMANDADE NOSSA SENHORA DAS DORES", "MG",
     "ITABIRA", "Pronon - Serviços médico-assistenciais", ["Acelerador Linear"], "Aprovada",
     "Aquisição de upgrade do acelerador linear do plano de expansão da radioterapia (PER-SUS) pacote 02."),
    ("PRONON-API-9105", "15153745000168", "SANTA CASA DE MISERICORDIA DA BAHIA", "BA",
     "SALVADOR", "Pronon - Serviços médico-assistenciais (2º ciclo)", ["Acelerador Linear"], "Rejeitada",
     "Aquisição e instalação de acelerador linear no Hospital Santa Izabel."),
    ("PRONON-API-54", "43751502000167", "SANTA CASA DE MISERICORDIA DE ARACATUBA", "SP",
     "ARAÇATUBA", "Pronon - Serviços médico-assistenciais", ["Acelerador Linear"], "Rejeitada",
     "Aquisição de um novo e moderno acelerador linear para terapias com radiação ionizante."),
    ("PRONON-API-507", "01619790000150", "SANTA CASA DE MISERICORDIA DE GOIANIA", "GO",
     "GOIÂNIA", "Pronon - Serviços médico-assistenciais", ["Mamógrafo"], "Rejeitada",
     "Ampliação de ofertas diagnósticas incluindo aquisição de mamógrafo, entre outros equipamentos."),
    ("PRONON-API-36947", "55990451000105", "SANTA CASA DE MISERICORDIA E BENEFICENCIA PORTUGUESA", "SP",
     "RIBEIRÃO PRETO", "Pronon - Prestação de Serviços Médico-Assistenciais", ["Acelerador Linear"], "Aprovada",
     "Substituição do Acelerador Linear para Ampliação e Qualificação da Assistência Oncológica do SUS."),
    ("PRONON-API-509", "61590410000124", "SOCIEDADE BENEFICENTE DE SENHORAS - HOSPITAL SIRIO LIBANES", "SP",
     "SÃO PAULO", "Pronon - Serviços médico-assistenciais", ["Braquiterapia"], "Rejeitada",
     "Ampliar o acesso de pacientes SUS ao tratamento de braquiterapia."),
    ("PRONON-API-1265", "61590410000124", "SOCIEDADE BENEFICENTE DE SENHORAS - HOSPITAL SIRIO LIBANES", "SP",
     "SÃO PAULO", "Pronon - Serviços médico-assistenciais (2º ciclo)", ["Acelerador Linear"], "Em Elaboração",
     "Aquisição e instalação de um novo acelerador linear no Hospital Sírio-Libanês."),
    ("PRONON-API-212", "92404789000164", "SOCIEDADE BENEFICENTE DO HOSPITAL DE CARIDADE", "RS",
     "FREDERICO WESTPHALEN", "Pronon - Serviços médico-assistenciais", ["Mamógrafo"], "Aprovada",
     "Aquisição de equipamento de mamografia (digital) para o Hospital Divina Providência."),
]


def executar(*, dry_run: bool) -> dict[str, int]:
    resultado = {"criados": 0, "atualizados": 0}
    with SessionLocal() as db:
        existentes = (
            {n for n in db.execute(select(Convenio.numero)).scalars()}
        )
        for chave_origem, cnpj, nome, uf, municipio, programa, tags, situacao, objeto in REGISTROS:
            existente = db.execute(select(Convenio).where(Convenio.chave_origem == chave_origem)).scalar_one_or_none()
            numero = existente.numero if existente else gerar_identificador_aleatorio("PN", existentes)
            convenio = espelhar_convenio(
                db,
                numero=numero,
                chave_origem=chave_origem,
                tipo_contratacao="PRONON",
                tipologia=None,
                origem_dado=(
                    "PRONON · API TransfereGov Parcerias (api-publica.transferegov.gestao.gov.br) "
                    "· curadoria manual 2026-09-18"
                ),
                nome_convenente=nome,
                cnpj_convenente=cnpj,
                municipio=municipio,
                uf=uf,
                cnes=None,
                programa=programa,
                ano_instrumento=None,
                objeto=objeto,
                situacao=situacao,
                investimento=None,
                equipamento_descricao=" / ".join(tags),
                componente=None,
            )
            # `equipamentos_tags` de `espelhar_convenio` só cobre Acelerador
            # Linear (ver lib_monitoramento_convenio.py) -- aqui a tag já
            # veio confirmada pela curadoria manual, sobrescreve.
            convenio.equipamentos_tags = tags
            if existente is None:
                resultado["criados"] += 1
            else:
                resultado["atualizados"] += 1
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
