"""Licença de operação do instrumento pela fonte oficial da ANSN, vinculada ao estabelecimento (CNES).

Sem vínculo confirmado a tela não afirma licença nem vencimento. Matrícula ausente da última carga aparece como
"não consta", nunca como vencida (não existe base pública de vencidas).
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.db.models import InstalacaoAnsn, InstrumentoEquipamento, User
from app.domain_errors import NotFoundError
from app.licenca_ansn import AREA_POR_FAMILIA
from app.repositories import licencas_ansn as repo
from app.repositories import monitoramento as monitoramento_repo
from app.schemas_licenca_ansn import LicencaOperacaoRead, LicencaVinculoRead


def situacao_da_instalacao(instalacao: InstalacaoAnsn | None, ultima_carga: date | None) -> str:
    if instalacao is None or (ultima_carga is not None and instalacao.consultado_em < ultima_carga):
        return "nao_consta"
    return instalacao.status


def areas_exigidas(codigos: set[str]) -> list[str]:
    return sorted({AREA_POR_FAMILIA[c] for c in codigos if c in AREA_POR_FAMILIA})


def montar_vinculos(
    pares: list, ultima_carga: date | None, hoje: date
) -> list[LicencaVinculoRead]:
    resultado = []
    for vinculo, instalacao in pares:
        situacao = situacao_da_instalacao(instalacao, ultima_carga)
        validade = instalacao.validade if instalacao is not None and situacao == "valida" else None
        resultado.append(
            LicencaVinculoRead(
                matricula=vinculo.matricula,
                designacao=instalacao.designacao if instalacao else None,
                cidade=instalacao.cidade if instalacao else None,
                uf=instalacao.uf if instalacao else None,
                area=instalacao.area_atuacao if instalacao else None,
                situacao=situacao,  # type: ignore[arg-type]
                validade=validade,
                dias=(validade - hoje).days if validade else None,
            )
        )
    return resultado


def obter_licenca_operacao(*, nr_convenio: str, db: Session, usuario: User) -> LicencaOperacaoRead:
    instrumento: InstrumentoEquipamento | None = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    codigos = repo.codigos_exigidos_por_instrumento(db, [instrumento.id]).get(instrumento.id, set())
    exigidas = areas_exigidas(codigos)
    if not exigidas:
        return LicencaOperacaoRead(
            exige=False, cnes=instrumento.cnes, sem_cnes=False, areas_exigidas=[], areas_sem_vinculo=[], vinculos=[],
            ultima_carga=None,
        )
    if not instrumento.cnes:
        return LicencaOperacaoRead(
            exige=True, cnes=None, sem_cnes=True, areas_exigidas=exigidas, areas_sem_vinculo=exigidas, vinculos=[],
            ultima_carga=None,
        )
    carga = repo.ultima_carga(db)
    vinculos = montar_vinculos(repo.vinculos_por_cnes(db, [instrumento.cnes]).get(instrumento.cnes, []), carga, date.today())
    cobertas = {v.area for v in vinculos if v.area}
    return LicencaOperacaoRead(
        exige=True,
        cnes=instrumento.cnes,
        sem_cnes=False,
        areas_exigidas=exigidas,
        areas_sem_vinculo=[a for a in exigidas if a not in cobertas],
        vinculos=vinculos,
        ultima_carga=carga,
    )


def vinculos_por_instrumento(
    db: Session, instrumentos: list[InstrumentoEquipamento], hoje: date
) -> dict[int, list[LicencaVinculoRead]]:
    """Vínculos da ANSN dos instrumentos que exigem licença e têm CNES (em lote, para o resumo)."""
    exigem = repo.codigos_exigidos_por_instrumento(db, [i.id for i in instrumentos])
    candidatos = [i for i in instrumentos if i.cnes and areas_exigidas(exigem.get(i.id, set()))]
    por_cnes = repo.vinculos_por_cnes(db, sorted({str(i.cnes) for i in candidatos}))
    carga = repo.ultima_carga(db)
    return {i.id: montar_vinculos(por_cnes.get(str(i.cnes), []), carga, hoje) for i in candidatos}
