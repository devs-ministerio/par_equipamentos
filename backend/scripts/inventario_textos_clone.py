"""Snapshot read-only de campos delimitados e todos os JSON/JSONB públicos.

Só emite nomes de campo e contagens. Não interpreta ausência de sinal como
ausência de dado pessoal; nomes livres/CPF sem formato exigem revisão própria.
"""

import re
from collections import Counter
from dataclasses import dataclass

from pydantic import JsonValue, TypeAdapter, ValidationError
from sqlalchemy import JSON, Connection, inspect, text

from scripts.integridade_recuperacao import PROJECOES_PRIVADAS
from scripts.preflight_clone_recuperacao import inventariar_acesso_clone
from scripts.proteger_clone_local import INTERNOS, PESSOAS
from scripts.sinais_privacidade_clone import sinais_payload, sinais_texto

_JSON: TypeAdapter[JsonValue] = TypeAdapter(JsonValue)


@dataclass(frozen=True)
class CampoExaminado:
    tabela: str
    coluna: str
    linhas_examinadas: int
    linhas_com_sinal: int
    sinais: tuple[tuple[str, int], ...]


def validar_achados_cobertos(campos: tuple[CampoExaminado, ...]) -> None:
    """Gate delimitado, não certificado: usar só o inventário do mesmo snapshot.

    Exige a projeção privada na adoção posterior. Não receber esse inventário
    da UI; achado fora da allowlist bloqueia, inclusive prova imutável.
    """
    if not campos:
        raise ValueError("Inventário vazio não comprova exame de privacidade.")
    if any(c.linhas_com_sinal and c.coluna not in PROJECOES_PRIVADAS.get(c.tabela, {}) for c in campos):
        raise ValueError("Sinais fora dos campos cobertos; adoção bloqueada para revisão protegida.")


def inventariar_textos_clone(conn: Connection) -> tuple[CampoExaminado, ...]:
    """Não altera nem exporta linhas; usa as guardas locais/revisão/read-only."""
    inventariar_acesso_clone(conn)
    inspector = inspect(conn)
    resultado = []
    for tabela in inspector.get_table_names(schema="public"):
        if not re.fullmatch(r"[a-z][a-z0-9_]*", tabela):
            raise ValueError("Nome de tabela fora do catálogo validado.")
        pessoas = PESSOAS.get(tabela, ())
        internos = INTERNOS.get(tabela, set())
        extras = (
            {"name", "email"}
            if tabela == "user"
            else {"titulo", "mensagem"}
            if tabela == "notificacao"
            else {"original_file"}
            if tabela == "reference_file"
            else set()
        )
        for coluna in inspector.get_columns(tabela, schema="public"):
            nome = coluna["name"]
            json = isinstance(coluna["type"], JSON)
            if not json and nome not in {*pessoas, *internos, *extras}:
                continue
            if not re.fullmatch(r"[a-z][a-z0-9_]*", nome):
                raise ValueError("Nome de coluna fora do catálogo validado.")
            examinadas, afetadas = 0, 0
            contagens: Counter[str] = Counter()
            consulta = text(f'SELECT "{nome}"::text FROM public."{tabela}" WHERE "{nome}" IS NOT NULL')
            with conn.execute(consulta.execution_options(stream_results=True, yield_per=500)) as cursor:
                for valor in cursor.scalars():
                    try:
                        sinais = sinais_payload(_JSON.validate_json(valor)) if json else sinais_texto(valor)
                    except (ValidationError, RecursionError):
                        raise ValueError("Payload não pôde ser examinado; revisão protegida necessária.") from None
                    if (
                        nome in pessoas
                        and valor != "Pessoa local"
                        and not re.fullmatch(r"Pessoa local [a-f0-9]{10}|Usuário local [0-9]+", valor)
                    ):
                        sinais.add("pessoa_fora_padrao")
                    if nome in internos and valor != "Texto interno protegido no clone local":
                        sinais.add("texto_interno_sem_protecao")
                    if tabela == "reference_file" and not re.fullmatch(r"referencia-local-[0-9]+\.xlsx", valor):
                        sinais.add("arquivo_fora_padrao")
                    examinadas += 1
                    afetadas += bool(sinais)
                    contagens.update(sinais)
            resultado.append(CampoExaminado(tabela, nome, examinadas, afetadas, tuple(sorted(contagens.items()))))
    if conn.scalar(text("SHOW transaction_read_only")) != "on":
        raise ValueError("Snapshot perdeu a proteção read-only.")
    return tuple(resultado)
