"""Extração única com precedência, reconciliação visível e nenhuma escrita."""

from collections import Counter, defaultdict
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.classificacao_itens import classificar
from app.domain_errors import ValidationError
from app.equipamentos import classificar_descricoes
from app.pipeline.texto import normalizar_texto, parsear_valor_brasileiro
from app.repositories import equipamento_marcadores as marcadores_repo
from app.repositories import itens_equipamento as itens_repo
from app.repositories import relatorios_encerrados as repo
from app.repositories.limites_relatorio import LimiteConsultaExcedido
from app.schemas_relatorios_encerrados import FatoEncerramento, FiltroEncerramento, PreviaEncerrados, RegistroEncerrado

_CONCLUSIVOS = {"PRESTACAO DE CONTAS CONCLUIDA", "PRESTACAO DE CONTAS CONCLUIDAS"}


@dataclass(frozen=True)
class ExtracaoEncerrados:
    itens: list[RegistroEncerrado]
    pendencias: list[RegistroEncerrado]


def _corresponde(fato: FatoEncerramento, filtro: FiltroEncerramento) -> bool:
    if filtro.uf and fato.uf not in filtro.uf:
        return False
    for campo in ("municipio", "cnes", "programa", "tipo_contratacao", "situacao"):
        valor = getattr(filtro, campo)
        origem = {"tipo_contratacao": fato.tipo, "situacao": fato.situacao_carteira}.get(
            campo, getattr(fato, campo, None)
        )
        if valor and normalizar_texto(valor) != normalizar_texto(origem):
            return False
    if filtro.ano_inicio is not None and (fato.ano is None or fato.ano < filtro.ano_inicio):
        return False
    if filtro.ano_fim is not None and (fato.ano is None or fato.ano > filtro.ano_fim):
        return False
    return not filtro.busca or normalizar_texto(filtro.busca) in normalizar_texto(
        f"{fato.numero} {fato.nome} {fato.municipio or ''}"
    )


def _classificar(fato: FatoEncerramento, chave: str) -> tuple[int, RegistroEncerrado] | None:
    motivos = []
    evidencia = ""
    pendencia = False
    prioridade = 9
    if fato.tipo == "Convênio":
        estados = [
            s for s in (fato.situacao_carteira, fato.situacao_monitoramento, fato.situacao_oficial) if s and s.strip()
        ]
        conclusivos = [normalizar_texto(s) in _CONCLUSIVOS for s in estados]
        if any(conclusivos):
            prioridade = 1
            if not all(conclusivos):
                motivos.append("Divergência de prestação de contas entre fontes")
                pendencia = True
            else:
                motivos.append("Prestação de contas concluída")
            evidencia = " | ".join(
                f"{fonte}: {status}"
                for fonte, status in (
                    ("Carteira", fato.situacao_carteira),
                    ("Monitoramento", fato.situacao_monitoramento),
                    ("SICONV", fato.situacao_oficial),
                )
                if status
            )
    if not motivos and fato.conclusao_ativa:
        prioridade = 2
        if fato.data_conclusao is None:
            motivos.append("Conclusão interna sem data")
            pendencia = True
        elif fato.tipo == "Convênio":
            conhecida = any((fato.situacao_carteira, fato.situacao_monitoramento, fato.situacao_oficial))
            motivos.append(
                "Concluído internamente — prestação de contas pendente"
                if conhecida
                else "Concluído internamente — prestação de contas sem informação"
            )
        else:
            motivos.append("Concluído no monitoramento interno")
        evidencia = "Evento fase_concluido ativo" + (
            f" em {fato.data_conclusao:%d/%m/%Y}" if fato.data_conclusao else " sem data de ocorrência"
        )
    pagas = [
        o for o in fato.ordens if normalizar_texto(o.in_situacao_op) == "PAGA" and o.id_ordem_pagamento is not None
    ]
    if (
        not motivos
        and fato.origem == "parceria"
        and fato.parceria_confirmada
        and fato.numero == fato.codigo_confirmado
        and pagas
    ):
        prioridade = 3
        motivos.append("Parceria paga")
        evidencia = "; ".join(f"Ordem {o.id_ordem_pagamento}: {o.in_situacao_op}" for o in pagas)
    if not motivos and fato.evidencia_invalida:
        motivos.append("Evidência financeira inválida")
        pendencia = True
    if not motivos:
        return None
    # A conclusão registrada no monitoramento é a data real; sem ela, o fim da
    # vigência é só uma referência do instrumento e vem identificado como tal.
    if fato.data_conclusao is not None:
        data_referencia, origem_data = fato.data_conclusao, "Conclusão no monitoramento"
    elif fato.data_final_vigencia is not None:
        data_referencia, origem_data = fato.data_final_vigencia, "Fim da vigência"
    else:
        data_referencia, origem_data = None, None
    return prioridade, RegistroEncerrado(
        chave=chave,
        numero=fato.numero,
        nome=fato.nome,
        tipo=fato.tipo,
        uf=fato.uf,
        municipio=fato.municipio,
        cnes=fato.cnes,
        valor_global=fato.valor_global,
        motivo=motivos[0],
        evidencia=evidencia,
        data_conclusao=fato.data_conclusao,
        data_referencia=data_referencia,
        origem_data=origem_data,
        convenio_id=fato.convenio_id,
        instrumento_id=fato.instrumento_id,
        proposta_id=fato.proposta_pk,
        itens_plano=fato.itens_plano,
        situacao_carteira=fato.situacao_carteira,
        situacao_monitoramento=fato.situacao_monitoramento,
        situacao_oficial=fato.situacao_oficial,
        pendencia=pendencia,
    )


def classificar_encerrados(fatos: list[FatoEncerramento], filtro: FiltroEncerramento) -> ExtracaoEncerrados:
    aliases = {str(f.proposta_id): f.numero for f in fatos if f.origem == "parceria" and f.proposta_id is not None}
    grupos: dict[str, list[tuple[int, RegistroEncerrado]]] = defaultdict(list)
    for fato in fatos:
        if not _corresponde(fato, filtro):
            continue
        numero = aliases.get(fato.numero, fato.numero) if fato.tipo == "Parceria TransfereGov" else fato.numero
        chave = f"{fato.tipo}:{numero}"
        candidato = _classificar(fato.model_copy(update={"numero": numero}), chave)
        if candidato is not None:
            grupos[chave].append(candidato)
    itens: list[RegistroEncerrado] = []
    pendencias: list[RegistroEncerrado] = []
    for chave in sorted(grupos):
        candidatos = grupos[chave]
        conflito = next(
            (r for _, r in candidatos if r.motivo == "Divergência de prestação de contas entre fontes"), None
        )
        validos = [(p, r) for p, r in candidatos if not r.pendencia]
        escolhido = conflito or min(validos or candidatos, key=lambda par: (par[0], par[1].evidencia))[1]
        (pendencias if escolhido.pendencia else itens).append(escolhido)
    return ExtracaoEncerrados(itens, pendencias)


def _texto_equipamentos(nomes: list[str]) -> str:
    """ "Acelerador Linear; Mamógrafo (2)": nome e, quando há mais de um, a contagem."""
    contagem = Counter(nomes)
    ordenados = sorted(contagem.items(), key=lambda par: (-par[1], par[0]))
    return "; ".join(f"{nome} ({quantidade})" if quantidade > 1 else nome for nome, quantidade in ordenados)


def _quantidade_do_item(item: dict) -> int:
    """`QTD_ITEM` do plano; sem valor legível, conta 1 unidade."""
    valor = parsear_valor_brasileiro(item.get("QTD_ITEM"))
    return int(valor) if valor is not None and valor >= 1 else 1


def _quantidade_de_equipamentos(itens_plano: list[dict], codigos: list[str]) -> int:
    """Unidades dos tipos de equipamento visíveis do registro.

    Soma o `QTD_ITEM` de cada item do plano que pertence a um desses tipos, o que
    inclui itens numerados ("Ultrassom 1", "Ultrassom 2"). Sem plano (PERSUS, FAF,
    TED), cada tipo conta 1.
    """
    por_tipo: Counter[str] = Counter()
    for item in itens_plano:
        descricao = item.get("DESCRICAO_ITEM") if isinstance(item, dict) else None
        if not descricao or classificar(str(descricao)).tipo != "aquisicao":
            continue  # rendimento, acessório e item múltiplo não somam unidade (classificação C5)
        for evidencia in classificar_descricoes([descricao]):
            if evidencia.codigo in codigos:
                por_tipo[evidencia.codigo] += _quantidade_do_item(item)
    return sum(por_tipo[codigo] or 1 for codigo in codigos)


def anexar_equipamentos(db: Session, extracao: ExtracaoEncerrados) -> ExtracaoEncerrados:
    """Equipamentos de cada registro, sem uma consulta por linha.

    A evidência do convênio prevalece; na falta dela, a do instrumento de
    monitoramento e, por fim, a da proposta.
    """
    registros = [*extracao.itens, *extracao.pendencias]
    marcadores = marcadores_repo.listar_por_origens(
        db,
        convenio_ids={r.convenio_id for r in registros if r.convenio_id is not None},
        instrumento_ids={r.instrumento_id for r in registros if r.instrumento_id is not None},
        proposta_ids={r.proposta_id for r in registros if r.proposta_id is not None},
    )

    entregues = itens_repo.unidades_entregues_por_instrumento(
        db, {r.instrumento_id for r in registros if r.instrumento_id is not None}
    )

    def com_equipamentos(registro: RegistroEncerrado) -> RegistroEncerrado:
        for origem, identificador in (
            ("convenio", registro.convenio_id),
            ("instrumento_equipamento", registro.instrumento_id),
            ("proposta_candidata", registro.proposta_id),
        ):
            achados = marcadores.get((origem, identificador)) if identificador is not None else None  # type: ignore[arg-type]
            if achados:
                return registro.model_copy(
                    update={
                        "equipamentos": _texto_equipamentos([m.nome for m in achados]),
                        "quantidade": _quantidade_de_equipamentos(registro.itens_plano, [m.codigo for m in achados]),
                        "quantidade_entregue": entregues.get(registro.instrumento_id)
                        if registro.instrumento_id is not None
                        else None,
                    }
                )
        return registro

    return ExtracaoEncerrados(
        [com_equipamentos(r) for r in extracao.itens], [com_equipamentos(r) for r in extracao.pendencias]
    )


def extrair_encerrados(*, db: Session, filtro: FiltroEncerramento) -> ExtracaoEncerrados:
    try:
        extracao = classificar_encerrados(repo.listar_fatos(db, equipamento=filtro.equipamento), filtro)
        return anexar_equipamentos(db, extracao)
    except LimiteConsultaExcedido as exc:
        raise ValidationError(
            "A carteira excede o limite seguro da extração de concluídos. Contate a administração."
        ) from exc


def previa_encerrados(
    *, db: Session, filtro: FiltroEncerramento, pagina: int, limite: int, pagina_pendencias: int = 1
) -> PreviaEncerrados:
    extracao = extrair_encerrados(db=db, filtro=filtro)
    inicio = (pagina - 1) * limite
    return PreviaEncerrados(
        total=len(extracao.itens),
        total_pendencias=len(extracao.pendencias),
        pagina=pagina,
        pagina_pendencias=pagina_pendencias,
        limite=limite,
        itens=extracao.itens[inicio : inicio + limite],
        pendencias=extracao.pendencias[(pagina_pendencias - 1) * limite : pagina_pendencias * limite],
    )
