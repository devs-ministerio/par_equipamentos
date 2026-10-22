"""Coleta pontual de prova oficial; não descobre, aprova nem grava no banco.

O chamador deve fornecer alvo obtido do Service e validar o destino local.
Downloads nacionais são temporários e descartados inclusive em falha.
"""

from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory

from app.domain_errors import ConflictError
from app.pipeline.portal_transparencia import _headers, _sessao_com_retry, buscar_convenio_por_numero_dto
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado, PacoteRecapturaLegado
from app.schemas_filhas_legado import ARQUIVOS_FILHAS, CHAVES_FILHAS
from app.schemas_portal_legado import PortalLegadoCapturado
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao, OrigemRecapturaColetada
from app.services.descoberta_prioritaria_ms import descobrir_prioritarios_ms
from scripts.coletar_siconv_legado import _baixar_zip, _linhas_csv_do_zip
from scripts.proteger_clone_local import ProtecaoTexto


def _selecionar(
    nome: str, *, chave: str, valores: set[str], obrigatorias: set[str], cache: Path
) -> tuple[list[dict[str, str]], str]:
    conteudo = _baixar_zip(nome, atualizar_cache=True, diretorio_cache=cache)
    selecionadas: list[dict[str, str]] = []
    with _linhas_csv_do_zip(conteudo, justificativa_ta=nome == "siconv_termo_aditivo") as (cabecalho, linhas):
        if not {chave, *obrigatorias} <= set(cabecalho):
            raise ValueError("Snapshot oficial sem colunas obrigatórias da recaptura.")
        indice = cabecalho.index(chave)
        for linha in linhas:
            if linha[indice].strip() in valores:
                if len(selecionadas) >= 10_000:
                    raise ValueError("Recaptura excedeu o limite seguro; nenhuma prova foi publicada.")
                selecionadas.append(dict(zip(cabecalho, linha, strict=True)))
    return selecionadas, sha256(conteudo).hexdigest()


def coletar_recaptura(alvo: AlvoRecapturaLegado) -> PacoteRecapturaLegado:
    """Valida escopo antes das filhas; nenhuma coleção omitida vira vazia."""
    alvo = AlvoRecapturaLegado.model_validate(alvo.model_dump())
    _headers()  # Falha antes dos downloads se a chave não estiver disponível.
    iniciado = datetime.now(UTC)
    with TemporaryDirectory(prefix="sigeo-recaptura-") as diretorio:
        cache = Path(diretorio)

        def ler(nome: str, chave: str, valores: set[str], *campos: str) -> tuple[list[dict[str, str]], str]:
            return _selecionar(nome, chave=chave, valores=valores, obrigatorias=set(campos), cache=cache)

        convenios, hash_convenios = ler("siconv_convenio", "NR_CONVENIO", {alvo.numero}, "ID_PROPOSTA")
        propostas, hash_proposta = ler("siconv_proposta", "ID_PROPOSTA", {alvo.id_proposta}, "COD_ORGAO_SUP")
        if len(convenios) != 1 or len(propostas) != 1 or convenios[0]["ID_PROPOSTA"] != alvo.id_proposta:
            raise ConflictError("Identidade oficial ausente, duplicada ou divergente da descoberta.")
        itens, hash_itens = ler(
            "siconv_plano_aplicacao", "ID_PROPOSTA", {alvo.id_proposta}, "ID_ITEM_PAD", "DESCRICAO_ITEM"
        )
        vinculos, hash_vinculos = ler("siconv_programa_proposta", "ID_PROPOSTA", {alvo.id_proposta}, "ID_PROGRAMA")
        programas, hash_programas = ler(
            "siconv_programa",
            "ID_PROGRAMA",
            {v["ID_PROGRAMA"] for v in vinculos},
            "NOME_PROGRAMA",
            "COD_ORGAO_SUP_PROGRAMA",
        )
        elegiveis = descobrir_prioritarios_ms(
            convenios=convenios,
            itens=itens,
            propostas=propostas,
            programas=programas,
            vinculos=vinculos,
            conhecidos=set(),
            limite=1,
        )
        if len(elegiveis) != 1:
            raise ConflictError("A fonte atual não comprova equipamento ou componente prioritário do MS.")
        with _sessao_com_retry() as sessao:
            portal = buscar_convenio_por_numero_dto(alvo.numero, session=sessao)
        if portal is None:
            raise ConflictError("Convênio não encontrado no Portal; prova não publicada.")
        portal_validado = PortalLegadoCapturado.model_validate(portal.model_dump(mode="json", exclude_none=True))
        if portal_validado.dimConvenio.codigo != alvo.numero:
            raise ConflictError("Portal retornou identidade divergente; prova não publicada.")
        filhas: dict[str, list[dict[str, str]]] = {}
        hashes_filhas: dict[str, str] = {}
        for campo, nome in ARQUIVOS_FILHAS.items():
            chave = "ID_SOLICITACAO" if campo == "termos_aditivos" else CHAVES_FILHAS[campo]
            filhas[campo], hashes_filhas[campo] = ler(nome, "NR_CONVENIO", {alvo.numero}, chave)
        captura = CapturaLegadoParaPromocao.model_validate(
            {
                "convenio": convenios[0],
                "itens": itens,
                "proposta": propostas[0],
                "programas": {"vinculos": vinculos, "catalogo": programas},
                "portal": portal_validado.model_dump(mode="json", exclude_none=True),
                "filhas": filhas,
            }
        )
        protegida = ProtecaoTexto([]).payload(captura.model_dump(mode="json"))
        return PacoteRecapturaLegado(
            captura=CapturaLegadoParaPromocao.model_validate(protegida),
            origem=OrigemRecapturaColetada(
                iniciado_em=iniciado,
                hash_convenios=hash_convenios,
                hash_itens=hash_itens,
                hash_proposta=hash_proposta,
                hashes_filhas=hashes_filhas,
                hashes_programas={"siconv_programa_proposta": hash_vinculos, "siconv_programa": hash_programas},
                payload_protegido_local=True,
            ),
        )
