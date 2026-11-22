"""Carga da base aberta da ANSN (instalações) e dos vínculos validados pela equipe (CNES x matrícula).

Idempotente. Sem `aplicar` só conta. Matrícula ausente da carga nova não é alterada nem dada como vencida.
"""

from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import InstalacaoAnsn, VinculoLicencaEstabelecimento
from app.domain_errors import ValidationError
from app.repositories import licencas_ansn as repo

STATUS = ("valida", "suspensa")


def _data(valor: Any) -> date | None:
    if valor in (None, ""):
        return None
    return valor if isinstance(valor, date) else date.fromisoformat(str(valor)[:10])


def _texto(valor: Any) -> str | None:
    texto = str(valor).strip() if valor is not None else ""
    return texto or None


def importar_instalacoes(
    db: Session, registros: list[dict[str, Any]], consultado_em: date, *, aplicar: bool
) -> Counter[str]:
    contagem: Counter[str] = Counter()
    matriculas = [str(r.get("matricula", "")).strip() for r in registros]
    if any(not m for m in matriculas):
        raise ValidationError("Há registro sem matrícula.")
    if len(set(matriculas)) != len(matriculas):
        raise ValidationError("Há matrícula repetida na carga.")
    existentes = repo.instalacoes_por_matricula(db, matriculas)
    for registro, matricula in zip(registros, matriculas, strict=True):
        status = str(registro.get("status") or "valida").strip()
        if status not in STATUS:
            raise ValidationError(f"Matrícula {matricula}: situação '{status}' desconhecida.")
        validade = _data(registro.get("validade"))
        if status == "valida" and validade is None:
            contagem["válida sem validade"] += 1
        campos = {
            "designacao": _texto(registro.get("designacao")) or "",
            "cidade": _texto(registro.get("cidade")),
            "uf": (_texto(registro.get("uf")) or "")[:2].upper() or None,
            "area_atuacao": _texto(registro.get("area_atuacao")),
            "setor_atuacao": _texto(registro.get("setor_atuacao")),
            "status": status,
            "validade": validade,
        }
        atual = existentes.get(matricula)
        if atual is None:
            contagem["nova"] += 1
            if aplicar:
                db.add(
                    InstalacaoAnsn(
                        matricula=matricula, consultado_em=consultado_em, primeira_consulta_em=consultado_em, **campos
                    )
                )
            continue
        if all(getattr(atual, k) == v for k, v in campos.items()):
            contagem["inalterada"] += 1
        else:
            contagem["atualizada"] += 1
            if aplicar:
                for k, v in campos.items():
                    setattr(atual, k, v)
        if aplicar:
            atual.consultado_em = consultado_em
    if aplicar:
        db.flush()
    return contagem


def importar_vinculos(
    db: Session, linhas: list[tuple[str, str]], *, aplicar: bool, origem: str = "carga"
) -> tuple[Counter[str], list[str]]:
    """Cria os vínculos CNES x matrícula que faltam. Devolve a contagem e as linhas rejeitadas (CNES desconhecido)."""
    contagem: Counter[str] = Counter()
    rejeitadas: list[str] = []
    normalizadas = []
    for cnes, matricula in linhas:
        c = "".join(ch for ch in str(cnes) if ch.isdigit()).zfill(7)
        m = str(matricula).strip()
        if not m:
            raise ValidationError(f"CNES {cnes}: matrícula vazia.")
        normalizadas.append((c, m))
    unicas = list(dict.fromkeys(normalizadas))
    contagem["repetida no arquivo"] = len(normalizadas) - len(unicas)
    cnes_ok = repo.cnes_existentes(db, sorted({c for c, _ in unicas}))
    instalacoes = repo.instalacoes_por_matricula(db, sorted({m for _, m in unicas}))
    ativos = repo.vinculos_ativos(db)
    for cnes, matricula in unicas:
        if cnes not in cnes_ok:
            rejeitadas.append(f"{cnes} / {matricula}: CNES não existe no cadastro")
            contagem["rejeitada: CNES desconhecido"] += 1
            continue
        if (cnes, matricula) in ativos:
            contagem["já vinculada"] += 1
            continue
        contagem["vínculo novo"] += 1
        if matricula not in instalacoes:
            contagem["matrícula fora da carga da ANSN"] += 1
        if aplicar:
            db.add(VinculoLicencaEstabelecimento(cnes=cnes, matricula=matricula, origem=origem))
    if aplicar:
        db.flush()
    return +contagem, rejeitadas
