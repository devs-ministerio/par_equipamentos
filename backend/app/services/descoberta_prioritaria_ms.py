"""Descoberta reconstruída: MS e prova exata de item/componente, sem SQL/HTTP."""

from collections import defaultdict
from collections.abc import Iterable

from app.equipamentos import classificar_descricoes, descricao_de_obra_ou_servico
from app.schemas_celebracao_legado import ConvenioCelebracaoSiconv
from app.schemas_escopo_descoberta import (
    ComponenteDescoberto,
    ProgramaEscopo,
    PropostaEscopo,
    VinculoProgramaProposta,
)
from app.services.criterios_descoberta import CODIGO_MS, componente_prioritario, equipamentos_prioritarios_do_item
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado, ItemDump


def descobrir_prioritarios_ms(
    *,
    convenios: Iterable[dict[str, str]],
    itens: Iterable[dict[str, str]],
    propostas: Iterable[dict[str, str]],
    programas: Iterable[dict[str, str]],
    vinculos: Iterable[dict[str, str]],
    conhecidos: set[str],
    limite: int = 1000,
) -> list[CandidatoLegado]:
    if type(limite) is not int or not 1 <= limite <= 1000:
        raise ValueError("Limite de candidatos deve estar entre 1 e 1000.")
    orgaos: dict[str, str] = {}
    for linha in propostas:
        proposta = PropostaEscopo.model_validate(linha)
        if orgaos.setdefault(proposta.ID_PROPOSTA, proposta.COD_ORGAO_SUP) != proposta.COD_ORGAO_SUP:
            raise ValueError("Proposta duplicada com órgão superior divergente.")
    catalogo: dict[str, ProgramaEscopo] = {}
    for linha in programas:
        programa_validado = ProgramaEscopo.model_validate(linha)
        if catalogo.setdefault(programa_validado.ID_PROGRAMA, programa_validado) != programa_validado:
            raise ValueError("Programa duplicado com evidência divergente.")
    componentes: dict[str, dict[str, ComponenteDescoberto]] = defaultdict(dict)
    for linha in vinculos:
        vinculo = VinculoProgramaProposta.model_validate(linha)
        programa = catalogo.get(vinculo.ID_PROGRAMA)
        if programa is None:
            raise ValueError("Vínculo oficial sem programa no snapshot completo.")
        componente = componente_prioritario(programa.NOME_PROGRAMA)
        if orgaos.get(vinculo.ID_PROPOSTA) == CODIGO_MS and programa.COD_ORGAO_SUP_PROGRAMA == CODIGO_MS and componente:
            componentes[vinculo.ID_PROPOSTA][programa.ID_PROGRAMA] = ComponenteDescoberto(
                id_programa=programa.ID_PROGRAMA, nome_programa=programa.NOME_PROGRAMA, componente=componente
            )
    por_numero: dict[str, ConvenioCelebracaoSiconv] = {}
    por_proposta: dict[str, str] = {}
    for linha in convenios:
        convenio = ConvenioCelebracaoSiconv.model_validate(linha)
        if por_numero.setdefault(convenio.NR_CONVENIO, convenio) != convenio:
            raise ValueError("Convênio duplicado com identidade ou celebração divergente.")
        if por_proposta.setdefault(convenio.ID_PROPOSTA, convenio.NR_CONVENIO) != convenio.NR_CONVENIO:
            raise ValueError("Proposta SICONV vinculada a múltiplos convênios.")
    evidencias: dict[str, list[EvidenciaLegado]] = defaultdict(list)
    descricoes: dict[tuple[str, str], str] = {}
    somente_obra_ou_servico: dict[str, bool] = {}
    for linha in itens:
        item = ItemDump.model_validate(linha)
        chave = (item.ID_PROPOSTA, item.ID_ITEM_PAD)
        if chave in descricoes:
            if descricoes[chave] != item.DESCRICAO_ITEM:
                raise ValueError("Item SICONV duplicado com descrição divergente.")
            continue
        descricoes[chave] = item.DESCRICAO_ITEM
        if orgaos.get(item.ID_PROPOSTA) != CODIGO_MS or item.ID_PROPOSTA not in por_proposta:
            continue
        prioritarios = equipamentos_prioritarios_do_item(item.DESCRICAO_ITEM)
        somente_obra_ou_servico[item.ID_PROPOSTA] = somente_obra_ou_servico.get(
            item.ID_PROPOSTA, True
        ) and descricao_de_obra_ou_servico(item.DESCRICAO_ITEM)
        for evidencia in classificar_descricoes([item.DESCRICAO_ITEM]):
            if evidencia.codigo in prioritarios:
                evidencias[item.ID_PROPOSTA].append(
                    EvidenciaLegado(
                        id_item=item.ID_ITEM_PAD,
                        codigo_equipamento=evidencia.codigo,
                        descricao=evidencia.descricao_original,
                        relacao=evidencia.relacao,
                    )
                )
    resultado: list[CandidatoLegado] = []
    for numero, convenio in sorted(por_numero.items()):
        proposta_id = convenio.ID_PROPOSTA
        if numero in conhecidos or orgaos.get(proposta_id) != CODIGO_MS or not convenio.celebrado:
            continue
        provas = tuple(sorted(evidencias.get(proposta_id, []), key=lambda e: (e.id_item, e.codigo_equipamento)))
        componentes_proposta = tuple(componentes.get(proposta_id, {}).values())
        if not provas and not componentes_proposta:
            continue
        if not provas and somente_obra_ou_servico.get(proposta_id, False):
            continue
        if len(resultado) >= limite:
            raise ValueError("Descoberta excedeu o limite seguro; lote não aplicado.")
        resultado.append(
            CandidatoLegado(
                numero=numero,
                id_proposta=proposta_id,
                evidencias=provas,
                componentes=tuple(sorted(componentes_proposta, key=lambda c: (c.id_programa, c.nome_programa))),
                criterio_escopo="prioritarios_ms_celebrados_v2",
                orgao_superior="36000",
                data_assinatura_siconv=convenio.DIA_ASSIN_CONV,
                data_publicacao_siconv=convenio.DIA_PUBL_CONV,
            )
        )
    return resultado
