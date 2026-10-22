"""Exclusão explícita da carteira sobre schema versionado, sem apagar fonte."""

from pathlib import Path

import pytest
from alembic.config import Config
from fastapi import HTTPException
from psycopg import Error as DatabaseDriverError
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import DBAPIError

from alembic import command
from app.db.models import Convenio
from app.repositories.convenios import listar_convenios_filtrados
from app.repositories.descoberta_legado import numeros_legados_conhecidos
from app.routers.convenios import listar_convenios, obter_convenio
from tests.test_cadeia_migrations_recuperacao_db import banco_migrations as banco_migrations
from tests.test_fluxo_radar_schema_versionado_db import radar_versionado as radar_versionado


@pytest.mark.parametrize(
    "filtros",
    [
        {},
        {"busca": "Instituição"},
        {"uf": "BA"},
        {"ano": 2026},
        {"situacao": "Em execução"},
        {"tipo_contratacao": "Convênio"},
        {"programa": "Programa sintético"},
    ],
)
def test_carteira_contagem_e_relatorio_nao_exibem_registro_fora_escopo(radar_versionado, filtros):
    # Arrange: dois convênios idênticos nos filtros; só um foi excluído.
    db, usuarios = radar_versionado
    atributos = dict(
        convenente_nome="Instituição sintética",
        tipo_contratacao="Convênio",
        uf="BA",
        ano_instrumento=2026,
        situacao="Em execução",
        programa="Programa sintético",
    )
    visivel = Convenio(numero="999001", **atributos)
    excluido = Convenio(numero="971252", fora_escopo_equipamentos=True, **atributos)
    db.add_all([visivel, excluido])
    db.commit()
    # Act: as consultas reais de listagem/contagem e exportação.
    lista = listar_convenios(db=db, usuario=usuarios["admin"], pagina=1, tamanho_pagina=20, **filtros)
    exportados = listar_convenios_filtrados(
        db,
        ufs=[filtros["uf"]] if "uf" in filtros else None,
        ano_inicio=filtros.get("ano"),
        situacao=filtros.get("situacao"),
        tipo_contratacao=filtros.get("tipo_contratacao"),
        programa=filtros.get("programa"),
        busca=filtros.get("busca"),
    )
    # Assert: ocultação consistente; fonte continua registrada e conhecida.
    assert lista.total == 1 and [c.numero for c in lista.itens] == ["999001"]
    assert [c.numero for c in exportados] == ["999001"]
    assert numeros_legados_conhecidos(db) == {"999001", "971252"}
    assert db.get(Convenio, excluido.id).fora_escopo_equipamentos is True


def test_detalhe_excluido_nao_e_exposto_nem_apagado(radar_versionado):
    db, usuarios = radar_versionado
    db.add(Convenio(numero="971252", convenente_nome="Instituição sintética", fora_escopo_equipamentos=True))
    db.commit()
    with pytest.raises(HTTPException) as erro:
        obter_convenio("971252", db=db, usuario=usuarios["admin"])
    assert erro.value.status_code == 404
    assert db.scalar(select(Convenio.numero)) == "971252"


def test_migration_alinha_limites_e_reverte_sem_decisoes_de_exclusao(banco_migrations):
    conn, config = banco_migrations
    command.upgrade(config, "95d13a6e4c28")
    conn.execute(text("INSERT INTO convenio (numero,convenente_nome) VALUES ('999001','Instituição sintética')"))
    conn.commit()
    command.upgrade(config, "head")
    assert conn.scalar(text("SELECT fora_escopo_equipamentos FROM convenio")) is False
    for tabela, coluna, tamanho in (
        ("candidato_legado_captura", "criterio_escopo", 32),
        ("candidato_legado_captura", "orgao_superior", 5),
        ("candidato_legado_recaptura", "hash_conteudo", 64),
    ):
        meta = next(c for c in inspect(conn).get_columns(tabela) if c["name"] == coluna)
        assert meta["type"].length == tamanho
    conn.commit()
    command.downgrade(config, "95d13a6e4c28")
    assert "fora_escopo_equipamentos" not in {c["name"] for c in inspect(conn).get_columns("convenio")}
    assert conn.scalar(text("SELECT numero FROM convenio")) == "999001"
    conn.commit()
    command.upgrade(config, "head")
    assert conn.scalar(text("SELECT fora_escopo_equipamentos FROM convenio")) is False


def test_downgrade_nao_descarta_decisao_de_ocultacao(radar_versionado):
    db, _ = radar_versionado
    db.add(Convenio(numero="971252", convenente_nome="Instituição sintética", fora_escopo_equipamentos=True))
    db.commit()
    conn = db.get_bind()
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["connection"] = conn
    with pytest.raises(DBAPIError, match="preserve as exclusões") as erro:
        command.downgrade(config, "95d13a6e4c28")
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conn.rollback()
    assert conn.scalar(text("SELECT fora_escopo_equipamentos FROM convenio")) is True
    assert conn.scalar(text("SELECT version_num FROM alembic_version")) == "b7f35c806e4a"
