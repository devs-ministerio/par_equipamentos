"""Equipamentos entregues: uma linha por unidade, com os mesmos filtros do relatório de concluídos."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.equipamentos import nome_curto_do_item
from app.pipeline.texto import normalizar_texto
from app.repositories import convenios as convenios_repo
from app.repositories import relatorios_entregues as repo
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.schemas_relatorios_encerrados import FiltroEncerramento
from app.schemas_relatorios_entregues import PreviaEntregues, RegistroEntregue


@dataclass(frozen=True)
class ExtracaoEntregues:
    itens: list[RegistroEntregue]


def _corresponde(linha: dict, filtro: FiltroEncerramento) -> bool:
    if filtro.uf and linha["uf"] not in filtro.uf:
        return False
    for valor, origem in (
        (filtro.municipio, linha["municipio"]),
        (filtro.cnes, linha["cnes"]),
        (filtro.programa, linha["programa"]),
        (filtro.tipo_contratacao, linha["tipo"] or "Convênio"),
        (filtro.equipamento, linha["familia"]),
    ):
        if valor and normalizar_texto(valor) != normalizar_texto(origem):
            return False
    ano = linha["ano"]
    if filtro.ano_inicio is not None and (ano is None or ano < filtro.ano_inicio):
        return False
    if filtro.ano_fim is not None and (ano is None or ano > filtro.ano_fim):
        return False
    return not filtro.busca or normalizar_texto(filtro.busca) in normalizar_texto(
        f"{linha['instrumento']} {linha['convenente']} {linha['municipio'] or ''} {linha['numero_serie'] or ''}"
    )


def extrair_entregues(*, db: Session, filtro: FiltroEncerramento) -> ExtracaoEntregues:
    try:
        linhas = repo.listar_unidades_entregues(db)
    except LimiteConsultaExcedido as exc:
        raise ValidationError(
            "A carteira excede o limite seguro da extração de equipamentos entregues. Contate a administração."
        ) from exc
    fora = convenios_repo.listar_numeros_fora_escopo(db, {linha["instrumento"] for linha in linhas})
    itens = [
        RegistroEntregue(
            instrumento=linha["instrumento"],
            convenente=linha["convenente"] or "",
            tipo=linha["tipo"] or "Convênio",
            uf=linha["uf"],
            municipio=linha["municipio"],
            cnes=linha["cnes"],
            ano=linha["ano"],
            programa=linha["programa"],
            item=linha["nome_renem"] or nome_curto_do_item(linha["descricao_item"]),
            familia=linha["familia"],
            ordem=linha["ordem"],
            marca=linha["marca"],
            modelo=linha["modelo"],
            numero_serie=linha["numero_serie"],
            vida_util_anos=linha["vida_util_anos"],
            data_entrega=linha["data_entrega"],
        )
        for linha in linhas
        if linha["instrumento"] not in fora and _corresponde(linha, filtro)
    ]
    return ExtracaoEntregues(itens)


def previa_entregues(*, db: Session, filtro: FiltroEncerramento, pagina: int, limite: int) -> PreviaEntregues:
    itens = extrair_entregues(db=db, filtro=filtro).itens
    inicio = (pagina - 1) * limite
    return PreviaEntregues(total=len(itens), pagina=pagina, limite=limite, itens=itens[inicio : inicio + limite])
