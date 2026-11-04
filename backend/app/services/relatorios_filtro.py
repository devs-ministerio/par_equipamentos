"""Filtro e rótulos do relatório (escopo, período, legendas).

Parte do pacote de relatórios; a fachada pública é `app.services.relatorios`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session

from app.db.models import (
    Convenio,
    MarcoGrupo,
)
from app.domain_errors import ValidationError
from app.geo_reference import NOME_POR_UF, REGIOES, ufs_da_regiao
from app.pipeline.texto import capitalizar_nome
from app.repositories import monitoramento as monitoramento_repo
from app.schemas_relatorios_encerrados import FiltroEncerramento

Escopo = Literal["brasil", "regiao", "uf", "municipio", "cnes"]

Nivel = Literal["simplificado", "completo"]

Formato = Literal["xlsx", "docx"]

TipoRelatorio = Literal["instrumentos_repasse", "analise_merito"]

_ROTULO_GRUPO_MARCO = {
    MarcoGrupo.fase_geral: "Fase geral",
    MarcoGrupo.cronograma_fisico: "Cronograma físico",
    MarcoGrupo.regulatorio: "Regulatório",
}


@dataclass(frozen=True)
class FiltroRelatorio:
    escopo: Escopo
    regiao: str | None = None
    uf: str | None = None
    municipio: str | None = None
    cnes: str | None = None
    # Período de 2 datas (Bloco 8, Plan Mode relatorios 2026-09-27 -- pedido
    # do usuário: "a data deve ser dois campos pra gente escolher o
    # período"), substitui o antigo `ano` único. Só se aplica a
    # `instrumentos_repasse` -- `analise_merito` não tem dimensão de ano
    # civil (decisão do usuário, ver plan-mode).
    ano_inicio: int | None = None
    ano_fim: int | None = None
    # Filtros novos (Plan Mode relatorios 2026-09-25, Bloco 7 -- "mesmos
    # filtros que temos no instrumentos/repasses") -- só aplicados na
    # seção de Convênios (situacao/programa/tipo_contratacao/busca) e, onde
    # o campo existe, em Monitoramento (tipo_contratacao/programa) e
    # Propostas (programa/situacao). Não fazem parte da validação de
    # escopo -- opcionais em qualquer combinação.
    situacao: str | None = None
    programa: str | None = None
    tipo_contratacao: str | None = None
    # `equipamento` (Bloco 8 -- achado ao vivo: filtro de Equipamento da UI
    # nunca chegava no arquivo gerado) só filtra Convênios -- mesmo
    # mecanismo de `EquipamentoMarcador` do router `/convenios`. Propostas/
    # Monitoramento não têm essa granularidade hoje.
    equipamento: str | None = None
    busca: str | None = None
    encerramento: Literal["todos", "encerrados", "entregues", "previsoes"] = "todos"
    # Situação de conclusão da visão "previsões" (D01); código de `relatorios_conclusao.CATEGORIAS_CONCLUSAO`.
    situacao_conclusao: str | None = None
    # Filtro único de Situação: o valor vale só na seção da origem escolhida e as demais ficam de fora.
    # Sem origem (chamada direta da API), `situacao` segue filtrando só os convênios.
    situacao_origem: Literal["instrumento", "monitoramento", "proposta"] | None = None
    # Referência do período (D02): por padrão o ano de origem do instrumento; "data_do_evento" usa datas completas
    # e vale só nas extrações por evento (Concluídos = data da conclusão, Equipamento entregue = data da entrega).
    periodo_por: Literal["ano_instrumento", "data_do_evento"] = "ano_instrumento"
    data_inicio: date | None = None
    data_fim: date | None = None

    def validar_referencia_do_periodo(self) -> None:
        """Na geração do arquivo, o período por data do evento só tem sentido nas extrações por evento."""
        if self.por_data_do_evento() and self.encerramento in ("todos", "previsoes"):
            raise ValidationError(
                "O período por data do evento vale só em Concluídos e Equipamento entregue; "
                "use o ano do instrumento nos demais relatórios."
            )

    def por_data_do_evento(self) -> bool:
        return self.periodo_por == "data_do_evento"

    def rotulo_evento(self) -> str:
        return "entrega" if self.encerramento == "entregues" else "conclusão"

    def rotulo_situacao(self) -> str:
        return {
            "monitoramento": "Fase do monitoramento",
            "proposta": "Situação da proposta",
        }.get(self.situacao_origem or "", "Situação do convênio")

    def filtro_encerrados(self) -> FiltroEncerramento:
        return FiltroEncerramento(
            uf=self.ufs(),
            municipio=self.municipio_do_escopo(),
            cnes=self.cnes_do_escopo(),
            ano_inicio=None if self.por_data_do_evento() else self.ano_inicio,
            ano_fim=None if self.por_data_do_evento() else self.ano_fim,
            data_inicio=self.data_inicio if self.por_data_do_evento() else None,
            data_fim=self.data_fim if self.por_data_do_evento() else None,
            situacao=self.situacao if self.situacao_origem in (None, "instrumento", "proposta") else None,
            programa=self.programa,
            tipo_contratacao=self.tipo_contratacao,
            equipamento=self.equipamento,
            busca=self.busca,
        )

    def __post_init__(self) -> None:
        if self.escopo == "regiao":
            if not self.regiao:
                raise ValidationError("Escopo 'regiao' exige o parâmetro 'regiao'.")
            if self.regiao not in REGIOES:
                raise ValidationError(f"Região '{self.regiao}' desconhecida. Use uma de: {', '.join(REGIOES)}.")
        elif self.escopo == "uf":
            if not self.uf:
                raise ValidationError("Escopo 'uf' exige o parâmetro 'uf'.")
        elif self.escopo == "municipio":
            if not (self.uf and self.municipio):
                raise ValidationError("Escopo 'municipio' exige os parâmetros 'uf' e 'municipio'.")
        elif self.escopo == "cnes" and not self.cnes:
            raise ValidationError("Escopo 'cnes' exige o parâmetro 'cnes'.")
        if self.por_data_do_evento():
            if self.data_inicio and self.data_fim and self.data_inicio > self.data_fim:
                raise ValidationError("'data_inicio' não pode ser depois de 'data_fim'.")
        elif self.data_inicio or self.data_fim:
            raise ValidationError("Informe 'periodo_por=data_do_evento' para usar data inicial e final.")
        # Se só 1 dos 2 campos do período vier, o outro assume o mesmo valor
        # (período de 1 ano só, mesmo comportamento do antigo `ano` único).
        if self.ano_inicio is not None and self.ano_fim is None:
            object.__setattr__(self, "ano_fim", self.ano_inicio)
        elif self.ano_fim is not None and self.ano_inicio is None:
            object.__setattr__(self, "ano_inicio", self.ano_fim)
        if self.ano_inicio is not None and self.ano_fim is not None and self.ano_inicio > self.ano_fim:
            raise ValidationError("'ano_inicio' não pode ser depois de 'ano_fim'.")

    def ufs(self) -> list[str] | None:
        if self.escopo == "brasil" or self.escopo == "cnes":
            return None
        if self.escopo == "regiao":
            assert self.regiao is not None
            return ufs_da_regiao(self.regiao)
        assert self.uf is not None
        return [self.uf]

    def municipio_do_escopo(self) -> str | None:
        return self.municipio if self.escopo == "municipio" else None

    def cnes_do_escopo(self) -> str | None:
        return self.cnes if self.escopo == "cnes" else None

    def titulo(self) -> str:
        base = {
            "brasil": "Brasil",
            "regiao": f"Região {self.regiao}",
            "uf": f"UF {self.uf}",
            "municipio": f"{self.municipio}/{self.uf}",
            "cnes": f"CNES {self.cnes}",
        }[self.escopo]
        if self.ano_inicio is None and self.ano_fim is None:
            return base
        if self.ano_inicio == self.ano_fim:
            return f"{base} -- {self.ano_inicio}"
        return f"{base} -- {self.ano_inicio} a {self.ano_fim}"

    def periodo_referencia(self) -> str | None:
        """Texto de "Período de referência" pro cabeçalho do Word (Bloco 8) --
        `None` quando nenhum dos 2 campos foi informado (omite a linha)."""
        if self.ano_inicio is None and self.ano_fim is None:
            return None
        if self.ano_inicio == self.ano_fim:
            return str(self.ano_inicio)
        return f"{self.ano_inicio} a {self.ano_fim}"


def _valor_global_confiavel(convenio: Convenio) -> float | None:
    """Mitigação de um bug real de ingestão achado ao vivo 2026-09-27
    (usuário, convênio 922037 -- "valor global quebrado do portal"):
    `scripts/importar_convenios_banco.py::_num_ou_none` faz `float(v)`
    direto, sem tratar vírgula decimal do SICONV bulk ("VL_GLOBAL_CONV":
    "5928266,99") -- `float("5928266,99")` estoura `ValueError`, o valor
    vira `None` e o import cai pro Portal da Transparência, que pra 3
    convênios confirmados (812878/922037/924078) devolve um valor ~10.000x
    menor que o repasse real. Corrigir a ingestão em si (reprocessar o
    banco) é uma decisão à parte, fora do escopo deste relatório -- aqui só
    EVITA propagar um valor obviamente quebrado: `Valor Global` nunca
    deveria ser menor que `Valor Repasse` (repasse é parte do global)."""
    if (
        convenio.valor_global is not None
        and convenio.valor_repasse is not None
        and convenio.valor_global < convenio.valor_repasse
    ):
        return None
    return convenio.valor_global


def _assunto(db: Session | None, filtro: FiltroRelatorio) -> str:
    """Texto de "Assunto" do cabeçalho (Bloco 8, mockup do usuário --
    `data/relatorios/relatorio_imip.pages`, "Assunto: IMIP (CNES:
    0000434)") -- nome do que foi pesquisado, não só o código."""
    if filtro.escopo == "cnes":
        assert filtro.cnes is not None
        assert db is not None
        estabelecimento = monitoramento_repo.obter_cnes_por_codigo(db, filtro.cnes)
        nome = estabelecimento.nome_estabelecimento if estabelecimento else f"CNES {filtro.cnes}"
        return f"{nome} (CNES: {filtro.cnes})"
    if filtro.escopo == "municipio":
        assert filtro.municipio is not None
        return f"{capitalizar_nome(filtro.municipio)}/{filtro.uf}"
    if filtro.escopo == "uf":
        return f"UF {filtro.uf}"
    if filtro.escopo == "regiao":
        return f"Região {filtro.regiao}"
    return "Brasil"


def _descricao_recorte(filtro: FiltroRelatorio) -> str:
    """Geografia e período compartilhados pelas fontes; os demais filtros
    (situação, programa, tipo, equipamento, busca) são descritos à parte."""
    if filtro.escopo == "brasil":
        lugar = "no Brasil"
    elif filtro.escopo == "regiao":
        lugar = f"na região {filtro.regiao}"
    elif filtro.escopo == "uf":
        nome = NOME_POR_UF.get(filtro.uf or "", filtro.uf or "")
        if filtro.uf == "DF":
            lugar = "no Distrito Federal"
        else:
            artigo = (
                "da"
                if filtro.uf in {"BA", "PB"}
                else "do"
                if filtro.uf in {"AC", "AP", "AM", "CE", "ES", "MA", "PA", "PR", "PI", "RJ", "RN", "RS", "TO"}
                else "de"
            )
            lugar = f"no estado {artigo} {nome}"
    elif filtro.escopo == "municipio":
        lugar = f"no município de {capitalizar_nome(filtro.municipio or '')}/{filtro.uf}"
    else:
        lugar = f"no CNES {filtro.cnes}"

    if filtro.por_data_do_evento() and (filtro.data_inicio or filtro.data_fim):
        inicio = filtro.data_inicio.strftime("%d/%m/%Y") if filtro.data_inicio else "o início"
        fim = filtro.data_fim.strftime("%d/%m/%Y") if filtro.data_fim else "hoje"
        return f"{lugar} com data de {filtro.rotulo_evento()} de {inicio} a {fim}"
    if filtro.ano_inicio is None:
        return lugar
    if filtro.ano_inicio == filtro.ano_fim:
        return f"{lugar} no ano de {filtro.ano_inicio}"
    return f"{lugar} no período de {filtro.ano_inicio} a {filtro.ano_fim}"


def _legendas_resumo(filtro: FiltroRelatorio) -> tuple[str, str, str]:
    recorte = _descricao_recorte(filtro)
    filtros_convenios = [
        f"{rotulo}: {valor}"
        for rotulo, valor in (
            (filtro.rotulo_situacao().lower(), filtro.situacao),
            ("programa", filtro.programa),
            ("equipamento", filtro.equipamento),
            ("busca", filtro.busca),
        )
        if valor
    ]
    restricoes = f" Convênios filtrados por {'; '.join(filtros_convenios)}." if filtros_convenios else ""
    tipo_instrumentos = (
        f" Convênios e monitoramento filtrados por tipo de contratação: {filtro.tipo_contratacao}."
        if filtro.tipo_contratacao
        else ""
    )
    tipo_equipamentos = (
        f" Convênios filtrados por tipo de contratação: {filtro.tipo_contratacao}." if filtro.tipo_contratacao else ""
    )
    contexto_propostas = (
        "ano da proposta; sem filtros de convênios ou monitoramento"
        if filtro.ano_inicio is not None
        else "sem filtros de convênios ou monitoramento"
    )
    ressalva_monitoramento = ""
    if (
        filtro.ano_inicio is not None
        and filtro.ano_fim is not None
        and filtro.ano_inicio <= date.today().year <= filtro.ano_fim
    ):
        ressalva_monitoramento = " A carteira monitorada inclui instrumentos em andamento de anos anteriores."
    return (
        f"Instrumentos e programas {recorte}.{restricoes}{tipo_instrumentos}{ressalva_monitoramento}",
        f"Propostas {recorte} ({contexto_propostas}).",
        f"Equipamentos identificados em convênios {recorte}.{restricoes}{tipo_equipamentos}",
    )


_NOTA_VALOR_PERSUS_I = (
    "Em instrumentos PERSUS I, o valor do equipamento é o valor global do instrumento e pode incluir obras."
)

_ROTULO_CONTRATACAO = "CONTRATAÇÃO"

_SITUACAO_SEM_MONITORAMENTO_ESPERADO = "Em contratação"

_TIPO_EM_CONTRATACAO = "PERSUS II"
