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

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_current_user, require_monitoramento_editor
from app.authz import usuario_pode_editar_instrumento
from app.db.base import get_db
from app.db.models import (
    User,
)
from app.pipeline import portal_transparencia
from app.repositories import monitoramento as monitoramento_repo
from app.repositories.notificacoes import obter_ids_responsaveis_do_instrumento
from app.schemas_monitoramento import ResumoMonitoramentoRead
from app.schemas_monitoramento_api import (
    AcaoMonitoramentoCreate,
    AcaoMonitoramentoRead,
    AcaoMonitoramentoUpdate,
    CnesEstabelecimentoRead,
    ColaboradorMonitoramentoRead,
    EventoMarcoCreate,
    EventoMarcoRead,
    EventoMarcoUpdate,
    InstrumentoEquipamentoCreate,
    InstrumentoEquipamentoRead,
    InstrumentoEquipamentoUpdate,
    InstrumentoTimelineRead,
    MarcoCatalogoRead,
    MotivoExclusao,
    ValorSituacaoAoVivoRead,
)
from app.serializers_monitoramento import _acao_read, _ao_vivo_de, _evento_read
from app.services.monitoramento_acompanhamento import acompanhamento_dos_instrumentos
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
    HTTP (`fase_atual`/`pode_editar` não são coluna, por isso o `model_copy`)."""
    itens = listar_instrumentos_monitorados(db=db, limit=limit)
    ids_instrumentos = {item.instrumento.id for item in itens}
    coordenadas_por_cnes = monitoramento_repo.mapear_coordenadas_cnes(
        db, {item.instrumento.cnes for item in itens if item.instrumento.cnes}
    )
    responsaveis_por_instrumento = monitoramento_repo.mapear_responsaveis_por_instrumentos(db, ids_instrumentos)
    responsaveis_com_papel = monitoramento_repo.mapear_responsaveis_com_papel_por_instrumentos(db, ids_instrumentos)
    acompanhamento = acompanhamento_dos_instrumentos(db, sorted(ids_instrumentos))
    return [
        InstrumentoEquipamentoRead.model_validate(item.instrumento).model_copy(
            update={
                "fase_atual": item.fase_atual,
                "pode_editar": usuario_pode_editar_instrumento(
                    usuario, responsaveis_por_instrumento.get(item.instrumento.id, set())
                ),
                "tecnico_titular_id": responsaveis_com_papel.get(item.instrumento.id, {}).get("titular"),
                "tecnico_suplente_id": responsaveis_com_papel.get(item.instrumento.id, {}).get("suplente"),
                "acompanhamento": acompanhamento.get(item.instrumento.id),
                "latitude": coordenadas_por_cnes.get(item.instrumento.cnes or "", (None, None))[0],
                "longitude": coordenadas_por_cnes.get(item.instrumento.cnes or "", (None, None))[1],
            }
        )
        for item in itens
    ]


@router.get("/colaboradores", response_model=list[ColaboradorMonitoramentoRead])
def listar_colaboradores(
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
):
    """Lista fechada para os selects de responsável do monitoramento."""
    return monitoramento_repo.listar_colaboradores_ativos(db)


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
    ids_responsaveis = obter_ids_responsaveis_do_instrumento(db, timeline.instrumento.id)
    responsaveis_com_papel = monitoramento_repo.mapear_responsaveis_com_papel_por_instrumentos(
        db, {timeline.instrumento.id}
    )

    return InstrumentoTimelineRead(
        instrumento=InstrumentoEquipamentoRead.model_validate(timeline.instrumento).model_copy(
            update={
                "pode_editar": usuario_pode_editar_instrumento(usuario, ids_responsaveis),
                "tecnico_titular_id": responsaveis_com_papel.get(timeline.instrumento.id, {}).get("titular"),
                "tecnico_suplente_id": responsaveis_com_papel.get(timeline.instrumento.id, {}).get("suplente"),
            }
        ),
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
    evento = excluir_evento_monitorado(
        evento_id=evento_id,
        motivo=corpo.motivo,
        db=db,
        usuario=usuario,
        anular_inauguracao_vinculada=corpo.anular_inauguracao_vinculada,
    )
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
