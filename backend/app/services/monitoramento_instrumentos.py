"""Casos de uso de instrumentos monitorados."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
from typing import cast

from sqlalchemy.orm import Session

from app.audit import log_action
from app.authz import assert_pode_editar_monitoramento
from app.db.models import CnesEstabelecimento, EventoMarco, InstrumentoEquipamento, MarcoCatalogo, User
from app.domain_errors import ConflictError, NotFoundError, ValidationError
from app.repositories import monitoramento as monitoramento_repo
from app.repositories import propostas_candidatas as propostas_repo
from app.services.monitoramento_eventos import substituir_responsaveis_instrumento


@dataclass(frozen=True)
class NovoInstrumentoMonitorado:
    nr_convenio: str
    cnpj_convenente: str | None
    nome_convenente: str
    tipo_contratacao: str
    tecnico_titular_id: int
    municipio: str | None = None
    uf: str | None = None
    cnes: str | None = None
    programa: str | None = None
    tp_instrumento_programa: str | None = None
    componente: str | None = None
    ano_instrumento: int | None = None
    tecnico_suplente_id: int | None = None
    nivel_monitoramento: str | None = None
    modalidade_onco: str | None = None
    responsavel_execucao_nome: str | None = None
    responsavel_execucao_contato: str | None = None
    situacao_prestacao_contas: str | None = None
    origem_dado: str | None = None
    tipologia: str | None = None
    investimento_aquisicao: float | None = None
    situacao_programa: str | None = None
    natureza_servico: str | None = None
    proposta_candidata_id: int | None = None


def _valores_confiaveis_da_parceria(
    dados: NovoInstrumentoMonitorado,
    *,
    db: Session,
) -> dict[str, object]:
    """Resolve no banco a única porta TransfereGov para monitoramento.

    O browser fornece apenas a referência interna da proposta. Situação,
    código da parceria e dados de identificação não são evidência confiável
    quando enviados pelo cliente e por isso são sempre substituídos aqui.
    """
    valores = asdict(dados)
    proposta_id = valores.pop("proposta_candidata_id")
    if dados.tipo_contratacao != "Parceria TransfereGov":
        if proposta_id is not None:
            raise ValidationError("A referência de proposta só é aceita para Parceria TransfereGov.")
        return valores

    if proposta_id is None:
        raise ValidationError("Informe a proposta confirmada para adicionar a parceria ao monitoramento.")
    proposta = propostas_repo.obter_proposta_por_id(db, proposta_id)
    if proposta is None:
        raise NotFoundError("Proposta de financiamento não encontrada.")
    if not proposta.tem_parceria or not proposta.cd_parceria:
        raise ValidationError("Somente propostas com parceria confirmada podem entrar no monitoramento interno.")

    valores.update(
        nr_convenio=proposta.cd_parceria,
        cnpj_convenente=proposta.cnpj_ente_recebedor,
        nome_convenente=proposta.nm_proponente,
        municipio=proposta.municipio,
        uf=proposta.uf,
        cnes=proposta.cnes,
        programa=proposta.nm_programa,
        componente=proposta.componente_batido,
        ano_instrumento=proposta.data_proposta.year if proposta.data_proposta else None,
    )
    return valores


def criar_instrumento_monitorado(
    *,
    dados: NovoInstrumentoMonitorado,
    db: Session,
    usuario: User,
) -> InstrumentoEquipamento:
    assert_pode_editar_monitoramento(usuario)
    valores = _valores_confiaveis_da_parceria(dados, db=db)
    # PERSUS II só passa a integrar o recorte anual quando a equipe decide
    # incluí-lo no monitoramento. A própria inclusão é a fonte desse ano.
    if dados.tipo_contratacao == "PERSUS II" and valores["ano_instrumento"] is None:
        valores["ano_instrumento"] = date.today().year
        monitoramento_repo.preencher_ano_convenio_se_ausente(
            db,
            numero=str(valores["nr_convenio"]),
            tipo_contratacao="PERSUS II",
            ano=date.today().year,
        )
    nr_convenio = str(valores["nr_convenio"])
    ja_existe = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if ja_existe is not None:
        raise ConflictError(f"Já existe instrumento monitorado com nr_convenio={nr_convenio}.")

    titular_id = valores.pop("tecnico_titular_id")
    suplente_id = valores.pop("tecnico_suplente_id")
    instrumento = InstrumentoEquipamento(**valores)
    monitoramento_repo.adicionar_instrumento(db, instrumento)
    # A relação é a fonte de verdade; os nomes são apenas o espelho legado
    # preenchido pela função, nunca aceitos como entrada livre.
    titular, suplente = substituir_responsaveis_instrumento(
        db=db,
        instrumento=instrumento,
        titular_id=cast(int, titular_id),
        suplente_id=cast(int | None, suplente_id),
    )
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="created",
        details={
            "nr_convenio": instrumento.nr_convenio,
            "tipo_contratacao": dados.tipo_contratacao,
            "tecnico_titular_id": titular.id,
            "tecnico_suplente_id": suplente.id if suplente is not None else None,
        },
    )
    db.commit()
    db.refresh(instrumento)
    return instrumento


@dataclass(frozen=True)
class InstrumentoComFase:
    instrumento: InstrumentoEquipamento
    fase_atual: str


def _fase_atual_id(fases_gerais_desc: list[MarcoCatalogo], marco_ids_com_evento: set[int]) -> int | None:
    """Percorre os marcos de fase_geral do mais avançado (`ordem` desc) pro
    menos avançado -- o primeiro com evento registrado É a fase atual.
    Nenhum encontrado -> instrumento ainda não iniciou nenhuma fase."""
    for marco in fases_gerais_desc:
        if marco.id in marco_ids_com_evento:
            return marco.id
    return None


def listar_instrumentos_monitorados(
    *,
    db: Session,
    limit: int = 500,
    ufs: list[str] | None = None,
    municipio: str | None = None,
    cnes: str | None = None,
    ano_inicio: int | None = None,
    ano_fim: int | None = None,
    tipo_contratacao: str | None = None,
) -> list[InstrumentoComFase]:
    """`fase_atual` calculado (achado 2026-09-10, pedido do usuario: filtro
    de fase na Visao Geral) -- mesmo padrao de calculo de `obter_resumo`
    (marco de fase_geral de maior ordem com evento), so que aqui devolvido
    POR instrumento em vez de agregado. ufs/municipio/cnes/ano_inicio/
    ano_fim/tipo_contratacao sao filtros novos (Plan Mode relatorios
    2026-09-25, Blocos 2/4/7/8).

    `ano_inicio`/`ano_fim` NAO vao pro repository (achado ao vivo, Bloco 8,
    pedido do usuario: "instrumentos/programas em andamento devem sempre
    aparecer quando solicitar o relatorio do ano de 2026") -- a regra so e
    decidivel DEPOIS de calcular `fase_atual`: instrumento com
    `ano_instrumento` fora do periodo pedido ainda entra se (a) o periodo
    inclui o ano CORRENTE (generico, recalcula sozinho a cada ano -- nunca
    hardcode de um ano especifico) e (b) a fase atual ainda nao e
    "Concluido" (esta em andamento). Fora desse caso, filtra por periodo
    normalmente."""
    instrumentos = monitoramento_repo.listar_instrumentos(
        db,
        limit=limit,
        ufs=ufs,
        municipio=municipio,
        cnes=cnes,
        tipo_contratacao=tipo_contratacao,
    )
    fases_gerais_desc = monitoramento_repo.listar_marcos_fase_geral_desc(db)
    fase_ids = [m.id for m in fases_gerais_desc]
    eventos_por_instrumento = monitoramento_repo.mapa_eventos_por_instrumento(db, fase_ids)

    resultado = []
    for inst in instrumentos:
        fase_atual_id = _fase_atual_id(fases_gerais_desc, eventos_por_instrumento.get(inst.id, set()))
        fase_atual = next((f.rotulo for f in fases_gerais_desc if f.id == fase_atual_id), "Não iniciado")
        resultado.append(InstrumentoComFase(instrumento=inst, fase_atual=fase_atual))

    if ano_inicio is not None or ano_fim is not None:
        hoje = date.today().year
        periodo_inclui_hoje = (ano_inicio is None or ano_inicio <= hoje) and (ano_fim is None or hoje <= ano_fim)

        def _no_periodo(ano: int | None) -> bool:
            if ano is None:
                return False
            if ano_inicio is not None and ano < ano_inicio:
                return False
            return not (ano_fim is not None and ano > ano_fim)

        resultado = [
            r
            for r in resultado
            if _no_periodo(r.instrumento.ano_instrumento) or (periodo_inclui_hoje and r.fase_atual != "Concluído")
        ]
    return resultado


def listar_marcos_monitoramento(*, db: Session, limit: int) -> list[MarcoCatalogo]:
    return monitoramento_repo.listar_marcos_catalogo(db, limit=limit)


def buscar_cnes_monitoramento(*, termo: str, db: Session, limit: int = 20) -> list[CnesEstabelecimento]:
    return monitoramento_repo.buscar_cnes(db, termo=termo, limit=limit)


@dataclass(frozen=True)
class TimelineInstrumento:
    instrumento: InstrumentoEquipamento
    eventos: list[EventoMarco]


def obter_timeline_instrumento(*, db: Session, nr_convenio: str) -> TimelineInstrumento:
    instrumento = monitoramento_repo.obter_instrumento_por_nr_convenio(db, nr_convenio)
    if instrumento is None:
        raise NotFoundError(f"Instrumento {nr_convenio} não monitorado.")
    eventos = monitoramento_repo.listar_eventos_do_instrumento(db, instrumento.id)
    return TimelineInstrumento(instrumento=instrumento, eventos=eventos)
