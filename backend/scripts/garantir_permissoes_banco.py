"""Confere quem é o dono e quem pode ler/escrever em cada objeto do schema `public`.

Existe por causa do incidente de 23/10/2026: a migração do release rodou como
`neondb_owner`, as tabelas novas ficaram com esse dono e sem leitura para
`sigeo_backup`, e o backup agendado passou a falhar com
`permission denied for table fonte_captura`. Este script é executado por
`migrar_banco.yml` com a credencial de migração e impede a repetição:

- ``--so-usuario``: só confirma que a conexão é do role esperado (padrão ``sigeo_migration``).
- sem flags: lista pendências de dono e de permissão e termina com código 1 se houver.
- ``--corrigir``: reaplica as concessões previstas no desenho (idempotente, só quem é
  dono do objeto consegue conceder) e verifica de novo.

Roles que não existem no banco (ambiente local ou de teste) são ignoradas.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field

from sqlalchemy import text
from sqlalchemy.engine import Connection

USUARIO_ESPERADO = "sigeo_migration"
ROLE_RUNTIME = "sigeo_runtime"
ROLE_BACKUP = "sigeo_backup"

CONCESSOES = {
    ROLE_RUNTIME: (
        "GRANT USAGE ON SCHEMA public TO {role}",
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}",
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}",
    ),
    ROLE_BACKUP: (
        "GRANT USAGE ON SCHEMA public TO {role}",
        "GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}",
        "GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}",
    ),
}

_SQL_FORA_DO_DONO = text(
    """
    SELECT 'tabela' AS tipo, c.relname AS nome, pg_get_userbyid(c.relowner) AS dono
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND c.relowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype = 'e')
    UNION ALL
    SELECT 'enum', t.typname, pg_get_userbyid(t.typowner)
    FROM pg_type t
    WHERE t.typnamespace = 'public'::regnamespace AND t.typtype = 'e'
      AND t.typowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user)
    ORDER BY 1, 2
    """
)

_SQL_SEM_PERMISSAO = text(
    """
    SELECT c.relname, c.relkind::text
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'S')
      AND NOT CASE
        WHEN c.relkind = 'S' AND :role = 'sigeo_backup' THEN has_sequence_privilege(:role, c.oid, 'SELECT')
        WHEN c.relkind = 'S' THEN has_sequence_privilege(:role, c.oid, 'USAGE')
                                  AND has_sequence_privilege(:role, c.oid, 'SELECT')
        WHEN :role = 'sigeo_backup' THEN has_table_privilege(:role, c.oid, 'SELECT')
        ELSE has_table_privilege(:role, c.oid, 'SELECT') AND has_table_privilege(:role, c.oid, 'INSERT')
             AND has_table_privilege(:role, c.oid, 'UPDATE') AND has_table_privilege(:role, c.oid, 'DELETE')
      END
    ORDER BY 1
    """
)


@dataclass
class Pendencias:
    fora_do_dono: list[str] = field(default_factory=list)
    sem_permissao: dict[str, list[str]] = field(default_factory=dict)
    roles_ausentes: list[str] = field(default_factory=list)

    def vazio(self) -> bool:
        return not self.fora_do_dono and not any(self.sem_permissao.values())

    def linhas(self) -> list[str]:
        saida = [f"Fora do dono atual: {item}" for item in self.fora_do_dono]
        for role, itens in self.sem_permissao.items():
            saida += [f"Sem permissão para {role}: {item}" for item in itens]
        return saida


def usuario_atual(conexao: Connection) -> str:
    return str(conexao.execute(text("SELECT current_user")).scalar_one())


def _roles_existentes(conexao: Connection) -> set[str]:
    linhas = conexao.execute(
        text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:nomes)"), {"nomes": [ROLE_RUNTIME, ROLE_BACKUP]}
    )
    return {linha[0] for linha in linhas}


def listar_pendencias(conexao: Connection) -> Pendencias:
    existentes = _roles_existentes(conexao)
    pendencias = Pendencias(roles_ausentes=sorted({ROLE_RUNTIME, ROLE_BACKUP} - existentes))
    pendencias.fora_do_dono = [f"{t} {n} (dono {d})" for t, n, d in conexao.execute(_SQL_FORA_DO_DONO)]
    for role in (ROLE_RUNTIME, ROLE_BACKUP):
        if role not in existentes:
            continue
        itens = [
            f"{nome} ({'sequência' if tipo == 'S' else 'tabela'})"
            for nome, tipo in conexao.execute(_SQL_SEM_PERMISSAO, {"role": role})
        ]
        pendencias.sem_permissao[role] = itens
    return pendencias


def corrigir(conexao: Connection) -> None:
    existentes = _roles_existentes(conexao)
    for role, comandos in CONCESSOES.items():
        if role in existentes:
            for comando in comandos:
                conexao.execute(text(comando.format(role=role)))


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    analisador.add_argument("--so-usuario", action="store_true", help="só confere o usuário da conexão")
    analisador.add_argument("--corrigir", action="store_true", help="reaplica as concessões e verifica")
    analisador.add_argument("--usuario-esperado", default=USUARIO_ESPERADO)
    args = analisador.parse_args(argv)

    from app.db.base import engine

    with engine.begin() as conexao:
        usuario = usuario_atual(conexao)
        if usuario != args.usuario_esperado:
            print(
                f"Conexão como '{usuario}', mas o esperado é '{args.usuario_esperado}'. "
                "Corrija o secret DATABASE_URL_MIGRATION (role sigeo_migration, conexão direta).",
                file=sys.stderr,
            )
            return 1
        print(f"Usuário da conexão: {usuario}")
        if args.so_usuario:
            return 0
        if args.corrigir:
            corrigir(conexao)
        pendencias = listar_pendencias(conexao)
    for papel in pendencias.roles_ausentes:
        print(f"Role {papel} não existe neste banco; conferência ignorada.")
    if pendencias.vazio():
        print("Dono e permissões conferem.")
        return 0
    print("Pendências de dono ou permissão:", file=sys.stderr)
    for linha in pendencias.linhas():
        print(f"  - {linha}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
