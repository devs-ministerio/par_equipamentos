"""Regras puras de nomeação, retenção e atraso dos backups cifrados no R2.

O workflow `.github/workflows/backup_banco.yml` lista o bucket com
`aws s3api list-objects-v2` e passa o JSON para este módulo, que decide o que
expirou e se o último backup está atrasado. Não acessa rede, banco nem
credencial: assim a política é testável sem R2 e nunca apaga por engano.

Uso:
    python -m scripts.backup_retencao nome-objeto
    python -m scripts.backup_retencao atraso   --listagem listagem.json [--limite-horas 24]
    python -m scripts.backup_retencao expirados --listagem listagem.json [--dias 7] [--minimo 3]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

PREFIXO = "sigeo/producao"
SUFIXO_DUMP = ".dump.age"
SUFIXO_HASH = ".dump.age.sha256"
_NOME = re.compile(r"^" + re.escape(PREFIXO) + r"/\d{4}/\d{2}/\d{2}/sigeo-\d{8}T\d{6}Z-\d+\.dump\.age(\.sha256)?$")


@dataclass(frozen=True)
class ObjetoBackup:
    chave: str
    modificado_em: datetime
    tamanho: int


def chave_dump(agora: datetime, execucao: str) -> str:
    """Chave determinística em UTC; a execução do workflow evita colisão."""
    if agora.tzinfo is None:
        raise ValueError("O horário precisa estar em UTC com fuso explícito.")
    if not execucao.isdigit():
        raise ValueError("O identificador da execução deve ser numérico.")
    utc = agora.astimezone(timezone.utc)
    return f"{PREFIXO}/{utc:%Y/%m/%d}/sigeo-{utc:%Y%m%dT%H%M%SZ}-{execucao}{SUFIXO_DUMP}"


def interpretar_listagem(documento: dict) -> list[ObjetoBackup]:
    """Aceita a saída de `list-objects-v2`; ignora tudo fora do padrão de nome.

    Objetos estranhos nunca entram: assim uma limpeza jamais alcança arquivo
    que este fluxo não criou.
    """
    objetos = []
    for item in documento.get("Contents") or []:
        chave = item["Key"]
        if not _NOME.match(chave):
            continue
        modificado = datetime.fromisoformat(item["LastModified"].replace("Z", "+00:00"))
        objetos.append(ObjetoBackup(chave, modificado, int(item["Size"])))
    return objetos


def _dumps_validos(objetos: list[ObjetoBackup]) -> list[ObjetoBackup]:
    """Dump cifrado só conta se tem o `.sha256` correspondente e não é vazio."""
    chaves = {o.chave for o in objetos}
    return sorted(
        (o for o in objetos if o.chave.endswith(SUFIXO_DUMP) and o.tamanho > 0 and o.chave + ".sha256" in chaves),
        key=lambda o: o.modificado_em,
        reverse=True,
    )


def backup_atrasado(objetos: list[ObjetoBackup], agora: datetime, limite: timedelta) -> tuple[bool, str]:
    validos = _dumps_validos(objetos)
    if not validos:
        return True, "Nenhum backup íntegro encontrado."
    idade = agora - validos[0].modificado_em
    if idade > limite:
        horas = idade.total_seconds() / 3600
        return True, f"Último backup íntegro tem {horas:.1f} h (limite {limite.total_seconds() / 3600:.0f} h)."
    return False, "Backup recente."


def selecionar_expirados(
    objetos: list[ObjetoBackup], agora: datetime, retencao: timedelta, minimo_validos: int
) -> list[str]:
    """Chaves a apagar: o que passou da retenção e não é um backup protegido.

    Os `minimo_validos` backups íntegros mais recentes (dump e hash) nunca
    expiram, mesmo velhos, para que uma falha prolongada do backup não esvazie
    o bucket. Restos de upload incompleto (dump sem hash ou hash sem dump) só
    saem depois da retenção.
    """
    protegidos: set[str] = set()
    for dump in _dumps_validos(objetos)[:minimo_validos]:
        protegidos |= {dump.chave, dump.chave + ".sha256"}
    return sorted(o.chave for o in objetos if o.chave not in protegidos and agora - o.modificado_em > retencao)


def _ler(caminho: str) -> list[ObjetoBackup]:
    return interpretar_listagem(json.loads(Path(caminho).read_text(encoding="utf-8")))


def main(argv: list[str] | None = None) -> int:
    analisador = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = analisador.add_subparsers(dest="comando", required=True)
    sub.add_parser("nome-objeto")
    atraso = sub.add_parser("atraso")
    atraso.add_argument("--listagem", required=True)
    atraso.add_argument("--limite-horas", type=float, default=24)
    expirados = sub.add_parser("expirados")
    expirados.add_argument("--listagem", required=True)
    expirados.add_argument("--dias", type=int, default=7)
    expirados.add_argument("--minimo", type=int, default=3)
    args = analisador.parse_args(argv)
    agora = datetime.now(timezone.utc)

    if args.comando == "nome-objeto":
        import os

        print(chave_dump(agora, os.environ["GITHUB_RUN_ID"]))
        return 0
    objetos = _ler(args.listagem)
    if args.comando == "atraso":
        atrasado, motivo = backup_atrasado(objetos, agora, timedelta(hours=args.limite_horas))
        print(motivo, file=sys.stderr)
        return 1 if atrasado else 0
    if args.dias < 1 or args.minimo < 1:
        print("Retenção e mínimo precisam ser positivos.", file=sys.stderr)
        return 2
    for chave in selecionar_expirados(objetos, agora, timedelta(days=args.dias), args.minimo):
        print(chave)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
