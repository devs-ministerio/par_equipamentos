"""Cópia protegida persistente em quarentena, sem servir app ou enviar e-mail.

Operação manual local: banco vazio, migrations reais, adoção protegida e
promoção. Não lê .env, não tem CLI, não aceita origem/target alternativos.
Falha após criação preserva o descartável privado para diagnóstico; nunca
remove/reescreve bancos existentes nem termina sessões de outros processos.
"""

from pathlib import Path
from uuid import uuid4

from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from alembic import command
from scripts.adotar_clone_recuperacao import _validar_origem, adotar_clone_em_descartavel
from scripts.homologacao_local import validar_url_banco
from scripts.integridade_recuperacao import REVISAO_DESTINO, _calcular_integridade, integridade_tabelas
from scripts.preflight_clone_recuperacao import CLONE_PRESERVADO
from scripts.promover_clone_recuperacao import CLONE_PERSISTENTE, _validar_controlador, promover_copia_privada


def preparar_clone_persistente(controlador_url: URL) -> int:
    """Retorna apenas OID da cópia bloqueada; não cria credenciais de runtime."""
    validar_url_banco(controlador_url.render_as_string(hide_password=False), teste=True)
    nome = "sigeo_test_migrations_" + uuid4().hex
    controlador = create_engine(controlador_url, poolclass=NullPool)
    destino = create_engine(controlador_url.set(database=nome), poolclass=NullPool)
    origem_engine = create_engine(controlador_url.set(database=CLONE_PRESERVADO), poolclass=NullPool)
    try:
        with controlador.connect().execution_options(isolation_level="AUTOCOMMIT") as admin:
            _validar_controlador(admin)
            if admin.scalar(
                text("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=:nome)"), {"nome": CLONE_PERSISTENTE}
            ):
                raise ValueError("Cópia persistente já existe; operação não iniciada.")
            # CREATE DATABASE não é transacional. O nome é gerado; nenhuma
            # opção TEMPLATE, FORCE, DROP, stamp ou reset de banco é utilizada.
            admin.execute(text(f'CREATE DATABASE "{nome}"'))
            admin.execute(text(f'REVOKE ALL ON DATABASE "{nome}" FROM PUBLIC'))
        with origem_engine.connect().execution_options(
            isolation_level="REPEATABLE READ", postgresql_readonly=True
        ) as origem:
            _validar_origem(origem)
            antes = _calcular_integridade(origem, proteger_identidades_auditoria=False)
            with destino.connect() as copia:
                config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
                config.attributes["connection"] = copia
                command.upgrade(config, REVISAO_DESTINO)
                bootstrap = integridade_tabelas(copia)
                copia.commit()
                recebido = adotar_clone_em_descartavel(origem=origem, destino=copia, bootstrap=bootstrap)
                if recebido != integridade_tabelas(copia):
                    raise ValueError("Manifesto pós-adoção divergente; cópia não promovida.")
                if _calcular_integridade(origem, proteger_identidades_auditoria=False) != antes:
                    raise ValueError("Origem divergente; cópia não promovida.")
        with controlador.connect() as admin:
            return promover_copia_privada(admin, nome=nome, esperado=recebido)
    except SQLAlchemyError:
        raise ValueError("Preparação interrompida; cópia não liberada, bancos anteriores preservados.") from None
    finally:
        origem_engine.dispose()
        destino.dispose()
        controlador.dispose()
