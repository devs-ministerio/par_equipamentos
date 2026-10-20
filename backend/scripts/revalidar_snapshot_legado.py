"""Revalida fila usando os mesmos ZIPs íntegros da descoberta; sem rede/SQL."""

from collections import defaultdict
from datetime import datetime
from pathlib import Path

from app.domain_errors import ConflictError
from app.repositories.descoberta_legado import ler_snapshot_csv
from app.schemas_celebracao_legado import ConvenioCelebracaoSiconv
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_revalidacao_legado import EscopoLegadoColetado, RevalidacaoPreparada, RevalidacoesCiclo
from scripts.proteger_clone_local import ProtecaoTexto


def selecionar_linhas(
    cache: Path, nome: str, coluna: str, valores: set[str], campos: set[str]
) -> dict[str, list[dict[str, str]]]:
    selecionadas: dict[str, list[dict[str, str]]] = defaultdict(list)
    total = 0
    for linha in ler_snapshot_csv(cache / f"{nome}.csv.zip", colunas={coluna, *campos}):
        if linha[coluna] in valores:
            total += 1
            if total > 100_000 or len(selecionadas[linha[coluna]]) >= 10_000:
                raise ValueError("Snapshot excedeu limite seguro de revalidação; ciclo não aplicado.")
            selecionadas[linha[coluna]].append({campo: linha[campo] for campo in {coluna, *campos}})
    return selecionadas


def preparar_snapshot(
    *, cache: Path, alvos: list[AlvoRecapturaLegado], elegiveis: set[str], hashes: dict[str, str], iniciado_em: datetime
) -> RevalidacoesCiclo:
    selecionados = [a for a in alvos if a.numero not in elegiveis]
    if not selecionados:
        return RevalidacoesCiclo(entradas=(), inconclusivos=())
    ids = {a.id_proposta for a in selecionados}
    convenios = selecionar_linhas(
        cache,
        "siconv_convenio",
        "NR_CONVENIO",
        {a.numero for a in selecionados},
        {"ID_PROPOSTA", "DIA_ASSIN_CONV", "DIA_PUBL_CONV", "SIT_CONVENIO"},
    )
    propostas = selecionar_linhas(cache, "siconv_proposta", "ID_PROPOSTA", ids, {"COD_ORGAO_SUP"})
    itens = selecionar_linhas(cache, "siconv_plano_aplicacao", "ID_PROPOSTA", ids, {"ID_ITEM_PAD", "DESCRICAO_ITEM"})
    vinculos = selecionar_linhas(cache, "siconv_programa_proposta", "ID_PROPOSTA", ids, {"ID_PROGRAMA"})
    programas = selecionar_linhas(
        cache,
        "siconv_programa",
        "ID_PROGRAMA",
        {v["ID_PROGRAMA"] for grupo in vinculos.values() for v in grupo},
        {"NOME_PROGRAMA", "COD_ORGAO_SUP_PROGRAMA"},
    )
    entradas = []
    inconclusivos = []
    for alvo in selecionados:
        linhas = convenios.get(alvo.numero, [])
        proposta = propostas.get(alvo.id_proposta, [])
        if len(linhas) > 1 or len(proposta) > 1:
            raise ConflictError("Identidade oficial duplicada; ciclo não aplicado.")
        if not linhas or not proposta or not itens.get(alvo.id_proposta):
            inconclusivos.append(alvo.candidato_id)
            continue
        if linhas[0]["ID_PROPOSTA"] != alvo.id_proposta:
            raise ConflictError("Identidade histórica diverge do snapshot; ciclo não aplicado.")
        links = vinculos.get(alvo.id_proposta, [])
        catalogo = [p for chave in {v["ID_PROGRAMA"] for v in links} for p in programas.get(chave, [])]
        escopo = EscopoLegadoColetado.model_validate(
            dict(
                iniciado_em=iniciado_em,
                convenio=ConvenioCelebracaoSiconv.model_validate(linhas[0]).model_dump(),
                proposta=proposta[0],
                itens=itens[alvo.id_proposta],
                vinculos=links,
                programas=catalogo,
                hashes=hashes,
                payload_protegido_local=True,
            )
        )
        escopo = EscopoLegadoColetado.model_validate(ProtecaoTexto([]).payload(escopo.model_dump(mode="json")))
        entradas.append(RevalidacaoPreparada(alvo=alvo, escopo=escopo))
    return RevalidacoesCiclo(entradas=tuple(entradas), inconclusivos=tuple(inconclusivos))
