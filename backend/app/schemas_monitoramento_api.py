"""Schemas de entrada e saída das rotas de monitoramento de equipamento."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.db.models import (
    MarcoGrupo,
)


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
    # Só vale para o evento de conclusão: anula também a inauguração gerada junto com ele (mesma data).
    anular_inauguracao_vinculada: bool = False


class InstrumentoEquipamentoRead(BaseModel):
    id: int
    nr_convenio: str
    cnpj_convenente: str | None
    nome_convenente: str
    municipio: str | None
    uf: str | None
    cnes: str | None
    latitude: float | None = None
    longitude: float | None = None
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
    tecnico_titular_id: int | None = None
    tecnico_suplente_id: int | None = None
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
    # Calculado por request pro usuario autenticado (nao e coluna, mesmo
    # padrao de fase_atual acima) -- autorizacao por titularidade
    # (app.authz::usuario_pode_editar_instrumento, pedido do usuario
    # 2026-09-25): admin/gestor sempre True; colaborador so True se for
    # titular/suplente designado (ou se ninguem foi designado ainda).
    # Default True cobre POST/PATCH, que ja provaram a permissao pra chegar
    # ali -- so listar_instrumentos/obter_timeline recalculam de verdade.
    pode_editar: bool = True

    model_config = ConfigDict(from_attributes=True)


class ColaboradorMonitoramentoRead(BaseModel):
    """Opção segura para atribuição: somente identidade e nome exibível."""

    id: int
    name: str

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
    tecnico_titular_id: int | None = None
    tecnico_suplente_id: int | None = None
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

    model_config = ConfigDict(extra="forbid")


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
    tecnico_titular_id: int
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
    # Obrigatório apenas para a porta TransfereGov: o Service busca a fonte e
    # decide se existe parceria confirmada; o browser nunca prova esse fato.
    proposta_candidata_id: int | None = None

    model_config = ConfigDict(extra="forbid")


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


class CnesEstabelecimentoRead(BaseModel):
    cnes: str
    nome_estabelecimento: str
    municipio: str | None
    uf: str | None

    model_config = ConfigDict(from_attributes=True)
