"""Contratos de leitura do resumo agregado de monitoramento
(GET /monitoramento/resumo) -- extraídos de app/routers/monitoramento.py
(Plan Mode fechamento final 2026-09-25, Bloco 2) pra dar pro Service
(app/services/monitoramento_resumo.py) e pro Router importarem sem
depender um do outro."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


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


class DivergenciaConclusaoRead(BaseModel):
    nr_convenio: str
    nome_convenente: str
    tipo_contratacao: str | None
    fase_interna: str
    fonte_externa: str
    status_externo_original: str
    status_externo_normalizado: str
    atualizado_em: datetime
    risco: str


class IndicadoresInstrumentoRead(BaseModel):
    nr_convenio: str
    acoes_pendentes: int
    acoes_atrasadas: int
    licenca_cnen_deferida: bool
    pct_referencia_fase: float | None
    ultima_atividade_em: datetime | None


class AcaoAbertaResumoRead(BaseModel):
    id: int
    nr_convenio: str
    nome_convenente: str
    descricao: str
    data_prevista: date | None
    dias: int | None
    responsavel: str | None


class ResumoMonitoramentoRead(BaseModel):
    """1 chamada so pra pagina de overview (achado 2026-09-09, pedido do
    usuario: pagina INDEPENDENTE, nao so o detalhe de 1 convenio) -- tudo
    que da pra calcular a partir do NOSSO schema (instrumento_equipamento/
    evento_marco/acao_monitoramento). Pagamento ao fornecedor fica de fora
    de proposito -- essa info vem de `Convenio.valor_pago_fornecedor`
    (tabela do banco, ver `app/routers/convenios.py`; o `siconv.json`
    estatico que alimentava isso antes foi removido no Bloco 5 do Plan Mode
    seguranca 2026-09-16), nao deste endpoint; o front busca via
    `GET /convenios/{numero}` e cruza sozinho com a lista de nr_convenio
    abaixo pra nao acoplar este router ao dominio de convenio."""

    total_instrumentos: int
    # Nome de wire legado: média do percentual REFERENCIAL da fase sobre toda
    # a carteira (sem marco = 0%), não medição de execução física.
    pct_execucao_fisica_medio: float | None
    distribuicao_fase: list[ContagemRotulo]
    licencas_cnen_deferidas: int
    licencas_vencendo: list[LicencaVencendoResumo]
    por_tecnico_titular: list[ContagemRotulo]
    inauguracoes: list[InauguracaoResumo]
    acoes_pendentes: int
    acoes_atrasadas: int
    nr_convenios: list[str]
    divergencias_conclusao: list[DivergenciaConclusaoRead]
    divergencias_conclusao_por_fonte: list[ContagemRotulo]
    indicadores_por_instrumento: list[IndicadoresInstrumentoRead]
    acoes_em_aberto: list[AcaoAbertaResumoRead]
    fila_acoes_truncada: bool
    gerado_em: datetime
