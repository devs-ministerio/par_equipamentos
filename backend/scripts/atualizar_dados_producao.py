"""Executor batch autorizado; nenhuma sessão de usuário ou migration é criada.

Usar no GitHub Actions com ATUALIZACOES_PRODUCAO=true e credencial runtime.
Cada tarefa falha separadamente e nunca imprime exceção/URL com credenciais.
"""

from __future__ import annotations

import argparse
import importlib
import json
import os
import secrets
import traceback
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import TypedDict

from pydantic import ValidationError as ErroContrato
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

TAREFAS = {
    "siconv": ("scripts.job_verificacao_siconv", "siconv_legado"),
    "transferegov": ("scripts.job_verificacao_transferegov", "transferegov_verificacao"),
    "descoberta-transferegov": ("scripts.job_descoberta_transferegov", "transferegov_descoberta"),
    "descoberta-siconv": ("scripts.job_descoberta_siconv", "siconv_descoberta"),
    "vigencia": ("scripts.job_alerta_vigencia", "alerta_vigencia"),
    "tomografo": ("scripts.run_pipeline_tomografo", "cnes_tomografo"),
    "ressonancia": ("scripts.run_pipeline_ressonancia", "cnes_ressonancia"),
    "pet-ct": ("scripts.run_pipeline_pet_ct", "cnes_pet_ct"),
    "populacao": ("scripts.importar_populacao_municipios", "populacao_ans"),
}
CHAVE_LOCK = 739021027


def validar_ambiente(ambiente: Mapping[str, str]) -> None:
    if ambiente.get("GITHUB_ACTIONS") != "true" or ambiente.get("ATUALIZACOES_PRODUCAO") != "true":
        raise ValueError("Executor exclusivo de atualização autorizada no GitHub Actions.")
    if any(ambiente.get(nome) for nome in ("DATABASE_URL_MIGRATION", "TEST_DATABASE_URL")):
        raise ValueError("Credenciais de migração/teste não pertencem ao executor runtime.")
    if any(nome.startswith("PG") and valor for nome, valor in ambiente.items()):
        raise ValueError("Não herdar configuração PG no executor.")
    url = make_url(ambiente.get("DATABASE_URL", ""))
    if url.get_backend_name() not in {"postgres", "postgresql"} or url.username != "sigeo_runtime":
        raise ValueError("Atualização exige PostgreSQL e role sigeo_runtime.")
    if not url.host or not url.host.endswith(".neon.tech"):
        raise ValueError("Destino de produção não reconhecido.")
    if Path(".env").exists():
        raise ValueError("Runner deve usar secrets explícitos, sem arquivo .env.")


def _preflight() -> None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from app.db.base import engine

    esperadas = set(ScriptDirectory.from_config(Config("alembic.ini")).get_heads())
    with engine.connect() as conexao:
        conexao.execute(text("SET TRANSACTION READ ONLY"))
        atuais = set(conexao.execute(text("SELECT version_num FROM alembic_version")).scalars())
        if atuais != esperadas:
            raise ValueError("Schema de produção difere das migrations do executor; nenhuma carga iniciada.")
        if conexao.execute(text("SELECT current_user")).scalar_one() != "sigeo_runtime":
            raise ValueError("Role conectada não é runtime.")
        for tabela in ("fonte_captura", "convenio", "proposta_candidata", "candidato_legado"):
            permitido = conexao.execute(
                text(
                    "SELECT bool_and(has_table_privilege(current_user, :tabela, privilegio)) "
                    "FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) AS privilegio"
                ),
                {"tabela": tabela},
            ).scalar_one()
            if not permitido:
                raise ValueError("Runtime não tem os privilégios necessários para atualizar.")
        print(json.dumps({"preflight": "ok", "schema": sorted(atuais), "role": "sigeo_runtime"}))
        conexao.rollback()


class ResumoCaptura(TypedDict):
    id: int
    status: str
    itens_verificados: int
    itens_alterados: int
    avisos_criados: int


def _ultima_captura(fonte: str, *, depois_de: int = 0) -> ResumoCaptura | None:
    from app.db.base import engine

    with engine.connect() as conexao:
        linha = (
            conexao.execute(
                text(
                    "SELECT id, status, itens_verificados, itens_alterados, avisos_criados FROM fonte_captura "
                    "WHERE fonte = :fonte AND id > :depois ORDER BY id DESC LIMIT 1"
                ),
                {"fonte": fonte, "depois": depois_de},
            )
            .mappings()
            .first()
        )
        if linha is None:
            return None
        return ResumoCaptura(
            id=linha["id"],
            status=linha["status"],
            itens_verificados=linha["itens_verificados"],
            itens_alterados=linha["itens_alterados"],
            avisos_criados=linha["avisos_criados"],
        )


def executar(tarefa: str) -> None:
    validar_ambiente(os.environ)
    # Settings exige assinatura configurada, mas batch não assina sessões.
    # Um segredo novo em memória evita compartilhar a chave real do backend.
    os.environ["JWT_SECRET"] = secrets.token_urlsafe(48)
    _preflight()
    if tarefa == "preflight":
        return

    from app.db.base import engine
    from app.services.capturas_fonte import captura

    # Lock de sessão não deve passar pelo pooler transacional do Neon.
    # Apenas a conexão da trava é direta; os jobs preservam o engine runtime.
    host = engine.url.host or ""
    rotulo, separador, dominio = host.partition(".")
    host_direto = rotulo.removesuffix("-pooler") + separador + dominio
    engine_trava = create_engine(engine.url.set(host=host_direto), poolclass=NullPool)
    with engine_trava.connect() as trava:
        if not trava.execute(text("SELECT pg_try_advisory_lock(:chave)"), {"chave": CHAVE_LOCK}).scalar_one():
            raise RuntimeError("Outra atualização está em execução; nenhuma tarefa foi iniciada.")
        trava.commit()
        try:
            modulo, fonte = TAREFAS[tarefa]
            anterior = _ultima_captura(fonte)
            job = importlib.import_module(modulo)
            if tarefa == "descoberta-siconv":
                job.run(baseline_silenciosa=not _tem_baseline(fonte))
            elif tarefa in {"tomografo", "ressonancia", "pet-ct", "vigencia", "populacao"}:
                with captura(fonte) as rodada:
                    rodada.detalhes["github_run_id"] = os.environ.get("GITHUB_RUN_ID")
                    rodada.detalhes["github_sha"] = os.environ.get("GITHUB_SHA")
                    if tarefa == "populacao":
                        _preparar_populacao(job.importar)
                    elif tarefa == "vigencia":
                        rodada.avisos_criados = job.run()
                    else:
                        job.run()
                    if tarefa in {"tomografo", "ressonancia", "pet-ct"}:
                        familia = {"tomografo": "TOMOGRAFO", "ressonancia": "RESSONANCIA", "pet-ct": "PET_CT"}[tarefa]
                        resumo = _resumo_pipeline(familia)
                        rodada.itens_verificados = resumo["equipamentos"]
                        rodada.detalhes.update(resumo)
            else:
                job.run()
            resultado = _ultima_captura(fonte, depois_de=anterior["id"] if anterior else 0)
            print(json.dumps({"tarefa": tarefa, "captura": resultado}, ensure_ascii=False))
            if not resultado or resultado["status"] != "ok":
                raise RuntimeError("Coleta incompleta; conferir captura. Não considerar a tarefa aprovada.")
        finally:
            trava.execute(text("SELECT pg_advisory_unlock(:chave)"), {"chave": CHAVE_LOCK})
            trava.commit()


class ResumoPipeline(TypedDict):
    execution_id: int
    competencia: str
    equipamentos: int


def _resumo_pipeline(familia: str) -> ResumoPipeline:
    from app.db.base import engine

    with engine.connect() as conexao:
        linha = (
            conexao.execute(
                text(
                    "SELECT e.id, c.label, (SELECT count(*) FROM equipment_offer_row o WHERE o.execution_id = e.id) "
                    "AS equipamentos FROM competency c JOIN execution e ON e.id = c.published_execution_id "
                    "WHERE c.equipment_family = :familia ORDER BY e.finished_at DESC LIMIT 1"
                ),
                {"familia": familia},
            )
            .mappings()
            .one()
        )
        return ResumoPipeline(execution_id=linha["id"], competencia=linha["label"], equipamentos=linha["equipamentos"])


def _tem_baseline(fonte: str) -> bool:
    from app.db.base import engine

    with engine.connect() as conexao:
        return bool(
            conexao.execute(
                text(
                    "SELECT EXISTS (SELECT 1 FROM fonte_captura WHERE fonte = :fonte AND "
                    "(status = 'ok' OR (status = 'parcial' AND detalhes->>'publicacao' = 'concluida')))"
                ),
                {"fonte": fonte},
            ).scalar_one()
        )


def _preparar_populacao(importar: Callable[[], None]) -> None:
    from app.db.base import engine

    with engine.connect() as conexao:
        existe = conexao.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM municipality_population_row p JOIN reference_file r "
                "ON r.id = p.reference_file_id WHERE r.active IS TRUE AND r.type = 'population')"
            )
        ).scalar_one()
    if existe:
        print("Referência ANS ativa preservada; não reimportar arquivo a cada rodada.")
    else:
        importar()


def diagnostico_seguro(erro: Exception) -> dict[str, object]:
    diagnostico: dict[str, object] = {"tipo": type(erro).__name__}
    if isinstance(erro, ErroContrato):
        diagnostico["contrato"] = erro.title
        diagnostico["campos"] = [
            {"local": e["loc"], "tipo": e["type"]}
            for e in erro.errors(include_input=False, include_context=False, include_url=False)[:10]
        ]
    diagnostico["origem"] = [
        {"arquivo": Path(frame.filename).name, "funcao": frame.name, "linha": frame.lineno}
        for frame in traceback.extract_tb(erro.__traceback__)[-4:]
    ]
    return diagnostico


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tarefa", choices=["preflight", *TAREFAS])
    args = parser.parse_args()
    try:
        executar(args.tarefa)
    except Exception as erro:
        print(
            json.dumps(
                {
                    "tarefa": args.tarefa,
                    "status": "erro",
                    **diagnostico_seguro(erro),
                    "mensagem": "Atualização não concluída; confira preflight, capturas e disponibilidade da fonte.",
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
