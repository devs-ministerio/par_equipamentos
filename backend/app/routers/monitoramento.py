"""Monitoramento de equipamento pos-repasse -- esforco separado da analise
de merito de hipo/hipersuficiencia (decisao 2026-09-03). Ver app/db/models.py
(secao 8) pro desenho (instrumento_equipamento / marco_catalogo /
evento_marco, log append-only).

So 1 instrumento por enquanto (convenio 948686, ver
scripts/seed_monitoramento.py) -- decisao deliberada do usuario pra validar
o desenho antes de escalar pros 71. Sem autenticacao ainda (`autor` e texto
livre no corpo do evento) -- login fica pra uma fase posterior, decisao do
usuario 2026-09-03.
"""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import EventoMarco, InstrumentoEquipamento, MarcoCatalogo, MarcoGrupo
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
    autor_nome: str | None  # texto livre por enquanto -- ver EventoMarcoCreate
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
    # Texto livre por enquanto (nome de quem esta lancando) -- vira FK real
    # pro usuario autenticado quando o login entrar. Guardado dentro de
    # `observacao` com prefixo ate existir coluna propria seria gambiarra;
    # em vez disso o front manda junto e o router prefixa na observacao de
    # forma explicita (ver `_compor_observacao`), deixando claro no dado que
    # e um valor auto-declarado, nao autenticado.
    autor_nome: str


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
    tecnico_titular: str | None
    tecnico_suplente: str | None
    nivel_monitoramento: str | None
    finalidade: str | None
    modalidade_onco: str | None

    model_config = ConfigDict(from_attributes=True)


class InstrumentoEquipamentoUpdate(BaseModel):
    """So os campos de cadastro que NENHUMA API publica tem (mesmo criterio
    do comentario em InstrumentoEquipamento no models.py) -- nunca
    nr_convenio/cnpj_convenente/nome_convenente/programa/componente/
    ano_instrumento, que vem de fonte real (planilha/API) e nao devem virar
    editaveis a mao aqui. Tambem NUNCA `equipamento_descricao` (achado
    2026-09-09: e o equipamento PLANEJADO do SICONV, "não vamos alterar o
    equipamento que veio do SISCONV") -- os `equipamento_*` editaveis aqui
    sao o equipamento FISICO de verdade, informado pelo estabelecimento
    depois da entrega. Todos opcionais -- PATCH aplica so o que vier
    preenchido, deixando o resto como esta (nunca zera campo por omissao)."""
    equipamento_marca: str | None = None
    equipamento_modelo: str | None = None
    equipamento_numero_serie: str | None = None
    equipamento_vida_util_anos: int | None = None
    tecnico_titular: str | None = None
    tecnico_suplente: str | None = None
    nivel_monitoramento: str | None = None
    finalidade: str | None = None
    modalidade_onco: str | None = None


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


def _compor_observacao(autor_nome: str, observacao: str | None) -> str:
    """Autoria auto-declarada (sem login ainda) fica sempre visivel junto do
    texto -- nunca silenciosa. Formato: "[Nome] texto". Trocar por FK real
    (autor_id) quando a autenticacao entrar e so parar de prefixar aqui,
    o dado historico ja gravado continua legivel do jeito que esta."""
    prefixo = f"[{autor_nome}]"
    return f"{prefixo} {observacao}" if observacao else prefixo


@router.get("/marcos", response_model=list[MarcoCatalogoRead])
def listar_marcos(db: Session = Depends(get_db)):
    return db.execute(select(MarcoCatalogo).order_by(MarcoCatalogo.grupo, MarcoCatalogo.ordem)).scalars().all()


@router.get("/instrumentos", response_model=list[InstrumentoEquipamentoRead])
def listar_instrumentos(db: Session = Depends(get_db)):
    return db.execute(select(InstrumentoEquipamento).order_by(InstrumentoEquipamento.nr_convenio)).scalars().all()


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


@router.patch("/instrumentos/{nr_convenio}", response_model=InstrumentoEquipamentoRead)
def atualizar_cadastro(nr_convenio: str, corpo: InstrumentoEquipamentoUpdate, db: Session = Depends(get_db)):
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

    for campo, valor in corpo.model_dump(exclude_unset=True).items():
        setattr(instrumento, campo, valor)
    db.commit()
    db.refresh(instrumento)
    return instrumento


@router.post("/instrumentos/{nr_convenio}/eventos", response_model=EventoMarcoRead, status_code=201)
def registrar_evento(nr_convenio: str, corpo: EventoMarcoCreate, db: Session = Depends(get_db)):
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

    evento = EventoMarco(
        instrumento_id=instrumento.id,
        marco_id=corpo.marco_id,
        data_ocorrencia=corpo.data_ocorrencia,
        data_prevista=corpo.data_prevista,
        status_regulatorio=corpo.status_regulatorio,
        numero_documento=corpo.numero_documento,
        data_validade=corpo.data_validade,
        observacao=_compor_observacao(corpo.autor_nome, corpo.observacao),
        autor_id=None,
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return EventoMarcoRead(
        id=evento.id, marco_id=evento.marco_id, data_ocorrencia=evento.data_ocorrencia,
        data_prevista=evento.data_prevista, status_regulatorio=evento.status_regulatorio,
        numero_documento=evento.numero_documento, data_validade=evento.data_validade,
        observacao=evento.observacao, autor_nome=None, created_at=evento.created_at,
    )
