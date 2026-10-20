"""Consulta pontual das cinco fontes completas; sem SQL, Portal ou financeiro."""

from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from app.domain_errors import ConflictError
from app.schemas_celebracao_legado import ConvenioCelebracaoSiconv
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_revalidacao_legado import EscopoLegadoColetado
from scripts.coletar_recaptura_legado import _selecionar
from scripts.proteger_clone_local import ProtecaoTexto


def coletar_escopo(alvo: AlvoRecapturaLegado) -> EscopoLegadoColetado:
    alvo = AlvoRecapturaLegado.model_validate(alvo.model_dump())
    inicio = datetime.now(UTC)
    hashes: dict[str, str] = {}
    with TemporaryDirectory(prefix="sigeo-revalidacao-") as pasta:

        def ler(nome: str, chave: str, valores: set[str], *campos: str) -> list[dict[str, str]]:
            linhas, hashes[nome] = _selecionar(
                nome, chave=chave, valores=valores, obrigatorias=set(campos), cache=Path(pasta)
            )
            return linhas

        convenios = ler("siconv_convenio", "NR_CONVENIO", {alvo.numero}, "ID_PROPOSTA")
        propostas = ler("siconv_proposta", "ID_PROPOSTA", {alvo.id_proposta}, "COD_ORGAO_SUP")
        if len(convenios) != 1 or len(propostas) != 1 or convenios[0]["ID_PROPOSTA"] != alvo.id_proposta:
            raise ConflictError("Identidade oficial ausente, duplicada ou divergente; histórico preservado.")
        itens = ler("siconv_plano_aplicacao", "ID_PROPOSTA", {alvo.id_proposta}, "ID_ITEM_PAD", "DESCRICAO_ITEM")
        vinculos = ler("siconv_programa_proposta", "ID_PROPOSTA", {alvo.id_proposta}, "ID_PROGRAMA")
        programas = ler(
            "siconv_programa",
            "ID_PROGRAMA",
            {v["ID_PROGRAMA"] for v in vinculos},
            "NOME_PROGRAMA",
            "COD_ORGAO_SUP_PROGRAMA",
        )
        escopo = EscopoLegadoColetado.model_validate(
            dict(
                iniciado_em=inicio.isoformat(),
                convenio=ConvenioCelebracaoSiconv.model_validate(convenios[0]).model_dump(),
                proposta=propostas[0],
                itens=itens,
                vinculos=vinculos,
                programas=programas,
                hashes=hashes,
                payload_protegido_local=True,
            )
        )
        return EscopoLegadoColetado.model_validate(ProtecaoTexto([]).payload(escopo.model_dump(mode="json")))
