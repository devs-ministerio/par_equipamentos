"""Complementa no monitoramento somente os PERSUS com dados conciliados.

O banco é a fonte definitiva de CNES. ``Controle PERSUS.xlsx`` só acrescenta
dados a um Convênio PERSUS já identificado de maneira única; nunca cria um
novo Convênio nem altera CNES. Marcos sem equivalente no catálogo tornam-se
ações concluídas, preservando a informação operacional da planilha.

O escopo é deliberadamente seletivo: entram os PERSUS que a planilha permite
vincular com segurança, mais os que já estavam em monitoramento interno.
Os demais continuam somente em Instrumentos Firmados até receberem dados ou
uma conciliação manual explícita.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import openpyxl
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import AcaoMonitoramento, Convenio, EventoMarco, InstrumentoEquipamento, MarcoCatalogo

ROOT = Path(__file__).resolve().parents[2]
ARQUIVO_PADRAO = ROOT / "data/Controle PERSUS.xlsx"
ARQUIVO_ENTREGAS_PADRAO = ROOT / "data/Entregas_aceleradores_lineares_PERSUS_PRONON_CONV.xlsx"

# Conciliação manual feita pela equipe em 2026-09-24. O valor da planilha é
# preservado em ``cnes_informado`` para auditoria; esta tabela só define a
# chave de associação com o PERSUS I já existente no banco. A linha 19 é
# propositalmente buscada apenas no universo PERSUS I, pois há PERSUS II com
# o mesmo CNES fora do escopo desta complementação.
CNES_VALIDADO_POR_LINHA = {
    5: "2083116",
    16: "2448521",
    19: "2025507",
    28: "2795671",
}


def _texto(valor: object) -> str:
    return str(valor or "").strip()


def _normalizar(valor: object) -> str:
    texto = unicodedata.normalize("NFKD", _texto(valor)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", texto)


def _cnes(valor: object) -> str | None:
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    digitos = re.sub(r"\D", "", _texto(valor))
    return digitos.zfill(7) if 1 <= len(digitos) <= 7 else None


def _data(valor: object) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    return valor if isinstance(valor, date) else None


def _tipologia(valor: object) -> str | None:
    tipo = _texto(valor).upper().replace(".", "")
    return "C.B" if tipo == "CB" else tipo or None


def _chave_local(uf: object, municipio: object, unidade: object) -> tuple[str, str, str]:
    return (_normalizar(uf), _normalizar(municipio), _normalizar(unidade))


@dataclass(frozen=True)
class LinhaControle:
    linha: int
    cnes_informado: str
    tipologia: str | None
    uf: str
    municipio: str
    unidade: str
    situacao_inauguracao: str | None
    data_inauguracao: date | None
    previsao_cnen: date | None
    ano: int | None
    codigo_obra: str | None
    nup: str | None
    datas_equipamento: dict[str, date]
    acoes_concluidas: dict[str, date]


@dataclass(frozen=True)
class LinhaEntrega:
    """Registro de Entregas usado somente para data efetiva de inauguração."""

    linha: int
    tipo_contratacao: str
    uf: str
    municipio: str
    unidade: str
    nr_convenio: str | None
    data_inauguracao: date | None


def _indice_por_local(
    ws, *, inicio: int, colunas: tuple[int, int, int, int]
) -> dict[tuple[str, str, str], list[tuple]]:
    indice: dict[tuple[str, str, str], list[tuple]] = defaultdict(list)
    for numero, linha in enumerate(ws.iter_rows(values_only=True), 1):
        if numero <= inicio or not _cnes(linha[colunas[0]]):
            continue
        indice[_chave_local(linha[colunas[1]], linha[colunas[2]], linha[colunas[3]])].append(linha)
    return indice


def _indice_por_cnes(ws, *, inicio: int, coluna_cnes: int) -> dict[str, list[tuple]]:
    """Índice auxiliar: só é consumido quando o CNES tiver uma única ocorrência."""
    indice: dict[str, list[tuple]] = defaultdict(list)
    for numero, linha in enumerate(ws.iter_rows(values_only=True), 1):
        if numero <= inicio:
            continue
        if cnes := _cnes(linha[coluna_cnes]):
            indice[cnes].append(linha)
    return indice


def ler_controle(path: Path) -> list[LinhaControle]:
    livro = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if {"Obras", "Equipamentos", "Inauguração"} - set(livro.sheetnames):
        raise ValueError("Controle PERSUS precisa conter Obras, Equipamentos e Inauguração.")
    obras = _indice_por_local(livro["Obras"], inicio=2, colunas=(2, 3, 4, 5))
    equipamentos = _indice_por_local(livro["Equipamentos"], inicio=1, colunas=(1, 2, 3, 4))
    obras_por_cnes = _indice_por_cnes(livro["Obras"], inicio=2, coluna_cnes=2)
    equipamentos_por_cnes = _indice_por_cnes(livro["Equipamentos"], inicio=1, coluna_cnes=1)
    registros: list[LinhaControle] = []
    for numero, linha in enumerate(livro["Inauguração"].iter_rows(values_only=True), 1):
        if numero == 1 or not (cnes := _cnes(linha[2])):
            continue
        chave = _chave_local(linha[0], linha[3], linha[4])
        obra = obras[chave][0] if len(obras[chave]) == 1 else None
        equipamento = equipamentos[chave][0] if len(equipamentos[chave]) == 1 else None
        # A fonte usa aliases de hospital em algumas abas. O CNES do PERSUS
        # já é canônico; só o usamos para localizar dados complementares se
        # for único dentro da aba correspondente, sem escolher duplicatas.
        if obra is None and len(obras_por_cnes[cnes]) == 1:
            obra = obras_por_cnes[cnes][0]
        if equipamento is None and len(equipamentos_por_cnes[cnes]) == 1:
            equipamento = equipamentos_por_cnes[cnes][0]
        datas = {}
        acoes = {}
        if equipamento:
            for codigo, coluna in {
                "cronograma_chegada_porto": 9,
                "cronograma_obra_inicio": 11,
                "cronograma_instalacao_inicio": 13,
                "cronograma_instalacao_fim": 14,
                "cronograma_comissionamento": 15,
                "regulatorio_licenca_operacao": 20,
            }.items():
                if data_evento := _data(equipamento[coluna]):
                    datas[codigo] = data_evento
            for descricao, coluna in {
                "Embarque informado": 8,
                "Saída do porto informada": 10,
                "Montagem mecânica concluída": 12,
                "Dados entregues à CNEN": 16,
                "Treinamentos concluídos": 17,
            }.items():
                if data_acao := _data(equipamento[coluna]):
                    acoes[descricao] = data_acao
        registros.append(
            LinhaControle(
                linha=numero,
                cnes_informado=cnes,
                tipologia=_tipologia(linha[1]),
                uf=_texto(linha[0]),
                municipio=_texto(linha[3]),
                unidade=_texto(linha[4]),
                situacao_inauguracao=_texto(linha[8]) or None,
                previsao_cnen=_data(linha[9]),
                data_inauguracao=_data(linha[10]),
                ano=int(equipamento[6]) if equipamento and isinstance(equipamento[6], (int, float)) else None,
                codigo_obra=_texto(obra[0]) or None if obra else None,
                nup=_texto(obra[1]) or None if obra else None,
                datas_equipamento=datas,
                acoes_concluidas=acoes,
            )
        )
    return registros


def ler_entregas(path: Path = ARQUIVO_ENTREGAS_PADRAO) -> list[LinhaEntrega]:
    """Lê PERSUS-I e CONVÊNIO; PRONON é intencionalmente excluído do fluxo."""
    livro = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if {"PERSUS-I", "CONVÊNIO"} - set(livro.sheetnames):
        raise ValueError("Planilha de entregas precisa conter as abas PERSUS-I e CONVÊNIO.")
    registros: list[LinhaEntrega] = []
    for numero, linha in enumerate(livro["PERSUS-I"].iter_rows(values_only=True), 1):
        if numero > 1 and _texto(linha[1]) and _texto(linha[2]) and _texto(linha[3]):
            registros.append(
                LinhaEntrega(
                    linha=numero,
                    tipo_contratacao="PERSUS I",
                    uf=_texto(linha[1]),
                    municipio=_texto(linha[2]),
                    unidade=_texto(linha[3]),
                    nr_convenio=None,
                    data_inauguracao=_data(linha[7]),
                )
            )
    for numero, linha in enumerate(livro["CONVÊNIO"].iter_rows(values_only=True), 1):
        if numero > 1 and _texto(linha[1]) and _texto(linha[3]) and _texto(linha[4]) and _texto(linha[5]):
            registros.append(
                LinhaEntrega(
                    linha=numero,
                    tipo_contratacao="Convênio",
                    uf=_texto(linha[1]),
                    municipio=_texto(linha[3]),
                    unidade=_texto(linha[4]),
                    nr_convenio=_texto(linha[5]),
                    data_inauguracao=_data(linha[10]),
                )
            )
    return registros


def _datas_entregas_por_local(entregas: Sequence[LinhaEntrega]) -> dict[tuple[str, str, str], date]:
    """Retorna somente datas cuja identidade local é única e não conflitante."""
    por_local: dict[tuple[str, str, str], set[date]] = defaultdict(set)
    for entrega in entregas:
        if entrega.tipo_contratacao == "PERSUS I" and entrega.data_inauguracao:
            por_local[_chave_local(entrega.uf, entrega.municipio, entrega.unidade)].add(entrega.data_inauguracao)
    return {chave: next(iter(datas)) for chave, datas in por_local.items() if len(datas) == 1}


def _data_inauguracao_prioritaria(
    registro: LinhaControle, datas_entregas: dict[tuple[str, str, str], date]
) -> date | None:
    """Entregas é a fonte padrão; Controle só preenche ausência na fonte padrão."""
    return datas_entregas.get(
        _chave_local(registro.uf, registro.municipio, registro.unidade), registro.data_inauguracao
    )


def _resolver_convenio(registro: LinhaControle, convenios: Sequence[Convenio]) -> Convenio | None:
    if cnes_validado := CNES_VALIDADO_POR_LINHA.get(registro.linha):
        candidatos_validados = [convenio for convenio in convenios if convenio.cnes == cnes_validado]
        return candidatos_validados[0] if len(candidatos_validados) == 1 else None
    por_cnes_tipo = [
        convenio
        for convenio in convenios
        if convenio.cnes == registro.cnes_informado
        and convenio.tipologia == registro.tipologia
        and _normalizar(convenio.uf) == _normalizar(registro.uf)
        and _normalizar(convenio.municipio) == _normalizar(registro.municipio)
    ]
    por_local = [
        convenio
        for convenio in convenios
        if _chave_local(convenio.uf, convenio.municipio, convenio.convenente_nome)
        == _chave_local(registro.uf, registro.municipio, registro.unidade)
    ]
    candidatos = {convenio.id: convenio for convenio in [*por_cnes_tipo, *por_local]}
    return next(iter(candidatos.values())) if len(candidatos) == 1 else None


def _resolver_convenio_entrega(entrega: LinhaEntrega, convenios: Sequence[Convenio]) -> Convenio | None:
    """Aceita Entregas somente quando UF, município e unidade são exatos e únicos."""
    if entrega.tipo_contratacao == "Convênio":
        candidatos_numero = [convenio for convenio in convenios if convenio.numero == entrega.nr_convenio]
        return candidatos_numero[0] if len(candidatos_numero) == 1 else None
    candidatos = [
        convenio
        for convenio in convenios
        if _chave_local(convenio.uf, convenio.municipio, convenio.convenente_nome)
        == _chave_local(entrega.uf, entrega.municipio, entrega.unidade)
    ]
    return candidatos[0] if len(candidatos) == 1 else None


def _campos_instrumento(convenio: Convenio, origem: str) -> dict[str, object]:
    return {
        "cnpj_convenente": None,
        "nome_convenente": convenio.convenente_nome,
        "municipio": convenio.municipio,
        "uf": convenio.uf,
        "cnes": convenio.cnes,
        "programa": convenio.programa,
        "tipo_contratacao": "PERSUS I",
        # A planilha de controle é complementar. A proveniência do item
        # continua sendo a carga PERSUS original; o hash deste arquivo fica
        # na observação dos novos eventos/açoes, que é o audit trail certo.
        "origem_dado": convenio.origem_dado or origem,
        "tipologia": convenio.tipologia,
        "ano_instrumento": convenio.ano_instrumento,
        "investimento_aquisicao": convenio.valor_global,
        "situacao_programa": convenio.situacao,
        "natureza_servico": convenio.objeto,
        "equipamento_descricao": "Acelerador linear",
        "chave_origem": convenio.chave_origem,
    }


def _adicionar_evento(
    db,
    instrumento: InstrumentoEquipamento,
    marco: MarcoCatalogo,
    fase_geral_id: int | None,
    data_ocorrencia: date | None,
    data_prevista: date | None,
    observacao: str,
) -> bool:
    existe = (
        db.execute(
            select(EventoMarco.id).where(
                EventoMarco.instrumento_id == instrumento.id,
                EventoMarco.marco_id == marco.id,
                EventoMarco.data_ocorrencia == data_ocorrencia,
                EventoMarco.data_prevista == data_prevista,
                EventoMarco.observacao == observacao,
            )
        )
        .scalars()
        .first()
    )
    if existe is not None:
        return False
    db.add(
        EventoMarco(
            instrumento_id=instrumento.id,
            marco_id=marco.id,
            fase_geral_id=fase_geral_id,
            data_ocorrencia=data_ocorrencia,
            data_prevista=data_prevista,
            observacao=observacao,
        )
    )
    return True


def _adicionar_acao_concluida(db, instrumento: InstrumentoEquipamento, descricao: str, data_conclusao: date) -> bool:
    existe = (
        db.execute(
            select(AcaoMonitoramento.id).where(
                AcaoMonitoramento.instrumento_id == instrumento.id,
                AcaoMonitoramento.descricao == descricao,
                AcaoMonitoramento.data_conclusao == data_conclusao,
            )
        )
        .scalars()
        .first()
    )
    if existe is not None:
        return False
    db.add(AcaoMonitoramento(instrumento_id=instrumento.id, descricao=descricao, data_conclusao=data_conclusao))
    return True


def _fase_para_evento(codigo: str) -> str:
    if codigo == "cronograma_chegada_porto":
        return "fase_equipamento_em_aquisicao"
    if codigo == "cronograma_obra_inicio":
        return "fase_em_andamento"
    if codigo in {"cronograma_instalacao_inicio", "cronograma_instalacao_fim", "cronograma_comissionamento"}:
        return "fase_comissionamento"
    if codigo == "regulatorio_licenca_operacao":
        return "fase_equipamento_entregue"
    return "fase_concluido"


def _situacao_convenio(situacao_inauguracao: str | None) -> str | None:
    situacao = _normalizar(situacao_inauguracao)
    if "INAUGURADA" in situacao and "NAO" not in situacao:
        return "Em operação"
    if "NAOAPTO" in situacao or "ANALISE" in situacao:
        return "Em execução"
    return None


def _fases_ocorridas(registro: LinhaControle, *, data_inauguracao: date | None = None) -> dict[str, date]:
    """Consolida a última evidência realizada de cada fase geral.

    ``fase_geral_id`` dá contexto a um marco físico/regulatório, mas não é
    em si um evento de fase. O resumo do monitoramento deriva a etapa atual
    exclusivamente dos eventos cujo próprio marco é do grupo ``fase_geral``.
    A complementação precisa materializar ambos: o marco detalhado e a
    transição de fase que ele confirma.
    """
    fases: dict[str, date] = {}
    for codigo, data_evento in registro.datas_equipamento.items():
        fase = _fase_para_evento(codigo)
        anterior = fases.get(fase)
        if anterior is None or data_evento > anterior:
            fases[fase] = data_evento
    if data_inauguracao:
        fases["fase_concluido"] = data_inauguracao
    return fases


def validar(*, arquivo: Path = ARQUIVO_PADRAO, arquivo_entregas: Path = ARQUIVO_ENTREGAS_PADRAO) -> dict[str, int]:
    """Confere a conciliação sem abrir nenhuma escrita na base.

    Diferentemente de ``--dry-run``, esta etapa não faz ``flush`` e por isso
    também não consome valores de sequence em uma base produtiva.
    """
    registros = ler_controle(arquivo)
    datas_entregas = _datas_entregas_por_local(ler_entregas(arquivo_entregas))
    resultado: dict[str, int] = defaultdict(int)
    with SessionLocal() as db:
        convenios = db.execute(select(Convenio).where(Convenio.chave_origem.like("PERSUS1-%"))).scalars().all()
        chaves_monitoradas = set(
            db.execute(
                select(InstrumentoEquipamento.chave_origem).where(InstrumentoEquipamento.chave_origem.like("PERSUS1-%"))
            ).scalars()
        )
        resolvidos: dict[str, Convenio] = {}
        for registro in registros:
            data_inauguracao = _data_inauguracao_prioritaria(registro, datas_entregas)
            convenio = _resolver_convenio(registro, convenios)
            if convenio is None:
                resultado["pendentes_vinculo"] += 1
                continue
            if convenio.chave_origem is None:
                raise ValueError(f"PERSUS sem chave de origem: {convenio.numero}")
            resolvidos[convenio.chave_origem] = convenio
            resultado["linhas_vinculadas"] += 1
            if registro.ano is not None and convenio.ano_instrumento not in (None, registro.ano):
                resultado["conflitos_ano"] += 1
            if registro.nup and convenio.numero_processo not in (None, registro.nup):
                resultado["conflitos_nup"] += 1
            if data_inauguracao and convenio.data_conclusao not in (None, data_inauguracao):
                resultado["conflitos_inauguracao"] += 1
            resultado["eventos_planejados"] += len(registro.datas_equipamento)
            resultado["eventos_planejados"] += int(registro.previsao_cnen is not None)
            resultado["eventos_planejados"] += int(data_inauguracao is not None)
            resultado["acoes_planejadas"] += len(registro.acoes_concluidas)
        chaves_escopo = set(resolvidos) | chaves_monitoradas
        resultado["persus_no_banco"] = len(convenios)
        resultado["instrumentos_existentes"] = len(chaves_monitoradas)
        resultado["persus_no_escopo_monitoramento"] = len(chaves_escopo)
        resultado["instrumentos_a_criar"] = len(chaves_escopo - chaves_monitoradas)
    resultado["linhas"] = len(registros)
    print("VALIDACAO: " + ", ".join(f"{k}={v}" for k, v in sorted(resultado.items())))
    return resultado


def _resolver_linhas(
    registros: Sequence[LinhaControle], convenios: Sequence[Convenio]
) -> tuple[dict[int, Convenio], dict[str, Convenio], list[LinhaControle]]:
    resolvidos_por_linha: dict[int, Convenio] = {}
    resolvidos_por_chave: dict[str, Convenio] = {}
    pendentes: list[LinhaControle] = []
    for registro in registros:
        convenio = _resolver_convenio(registro, convenios)
        if convenio is None:
            pendentes.append(registro)
            continue
        if convenio.chave_origem is None:
            raise ValueError(f"PERSUS sem chave de origem: {convenio.numero}")
        resolvidos_por_linha[registro.linha] = convenio
        resolvidos_por_chave[convenio.chave_origem] = convenio
    return resolvidos_por_linha, resolvidos_por_chave, pendentes


def _garantir_instrumentos(
    db,
    convenios_por_chave: dict[str, Convenio],
    instrumentos: dict[str, InstrumentoEquipamento],
    chaves_escopo: set[str],
    origem: str,
    resultado: dict[str, int],
) -> None:
    for chave_origem in chaves_escopo:
        convenio = convenios_por_chave[chave_origem]
        instrumento = instrumentos.get(chave_origem)
        campos = _campos_instrumento(convenio, origem)
        if instrumento is None:
            instrumento = InstrumentoEquipamento(nr_convenio=convenio.numero, **campos)
            db.add(instrumento)
            db.flush()
            instrumentos[chave_origem] = instrumento
            resultado["instrumentos_criados"] += 1
            continue
        for campo, valor in campos.items():
            setattr(instrumento, campo, valor)
        resultado["instrumentos_atualizados"] += 1


def _complementar_campos(
    convenio: Convenio,
    instrumento: InstrumentoEquipamento,
    registro: LinhaControle,
    data_inauguracao: date | None,
    resultado: dict[str, int],
) -> None:
    if registro.ano is not None:
        if convenio.ano_instrumento in (None, registro.ano):
            convenio.ano_instrumento = registro.ano
            instrumento.ano_instrumento = registro.ano
        else:
            resultado["conflitos_ano"] += 1
    if registro.nup:
        if convenio.numero_processo in (None, registro.nup):
            convenio.numero_processo = registro.nup
        else:
            resultado["conflitos_nup"] += 1
    if data_inauguracao:
        if convenio.data_conclusao in (None, data_inauguracao):
            convenio.data_conclusao = data_inauguracao
        else:
            resultado["conflitos_inauguracao"] += 1
    if situacao := _situacao_convenio(registro.situacao_inauguracao):
        convenio.situacao = situacao


def _registrar_eventos(
    db,
    instrumento: InstrumentoEquipamento,
    registro: LinhaControle,
    data_inauguracao: date | None,
    marcos: dict[str, MarcoCatalogo],
    observacao: str,
    resultado: dict[str, int],
) -> None:
    for codigo, data_evento in registro.datas_equipamento.items():
        marco = marcos.get(codigo)
        fase = marcos.get(_fase_para_evento(codigo))
        if marco is not None:
            resultado["eventos"] += int(
                _adicionar_evento(db, instrumento, marco, fase.id if fase else None, data_evento, None, observacao)
            )
    marco_licenca = marcos.get("regulatorio_licenca_operacao")
    fase_entregue = marcos.get("fase_equipamento_entregue")
    if registro.previsao_cnen and marco_licenca:
        resultado["eventos"] += int(
            _adicionar_evento(
                db,
                instrumento,
                marco_licenca,
                fase_entregue.id if fase_entregue else None,
                None,
                registro.previsao_cnen,
                observacao,
            )
        )
    marco_inauguracao = marcos.get("cronograma_previsao_inauguracao")
    fase_concluido = marcos.get("fase_concluido")
    if data_inauguracao and marco_inauguracao:
        resultado["eventos"] += int(
            _adicionar_evento(
                db,
                instrumento,
                marco_inauguracao,
                fase_concluido.id if fase_concluido else None,
                data_inauguracao,
                None,
                observacao,
            )
        )
    for codigo_fase, data_evento in _fases_ocorridas(registro, data_inauguracao=data_inauguracao).items():
        fase = marcos.get(codigo_fase)
        if fase is None:
            continue
        resultado["fases_gerais"] += int(
            _adicionar_evento(
                db,
                instrumento,
                fase,
                None,
                data_evento,
                None,
                f"Fase geral consolidada pela complementação PERSUS. {observacao}",
            )
        )


def _registrar_acoes(
    db, instrumento: InstrumentoEquipamento, registro: LinhaControle, observacao: str, resultado: dict[str, int]
) -> None:
    for descricao, data_conclusao in registro.acoes_concluidas.items():
        resultado["acoes"] += int(
            _adicionar_acao_concluida(db, instrumento, f"{descricao}. {observacao}", data_conclusao)
        )


def complementar_fases_gerais(
    *,
    arquivo: Path = ARQUIVO_PADRAO,
    arquivo_entregas: Path = ARQUIVO_ENTREGAS_PADRAO,
    dry_run: bool = False,
) -> dict[str, int]:
    """Materializa em lote as fases gerais faltantes da carga já aplicada.

    A primeira versão da complementação criou os marcos detalhados com
    ``fase_geral_id``, mas o resumo só considera eventos cujo marco é a fase
    geral. Este reparo evita reprocessar os demais 287 registros idempotentes
    contra um banco remoto: lê os eventos de fase existentes uma única vez e
    insere exclusivamente as transições ainda ausentes.
    """
    origem = f"Controle PERSUS.xlsx · sha256:{hashlib.sha256(arquivo.read_bytes()).hexdigest()[:12]}"
    registros = ler_controle(arquivo)
    datas_entregas = _datas_entregas_por_local(ler_entregas(arquivo_entregas))
    resultado: dict[str, int] = defaultdict(int)
    with SessionLocal() as db:
        convenios = db.execute(select(Convenio).where(Convenio.chave_origem.like("PERSUS1-%"))).scalars().all()
        instrumentos = {
            item.chave_origem: item
            for item in db.execute(
                select(InstrumentoEquipamento).where(InstrumentoEquipamento.chave_origem.like("PERSUS1-%"))
            ).scalars()
            if item.chave_origem is not None
        }
        marcos = {marco.codigo: marco for marco in db.execute(select(MarcoCatalogo)).scalars()}
        resolvidos_por_linha, _resolvidos, pendentes = _resolver_linhas(registros, convenios)
        fases_ids = {marco.id for marco in marcos.values() if marco.codigo.startswith("fase_")}
        existentes = {
            (instrumento_id, marco_id, data_ocorrencia)
            for instrumento_id, marco_id, data_ocorrencia in db.execute(
                select(EventoMarco.instrumento_id, EventoMarco.marco_id, EventoMarco.data_ocorrencia).where(
                    EventoMarco.instrumento_id.in_([item.id for item in instrumentos.values()]),
                    EventoMarco.marco_id.in_(fases_ids),
                )
            ).all()
        }
        for registro in registros:
            convenio = resolvidos_por_linha.get(registro.linha)
            if convenio is None or convenio.chave_origem is None:
                continue
            instrumento = instrumentos.get(convenio.chave_origem)
            if instrumento is None:
                resultado["pendentes_instrumento"] += 1
                continue
            observacao = (
                f"Fase geral consolidada pela complementação PERSUS. Importado de {origem}, linha {registro.linha}."
            )
            data_inauguracao = _data_inauguracao_prioritaria(registro, datas_entregas)
            for codigo_fase, data_evento in _fases_ocorridas(registro, data_inauguracao=data_inauguracao).items():
                fase = marcos.get(codigo_fase)
                if fase is None:
                    continue
                chave_evento = (instrumento.id, fase.id, data_evento)
                if chave_evento in existentes:
                    continue
                db.add(
                    EventoMarco(
                        instrumento_id=instrumento.id,
                        marco_id=fase.id,
                        data_ocorrencia=data_evento,
                        observacao=observacao,
                    )
                )
                existentes.add(chave_evento)
                resultado["fases_gerais"] += 1
        resultado["pendentes_vinculo"] = len(pendentes)
        if dry_run:
            db.rollback()
        else:
            db.commit()
    resultado["linhas"] = len(registros)
    print(("SIMULACAO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in sorted(resultado.items())))
    return resultado


def _corrigir_evento_importado(
    db,
    *,
    instrumento: InstrumentoEquipamento,
    marco: MarcoCatalogo,
    fase_geral_id: int | None,
    data_inauguracao: date,
    observacao: str,
) -> bool:
    """Corrige somente evento PERSUS importado, preservando evento manual intacto."""
    novo = db.execute(
        select(EventoMarco).where(
            EventoMarco.instrumento_id == instrumento.id,
            EventoMarco.marco_id == marco.id,
            EventoMarco.data_ocorrencia == data_inauguracao,
            EventoMarco.observacao == observacao,
        )
    ).scalar_one_or_none()
    if novo is None:
        novo = EventoMarco(
            instrumento_id=instrumento.id,
            marco_id=marco.id,
            fase_geral_id=fase_geral_id,
            data_ocorrencia=data_inauguracao,
            observacao=observacao,
        )
        db.add(novo)
        db.flush()
    antigos = db.execute(
        select(EventoMarco).where(
            EventoMarco.instrumento_id == instrumento.id,
            EventoMarco.marco_id == marco.id,
            EventoMarco.data_ocorrencia.is_not(None),
            EventoMarco.data_ocorrencia != data_inauguracao,
            EventoMarco.deletado_em.is_(None),
            EventoMarco.substituido_por_id.is_(None),
            EventoMarco.observacao.like("%Controle PERSUS.xlsx%"),
        )
    ).scalars()
    substituidos = 0
    for antigo in antigos:
        antigo.substituido_por_id = novo.id
        substituidos += 1
    return substituidos == 0


def complementar_inauguracoes_entregas(
    *, arquivo_entregas: Path = ARQUIVO_ENTREGAS_PADRAO, dry_run: bool = False
) -> dict[str, int]:
    """Aplica a fonte prioritária de inauguração a PERSUS I e Convênios.

    A aba Entregas é a fonte padrão indicada pela equipe. Controle é exclusivo
    de PERSUS I, como fonte de ações/eventos, e só supre data quando Entregas
    a deixa vazia. PRONON não é lido nem alterado.
    A correção troca apenas eventos anteriores importados do Controle; eventos
    manuais não são substituídos por script.
    """
    entregas = ler_entregas(arquivo_entregas)
    resultado: dict[str, int] = defaultdict(int)
    with SessionLocal() as db:
        convenios = db.execute(select(Convenio)).scalars().all()
        instrumentos = {
            item.chave_origem: item
            for item in db.execute(
                select(InstrumentoEquipamento).where(InstrumentoEquipamento.chave_origem.like("PERSUS1-%"))
            ).scalars()
            if item.chave_origem is not None
        }
        marcos = {marco.codigo: marco for marco in db.execute(select(MarcoCatalogo)).scalars()}
        marco_inauguracao = marcos.get("cronograma_previsao_inauguracao")
        fase_concluido = marcos.get("fase_concluido")
        for entrega in entregas:
            if entrega.data_inauguracao is None:
                resultado["entregas_sem_data"] += 1
                continue
            convenio = _resolver_convenio_entrega(entrega, convenios)
            if convenio is None:
                resultado["entregas_pendentes_vinculo"] += 1
                continue
            if convenio.data_conclusao == entrega.data_inauguracao:
                resultado["inauguracoes_ja_coerentes"] += 1
                continue
            convenio.data_conclusao = entrega.data_inauguracao
            convenio.situacao = "Em operação"
            resultado["inauguracoes_atualizadas"] += 1
            if convenio.chave_origem is None:
                continue
            instrumento = instrumentos.get(convenio.chave_origem)
            if instrumento is None or marco_inauguracao is None or fase_concluido is None:
                continue
            origem = (
                "Data de inauguração corrigida pela fonte prioritária "
                f"Entregas ({entrega.tipo_contratacao}), linha {entrega.linha}."
            )
            _corrigir_evento_importado(
                db,
                instrumento=instrumento,
                marco=marco_inauguracao,
                fase_geral_id=fase_concluido.id,
                data_inauguracao=entrega.data_inauguracao,
                observacao=origem,
            )
            _corrigir_evento_importado(
                db,
                instrumento=instrumento,
                marco=fase_concluido,
                fase_geral_id=None,
                data_inauguracao=entrega.data_inauguracao,
                observacao=origem,
            )
            resultado["monitoramentos_atualizados"] += 1
        if dry_run:
            db.rollback()
        else:
            db.commit()
    resultado["entregas"] = len(entregas)
    print(("SIMULACAO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in sorted(resultado.items())))
    return resultado


def executar(
    *,
    arquivo: Path = ARQUIVO_PADRAO,
    arquivo_entregas: Path = ARQUIVO_ENTREGAS_PADRAO,
    dry_run: bool = False,
) -> dict[str, int]:
    origem = f"Controle PERSUS.xlsx · sha256:{hashlib.sha256(arquivo.read_bytes()).hexdigest()[:12]}"
    registros = ler_controle(arquivo)
    datas_entregas = _datas_entregas_por_local(ler_entregas(arquivo_entregas))
    resultado: dict[str, int] = defaultdict(int)
    with SessionLocal() as db:
        convenios = db.execute(select(Convenio).where(Convenio.chave_origem.like("PERSUS1-%"))).scalars().all()
        instrumentos = {
            item.chave_origem: item
            for item in db.execute(
                select(InstrumentoEquipamento).where(InstrumentoEquipamento.chave_origem.like("PERSUS1-%"))
            ).scalars()
            if item.chave_origem is not None
        }
        marcos = {marco.codigo: marco for marco in db.execute(select(MarcoCatalogo)).scalars()}
        resolvidos_por_linha, resolvidos, pendentes = _resolver_linhas(registros, convenios)
        chaves_escopo = set(instrumentos) | set(resolvidos)
        convenios_por_chave = {
            convenio.chave_origem: convenio for convenio in convenios if convenio.chave_origem is not None
        }
        _garantir_instrumentos(db, convenios_por_chave, instrumentos, chaves_escopo, origem, resultado)
        resultado["pendentes_vinculo"] = len(pendentes)
        for registro in registros:
            convenio = resolvidos_por_linha.get(registro.linha)
            if convenio is None:
                continue
            if convenio.chave_origem is None:
                raise ValueError(f"PERSUS sem chave de origem: {convenio.numero}")
            instrumento = instrumentos[convenio.chave_origem]
            observacao = f"Importado de {origem}, linha {registro.linha}."
            data_inauguracao = _data_inauguracao_prioritaria(registro, datas_entregas)
            _complementar_campos(convenio, instrumento, registro, data_inauguracao, resultado)
            _registrar_eventos(db, instrumento, registro, data_inauguracao, marcos, observacao, resultado)
            _registrar_acoes(db, instrumento, registro, observacao, resultado)
            resultado["linhas_vinculadas"] += 1
        if dry_run:
            db.rollback()
        else:
            db.commit()
    resultado["linhas"] = len(registros)
    print(("SIMULACAO" if dry_run else "APLICADO") + ": " + ", ".join(f"{k}={v}" for k, v in sorted(resultado.items())))
    return resultado


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--arquivo", type=Path, default=ARQUIVO_PADRAO)
    parser.add_argument("--arquivo-entregas", type=Path, default=ARQUIVO_ENTREGAS_PADRAO)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--validar", action="store_true")
    parser.add_argument("--fases-gerais", action="store_true")
    parser.add_argument("--inauguracoes-entregas", action="store_true")
    argumentos = parser.parse_args()
    if argumentos.validar:
        validar(arquivo=argumentos.arquivo, arquivo_entregas=argumentos.arquivo_entregas)
    elif argumentos.fases_gerais:
        complementar_fases_gerais(
            arquivo=argumentos.arquivo, arquivo_entregas=argumentos.arquivo_entregas, dry_run=argumentos.dry_run
        )
    elif argumentos.inauguracoes_entregas:
        complementar_inauguracoes_entregas(arquivo_entregas=argumentos.arquivo_entregas, dry_run=argumentos.dry_run)
    else:
        executar(arquivo=argumentos.arquivo, arquivo_entregas=argumentos.arquivo_entregas, dry_run=argumentos.dry_run)
