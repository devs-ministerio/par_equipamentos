"""Proteção da cópia local; nunca conectar este módulo a banco remoto."""

import re
import secrets
import unicodedata
from hashlib import sha256

import psycopg
from argon2 import PasswordHasher
from psycopg import sql
from psycopg.types.json import Jsonb

type JsonValue = str | int | float | bool | None | list[JsonValue] | dict[str, JsonValue]

EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
CPF = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
TELEFONE = re.compile(r"(?:\+55\s*)?\(\d{2}\)\s*\d{4,5}[-\s]\d{4}\b")
TOKEN_URL = re.compile(r"([?&](?:token|secret|senha|password)=)[^&#\s]+", re.I)
PESSOAS = {
    "user": ("name",),
    "instrumento_equipamento": ("tecnico_titular", "tecnico_suplente", "responsavel_execucao_nome"),
    "acao_monitoramento": ("responsavel",),
}
INTERNOS = {
    "instrumento_equipamento": {"observacao", "observacoes", "responsavel_execucao_contato"},
    "evento_marco": {"observacao", "motivo_exclusao"},
    "acao_monitoramento": {"descricao", "motivo_exclusao"},
    "candidato_legado_decisao": {"justificativa"},
}
IDENTIDADES = {
    "numero",
    "nr_convenio",
    "id_proposta",
    "cnes",
    "codigo",
    "cd_parceria",
    "codigo_ibge",
    "codigo_ibge_municipio",
}


class ProtecaoTexto:
    def __init__(self, nomes: list[str]):
        sal = secrets.token_hex(32)
        self.pessoas = {
            nome.casefold(): "Pessoa local " + sha256((sal + nome.casefold()).encode()).hexdigest()[:10]
            for nome in nomes
            if nome.strip()
        }
        self.padrao = (
            re.compile("|".join(re.escape(nome) for nome in sorted(self.pessoas, key=len, reverse=True)), re.I)
            if self.pessoas
            else None
        )

    def texto(self, valor: str, *, identidade: bool = False) -> str:
        if self.padrao:
            valor = self.padrao.sub(lambda m: self.pessoas[m.group().casefold()], valor)
        valor = EMAIL.sub("contato-local@example.com", valor)
        valor = TELEFONE.sub("[telefone protegido]", valor)
        if not identidade:
            valor = CPF.sub("[identificador pessoal protegido]", valor)
        return TOKEN_URL.sub(r"\1[protegido]", valor)

    def payload(self, valor: JsonValue, chave: str = "") -> JsonValue:
        normalizada = "".join(c for c in unicodedata.normalize("NFKD", chave).casefold() if c.isalnum())
        if valor is not None and any(
            p in normalizada
            for p in (
                "cpf",
                "telefone",
                "celular",
                "email",
                "password",
                "senha",
                "token",
                "contato",
                "representante",
                "responsavel",
                "depositante",
            )
        ):
            return "[dado pessoal protegido]"
        if isinstance(valor, str):
            identidade = normalizada in {"idproposta", "nrconvenio", "numero", "cnes", "codigo", "cdparceria"}
            return self.texto(valor, identidade=identidade)
        if isinstance(valor, list):
            return [self.payload(item, chave) for item in valor]
        if isinstance(valor, dict):
            pessoa_fisica = any(
                "fornecedor" in nome.casefold()
                and isinstance(item, str)
                and (re.fullmatch(r"\d{11}", item) or re.fullmatch(r"\*+[\d*]+\*+", item))
                for nome, item in valor.items()
            )
            if pessoa_fisica:
                return {
                    nome: "[pessoa física protegida]"
                    if "nome" in nome.casefold() or "identif" in nome.casefold()
                    else self.payload(item, nome)
                    for nome, item in valor.items()
                }
            return {nome: self.payload(item, nome) for nome, item in valor.items()}
        return valor


def proteger_banco(conexao: psycopg.Connection, nomes_tabelas: list[str]) -> dict[str, int]:
    """Recebe conexão local validada pelo orquestrador; uma transação por cópia."""
    if conexao.info.host not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("Proteção permitida somente em loopback.")
    if not conexao.info.dbname.startswith("sigeo_homologacao_base_"):
        raise ValueError("Proteção exige a nova base local de homologação.")
    nomes: list[str] = []
    for tabela, colunas_pessoa in PESSOAS.items():
        if tabela in nomes_tabelas:
            for coluna in colunas_pessoa:
                nomes.extend(
                    r[0]
                    for r in conexao.execute(
                        sql.SQL("SELECT DISTINCT {} FROM {} WHERE {} IS NOT NULL").format(
                            sql.Identifier(coluna), sql.Identifier(tabela), sql.Identifier(coluna)
                        )
                    )
                    if r[0]
                )
    protecao = ProtecaoTexto(nomes)
    senha_inutilizavel = PasswordHasher().hash(secrets.token_urlsafe(64))
    alterados: dict[str, int] = {}
    for tabela in nomes_tabelas:
        if tabela == "alembic_version":
            continue
        colunas = conexao.execute(
            "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=%s AND data_type IN ('text','character varying','json','jsonb') ORDER BY ordinal_position",
            (tabela,),
        ).fetchall()
        if not colunas:
            continue
        pk = conexao.execute(
            "SELECT k.column_name FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON t.constraint_name=k.constraint_name AND t.table_schema=k.table_schema AND t.table_name=k.table_name WHERE t.table_schema='public' AND t.table_name=%s AND t.constraint_type='PRIMARY KEY' ORDER BY k.ordinal_position",
            (tabela,),
        ).fetchall()
        if len(pk) != 1:
            raise ValueError("Tabela sem chave primária simples; proteção deve ser revisada.")
        campos = [nome for nome, _ in colunas if nome != pk[0][0]]
        tipos = {nome: tipo for nome, tipo in colunas}
        alterados[tabela] = 0
        consulta = sql.SQL("SELECT {} FROM {}").format(
            sql.SQL(",").join(sql.Identifier(nome) for nome in [pk[0][0], *campos]), sql.Identifier(tabela)
        )
        atualizar = sql.SQL("UPDATE {} SET {} WHERE {}=%s").format(
            sql.Identifier(tabela),
            sql.SQL(",").join(sql.SQL("{}=%s").format(sql.Identifier(nome)) for nome in campos),
            sql.Identifier(pk[0][0]),
        )
        with conexao.cursor(name="proteger_" + tabela) as leitura, conexao.cursor() as escrita:
            leitura.execute(consulta)
            while linhas := leitura.fetchmany(500):
                lote = []
                for linha in linhas:
                    valores = []
                    mudou = False
                    for nome, original in zip(campos, linha[1:], strict=True):
                        novo = original
                        if original is not None:
                            if tabela == "user" and nome == "name":
                                novo = protecao.pessoas.get(original.casefold(), f"Usuário local {linha[0]}")
                            elif tabela == "user" and nome == "email":
                                novo = f"usuario-local-{linha[0]}@example.com"
                            elif nome == "password_hash":
                                novo = senha_inutilizavel
                            elif "token_hash" in nome:
                                novo = None if tabela == "user" else sha256(secrets.token_bytes(32)).hexdigest()
                            elif tabela == "audit_log" and nome == "details":
                                novo = {"protegido_no_clone_local": True}
                            elif nome in INTERNOS.get(tabela, set()):
                                novo = "Texto interno protegido no clone local"
                            elif tipos[nome] in ("json", "jsonb"):
                                novo = protecao.payload(original)
                            elif nome in PESSOAS.get(tabela, ()):
                                novo = protecao.pessoas.get(str(original).casefold(), "Pessoa local")
                            elif tabela == "reference_file" and nome == "original_file":
                                novo = f"referencia-local-{linha[0]}.xlsx"
                            else:
                                novo = protecao.texto(original, identidade=nome in IDENTIDADES)
                        mudou |= novo != original
                        valores.append(Jsonb(novo) if novo is not None and tipos[nome] in ("json", "jsonb") else novo)
                    if mudou:
                        lote.append((*valores, linha[0]))
                if lote:
                    escrita.executemany(atualizar, lote)
                    alterados[tabela] += len(lote)
    if "user" in nomes_tabelas:
        conexao.execute('UPDATE "user" SET activation_expires_at=NULL, failed_login_attempts=0, locked_until=NULL')
    return alterados
