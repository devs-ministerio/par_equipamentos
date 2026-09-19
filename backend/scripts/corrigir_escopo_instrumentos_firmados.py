"""Correção pontual do Plan Mode monitoramento-ingestao (2026-09-18): a
carga de hoje (`importar_programas_monitoramento.py` +
`importar_planilha_monitoramento.py`) gravou FAF/TED/PERSUS I/PERSUS II/
PRONON só em `instrumento_equipamento` (monitoramento interno). O universo
correto pra todos eles é `convenio` ("Instrumentos firmados") -- só
permanecem TAMBÉM no monitoramento interno o que a equipe já cadastrava
(Convênio/FAF/TED, decisão do usuário) e PERSUS I ainda não concluído
(`situacao_programa != 'Inaugurada'`).

Escopo desta correção:
  - Convênio (71): intocado.
  - FAF (12) / TED (3): permanecem no monitoramento interno (decisão do
    usuário: preservar o cadastro/eventos/ações já existentes), GANHAM
    espelho em `convenio` e trocam `nr_convenio` (NUP SEI só com dígitos,
    achado do usuário: "ficou muito ruim") por um identificador aleatório
    com prefixo -- o NUP SEI antigo migra pra `chave_origem` (upsert
    estável, nunca mais exposto).
  - PERSUS I concluído ("Inaugurada", 87): sai do monitoramento interno
    (evento/instrumento apagados via cascade), entra só em `convenio`.
  - PERSUS I não concluído ("Não inaugurada", 5): fica nos dois (mesmo
    padrão do Convênio tracked) -- troca nr_convenio por aleatório, chave
    antiga preservada em `chave_origem`, espelho criado em `convenio`.
  - PERSUS II (50) / PRONON (21): saem do monitoramento interno, entram só
    em `convenio`.

Idempotente por `chave_origem` -- reexecutar não duplica nem gera novo
identificador aleatório pra quem já foi corrigido. `--dry-run` faz rollback
no final e imprime o que seria feito.
"""
from __future__ import annotations

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import AcaoMonitoramento, Convenio, EventoMarco, InstrumentoEquipamento
from scripts.lib_identificadores import gerar_identificador_aleatorio
from scripts.lib_monitoramento_convenio import espelhar_convenio

PREFIXOS = {"FAF": "FAF", "TED": "TED", "PERSUS I": "PERSUS1", "PERSUS II": "PERSUS2", "PRONON": "PRONON"}


def _espelhar(*, db, instrumento: InstrumentoEquipamento, numero: str, chave_origem: str) -> Convenio:
    return espelhar_convenio(
        db,
        numero=numero,
        chave_origem=chave_origem,
        tipo_contratacao=instrumento.tipo_contratacao,
        tipologia=instrumento.tipologia,
        origem_dado=instrumento.origem_dado,
        nome_convenente=instrumento.nome_convenente,
        cnpj_convenente=instrumento.cnpj_convenente,
        municipio=instrumento.municipio,
        uf=instrumento.uf,
        cnes=instrumento.cnes,
        programa=instrumento.programa or instrumento.tipo_contratacao,
        ano_instrumento=instrumento.ano_instrumento,
        objeto=instrumento.natureza_servico or instrumento.componente or instrumento.tipologia,
        situacao=instrumento.situacao_programa,
        investimento=instrumento.investimento_aquisicao,
        equipamento_descricao=instrumento.equipamento_descricao,
        componente=instrumento.componente,
    )


def executar(*, dry_run: bool) -> dict[str, int]:
    resultado = {
        "faf_ted_migrados": 0, "persus1_nao_concluido_migrado": 0,
        "movidos_para_convenio_apenas": 0, "instrumentos_removidos": 0,
        "ja_corrigidos": 0,
    }
    with SessionLocal() as db:
        existentes = {
            n for n in db.execute(select(Convenio.numero)).scalars()
        } | {
            n for n in db.execute(select(InstrumentoEquipamento.nr_convenio)).scalars()
        }

        instrumentos = db.execute(
            select(InstrumentoEquipamento).where(
                InstrumentoEquipamento.tipo_contratacao.in_(list(PREFIXOS))
            )
        ).scalars().all()

        for inst in instrumentos:
            fica_no_monitoramento = inst.tipo_contratacao in ("FAF", "TED") or (
                inst.tipo_contratacao == "PERSUS I" and inst.situacao_programa != "Inaugurada"
            )

            if inst.chave_origem is not None:
                # Já corrigido em execução anterior -- só garante que o
                # espelho em `convenio` existe (idempotente).
                if fica_no_monitoramento:
                    _espelhar(db=db, instrumento=inst, numero=inst.nr_convenio, chave_origem=inst.chave_origem)
                resultado["ja_corrigidos"] += 1
                continue

            chave_origem = inst.nr_convenio  # identificador antigo (NUP SEI/PERSUSx-CNES), preservado só pra upsert
            novo_id = gerar_identificador_aleatorio(PREFIXOS[inst.tipo_contratacao], existentes)

            if fica_no_monitoramento:
                inst.chave_origem = chave_origem
                inst.nr_convenio = novo_id
                _espelhar(db=db, instrumento=inst, numero=novo_id, chave_origem=chave_origem)
                if inst.tipo_contratacao == "PERSUS I":
                    resultado["persus1_nao_concluido_migrado"] += 1
                else:
                    resultado["faf_ted_migrados"] += 1
            else:
                _espelhar(db=db, instrumento=inst, numero=novo_id, chave_origem=chave_origem)
                db.execute(EventoMarco.__table__.delete().where(EventoMarco.instrumento_id == inst.id))
                db.execute(AcaoMonitoramento.__table__.delete().where(AcaoMonitoramento.instrumento_id == inst.id))
                db.delete(inst)
                resultado["movidos_para_convenio_apenas"] += 1
                resultado["instrumentos_removidos"] += 1

        db.flush()
        if dry_run:
            db.rollback()
        else:
            db.commit()
    print(("SIMULAÇÃO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in resultado.items()))
    return resultado


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    executar(dry_run=args.dry_run)
