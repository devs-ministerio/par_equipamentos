"""Acesso a dados de monitoramento de equipamento -- primeira extração de
query real deste domínio (Bloco 3 do Plan Mode consolidação 2026-09-17),
começando pela fatia de leitura (`listar_instrumentos`/`obter_timeline`),
mais simples que a escrita (eventos/ações têm side effects). Funções soltas
com `db: Session` posicional, nunca comitam -- mesmo contrato provado em
`repositories/notificacoes.py` (padroes/backend/constituicao_backend.md
Seção 3).
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AcaoMonitoramento,
    CnesEstabelecimento,
    Convenio,
    EventoMarco,
    InstrumentoEquipamento,
    InstrumentoResponsavel,
    MarcoCatalogo,
    MarcoGrupo,
    Notificacao,
    PropostaCandidata,
    User,
    UserRole,
    UserStatus,
)
from app.pipeline.texto import normalizar_texto
from app.repositories.notificacoes import criar_notificacao

# Evento/ação ATIVO = ainda vigente (não corrigido nem excluído) -- ver
# docstring de EventoMarco/AcaoMonitoramento em models.py (Plan Mode
# monitoramento-evolucao 2026-09-19). Só o ativo entra em cálculo de fase,
# timeline e listagens padrão.
_EVENTO_ATIVO = and_(EventoMarco.substituido_por_id.is_(None), EventoMarco.deletado_em.is_(None))
_ACAO_ATIVA = and_(AcaoMonitoramento.substituido_por_id.is_(None), AcaoMonitoramento.deletado_em.is_(None))


@dataclass(frozen=True)
class DadosResumoMonitoramento:
    """Dados já limitados ao agregado que alimenta a visão geral.

    A regra de negócio (fase, alertas e divergência externa) pertence ao
    service/router; este objeto só evita que a camada HTTP conheça SQL.
    """

    instrumentos: list[InstrumentoEquipamento]
    propostas_por_chave: dict[str, PropostaCandidata]
    marcos: list[MarcoCatalogo]
    eventos_por_instrumento: dict[int, list[EventoMarco]]
    acoes_pendentes: int
    acoes_atrasadas: int
    acoes_por_instrumento: dict[int, tuple[int, int]]
    acoes_em_aberto: list[tuple[AcaoMonitoramento, str | None]]
    ultima_atividade_por_instrumento: dict[int, datetime]


def carregar_dados_resumo_monitoramento(db: Session, *, hoje: date) -> DadosResumoMonitoramento:
    instrumentos = list(db.execute(select(InstrumentoEquipamento)).scalars())
    propostas = list(db.execute(select(PropostaCandidata)).scalars())
    propostas_por_chave = {
        chave: proposta
        for proposta in propostas
        for chave in (proposta.cd_parceria, str(proposta.id_proposta))
        if chave
    }
    marcos = list(db.execute(select(MarcoCatalogo)).scalars())
    marco_ids_relevantes = {
        marco.id
        for marco in marcos
        if marco.grupo == MarcoGrupo.fase_geral
        or marco.codigo in {"regulatorio_licenca_operacao", "cronograma_previsao_inauguracao"}
    }
    eventos_por_instrumento: dict[int, list[EventoMarco]] = defaultdict(list)
    if marco_ids_relevantes:
        for evento in db.execute(
            select(EventoMarco).where(
                EventoMarco.marco_id.in_(marco_ids_relevantes),
                _EVENTO_ATIVO,
            )
        ).scalars():
            eventos_por_instrumento[evento.instrumento_id].append(evento)

    # O histórico append-only não é carteira de tarefas: versões substituídas
    # ou excluídas nunca podem inflar os indicadores executivos.
    contagens_acoes = db.execute(
        select(
            AcaoMonitoramento.instrumento_id,
            func.count(AcaoMonitoramento.id),
            func.count(AcaoMonitoramento.id).filter(AcaoMonitoramento.data_prevista < hoje),
        )
        .where(_ACAO_ATIVA, AcaoMonitoramento.data_conclusao.is_(None))
        .group_by(AcaoMonitoramento.instrumento_id)
    ).all()
    acoes_por_instrumento = {
        instrumento_id: (pendentes, atrasadas)
        for instrumento_id, pendentes, atrasadas in contagens_acoes
    }
    acoes_em_aberto = [
        (acao, responsavel_nome)
        for acao, responsavel_nome in db.execute(
            select(AcaoMonitoramento, User.name)
            .outerjoin(User, User.id == AcaoMonitoramento.responsavel_id)
            .where(_ACAO_ATIVA, AcaoMonitoramento.data_conclusao.is_(None))
            .order_by(AcaoMonitoramento.data_prevista.asc().nulls_last(), AcaoMonitoramento.id)
            .limit(500)
        )
    ]
    ultima_atividade_por_instrumento: dict[int, datetime] = {}
    for modelo, ativo in ((EventoMarco, _EVENTO_ATIVO), (AcaoMonitoramento, _ACAO_ATIVA)):
        for instrumento_id, instante in db.execute(
            select(modelo.instrumento_id, func.max(modelo.created_at))
            .where(ativo)
            .group_by(modelo.instrumento_id)
        ):
            anterior = ultima_atividade_por_instrumento.get(instrumento_id)
            if instante and (anterior is None or instante > anterior):
                ultima_atividade_por_instrumento[instrumento_id] = instante
    return DadosResumoMonitoramento(
        instrumentos=instrumentos,
        propostas_por_chave=propostas_por_chave,
        marcos=marcos,
        eventos_por_instrumento=dict(eventos_por_instrumento),
        acoes_pendentes=sum(pendentes for pendentes, _ in acoes_por_instrumento.values()),
        acoes_atrasadas=sum(atrasadas for _, atrasadas in acoes_por_instrumento.values()),
        acoes_por_instrumento=acoes_por_instrumento,
        acoes_em_aberto=acoes_em_aberto,
        ultima_atividade_por_instrumento=ultima_atividade_por_instrumento,
    )


def listar_instrumentos(
    db: Session,
    *,
    limit: int = 500,
    ufs: list[str] | None = None,
    municipio: str | None = None,
    cnes: str | None = None,
    tipo_contratacao: str | None = None,
) -> list[InstrumentoEquipamento]:
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- universo monitorado e pequeno hoje (86).
    # ufs/municipio/cnes/tipo_contratacao sao filtros novos (Plan Mode
    # relatorios 2026-09-25, Blocos 2/4/7) -- opcionais, nao existiam antes.
    # Sem `programa` de proposito (achado ao vivo, Bloco 7): e preenchido
    # manualmente pela equipe, sem garantia de bater com `Convenio.programa`
    # string a string -- `tipo_contratacao` e o unico vocabulario fechado e
    # identico nas duas tabelas (Convenio/FAF/TED/PERSUS I/PERSUS II),
    # seguro de filtrar. Municipio comparado em Python (normalizar_texto),
    # nao em SQL -- achado ao vivo (Bloco 4): "SAO PAULO"/"São Paulo"
    # convivem na mesma coluna a depender da origem, comparação exata
    # sempre perdia uma das grafias. Sem `ano` de proposito (Bloco 8,
    # Plan Mode relatorios 2026-09-27): a regra "em andamento sempre
    # aparece no ano corrente" só é decidível DEPOIS de calcular
    # `fase_atual` -- esse filtro migrou pra
    # `app/services/monitoramento_instrumentos.py::listar_instrumentos_monitorados`,
    # em Python, pós-cálculo de fase.
    stmt = select(InstrumentoEquipamento)
    if ufs:
        stmt = stmt.where(InstrumentoEquipamento.uf.in_(ufs))
    if cnes:
        stmt = stmt.where(InstrumentoEquipamento.cnes == cnes)
    if tipo_contratacao:
        stmt = stmt.where(InstrumentoEquipamento.tipo_contratacao == tipo_contratacao)
    stmt = stmt.order_by(InstrumentoEquipamento.nr_convenio).limit(limit)
    resultado = list(db.execute(stmt).scalars().all())
    if municipio:
        alvo = normalizar_texto(municipio)
        resultado = [i for i in resultado if normalizar_texto(i.municipio) == alvo]
    return resultado


def mapear_coordenadas_cnes(
    db: Session, cnes_codes: set[str]
) -> dict[str, tuple[float | None, float | None]]:
    """Busca as coordenadas em lote para a listagem, sem consulta por instrumento."""
    if not cnes_codes:
        return {}
    linhas = db.execute(
        select(
            CnesEstabelecimento.cnes,
            CnesEstabelecimento.latitude,
            CnesEstabelecimento.longitude,
        ).where(CnesEstabelecimento.cnes.in_(cnes_codes))
    )
    return {
        cnes: (
            float(latitude) if latitude is not None else None,
            float(longitude) if longitude is not None else None,
        )
        for cnes, latitude, longitude in linhas
    }


def listar_marcos_fase_geral_desc(db: Session) -> list[MarcoCatalogo]:
    """Ordem decrescente -- o chamador percorre do marco mais avançado pro
    menos avançado até achar o primeiro com evento registrado (fase atual)."""
    return list(
        db.execute(
            select(MarcoCatalogo)
            .where(MarcoCatalogo.grupo == MarcoGrupo.fase_geral)
            .order_by(MarcoCatalogo.ordem.desc())
        )
        .scalars()
        .all()
    )


def listar_marcos_catalogo(db: Session, *, limit: int) -> list[MarcoCatalogo]:
    return list(
        db.execute(select(MarcoCatalogo).order_by(MarcoCatalogo.grupo, MarcoCatalogo.ordem).limit(limit)).scalars()
    )


def mapa_eventos_por_instrumento(db: Session, marco_ids: list[int]) -> dict[int, set[int]]:
    """`{instrumento_id: {marco_id, ...}}` -- só os pares relevantes pros
    `marco_ids` pedidos (fase_geral), não todo `EventoMarco` da tabela
    (universo monitorado é pequeno hoje, mas a query já nasce restrita).
    Só considera evento ATIVO -- um evento corrigido/excluído não pode mais
    empurrar a fase pra frente."""
    eventos_por_instrumento: dict[int, set[int]] = defaultdict(set)
    if marco_ids:
        for instrumento_id, marco_id in db.execute(
            select(EventoMarco.instrumento_id, EventoMarco.marco_id).where(
                EventoMarco.marco_id.in_(marco_ids), _EVENTO_ATIVO
            )
        ):
            eventos_por_instrumento[instrumento_id].add(marco_id)
    return eventos_por_instrumento


def obter_instrumento_por_nr_convenio(db: Session, nr_convenio: str) -> InstrumentoEquipamento | None:
    return db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()


def obter_instrumento_por_id(db: Session, instrumento_id: int) -> InstrumentoEquipamento | None:
    return db.get(InstrumentoEquipamento, instrumento_id)


def obter_marco_por_id(db: Session, marco_id: int) -> MarcoCatalogo | None:
    return db.get(MarcoCatalogo, marco_id)


def obter_marco_por_codigo(db: Session, codigo: str) -> MarcoCatalogo | None:
    return db.execute(select(MarcoCatalogo).where(MarcoCatalogo.codigo == codigo)).scalar_one_or_none()


def obter_cnes_por_codigo(db: Session, cnes: str) -> CnesEstabelecimento | None:
    return db.get(CnesEstabelecimento, cnes)


def buscar_cnes(db: Session, *, termo: str, limit: int) -> list[CnesEstabelecimento]:
    stmt = select(CnesEstabelecimento)
    if termo.isdigit():
        stmt = stmt.where(CnesEstabelecimento.cnes.startswith(termo))
    else:
        stmt = stmt.where(CnesEstabelecimento.nome_estabelecimento.ilike(f"%{termo}%"))
    return list(db.execute(stmt.limit(limit)).scalars())


def listar_eventos_do_instrumento(db: Session, instrumento_id: int, *, apenas_ativos: bool = True) -> list[EventoMarco]:
    """`apenas_ativos=False` devolve também os corrigidos/excluídos -- uso
    restrito à trilha de auditoria, nunca à timeline padrão.

    Desempate por `id` além de `created_at` (achado 2026-09-19, ao vivo,
    convênio 947527): cargas em lote gravam vários eventos do mesmo marco
    com o MESMO `created_at` (timestamp do processo, não do evento) --
    sem desempate, a ordem de retorno do Postgres pra empate não é
    garantida, e o front pode achar que "o mais recente" é qualquer um
    deles. `id` cresce sempre na ordem real de inserção, então serve de
    desempate determinístico -- mesmo critério já usado em
    `obter_evento_mais_recente_do_marco` abaixo."""
    stmt = select(EventoMarco).where(EventoMarco.instrumento_id == instrumento_id)
    if apenas_ativos:
        stmt = stmt.where(_EVENTO_ATIVO)
    return list(db.execute(stmt.order_by(EventoMarco.created_at.desc(), EventoMarco.id.desc())).scalars().all())


def obter_evento_mais_recente_do_marco(
    db: Session,
    *,
    instrumento_id: int,
    marco_id: int,
) -> EventoMarco | None:
    """Só entre os ATIVOS -- reprogramação/justificativa compara contra o
    que está vigente, não contra um lançamento já corrigido."""
    return db.execute(
        select(EventoMarco)
        .where(EventoMarco.instrumento_id == instrumento_id, EventoMarco.marco_id == marco_id, _EVENTO_ATIVO)
        .order_by(EventoMarco.created_at.desc(), EventoMarco.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def obter_evento_por_id(db: Session, evento_id: int) -> EventoMarco | None:
    return db.get(EventoMarco, evento_id)


def obter_acao_por_id(db: Session, acao_id: int) -> AcaoMonitoramento | None:
    return db.get(AcaoMonitoramento, acao_id)


def listar_acoes_do_instrumento(
    db: Session, instrumento_id: int, *, apenas_ativas: bool = True
) -> list[AcaoMonitoramento]:
    """Mesmo padrão de `listar_eventos_do_instrumento` acima, só que pra
    `AcaoMonitoramento` -- usado pelo relatório (Bloco 8, Plan Mode
    relatorios 2026-09-25) pra achar "Última Ação". Ordenado por
    `data_conclusao` (ação concluída mais recente primeiro; pendente sem
    conclusão fica por último) com `created_at`/`id` de desempate."""
    stmt = select(AcaoMonitoramento).where(AcaoMonitoramento.instrumento_id == instrumento_id)
    if apenas_ativas:
        stmt = stmt.where(_ACAO_ATIVA)
    return list(
        db.execute(
            stmt.order_by(
                AcaoMonitoramento.data_conclusao.desc().nulls_last(),
                AcaoMonitoramento.created_at.desc(),
                AcaoMonitoramento.id.desc(),
            )
        )
        .scalars()
        .all()
    )


def listar_acoes_monitoradas(db: Session, *, pendentes: bool, limit: int) -> list[tuple[AcaoMonitoramento, str]]:
    stmt = (
        select(AcaoMonitoramento, InstrumentoEquipamento.nr_convenio)
        .join(InstrumentoEquipamento, AcaoMonitoramento.instrumento_id == InstrumentoEquipamento.id)
        .where(_ACAO_ATIVA)
        .order_by(AcaoMonitoramento.data_prevista.asc().nulls_last())
        .limit(limit)
    )
    if pendentes:
        stmt = stmt.where(AcaoMonitoramento.data_conclusao.is_(None))
    return [(acao, nr_convenio) for acao, nr_convenio in db.execute(stmt).all()]


def resolver_nomes_usuarios(db: Session, ids: Iterable[int | None]) -> dict[int, str]:
    """`{user_id: name}` pros ids pedidos -- usado pra montar `autor_nome`/
    `atualizado_por_nome`/`deletado_por_nome` sem N+1 query por evento/ação.
    Aceita ids `None` na entrada (comum quando o campo é opcional no
    chamador) -- só filtra, nunca falha."""
    ids_validos = {i for i in ids if i is not None}
    if not ids_validos:
        return {}
    return {row[0]: row[1] for row in db.execute(select(User.id, User.name).where(User.id.in_(ids_validos)))}


def adicionar_instrumento(db: Session, instrumento: InstrumentoEquipamento) -> None:
    """Persiste e materializa o id para o caso de uso registrar sua auditoria."""
    db.add(instrumento)
    db.flush()


def preencher_ano_convenio_se_ausente(
    db: Session,
    *,
    numero: str,
    tipo_contratacao: str,
    ano: int,
) -> None:
    """Espelha no universo de instrumentos firmados o ano definido pela gestão."""
    convenio = db.execute(
        select(Convenio).where(
            Convenio.numero == numero,
            Convenio.tipo_contratacao == tipo_contratacao,
            Convenio.ano_instrumento.is_(None),
        )
    ).scalar_one_or_none()
    if convenio is not None:
        convenio.ano_instrumento = ano


def adicionar_evento(db: Session, evento: EventoMarco) -> None:
    """Persiste lançamento append-only e materializa sua chave primária."""
    db.add(evento)
    db.flush()


def adicionar_acao(db: Session, acao: AcaoMonitoramento) -> None:
    """Persiste ação monitorada e materializa sua chave primária."""
    db.add(acao)
    db.flush()


def adicionar_notificacao(db: Session, notificacao: Notificacao) -> None:
    """Persiste a notificação auxiliar decidida pelo caso de uso, já
    materializando o destinatário (titular/suplente do instrumento +
    gestor/admin, ver app.repositories.notificacoes::criar_notificacao)."""
    criar_notificacao(db, notificacao)


def sincronizar(db: Session) -> None:
    """Força a emissão das alterações pendentes antes de uma consulta interna."""
    db.flush()


def mapear_responsaveis_por_instrumentos(db: Session, ids: set[int]) -> dict[int, set[int]]:
    """Versão em lote de `obter_ids_responsaveis_do_instrumento` -- usada pela
    listagem de instrumentos, pra não fazer 1 query por linha."""
    resultado: dict[int, set[int]] = defaultdict(set)
    if not ids:
        return resultado
    linhas = db.execute(
        select(InstrumentoResponsavel.instrumento_id, InstrumentoResponsavel.usuario_id).where(
            InstrumentoResponsavel.instrumento_id.in_(ids)
        )
    )
    for instrumento_id, usuario_id in linhas:
        resultado[instrumento_id].add(usuario_id)
    return resultado


def mapear_responsaveis_com_papel_por_instrumentos(db: Session, ids: set[int]) -> dict[int, dict[str, int]]:
    """Responsáveis por papel, para expor IDs de seleção sem inferir nomes."""
    resultado: dict[int, dict[str, int]] = defaultdict(dict)
    if not ids:
        return resultado
    for instrumento_id, papel, usuario_id in db.execute(
        select(
            InstrumentoResponsavel.instrumento_id,
            InstrumentoResponsavel.papel,
            InstrumentoResponsavel.usuario_id,
        ).where(InstrumentoResponsavel.instrumento_id.in_(ids))
    ):
        resultado[instrumento_id][papel] = usuario_id
    return resultado


def listar_colaboradores_ativos(db: Session) -> list[User]:
    return list(
        db.execute(
            select(User)
            .where(
                User.role == UserRole.colaborador,
                User.status == UserStatus.active,
                User.deleted_at.is_(None),
            )
            .order_by(User.name, User.id)
        ).scalars()
    )
