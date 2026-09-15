"""Monitoramento de equipamento pos-repasse -- esforco separado da analise
de merito de hipo/hipersuficiencia (decisao 2026-09-03). Ver app/db/models.py
(secao 8) pro desenho (instrumento_equipamento / marco_catalogo /
evento_marco, log append-only).

So 1 instrumento por enquanto (convenio 948686, ver
scripts/seed_monitoramento.py) -- decisao deliberada do usuario pra validar
o desenho antes de escalar pros 71. Mutacoes exigem usuario autenticado.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_action
from app.auth import require_monitoramento_editor
from app.db.base import get_db
from app.db.models import (
    AcaoMonitoramento,
    EventoMarco,
    InstrumentoEquipamento,
    MarcoCatalogo,
    MarcoGrupo,
    Notificacao,
    NotificacaoTipo,
    User,
)
from app.pipeline import portal_transparencia

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


class InstrumentoEquipamentoRead(BaseModel):
    id: int
    nr_convenio: str
    cnpj_convenente: str
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
    tecnico_titular: str | None
    tecnico_suplente: str | None
    nivel_monitoramento: str | None
    finalidade: str | None
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
    finalidade: str | None = None
    modalidade_onco: str | None = None
    responsavel_execucao_nome: str | None = None
    responsavel_execucao_contato: str | None = None
    situacao_prestacao_contas: str | None = None


class InstrumentoEquipamentoCreate(BaseModel):
    """Radar de Convenios (fluxo 2026-09-15, ver
    docs/arquitetura/fluxo_requisicao.md) -- 2 portas de entrada pro mesmo
    POST: automatica (candidato de proposta_candidata aceito, nr_convenio =
    str(id_proposta), tipo_contratacao="Parceria TransfereGov") e manual
    (tecnico cadastrando FAF/TED/PERSUS ou convenio avulso que a equipe ja
    conhece por fora -- nr_convenio = digitos do NUP SEI pro mesmo criterio
    ja usado em scripts/importar_planilha_monitoramento.py::
    _resolver_identificador). Diferente de InstrumentoEquipamentoUpdate:
    aqui SIM entra identidade (nr_convenio/cnpj/nome/tipo_contratacao),
    porque e o unico momento em que esses campos existem -- depois de
    criado, ficam imutaveis (mesma decisao do PATCH, corrigir por fora da
    aplicacao se a fonte original estava errada, nao por aqui)."""
    nr_convenio: str
    cnpj_convenente: str
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
    finalidade: str | None = None
    modalidade_onco: str | None = None
    responsavel_execucao_nome: str | None = None
    responsavel_execucao_contato: str | None = None
    situacao_prestacao_contas: str | None = None


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
    responsavel: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AcaoMonitoramentoCreate(BaseModel):
    descricao: str
    data_prevista: date | None = None
    responsavel: str | None = None


class InauguracaoResumo(BaseModel):
    """1 por instrumento com data de inauguracao registrada (real ou
    prevista) -- alimenta a lista/"calendario" de inauguracoes da pagina
    de overview. `dias` negativo = ja passou (atrasada, se nao realizada;
    so informativa se `realizada`). municipio/uf/equipamento adicionados
    2026-09-15 pro card "Próxima inauguração" (substituiu Ações atrasadas/
    Inaugurações críticas -- pedido do usuário: "não temos meios pra
    monitorar ações atrasadas e inaugurações críticas")."""
    nr_convenio: str
    nome_convenente: str
    municipio: str | None
    uf: str | None
    equipamento: str | None
    data: date
    realizada: bool
    dias: int


class ContagemRotulo(BaseModel):
    """{rotulo, quantidade} generico -- usado tanto pra distribuicao por
    fase quanto pra contagem por tecnico titular."""
    rotulo: str
    quantidade: int


class LicencaVencendoResumo(BaseModel):
    """1 por instrumento com licenca de operacao/alteracao emitida E
    data_validade preenchida -- achado 2026-09-09, alimenta o painel de
    gestao (semaforo de licenca por vencer). `dias` negativo = ja vencida."""
    nr_convenio: str
    nome_convenente: str
    data_validade: date
    dias: int


class ResumoMonitoramentoRead(BaseModel):
    """1 chamada so pra pagina de overview (achado 2026-09-09, pedido do
    usuario: pagina INDEPENDENTE, nao so o detalhe de 1 convenio) -- tudo
    que da pra calcular a partir do NOSSO schema (instrumento_equipamento/
    evento_marco/acao_monitoramento). Pagamento ao fornecedor fica de fora
    de proposito -- essa info vem do siconv.json estatico
    (frontend/public/monitoramento-equipamentos/), nao do banco; o front
    cruza sozinho com a lista de nr_convenio abaixo pra nao acoplar este
    router a um pipeline de arquivo que ele nao gerencia."""
    total_instrumentos: int
    pct_execucao_fisica_medio: float | None
    distribuicao_fase: list[ContagemRotulo]
    licencas_cnen_deferidas: int
    licencas_vencendo: list[LicencaVencendoResumo]
    por_tecnico_titular: list[ContagemRotulo]
    inauguracoes: list[InauguracaoResumo]
    acoes_pendentes: int
    acoes_atrasadas: int
    nr_convenios: list[str]


def _ao_vivo_de(dado: dict | None) -> ValorSituacaoAoVivoRead:
    """Monta o `ao_vivo` a partir da resposta crua do Portal da Transparencia
    (ou `None` quando a consulta falhou/nao achou). Extraida do endpoint pra
    dar pra testar a deteccao de `valor_suspeito` sem precisar de banco nem
    de rede (ver test_monitoramento.py)."""
    if dado is None:
        return ValorSituacaoAoVivoRead(disponivel=False)

    valor = dado.get("valor")
    valor_liberado = dado.get("valorLiberado")
    suspeito = valor is not None and valor_liberado is not None and valor_liberado > valor
    return ValorSituacaoAoVivoRead(
        disponivel=True,
        valor=valor,
        valor_liberado=valor_liberado,
        situacao=dado.get("situacao"),
        valor_suspeito=suspeito,
    )


def _fase_atual_id(fases_gerais_desc: list[MarcoCatalogo], marco_ids_com_evento: set[int]) -> int | None:
    """Mesma regra ja usada no front (MonitoramentoInterno.tsx): marco de
    fase_geral de MAIOR ordem que tem pelo menos 1 evento lancado --
    `fases_gerais_desc` ja vem ordenado por `ordem` decrescente."""
    for f in fases_gerais_desc:
        if f.id in marco_ids_com_evento:
            return f.id
    return None


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria autenticada fica visivel junto do texto para leitura rapida."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo


@router.get("/marcos", response_model=list[MarcoCatalogoRead])
def listar_marcos(db: Session = Depends(get_db)):
    return db.execute(select(MarcoCatalogo).order_by(MarcoCatalogo.grupo, MarcoCatalogo.ordem)).scalars().all()


@router.get("/instrumentos", response_model=list[InstrumentoEquipamentoRead])
def listar_instrumentos(db: Session = Depends(get_db)):
    """Inclui `fase_atual` calculado (achado 2026-09-10, pedido do usuario:
    filtro de fase na Visao Geral) -- mesmo padrao de calculo de
    `obter_resumo` (marco de fase_geral de maior ordem com evento), so que
    aqui devolvido POR instrumento em vez de agregado."""
    instrumentos = db.execute(select(InstrumentoEquipamento).order_by(InstrumentoEquipamento.nr_convenio)).scalars().all()
    marcos = db.execute(select(MarcoCatalogo)).scalars().all()
    fases_gerais_desc = sorted(
        (m for m in marcos if m.grupo == MarcoGrupo.fase_geral), key=lambda m: m.ordem or 0, reverse=True,
    )
    todos_eventos = db.execute(select(EventoMarco)).scalars().all()
    eventos_por_instrumento: dict[int, set[int]] = defaultdict(set)
    for e in todos_eventos:
        eventos_por_instrumento[e.instrumento_id].add(e.marco_id)

    resultado = []
    for inst in instrumentos:
        fase_atual_id = _fase_atual_id(fases_gerais_desc, eventos_por_instrumento.get(inst.id, set()))
        fase_atual = next((f.rotulo for f in fases_gerais_desc if f.id == fase_atual_id), "Não iniciado")
        resultado.append(InstrumentoEquipamentoRead.model_validate(inst).model_copy(update={"fase_atual": fase_atual}))
    return resultado


@router.get("/instrumentos/{nr_convenio}", response_model=InstrumentoTimelineRead)
def obter_timeline(nr_convenio: str, db: Session = Depends(get_db)):
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")
    eventos = db.execute(
        select(EventoMarco)
        .where(EventoMarco.instrumento_id == instrumento.id)
        .order_by(EventoMarco.created_at.desc())
    ).scalars().all()

    # Valor e situacao SEMPRE ao vivo (decisao 2026-09-03) -- nunca lidos do
    # banco. Falha da API vira `disponivel=False`, nao propaga excecao pro
    # front (a timeline continua util mesmo se o Portal da Transparencia
    # estiver fora do ar).
    try:
        dado = portal_transparencia.buscar_convenio_por_numero(nr_convenio)
        ao_vivo = _ao_vivo_de(dado)
    except Exception:
        # Chave ausente, rede fora, 500 do Portal da Transparencia -- qualquer
        # falha aqui rebaixa pra "indisponivel", nunca derruba a timeline.
        ao_vivo = ValorSituacaoAoVivoRead(disponivel=False)

    return InstrumentoTimelineRead(
        instrumento=InstrumentoEquipamentoRead.model_validate(instrumento),
        ao_vivo=ao_vivo,
        eventos=[
            EventoMarcoRead(
                id=e.id, marco_id=e.marco_id, data_ocorrencia=e.data_ocorrencia,
                data_prevista=e.data_prevista, status_regulatorio=e.status_regulatorio,
                numero_documento=e.numero_documento, data_validade=e.data_validade,
                observacao=e.observacao, autor_nome=None, created_at=e.created_at,
            )
            for e in eventos
        ],
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
    ja_existe = db.execute(
        select(InstrumentoEquipamento.id).where(InstrumentoEquipamento.nr_convenio == corpo.nr_convenio)
    ).scalar_one_or_none()
    if ja_existe is not None:
        raise HTTPException(409, f"Já existe instrumento monitorado com nr_convenio={corpo.nr_convenio}.")

    instrumento = InstrumentoEquipamento(**corpo.model_dump())
    db.add(instrumento)
    db.flush()  # popula instrumento.id antes do log_action, sem precisar de 2º commit
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="created",
        details={
            "nr_convenio": corpo.nr_convenio,
            "tipo_contratacao": corpo.tipo_contratacao,
            "tecnico_titular": corpo.tecnico_titular,
        },
    )
    db.commit()
    db.refresh(instrumento)
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
    nunca zera um campo existente por causa de um PATCH parcial."""
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")

    alteracoes: dict[str, dict[str, object | None]] = {}
    for campo, valor in corpo.model_dump(exclude_unset=True).items():
        antigo = getattr(instrumento, campo)
        if antigo != valor:
            alteracoes[campo] = {"old": antigo, "new": valor}
        setattr(instrumento, campo, valor)
    log_action(
        db,
        user_id=usuario.id,
        entity_name="instrumento_equipamento",
        entity_id=instrumento.id,
        action="updated",
        details={"nr_convenio": nr_convenio, "changes": alteracoes},
    )
    # Notificacao camada 2 (Radar de Convenios, 2026-09-15) -- edicao manual
    # do tecnico, so quando algo realmente mudou (alteracoes vazio = PATCH
    # com corpo igual ao que ja estava, nao e novidade pra ninguem).
    # nivel_minimo fica None por enquanto (hierarquia RBAC ainda a definir,
    # ver docstring de Notificacao em models.py) -- listar_notificacoes nao
    # filtra por role ainda, entao fica visivel pra todo mundo ate a regra
    # fechar, nunca escondido.
    if alteracoes:
        db.add(Notificacao(
            tipo=NotificacaoTipo.edicao_manual,
            titulo=f"{usuario.name} editou o convênio {nr_convenio}",
            corpo=f"Campo(s) alterado(s): {', '.join(alteracoes.keys())}",
            entidade_id=instrumento.id,
        ))
    db.commit()
    db.refresh(instrumento)
    return instrumento


def _resumo_equipamento_entregue(corpo: EventoMarcoCreate) -> str | None:
    """Resumo textual do equipamento fisico informado junto do evento de
    entrega -- vira parte da observacao (retrato historico do que foi
    confirmado NAQUELE lancamento, mesmo que o cadastro mude depois). None
    quando nenhum dos 4 campos veio preenchido."""
    partes = []
    if corpo.equipamento_marca or corpo.equipamento_modelo:
        partes.append(f"{corpo.equipamento_marca or ''} {corpo.equipamento_modelo or ''}".strip())
    if corpo.equipamento_numero_serie:
        partes.append(f"Nº série {corpo.equipamento_numero_serie}")
    if corpo.equipamento_vida_util_anos is not None:
        partes.append(f"Vida útil {corpo.equipamento_vida_util_anos} ano(s)")
    if not partes:
        return None
    return "Equipamento entregue: " + " · ".join(partes)


@router.post("/instrumentos/{nr_convenio}/eventos", response_model=EventoMarcoRead, status_code=201)
def registrar_evento(
    nr_convenio: str,
    corpo: EventoMarcoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Append-only -- sempre INSERT, nunca UPDATE (ver comentario em
    EventoMarco). Corrigir um lançamento errado e lançar um evento novo."""
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")
    marco = db.get(MarcoCatalogo, corpo.marco_id)
    if marco is None:
        raise HTTPException(422, f"Marco {corpo.marco_id} não existe no catálogo.")

    observacao = corpo.observacao
    # Equipamento FISICO so se aplica ao marco de entrega (achado
    # 2026-09-09, "o equipamento entregue pode mover para eventos") --
    # atualiza o estado atual do instrumento E deixa retrato no proprio
    # evento, via observacao.
    if marco.codigo == "cronograma_entrega":
        if corpo.equipamento_marca is not None:
            instrumento.equipamento_marca = corpo.equipamento_marca
        if corpo.equipamento_modelo is not None:
            instrumento.equipamento_modelo = corpo.equipamento_modelo
        if corpo.equipamento_numero_serie is not None:
            instrumento.equipamento_numero_serie = corpo.equipamento_numero_serie
        if corpo.equipamento_vida_util_anos is not None:
            instrumento.equipamento_vida_util_anos = corpo.equipamento_vida_util_anos
        resumo_equipamento = _resumo_equipamento_entregue(corpo)
        if resumo_equipamento:
            observacao = f"{observacao}. {resumo_equipamento}" if observacao else resumo_equipamento

    evento = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=corpo.marco_id,
        data_ocorrencia=corpo.data_ocorrencia,
        data_prevista=corpo.data_prevista,
        status_regulatorio=corpo.status_regulatorio,
        numero_documento=corpo.numero_documento,
        data_validade=corpo.data_validade,
        observacao=_compor_observacao(usuario.name, observacao),
        autor_id=usuario.id,
    )
    db.add(evento)
    db.flush()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="evento_marco",
        entity_id=evento.id,
        action="created",
        details={"nr_convenio": nr_convenio, "marco_id": corpo.marco_id},
    )
    db.commit()
    db.refresh(evento)
    return EventoMarcoRead(
        id=evento.id, marco_id=evento.marco_id, data_ocorrencia=evento.data_ocorrencia,
        data_prevista=evento.data_prevista, status_regulatorio=evento.status_regulatorio,
        numero_documento=evento.numero_documento, data_validade=evento.data_validade,
        observacao=evento.observacao, autor_nome=usuario.name, created_at=evento.created_at,
    )


@router.get("/resumo", response_model=ResumoMonitoramentoRead)
def obter_resumo(db: Session = Depends(get_db)):
    """Pagina de overview independente (achado 2026-09-09, pedido do
    usuario) -- 1 chamada so, tudo calculado a partir do NOSSO schema (ver
    docstring de ResumoMonitoramentoRead pro que fica de fora de
    proposito)."""
    instrumentos = db.execute(select(InstrumentoEquipamento)).scalars().all()
    marcos = db.execute(select(MarcoCatalogo)).scalars().all()
    fases_gerais_desc = sorted(
        (m for m in marcos if m.grupo == MarcoGrupo.fase_geral), key=lambda m: m.ordem or 0, reverse=True,
    )
    marco_licenca = next((m for m in marcos if m.codigo == "regulatorio_licenca_operacao"), None)
    marco_inauguracao = next((m for m in marcos if m.codigo == "cronograma_previsao_inauguracao"), None)

    todos_eventos = db.execute(select(EventoMarco)).scalars().all()
    eventos_por_instrumento: dict[int, list[EventoMarco]] = defaultdict(list)
    for e in todos_eventos:
        eventos_por_instrumento[e.instrumento_id].append(e)

    hoje = date.today()
    pcts = []
    contagem_fase: Counter[str] = Counter()
    contagem_tecnico: Counter[str] = Counter()
    licencas_deferidas = 0
    licencas_vencendo: list[LicencaVencendoResumo] = []
    inauguracoes: list[InauguracaoResumo] = []

    for inst in instrumentos:
        eventos_inst = eventos_por_instrumento.get(inst.id, [])
        marco_ids_com_evento = {e.marco_id for e in eventos_inst}

        fase_atual_id = _fase_atual_id(fases_gerais_desc, marco_ids_com_evento)
        fase_atual = next((f for f in fases_gerais_desc if f.id == fase_atual_id), None)
        if fase_atual and fase_atual.execucao_fisica_pct_referencia is not None:
            pcts.append(fase_atual.execucao_fisica_pct_referencia)
        contagem_fase[fase_atual.rotulo if fase_atual else "Não iniciado"] += 1

        # Achado 2026-09-09 (pedido do usuario): NA/NI ja viram NULL na
        # importacao/migration -- sempre conta, nunca pula, com rotulo
        # proprio pra quem ainda nao tem tecnico definido (antes ficava de
        # fora da distribuicao silenciosamente).
        contagem_tecnico[inst.tecnico_titular or "Sem técnico definido"] += 1

        if marco_licenca:
            evs_licenca = [e for e in eventos_inst if e.marco_id == marco_licenca.id]
            if evs_licenca and any(e.status_regulatorio == "Deferido" for e in evs_licenca):
                licencas_deferidas += 1
            # Evento mais recente com data_validade preenchida -- mesma
            # regra ja usada no front (MonitoramentoInterno.tsx) pro
            # contador de vencimento no detalhe do instrumento.
            ev_validade = max(
                (e for e in evs_licenca if e.data_validade), key=lambda e: e.created_at, default=None,
            )
            if ev_validade:
                licencas_vencendo.append(LicencaVencendoResumo(
                    nr_convenio=inst.nr_convenio, nome_convenente=inst.nome_convenente,
                    data_validade=ev_validade.data_validade, dias=(ev_validade.data_validade - hoje).days,
                ))

        if marco_inauguracao:
            evs_inaug = [e for e in eventos_inst if e.marco_id == marco_inauguracao.id]
            # Mais recente por created_at -- so 1 por instrumento na lista.
            ev = max(evs_inaug, key=lambda e: e.created_at, default=None)
            if ev:
                data = ev.data_ocorrencia or ev.data_prevista
                if data:
                    # Descricao PLANEJADA (SICONV) primeiro, cai pro FISICO
                    # (marca+modelo, so preenchido depois da entrega) --
                    # mesma prioridade conceitual do resto do schema (ver
                    # docstring da secao 8 em app/db/models.py).
                    equipamento = inst.equipamento_descricao or (
                        f"{inst.equipamento_marca} {inst.equipamento_modelo}".strip()
                        if inst.equipamento_marca or inst.equipamento_modelo else None
                    )
                    inauguracoes.append(InauguracaoResumo(
                        nr_convenio=inst.nr_convenio, nome_convenente=inst.nome_convenente,
                        municipio=inst.municipio, uf=inst.uf, equipamento=equipamento,
                        data=data, realizada=ev.data_ocorrencia is not None,
                        dias=(data - hoje).days,
                    ))

    inauguracoes.sort(key=lambda i: i.data)
    licencas_vencendo.sort(key=lambda i: i.data_validade)

    acoes = db.execute(select(AcaoMonitoramento)).scalars().all()
    acoes_pendentes = sum(1 for a in acoes if a.data_conclusao is None)
    acoes_atrasadas = sum(
        1 for a in acoes if a.data_conclusao is None and a.data_prevista is not None and a.data_prevista < hoje
    )

    return ResumoMonitoramentoRead(
        total_instrumentos=len(instrumentos),
        pct_execucao_fisica_medio=(sum(pcts) / len(pcts)) if pcts else None,
        distribuicao_fase=[ContagemRotulo(rotulo=r, quantidade=q) for r, q in contagem_fase.most_common()],
        licencas_cnen_deferidas=licencas_deferidas,
        licencas_vencendo=licencas_vencendo,
        por_tecnico_titular=[ContagemRotulo(rotulo=r, quantidade=q) for r, q in contagem_tecnico.most_common()],
        inauguracoes=inauguracoes,
        acoes_pendentes=acoes_pendentes,
        acoes_atrasadas=acoes_atrasadas,
        nr_convenios=[i.nr_convenio for i in instrumentos],
    )


@router.get("/acoes", response_model=list[AcaoMonitoramentoRead])
def listar_acoes(pendentes: bool = Query(False), db: Session = Depends(get_db)):
    """Todas as acoes (ou so pendentes, `?pendentes=true`) de TODOS os
    instrumentos, ordenadas por data_prevista -- alimenta a lista de
    "dividas por data" da pagina de overview."""
    stmt = (
        select(AcaoMonitoramento, InstrumentoEquipamento.nr_convenio)
        .join(InstrumentoEquipamento, AcaoMonitoramento.instrumento_id == InstrumentoEquipamento.id)
        .order_by(AcaoMonitoramento.data_prevista.asc().nulls_last())
    )
    if pendentes:
        stmt = stmt.where(AcaoMonitoramento.data_conclusao.is_(None))
    linhas = db.execute(stmt).all()
    return [
        AcaoMonitoramentoRead(
            id=a.id, instrumento_id=a.instrumento_id, nr_convenio=nr, descricao=a.descricao,
            data_prevista=a.data_prevista, data_conclusao=a.data_conclusao,
            responsavel=a.responsavel, created_at=a.created_at,
        )
        for a, nr in linhas
    ]


@router.post("/instrumentos/{nr_convenio}/acoes", response_model=AcaoMonitoramentoRead, status_code=201)
def registrar_acao(
    nr_convenio: str,
    corpo: AcaoMonitoramentoCreate,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Cria uma acao PENDENTE (data_conclusao null) -- diferente de
    EventoMarco, essa tabela nao esta amarrada a um catalogo fixo de
    marcos (ver docstring de AcaoMonitoramento no models.py)."""
    instrumento = db.execute(
        select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == nr_convenio)
    ).scalar_one_or_none()
    if instrumento is None:
        raise HTTPException(404, f"Instrumento {nr_convenio} não monitorado.")

    acao = AcaoMonitoramento(
        instrumento_id=instrumento.id, descricao=corpo.descricao,
        data_prevista=corpo.data_prevista, responsavel=corpo.responsavel,
    )
    db.add(acao)
    db.flush()
    log_action(
        db,
        user_id=usuario.id,
        entity_name="acao_monitoramento",
        entity_id=acao.id,
        action="created",
        details={"nr_convenio": nr_convenio, "responsavel": corpo.responsavel},
    )
    db.commit()
    db.refresh(acao)
    return AcaoMonitoramentoRead(
        id=acao.id, instrumento_id=acao.instrumento_id, nr_convenio=nr_convenio, descricao=acao.descricao,
        data_prevista=acao.data_prevista, data_conclusao=acao.data_conclusao,
        responsavel=acao.responsavel, created_at=acao.created_at,
    )


@router.patch("/acoes/{acao_id}/concluir", response_model=AcaoMonitoramentoRead)
def concluir_acao(
    acao_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(require_monitoramento_editor),
):
    """Unico UPDATE que AcaoMonitoramento permite de proposito -- marcar
    como concluida (seta data_conclusao = hoje). Descricao/data_prevista/
    responsavel continuam imutaveis (ver docstring do model)."""
    acao = db.get(AcaoMonitoramento, acao_id)
    if acao is None:
        raise HTTPException(404, f"Ação {acao_id} não encontrada.")
    if acao.data_conclusao is None:
        acao.data_conclusao = date.today()
        log_action(
            db,
            user_id=usuario.id,
            entity_name="acao_monitoramento",
            entity_id=acao.id,
            action="completed",
            details={"old": None, "new": acao.data_conclusao.isoformat()},
        )
        db.commit()
        db.refresh(acao)
    instrumento = db.get(InstrumentoEquipamento, acao.instrumento_id)
    return AcaoMonitoramentoRead(
        id=acao.id, instrumento_id=acao.instrumento_id, nr_convenio=instrumento.nr_convenio,
        descricao=acao.descricao, data_prevista=acao.data_prevista, data_conclusao=acao.data_conclusao,
        responsavel=acao.responsavel, created_at=acao.created_at,
    )
