"""Monitoramento de equipamento pos-repasse -- esforco separado da analise
de merito de hipo/hipersuficiencia (decisao 2026-09-03). Ver app/db/models.py
(secao 8) pro desenho (instrumento_equipamento / marco_catalogo /
evento_marco, log append-only).

O monitoramento cobre os instrumentos que a equipe escolheu acompanhar (91
na conferência de 2026-09-21); o seed de testes continua usando o convênio
948686. Mutações exigem editor; leituras exigem usuário autenticado (Plan
Mode segurança 2026-09-16, Bloco 1) -- exceção deliberada: /marcos fica
público (catálogo fixo, sem dado interno).
"""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.db.base import get_db
from app.db.models import (
    AcaoMonitoramento,
    EventoMarco,
    MarcoGrupo,
    User,
)
from app.pipeline import portal_transparencia
from app.repositories import monitoramento as monitoramento_repo
from app.schemas_monitoramento import ResumoMonitoramentoRead
from app.services.monitoramento_eventos import (
    DadosEquipamentoEntregue,
    NovoEventoMonitorado,
    atualizar_cadastro_instrumento,
    concluir_acao_monitorada,
    editar_acao_monitorada,
    editar_evento_monitorado,
    excluir_acao_monitorada,
    excluir_evento_monitorado,
    listar_acoes_monitoradas,
    obter_nr_convenio_da_acao_monitorada,
    registrar_acao_monitorada,
    registrar_evento_monitorado,
)
from app.services.monitoramento_instrumentos import (
    NovoInstrumentoMonitorado,
    buscar_cnes_monitoramento,
    criar_instrumento_monitorado,
    listar_instrumentos_monitorados,
    listar_marcos_monitoramento,
    obter_timeline_instrumento,
)
from app.services.monitoramento_resumo import montar_resumo_monitoramento

router = APIRouter(prefix="/monitoramento", tags=["monitoramento"])


class MarcoCatalogoRead(BaseModel):
    id: int
    codigo: str
    grupo: MarcoGrupo
    ordem: int | None
    execucao_fisica_pct_referencia: float | None
    rotulo: str
    descricao_referencia: str | None

    model_config = ConfigDict(from_attributes=True)


class EventoMarcoRead(BaseModel):
    id: int
    marco_id: int
    # Obrigatório pra marco de grupo fisico/regulatorio, None quando o
    # proprio evento JA é de grupo=fase_geral (Plan Mode monitoramento-
    # evolucao 2026-09-19).
    fase_geral_id: int | None
    data_ocorrencia: date | None
    data_prevista: date | None
    status_regulatorio: str | None
    # Numero de matricula/licenca/processo (ex. matricula CNEN) -- achado
    # 2026-09-09, coluna propria pra nao misturar com o vocabulario de
    # status (ver comentario em app/db/models.py::EventoMarco).
    numero_documento: str | None
    # Validade da licenca/matricula, quando aplicavel -- alimenta o alerta
    # de vencimento na pagina de monitoramento.
    data_validade: date | None
    observacao: str | None
    autor_nome: str | None
    created_at: datetime
    # Ciclo de vida (Plan Mode monitoramento-evolucao 2026-09-19) -- `ativo`
    # é conveniência calculada pro front não reimplementar a regra.
    atualizado_em: datetime | None = None
    substituido_por_id: int | None = None
    deletado_em: datetime | None = None
    deletado_por_nome: str | None = None
    motivo_exclusao: str | None = None
    ativo: bool = True

    model_config = ConfigDict(from_attributes=True)


class EventoMarcoCreate(BaseModel):
    marco_id: int
    data_ocorrencia: date | None = None
    data_prevista: date | None = None
    status_regulatorio: str | None = None
    numero_documento: str | None = None
    data_validade: date | None = None
    observacao: str | None = None
    # Legado temporario aceito por compatibilidade com o front atual; a
    # autoria real usada no evento vem do JWT.
    autor_nome: str | None = None
    # Obrigatório pra marco de grupo fisico/regulatorio -- ver
    # EventoMarcoRead. Validado no service, não só aqui.
    fase_geral_id: int | None = None
    confirmar_inauguracao: bool = False
    # Equipamento FISICO -- so usado quando marco.codigo ==
    # "cronograma_entrega" (achado 2026-09-09, pedido do usuario: "o
    # equipamento entregue pode mover para eventos"). `registrar_evento`
    # aplica isso em InstrumentoEquipamento (estado atual) E compoe um
    # resumo textual na observacao do proprio evento (retrato historico do
    # que foi confirmado NAQUELE lancamento). Ignorado silenciosamente pra
    # qualquer outro marco.
    equipamento_marca: str | None = None
    equipamento_modelo: str | None = None
    equipamento_numero_serie: str | None = None
    equipamento_vida_util_anos: int | None = None


class EventoMarcoUpdate(BaseModel):
    """Corrigir um evento (Plan Mode monitoramento-evolucao 2026-09-19) --
    mesmo shape de EventoMarcoCreate menos `marco_id`/equipamento (marco não
    muda numa correção; equipamento físico é editado por
    InstrumentoEquipamentoUpdate, não aqui)."""

    data_ocorrencia: date | None = None
    data_prevista: date | None = None
    status_regulatorio: str | None = None
    numero_documento: str | None = None
    data_validade: date | None = None
    observacao: str | None = None
    fase_geral_id: int | None = None


class MotivoExclusao(BaseModel):
    motivo: str = Field(min_length=3, max_length=500)


class InstrumentoEquipamentoRead(BaseModel):
    id: int
    nr_convenio: str
    cnpj_convenente: str | None
    nome_convenente: str
    municipio: str | None
    uf: str | None
    cnes: str | None
    # Equipamento PLANEJADO (SICONV/plano de aplicacao) -- nunca editavel
    # por aqui, ver InstrumentoEquipamentoUpdate.
    equipamento_descricao: str | None
    # Equipamento FISICO de verdade, informado pelo estabelecimento DEPOIS
    # da entrega (achado 2026-09-09: "não vamos alterar o equipamento que
    # veio do SISCONV, mas sim cadastrar os dados... quando o
    # estabelecimento disponibilizar, após a entrega"). Editaveis.
    equipamento_marca: str | None
    equipamento_modelo: str | None
    equipamento_numero_serie: str | None
    equipamento_vida_util_anos: int | None
    programa: str | None
    tp_instrumento_programa: str | None
    componente: str | None
    ano_instrumento: int | None
    # "Convênio" (universo Portal/TransfereGov) / "FAF" / "TED" -- achado
    # 2026-09-09, so vem da planilha/import, nunca editavel a mao (fora do
    # Update abaixo de proposito).
    tipo_contratacao: str | None
    origem_dado: str | None
    tipologia: str | None
    investimento_aquisicao: float | None
    situacao_programa: str | None
    natureza_servico: str | None
    tecnico_titular: str | None
    tecnico_suplente: str | None
    nivel_monitoramento: str | None
    modalidade_onco: str | None
    # Responsavel tecnico da execucao NA INSTITUICAO/convenente -- achado
    # 2026-09-09, DIFERENTE de tecnico_titular/suplente (que sao da nossa
    # equipe). Opcional, informativo.
    responsavel_execucao_nome: str | None
    responsavel_execucao_contato: str | None
    # Situacao da PRESTACAO DE CONTAS (TransfereGov) -- achado 2026-09-14,
    # DIFERENTE de `situacao` (Portal da Transparencia, buscado ao vivo em
    # `obter_timeline`/`_convenio_ao_vivo`, nao esta neste model porque tem
    # fonte automatica). Este campo nao tem API de consulta por convenio
    # legado, entao e dado manual, gravado aqui como os outros campos de
    # gestao interna (ver comentario em InstrumentoEquipamento no
    # models.py).
    situacao_prestacao_contas: str | None
    # Situacao da parceria/ordem de pagamento no TransfereGov NOVO --
    # achado 2026-09-15, sincronizado por job_verificacao_transferegov.py.
    # So existe pra tipo_contratacao="Parceria TransfereGov" -- ver
    # docstring dos 2 campos em app/db/models.py.
    situacao_parceria_transferegov: str | None
    situacao_ordem_pagamento_transferegov: str | None
    # So preenchido por `listar_instrumentos` (achado 2026-09-10, pedido do
    # usuario: filtro de fase na Visao Geral) -- reaproveita `_fase_atual_id`,
    # mesma regra ja usada em `obter_resumo`/no front. Fica None nos outros
    # endpoints que devolvem InstrumentoEquipamentoRead (PATCH/timeline), que
    # nao precisam disso.
    fase_atual: str | None = None

    model_config = ConfigDict(from_attributes=True)


class InstrumentoEquipamentoUpdate(BaseModel):
    """So os campos de cadastro que NENHUMA API publica tem (mesmo criterio
    do comentario em InstrumentoEquipamento no models.py) -- nunca
    nr_convenio/cnpj_convenente/nome_convenente/programa/componente/
    ano_instrumento/tipo_contratacao, que vem de fonte real (planilha/API)
    e nao devem virar editaveis a mao aqui. Tambem NUNCA `equipamento_descricao`
    (achado 2026-09-09: e o equipamento PLANEJADO do SICONV, "não vamos
    alterar o equipamento que veio do SISCONV") -- os `equipamento_*`
    editaveis aqui sao o equipamento FISICO de verdade, informado pelo
    estabelecimento depois da entrega (hoje entram principalmente pelo
    evento de entrega, ver EventoMarcoCreate, mas o PATCH continua
    disponivel pra corrigir depois). Todos opcionais -- PATCH aplica so o
    que vier preenchido, deixando o resto como esta (nunca zera campo por
    omissao)."""

    equipamento_marca: str | None = None
    equipamento_modelo: str | None = None
    equipamento_numero_serie: str | None = None
    equipamento_vida_util_anos: int | None = None
    tecnico_titular: str | None = None
    tecnico_suplente: str | None = None
    nivel_monitoramento: str | None = None
    # Tipologia (dicionário fechado A/CV/C/EO/C.B/NA) -- editável aqui desde
    # Plan Mode monitoramento-evolucao 2026-09-19, que absorveu o antigo
    # campo "finalidade" (removido, ver models.py). Validado no service
    # contra o mesmo dicionário do CHECK constraint.
    tipologia: str | None = None
    modalidade_onco: str | None = None
    responsavel_execucao_nome: str | None = None
    responsavel_execucao_contato: str | None = None
    situacao_prestacao_contas: str | None = None
    # CNES -- achado 2026-09-16, pedido do usuário: "vamos deixar o campo
    # cnes editável no sistema... só poderá editar por outro cnes válido na
    # base de dados". Validado em `atualizar_cadastro` contra
    # CnesEstabelecimento (nunca texto livre) antes de aplicar.
    cnes: str | None = None


class InstrumentoEquipamentoCreate(BaseModel):
    """Entrada explícita de um instrumento no monitoramento interno.

    Convênios, propostas e cargas manuais usam este mesmo POST. Diferente
    de InstrumentoEquipamentoUpdate:
    aqui SIM entra identidade (nr_convenio/cnpj/nome/tipo_contratacao),
    porque e o unico momento em que esses campos existem -- depois de
    criado, ficam imutaveis (mesma decisao do PATCH, corrigir por fora da
    aplicacao se a fonte original estava errada, nao por aqui)."""

    nr_convenio: str
    cnpj_convenente: str | None = None
    nome_convenente: str
    tipo_contratacao: str
    municipio: str | None = None
    uf: str | None = None
    cnes: str | None = None
    programa: str | None = None
    tp_instrumento_programa: str | None = None
    componente: str | None = None
    ano_instrumento: int | None = None
    tecnico_titular: str | None = None
    tecnico_suplente: str | None = None
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


class ValorSituacaoAoVivoRead(BaseModel):
    """Sempre buscado na hora no Portal da Transparencia -- nunca congelado
    no banco (decisao do usuario 2026-09-03, ver comentario em
    InstrumentoEquipamento). `disponivel=False` quando a API falhar/nao
    achar -- o front mostra "indisponivel" em vez de um valor errado.

    `valor_suspeito=True` quando o Portal devolve `valor` (global) MENOR que
    `valor_liberado` -- logicamente impossivel (liberado nunca passa do
    global) e e exatamente a assinatura do bug de truncamento confirmado
    nesse campo (ver docs/monitoramento-equipamentos/convenios.html e
    frontend/src/pages/monitoramento/mesclarConvenios.ts, que contorna o
    mesmo bug na lista principal cruzando com o SICONV). Esse endpoint e por
    instrumento, sem SICONV pra cruzar ao vivo, entao so da pra SINALIZAR o
    valor suspeito -- nao reconstruir o numero certo."""

    disponivel: bool
    valor: float | None = None
    valor_liberado: float | None = None
    situacao: str | None = None
    valor_suspeito: bool = False


class InstrumentoTimelineRead(BaseModel):
    instrumento: InstrumentoEquipamentoRead
    ao_vivo: ValorSituacaoAoVivoRead
    eventos: list[EventoMarcoRead]


class AcaoMonitoramentoRead(BaseModel):
    id: int
    instrumento_id: int
    nr_convenio: str
    descricao: str
    data_prevista: date | None
    data_conclusao: date | None
    # Legado texto livre (dado histórico) -- leitura cai pra ele quando
    # `responsavel_id` for None (Plan Mode monitoramento-evolucao
    # 2026-09-19).
    responsavel: str | None
    responsavel_id: int | None = None
    responsavel_nome: str | None = None
    criado_por_nome: str | None = None
    created_at: datetime
    atualizado_em: datetime | None = None
    substituido_por_id: int | None = None
    deletado_em: datetime | None = None
    deletado_por_nome: str | None = None
    motivo_exclusao: str | None = None
    ativo: bool = True

    model_config = ConfigDict(from_attributes=True)


class AcaoMonitoramentoCreate(BaseModel):
    descricao: str
    data_prevista: date | None = None
    responsavel: str | None = None
    responsavel_id: int | None = None


class AcaoMonitoramentoUpdate(BaseModel):
    """Corrigir uma ação (Plan Mode monitoramento-evolucao 2026-09-19) --
    mesma disciplina append-only de EventoMarcoUpdate."""

    descricao: str
    data_prevista: date | None = None
    responsavel: str | None = None
    responsavel_id: int | None = None


def _ao_vivo_de(
    dado: portal_transparencia.ConvenioPortalTransparencia | dict | None,
) -> ValorSituacaoAoVivoRead:
    """Monta o `ao_vivo` a partir da resposta crua do Portal da Transparencia
    (ou `None` quando a consulta falhou/nao achou). Extraida do endpoint pra
    dar pra testar a deteccao de `valor_suspeito` sem precisar de banco nem
    de rede (ver test_monitoramento.py)."""
    if dado is None:
        return ValorSituacaoAoVivoRead(disponivel=False)

    if isinstance(dado, dict):
        dado = portal_transparencia.ConvenioPortalTransparencia.model_validate(dado)

    valor = dado.valor
    valor_liberado = dado.valorLiberado
    suspeito = valor is not None and valor_liberado is not None and valor_liberado > valor
    return ValorSituacaoAoVivoRead(
        disponivel=True,
        valor=valor,
        valor_liberado=valor_liberado,
        situacao=dado.situacao,
        valor_suspeito=suspeito,
    )


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria autenticada fica visivel junto do texto para leitura rapida."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo


def _evento_read(evento: EventoMarco, nomes: dict[int, str]) -> EventoMarcoRead:
    """Monta EventoMarcoRead resolvendo autor/exclusão a partir do mapa de
    nomes já carregado (evita N+1 query por evento, ver
    `monitoramento_repo.resolver_nomes_usuarios`)."""
    return EventoMarcoRead(
        id=evento.id,
        marco_id=evento.marco_id,
        fase_geral_id=evento.fase_geral_id,
        data_ocorrencia=evento.data_ocorrencia,
        data_prevista=evento.data_prevista,
        status_regulatorio=evento.status_regulatorio,
        numero_documento=evento.numero_documento,
        data_validade=evento.data_validade,
        observacao=evento.observacao,
        autor_nome=nomes.get(evento.autor_id) if evento.autor_id else None,
        created_at=evento.created_at,
        atualizado_em=evento.atualizado_em,
        substituido_por_id=evento.substituido_por_id,
        deletado_em=evento.deletado_em,
        deletado_por_nome=nomes.get(evento.deletado_por_id) if evento.deletado_por_id else None,
        motivo_exclusao=evento.motivo_exclusao,
        ativo=evento.deletado_em is None and evento.substituido_por_id is None,
    )


def _acao_read(acao: AcaoMonitoramento, nr_convenio: str, nomes: dict[int, str]) -> AcaoMonitoramentoRead:
    return AcaoMonitoramentoRead(
        id=acao.id,
        instrumento_id=acao.instrumento_id,
        nr_convenio=nr_convenio,
        descricao=acao.descricao,
        data_prevista=acao.data_prevista,
        data_conclusao=acao.data_conclusao,
        responsavel=acao.responsavel,
        responsavel_id=acao.responsavel_id,
        responsavel_nome=nomes.get(acao.responsavel_id) if acao.responsavel_id else None,
        criado_por_nome=nomes.get(acao.criado_por_id) if acao.criado_por_id else None,
        created_at=acao.created_at,
        atualizado_em=acao.atualizado_em,
        substituido_por_id=acao.substituido_por_id,
        deletado_em=acao.deletado_em,
        deletado_por_nome=nomes.get(acao.deletado_por_id) if acao.deletado_por_id else None,
        motivo_exclusao=acao.motivo_exclusao,
        ativo=acao.deletado_em is None and acao.substituido_por_id is None,
    )


class CnesEstabelecimentoRead(BaseModel):
    cnes: str
    nome_estabelecimento: str
    municipio: str | None
    uf: str | None

    model_config = ConfigDict(from_attributes=True)


@router.get("/cnes-referencia", response_model=list[CnesEstabelecimentoRead])
def buscar_cnes_referencia(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Busca em CnesEstabelecimento (nome ou código) -- achado 2026-09-16,
    pedido do usuário: "só poderá editar por outro cnes válido na base de
    dados". Alimenta um seletor no front (não campo de texto livre) tanto
    pra editar o CNES de um instrumento/proposta já existente quanto pra
    conferir um código antes de aplicar. `q` com só dígitos busca por
    código (prefixo); qualquer outra coisa busca por nome (contém,
    case-insensitive). Limitado a 20 resultados -- é autocomplete, não
    listagem completa."""
    return buscar_cnes_monitoramento(termo=q, db=db)


@router.get("/marcos", response_model=list[MarcoCatalogoRead])
def listar_marcos(
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- catalogo fixo, 23 marcos hoje.
    limit: int = Query(default=200, le=200, gt=0),
    db: Session = Depends(get_db),
):
    return listar_marcos_monitoramento(db=db, limit=limit)


@router.get("/instrumentos", response_model=list[InstrumentoEquipamentoRead])
def listar_instrumentos(
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- universo monitorado e pequeno hoje (86).
    limit: int = Query(default=500, le=500, gt=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Router fino (Bloco 3 do Plan Mode consolidação 2026-09-17) -- lógica
    de fase atual e query vivem em `services/monitoramento_instrumentos.py`
    + `repositories/monitoramento.py`; aqui só o mapeamento pro schema
    HTTP (`fase_atual` não é coluna, por isso o `model_copy`)."""
    itens = listar_instrumentos_monitorados(db=db, limit=limit)
    return [
        InstrumentoEquipamentoRead.model_validate(item.instrumento).model_copy(update={"fase_atual": item.fase_atual})
        for item in itens
    ]


@router.get("/instrumentos/{nr_convenio}", response_model=InstrumentoTimelineRead)
def obter_timeline(
    nr_convenio: str,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    timeline = obter_timeline_instrumento(db=db, nr_convenio=nr_convenio)

    # Valor e situacao SEMPRE ao vivo (decisao 2026-09-03) -- nunca lidos do
    # banco. Falha da API vira `disponivel=False`, nao propaga excecao pro
    # front (a timeline continua util mesmo se o Portal da Transparencia
    # estiver fora do ar).
    try:
        dado = portal_transparencia.buscar_convenio_por_numero_dto(nr_convenio)
        ao_vivo = _ao_vivo_de(dado)
    except Exception:
        # Chave ausente, rede fora, 500 do Portal da Transparencia -- qualquer
        # falha aqui rebaixa pra "indisponivel", nunca derruba a timeline.
        ao_vivo = ValorSituacaoAoVivoRead(disponivel=False)

    ids_usuarios = {e.autor_id for e in timeline.eventos if e.autor_id} | {
        e.deletado_por_id for e in timeline.eventos if e.deletado_por_id
    }
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, ids_usuarios)

    return InstrumentoTimelineRead(
        instrumento=InstrumentoEquipamentoRead.model_validate(timeline.instrumento),
        ao_vivo=ao_vivo,
        eventos=[_evento_read(e, nomes) for e in timeline.eventos],
    )


@router.post("/instrumentos", response_model=InstrumentoEquipamentoRead, status_code=201)
def criar_instrumento(
    corpo: InstrumentoEquipamentoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Radar de Convenios -- endpoint novo (antes so existia PATCH num
    instrumento ja existente, criado 1x via
    scripts/importar_planilha_monitoramento.py, bootstrap unico). 2 portas
    de entrada: automatica (proposta_candidata aceita) e manual (tecnico
    cadastrando FAF/TED/PERSUS ou avulso) -- ver docstring de
    InstrumentoEquipamentoCreate. 409 se `nr_convenio` ja existe (checagem
    de duplicidade antes de criar, mesmo criterio pras 2 portas)."""
    instrumento = criar_instrumento_monitorado(
        dados=NovoInstrumentoMonitorado(**corpo.model_dump()), db=db, usuario=usuario
    )
    return instrumento


@router.patch("/instrumentos/{nr_convenio}", response_model=InstrumentoEquipamentoRead)
def atualizar_cadastro(
    nr_convenio: str,
    corpo: InstrumentoEquipamentoUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Unico jeito de editar `InstrumentoEquipamento` hoje (antes so dava
    pra criar/editar via scripts/seed_monitoramento.py) -- so os campos de
    InstrumentoEquipamentoUpdate, nunca identidade/financeiro (ver docstring
    do model). So aplica campo que veio preenchido no corpo (exclude_unset),
    nunca zera um campo existente por causa de um PATCH parcial. Lógica de
    negócio e autorização vivem no Service (Plan Mode segurança 2026-09-16,
    Bloco 3) -- este router só resolve a sessão HTTP e comita a transação."""
    instrumento = atualizar_cadastro_instrumento(
        nr_convenio=nr_convenio,
        alteracoes_brutas=corpo.model_dump(exclude_unset=True),
        db=db,
        usuario=usuario,
    )
    return instrumento


@router.post("/instrumentos/{nr_convenio}/eventos", response_model=EventoMarcoRead, status_code=201)
def registrar_evento(
    nr_convenio: str,
    corpo: EventoMarcoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Append-only -- sempre INSERT, nunca UPDATE (ver comentario em
    EventoMarco). Corrigir um lançamento errado e lançar um evento novo.
    Lógica de negócio e autorização vivem no Service (Plan Mode segurança
    2026-09-16, Bloco 3)."""
    evento = registrar_evento_monitorado(
        nr_convenio=nr_convenio,
        dados=NovoEventoMonitorado(
            marco_id=corpo.marco_id,
            data_ocorrencia=corpo.data_ocorrencia,
            data_prevista=corpo.data_prevista,
            status_regulatorio=corpo.status_regulatorio,
            numero_documento=corpo.numero_documento,
            data_validade=corpo.data_validade,
            observacao=corpo.observacao,
            fase_geral_id=corpo.fase_geral_id,
            confirmar_inauguracao=corpo.confirmar_inauguracao,
            equipamento=DadosEquipamentoEntregue(
                marca=corpo.equipamento_marca,
                modelo=corpo.equipamento_modelo,
                numero_serie=corpo.equipamento_numero_serie,
                vida_util_anos=corpo.equipamento_vida_util_anos,
            ),
        ),
        db=db,
        usuario=usuario,
    )
    return _evento_read(evento, {usuario.id: usuario.name})


@router.patch("/eventos/{evento_id}", response_model=EventoMarcoRead)
def editar_evento(
    evento_id: int,
    corpo: EventoMarcoUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Corrigir (append-only, ver docstring do model) -- lança um evento
    novo e fecha o antigo via `substituido_por_id`. Lógica de negócio e
    autorização vivem no Service."""
    novo = editar_evento_monitorado(
        evento_id=evento_id,
        dados=NovoEventoMonitorado(
            marco_id=0,  # ignorado -- editar_evento_monitorado mantém o marco do evento original
            data_ocorrencia=corpo.data_ocorrencia,
            data_prevista=corpo.data_prevista,
            status_regulatorio=corpo.status_regulatorio,
            numero_documento=corpo.numero_documento,
            data_validade=corpo.data_validade,
            observacao=corpo.observacao,
            fase_geral_id=corpo.fase_geral_id,
        ),
        db=db,
        usuario=usuario,
    )
    return _evento_read(novo, {usuario.id: usuario.name})


@router.delete("/eventos/{evento_id}", response_model=EventoMarcoRead)
def excluir_evento(
    evento_id: int,
    corpo: MotivoExclusao,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Exclusão lógica (ver docstring do model) -- nunca DELETE físico."""
    evento = excluir_evento_monitorado(evento_id=evento_id, motivo=corpo.motivo, db=db, usuario=usuario)
    return _evento_read(evento, {usuario.id: usuario.name})


@router.get("/resumo", response_model=ResumoMonitoramentoRead)
def obter_resumo(db: Session = Depends(get_db), usuario: User = Depends(require_current_user)):
    """Pagina de overview independente (achado 2026-09-09, pedido do
    usuario) -- 1 chamada so, tudo calculado a partir do NOSSO schema (ver
    docstring de ResumoMonitoramentoRead pro que fica de fora de
    proposito). Cálculo vive em
    `app/services/monitoramento_resumo.py::montar_resumo_monitoramento`
    (Plan Mode fechamento final 2026-09-25, Bloco 2) -- este router só
    resolve a sessão HTTP."""
    return montar_resumo_monitoramento(db)


@router.get("/acoes", response_model=list[AcaoMonitoramentoRead])
def listar_acoes(
    pendentes: bool = Query(False),
    # Teto de seguranca, nao paginacao de UI (Bloco 4 do Plan Mode
    # consolidacao 2026-09-17) -- volume atual e pequeno (universo de 91
    # instrumentos monitorados), sem necessidade de paginacao real ainda.
    limit: int = Query(default=500, le=500, gt=0),
    db: Session = Depends(get_db),
    usuario: User = Depends(require_current_user),
):
    """Todas as acoes ATIVAS (ou so pendentes, `?pendentes=true`) de TODOS
    os instrumentos, ordenadas por data_prevista -- alimenta a lista de
    "dividas por data" da pagina de overview. Ação corrigida/excluída não
    aparece aqui (ver docstring do model)."""
    linhas = listar_acoes_monitoradas(pendentes=pendentes, limit=limit, db=db)
    ids_usuarios = {a.responsavel_id for a, _ in linhas if a.responsavel_id} | {
        a.criado_por_id for a, _ in linhas if a.criado_por_id
    }
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, ids_usuarios)
    return [_acao_read(a, nr, nomes) for a, nr in linhas]


@router.post("/instrumentos/{nr_convenio}/acoes", response_model=AcaoMonitoramentoRead, status_code=201)
def registrar_acao(
    nr_convenio: str,
    corpo: AcaoMonitoramentoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Cria uma acao PENDENTE (data_conclusao null) -- diferente de
    EventoMarco, essa tabela nao esta amarrada a um catalogo fixo de
    marcos (ver docstring de AcaoMonitoramento no models.py). Lógica de
    negócio e autorização vivem no Service (Plan Mode segurança 2026-09-16,
    Bloco 3)."""
    acao = registrar_acao_monitorada(
        nr_convenio=nr_convenio,
        descricao=corpo.descricao,
        data_prevista=corpo.data_prevista,
        responsavel=corpo.responsavel,
        responsavel_id=corpo.responsavel_id,
        db=db,
        usuario=usuario,
    )
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, {corpo.responsavel_id, usuario.id})
    return _acao_read(acao, nr_convenio, nomes)


@router.patch("/acoes/{acao_id}", response_model=AcaoMonitoramentoRead)
def editar_acao(
    acao_id: int,
    corpo: AcaoMonitoramentoUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Corrigir (append-only, ver docstring do model) -- lança uma ação
    nova e fecha a antiga via `substituido_por_id`."""
    nova = editar_acao_monitorada(
        acao_id=acao_id,
        descricao=corpo.descricao,
        data_prevista=corpo.data_prevista,
        responsavel=corpo.responsavel,
        responsavel_id=corpo.responsavel_id,
        db=db,
        usuario=usuario,
    )
    nr_convenio = obter_nr_convenio_da_acao_monitorada(acao=nova, db=db)
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, {corpo.responsavel_id, usuario.id})
    return _acao_read(nova, nr_convenio, nomes)


@router.delete("/acoes/{acao_id}", response_model=AcaoMonitoramentoRead)
def excluir_acao(
    acao_id: int,
    corpo: MotivoExclusao,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Exclusão lógica (ver docstring do model) -- nunca DELETE físico."""
    acao = excluir_acao_monitorada(acao_id=acao_id, motivo=corpo.motivo, db=db, usuario=usuario)
    nr_convenio = obter_nr_convenio_da_acao_monitorada(acao=acao, db=db)
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, {usuario.id})
    return _acao_read(acao, nr_convenio, nomes)


@router.patch("/acoes/{acao_id}/concluir", response_model=AcaoMonitoramentoRead)
def concluir_acao(
    acao_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Unico UPDATE que AcaoMonitoramento permite de proposito -- marcar
    como concluida (seta data_conclusao = hoje). Descricao/data_prevista/
    responsavel continuam imutaveis (ver docstring do model). Lógica de
    negócio e autorização vivem no Service (Plan Mode segurança 2026-09-16,
    Bloco 3)."""
    acao = concluir_acao_monitorada(acao_id=acao_id, db=db, usuario=usuario)
    nr_convenio = obter_nr_convenio_da_acao_monitorada(acao=acao, db=db)
    nomes = monitoramento_repo.resolver_nomes_usuarios(db, {acao.responsavel_id, acao.criado_por_id})
    return _acao_read(acao, nr_convenio, nomes)
