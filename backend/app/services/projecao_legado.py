"""Projeção pura reconstruída das fontes; não aprova e não grava no banco."""

import re
from datetime import date, datetime
from decimal import Decimal

from pydantic import ValidationError

from app.domain_errors import ConflictError
from app.geo_reference import REGIAO_POR_UF
from app.schemas_projecao_legado import FinanceiroSiconv, ProjecaoCarteiraLegado
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao
from app.schemas_ultima_liberacao_legado import UltimaLiberacaoPortal


def _data_siconv(valor: object) -> date | None:
    if valor is None or valor == "":
        return None
    if not isinstance(valor, str):
        raise ValueError("Data oficial SICONV inválida.")
    if re.fullmatch(r"\d{8}", valor):
        return datetime.strptime(valor, "%Y%m%d").date()
    if "/" in valor:
        return datetime.strptime(valor, "%d/%m/%Y").date()
    return date.fromisoformat(valor)


def projetar_carteira(captura: CapturaLegadoParaPromocao) -> ProjecaoCarteiraLegado:
    try:
        captura = CapturaLegadoParaPromocao.model_validate(captura.model_dump())
        portal = captura.portal
        financeiro = FinanceiroSiconv.model_validate(captura.convenio.model_dump())
        liberacao = UltimaLiberacaoPortal.model_validate(portal.model_dump())
        extras = captura.convenio.model_extra or {}
        inicio = portal.dataInicioVigencia or _data_siconv(extras.get("DIA_INIC_VIGENC_CONV"))
        fim = portal.dataFinalVigencia or _data_siconv(extras.get("DIA_FIM_VIGENC_CONV"))
        contratacao = extras.get("SITUACAO_CONTRATACAO")
        if contratacao is not None and not isinstance(contratacao, str):
            raise ValueError("Situação de contratação oficial inválida.")
        if inicio is not None and fim is not None and fim < inicio:
            raise ValueError("Vigência oficial invertida.")
        if portal.municipioConvenente.codigoIBGE is not None and not re.fullmatch(
            r"[0-9]{7}",
            portal.municipioConvenente.codigoIBGE,
        ):
            raise ValueError("Código IBGE oficial inválido.")
    except (ValidationError, ValueError) as exc:
        raise ConflictError("A recaptura contém dados inválidos para a carteira. Consulte novamente a fonte.") from exc
    pagamentos = captura.filhas.pagamentos
    total_pago = sum((Decimal(p.VL_PAGO.replace(",", ".")) for p in pagamentos), Decimal(0)) if pagamentos else None
    ano = re.search(r"/([0-9]{4})$", portal.dimConvenio.numero)
    nomes = sorted({p.NOME_PROGRAMA for p in captura.programas.catalogo})
    bruto = captura.model_dump(mode="json")
    # Shape consumido pelos detalhes e pelo job de espelhamento existente.
    filhas = captura.filhas.model_dump(mode="json")
    raw = {
        "convenio": bruto["convenio"],
        "itens_plano_aplicacao": bruto["itens"],
        **filhas,
        "programas": bruto["programas"],
        "proposta": bruto["proposta"],
        "portal": bruto["portal"],
        "_espelho": {"versao": 1},
    }
    return ProjecaoCarteiraLegado(
        numero=captura.convenio.NR_CONVENIO,
        numero_instrumento=portal.dimConvenio.numero,
        ano_instrumento=int(ano[1]) if ano else None,
        objeto=portal.dimConvenio.objeto,
        situacao=captura.convenio.SIT_CONVENIO,
        situacao_portal=portal.situacao,
        situacao_contratacao=contratacao or None,
        convenente_nome=portal.convenente.nome,
        convenente_cnpj=portal.convenente.cnpjFormatado,
        convenente_tipo=portal.convenente.tipo,
        municipio=portal.municipioConvenente.nomeIBGE,
        uf=portal.municipioConvenente.uf.nome,
        codigo_ibge=portal.municipioConvenente.codigoIBGE,
        regiao=REGIAO_POR_UF[portal.municipioConvenente.uf.nome],
        numero_processo=portal.numeroProcesso,
        programa=" · ".join(nomes) if nomes else None,
        data_publicacao=portal.dataPublicacao,
        data_inicio_vigencia=inicio,
        data_final_vigencia=fim,
        data_conclusao=portal.dataConclusao,
        data_ultima_liberacao=liberacao.dataUltimaLiberacao,
        valor_global=Decimal(captura.convenio.VL_GLOBAL_CONV.replace(",", ".")),
        valor_repasse=financeiro.VL_REPASSE_CONV,
        valor_empenhado=financeiro.VL_EMPENHADO_CONV,
        valor_desembolsado=financeiro.VL_DESEMBOLSADO_CONV,
        valor_contrapartida=financeiro.VL_CONTRAPARTIDA_CONV,
        valor_saldo_conta=financeiro.VL_SALDO_CONTA,
        valor_ultima_liberacao=liberacao.valorDaUltimaLiberacao,
        valor_pago_fornecedor=total_pago,
        pagamentos_count=len(pagamentos),
        financeiro_fonte_confiavel=True,
        tipo_contratacao="Convênio",
        siconv_raw=raw,
    )
