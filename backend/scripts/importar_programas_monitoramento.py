"""Carga idempotente de PERSUS I/II e PRONON.

PERSUS I vem da aba canônica ``Panorama PER-SUS``. PERSUS II e PRONON
ficam em CSVs versionados ao lado deste script para preservar exatamente a
fonte recebida. A carga nunca inventa CNPJ: enriquece nome/localização pela
referência CNES e rejeita CNES inexistente.

Destino (correção 2026-09-18, Plan Mode monitoramento-ingestao -- a carga
original tinha jogado tudo em `instrumento_equipamento`, monitoramento
interno; o universo correto é `convenio`, "Instrumentos firmados"):
  - PERSUS I NÃO inaugurado: entra em `convenio` E em `instrumento_
    equipamento` (só esse subconjunto é ativamente acompanhado pela
    equipe, mesmo padrão do Convênio/FAF/TED já monitorados).
  - PERSUS I inaugurado, PERSUS II e PRONON: entram só em `convenio`.

Identificador visível (`numero`/`nr_convenio`) é aleatório com prefixo do
tipo (ver `scripts/lib_identificadores.py` -- essas fontes nunca têm NUP/
número oficial, gerar um "bonito" a partir do CNES/tipologia ficou "muito
ruim" de ler, achado do usuário 2026-09-18). O identificador antigo
determinístico (`PERSUS1-{cnes}-{tipologia}` etc.) migra pra `chave_origem`
-- usado só pelo upsert desta carga, nunca exposto na API/UI. PRONON ainda
não tem uma fonte de identificador oficial estudada (pendência registrada
no diagnóstico de ingestão) -- este esquema aleatório fica valendo até a
equipe encontrar uma alternativa melhor.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import openpyxl
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import CnesEstabelecimento, Convenio, EventoMarco, InstrumentoEquipamento, MarcoCatalogo
from scripts.lib_identificadores import gerar_identificador_aleatorio
from scripts.lib_monitoramento_convenio import espelhar_convenio

PREFIXOS = {"PERSUS I": "PS1", "PERSUS II": "PS2", "PRONON": "PN"}

ROOT = Path(__file__).resolve().parents[2]
PERSUS_I = ROOT / "docs/monitoramento-equipamentos/Apresentação PER-SUS.xlsx"
PERSUS_II = Path(__file__).parent / "data/persus_ii.csv"
PRONON = Path(__file__).parent / "data/pronon.csv"
TIPOLOGIAS = {"A", "CV", "C", "EO", "C.B", "NA"}


@dataclass(frozen=True)
class RegistroPrograma:
    identificador: str
    cnes: str
    programa: str
    tipo_contratacao: str
    origem_dado: str
    tipologia: str
    investimento: Decimal | None
    situacao: str | None
    natureza_servico: str | None
    municipio: str | None = None
    uf: str | None = None
    nome: str | None = None
    inauguracao: date | None = None
    licenca_operacao: date | None = None
    observacao: str | None = None


def _data(valor: object) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    return None


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def _cnes(valor: object) -> str | None:
    digitos = re.sub(r"\D", "", str(valor or ""))
    return digitos.zfill(7) if 1 <= len(digitos) <= 7 else None


def _ler_persus_i() -> list[RegistroPrograma]:
    ws = openpyxl.load_workbook(PERSUS_I, read_only=True, data_only=True)["Panorama PER-SUS"]
    origem = f"PERSUS I · Apresentação PER-SUS.xlsx · sha256:{_sha256(PERSUS_I)}"
    registros: list[RegistroPrograma] = []
    for linha in ws.iter_rows(min_row=13, values_only=True):
        tipologia = str(linha[1] or "").strip().upper()
        cnes = _cnes(linha[8])
        if not cnes or tipologia not in TIPOLOGIAS:
            continue
        situacao = str(linha[16]).strip() if linha[16] not in (None, "", "-") else None
        registros.append(RegistroPrograma(
            identificador=f"PERSUS1-{cnes}-{tipologia}",
            cnes=cnes,
            programa="PERSUS I",
            tipo_contratacao="PERSUS I",
            origem_dado=origem,
            tipologia=tipologia,
            investimento=Decimal(str(linha[13])) if isinstance(linha[13], (int, float, Decimal)) else None,
            situacao=situacao,
            natureza_servico="Modernização" if tipologia == "EO" else "Novo",
            municipio=str(linha[3]).strip() if linha[3] else None,
            uf=str(linha[5]).strip() if linha[5] else None,
            nome=str(linha[6]).strip() if linha[6] else None,
            inauguracao=_data(linha[15]),
            licenca_operacao=_data(linha[12]),
            observacao=str(linha[17]).strip() if linha[17] not in (None, "", "-") else None,
        ))
    return registros


def _ler_csv(path: Path, *, tipo: str) -> list[RegistroPrograma]:
    origem = f"{tipo} · {path.name} · sha256:{_sha256(path)}"
    registros = []
    with path.open(encoding="utf-8", newline="") as arquivo:
        for linha in csv.DictReader(arquivo):
            cnes = _cnes(linha["cnes"])
            tipologia = linha["tipologia"].strip().upper()
            if not cnes or tipologia not in TIPOLOGIAS:
                raise ValueError(f"Registro inválido em {path.name}: CNES={linha['cnes']!r}, tipologia={tipologia!r}")
            ano = re.search(r"20\d{2}", linha["programa"])
            identificador = (
                f"PERSUS2-{cnes}" if tipo == "PERSUS II"
                else f"PRONON-{ano.group(0) if ano else 'SEM-ANO'}-{cnes}"
            )
            registros.append(RegistroPrograma(
                identificador=identificador,
                cnes=cnes,
                programa=linha["programa"].strip(),
                tipo_contratacao=tipo,
                origem_dado=origem,
                tipologia=tipologia,
                investimento=Decimal(linha["investimento"]) if linha["investimento"] else None,
                situacao=linha["situacao"].strip() or None,
                natureza_servico=linha["natureza"].strip() or None,
            ))
    return registros


def _adicionar_evento_se_ausente(
    *, db, instrumento_id: int, marco: MarcoCatalogo | None, data_ocorrencia: date | None,
    data_prevista: date | None, observacao: str | None,
) -> bool:
    if marco is None or (data_ocorrencia is None and data_prevista is None):
        return False
    existe = db.execute(select(EventoMarco.id).where(
        EventoMarco.instrumento_id == instrumento_id,
        EventoMarco.marco_id == marco.id,
        EventoMarco.data_ocorrencia == data_ocorrencia,
        EventoMarco.data_prevista == data_prevista,
    )).scalar_one_or_none()
    if existe is not None:
        return False
    db.add(EventoMarco(
        instrumento_id=instrumento_id,
        marco_id=marco.id,
        data_ocorrencia=data_ocorrencia,
        data_prevista=data_prevista,
        observacao=observacao,
    ))
    return True


def executar(*, dry_run: bool) -> dict[str, int]:
    registros = _ler_persus_i() + _ler_csv(PERSUS_II, tipo="PERSUS II") + _ler_csv(PRONON, tipo="PRONON")
    if len({r.identificador for r in registros}) != len(registros):
        raise ValueError("A fonte contém identificadores duplicados.")

    resultado = {
        "convenio_criados": 0, "convenio_atualizados": 0,
        "monitoramento_criados": 0, "monitoramento_atualizados": 0,
        "eventos": 0, "rejeitados": 0,
    }
    with SessionLocal() as db:
        referencias = {
            r.cnes: r for r in db.execute(
                select(CnesEstabelecimento).where(CnesEstabelecimento.cnes.in_({x.cnes for x in registros}))
            ).scalars()
        }
        instrumentos_por_chave = {
            i.chave_origem: i for i in db.execute(
                select(InstrumentoEquipamento).where(
                    InstrumentoEquipamento.chave_origem.in_({x.identificador for x in registros})
                )
            ).scalars()
        }
        convenios_por_chave = {
            c.chave_origem: c for c in db.execute(
                select(Convenio).where(Convenio.chave_origem.in_({x.identificador for x in registros}))
            ).scalars()
        }
        marcos = {
            m.codigo: m for m in db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo.in_({
                "cronograma_previsao_inauguracao", "regulatorio_licenca_operacao",
            }))).scalars()
        }
        existentes = (
            {n for n in db.execute(select(Convenio.numero)).scalars()}
            | {n for n in db.execute(select(InstrumentoEquipamento.nr_convenio)).scalars()}
        )

        for registro in registros:
            referencia = referencias.get(registro.cnes)
            if referencia is None:
                resultado["rejeitados"] += 1
                print(f"[REJEITADO] {registro.identificador}: CNES {registro.cnes} não existe na referência")
                continue

            # Só o subconjunto PERSUS I ainda não inaugurado é ativamente
            # acompanhado no monitoramento interno -- ver docstring do
            # módulo. Todo o resto (PERSUS I concluído, PERSUS II, PRONON)
            # entra só em "Instrumentos firmados".
            fica_no_monitoramento = registro.tipo_contratacao == "PERSUS I" and (
                not registro.situacao or "INAUGURADA" not in registro.situacao.upper()
                or "NÃO" in registro.situacao.upper()
            )

            instrumento = instrumentos_por_chave.get(registro.identificador)
            numero = instrumento.nr_convenio if instrumento else (
                convenios_por_chave[registro.identificador].numero
                if registro.identificador in convenios_por_chave
                else gerar_identificador_aleatorio(PREFIXOS[registro.tipo_contratacao], existentes)
            )

            nome_convenente = registro.nome or referencia.nome_estabelecimento
            municipio = registro.municipio or referencia.municipio
            uf = registro.uf or referencia.uf

            if fica_no_monitoramento:
                campos = {
                    "cnpj_convenente": referencia.cnpj,
                    "nome_convenente": nome_convenente,
                    "municipio": municipio,
                    "uf": uf,
                    "cnes": registro.cnes,
                    "programa": registro.programa,
                    "tipo_contratacao": registro.tipo_contratacao,
                    "origem_dado": registro.origem_dado,
                    "tipologia": registro.tipologia,
                    "investimento_aquisicao": registro.investimento,
                    "situacao_programa": registro.situacao,
                    "natureza_servico": registro.natureza_servico,
                    "equipamento_descricao": "Acelerador linear / serviço de radioterapia",
                    "chave_origem": registro.identificador,
                }
                if instrumento is None:
                    instrumento = InstrumentoEquipamento(nr_convenio=numero, **campos)
                    db.add(instrumento)
                    db.flush()
                    instrumentos_por_chave[registro.identificador] = instrumento
                    resultado["monitoramento_criados"] += 1
                else:
                    for campo, valor in campos.items():
                        setattr(instrumento, campo, valor)
                    resultado["monitoramento_atualizados"] += 1

                inaugurada = bool(registro.situacao and "INAUGURADA" in registro.situacao.upper())
                if _adicionar_evento_se_ausente(
                    db=db,
                    instrumento_id=instrumento.id,
                    marco=marcos.get("cronograma_previsao_inauguracao"),
                    data_ocorrencia=registro.inauguracao if inaugurada else None,
                    data_prevista=registro.inauguracao if not inaugurada else None,
                    observacao=f"Importado de {registro.origem_dado}. {registro.observacao or ''}".strip(),
                ):
                    resultado["eventos"] += 1
                if _adicionar_evento_se_ausente(
                    db=db,
                    instrumento_id=instrumento.id,
                    marco=marcos.get("regulatorio_licenca_operacao"),
                    data_ocorrencia=registro.licenca_operacao,
                    data_prevista=None,
                    observacao=f"Importado de {registro.origem_dado}.",
                ):
                    resultado["eventos"] += 1
            elif instrumento is not None:
                # Reversão possível (ex. inauguração cadastrada, planilha
                # volta a apontar "não inaugurada") -- não deveria
                # acontecer na prática, mas nunca deixar um instrumento
                # órfão sem correspondência com o critério atual.
                db.execute(EventoMarco.__table__.delete().where(EventoMarco.instrumento_id == instrumento.id))
                db.delete(instrumento)
                del instrumentos_por_chave[registro.identificador]

            existe_convenio = registro.identificador in convenios_por_chave
            espelhar_convenio(
                db,
                numero=numero,
                chave_origem=registro.identificador,
                tipo_contratacao=registro.tipo_contratacao,
                origem_dado=registro.origem_dado,
                nome_convenente=nome_convenente,
                cnpj_convenente=referencia.cnpj,
                municipio=municipio,
                uf=uf,
                cnes=registro.cnes,
                programa=registro.programa,
                ano_instrumento=None,
                objeto=registro.natureza_servico,
                situacao=registro.situacao,
                investimento=registro.investimento,
                equipamento_descricao="Acelerador linear / serviço de radioterapia",
                componente=None,
            )
            resultado["convenio_atualizados" if existe_convenio else "convenio_criados"] += 1

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
