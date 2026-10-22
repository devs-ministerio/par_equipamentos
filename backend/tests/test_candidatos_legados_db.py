"""Radar legado contra PostgreSQL real e API, sem rede externa."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import pytest
import requests
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.db.base import SessionLocal
from app.db.models import (
    Convenio,
    FonteCaptura,
    InstrumentoEquipamento,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
)
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoRegistro
from app.domain_errors import ConflictError, ValidationError
from app.main import app
from app.schemas_legado import ReferenciaDescoberta
from app.services.candidatos_legados import listar_candidatos, registrar_descoberta
from app.services.descoberta_legado import CandidatoLegado, EvidenciaLegado

REFERENCIA = ReferenciaDescoberta(origem="snapshot_local", hash_snapshot="a" * 64)


@pytest.fixture
def coleta_legado(monkeypatch, tmp_path, candidatos):
    """Somente download e HTTP simulados; cruzamento, schema e SQL reais."""
    from scripts import job_descoberta_siconv as job

    chamadas = []
    estados = {c.numero: 200 for c in candidatos}
    with SessionLocal() as db:
        anteriores = set(db.scalars(select(FonteCaptura.id)))

    def baixar(nome, *, atualizar_cache, diretorio_cache):
        chamadas.append((nome, atualizar_cache))
        if nome == "siconv_convenio":
            texto = "ID_PROPOSTA;NR_CONVENIO;DIA_ASSIN_CONV;DIA_PUBL_CONV;SIT_CONVENIO\n" + "".join(
                f"{c.id_proposta};{c.numero};01/01/2025;02/01/2025;Em execução\n" for c in candidatos
            )
        elif nome == "siconv_proposta":
            texto = "ID_PROPOSTA;COD_ORGAO_SUP\n" + "".join(f"{c.id_proposta};36000\n" for c in candidatos)
        elif nome == "siconv_programa":
            texto = "ID_PROGRAMA;NOME_PROGRAMA;COD_ORGAO_SUP_PROGRAMA\n1;Programa genérico;36000\n"
        elif nome == "siconv_programa_proposta":
            texto = "ID_PROPOSTA;ID_PROGRAMA\n" + "".join(f"{c.id_proposta};1\n" for c in candidatos)
        else:
            texto = "ID_PROPOSTA;ID_ITEM_PAD;DESCRICAO_ITEM\n" + "".join(
                f"{c.id_proposta};1;Aquisição de acelerador linear\n" for c in candidatos
            )
        buffer = BytesIO()
        with ZipFile(buffer, "w") as arquivo:
            arquivo.writestr(nome + ".csv", texto)
        conteudo = buffer.getvalue()
        (diretorio_cache / (nome + ".csv.zip")).write_bytes(conteudo)
        return conteudo

    def consultar(sessao, url, *, params, headers, timeout):
        numero = params["numero"]
        resposta = requests.Response()
        resposta.status_code = estados[numero]
        resposta._content = json.dumps(
            {
                "dimConvenio": {"codigo": numero, "numero": "1/2026", "objeto": "Aquisição de acelerador linear"},
                "dataPublicacao": "2026-10-01",
            }
        ).encode()
        return resposta

    monkeypatch.setattr(job, "_baixar_zip", baixar)
    monkeypatch.setattr(settings, "portal_transparencia_api_key", "somente-fixture")
    monkeypatch.setattr(requests.Session, "get", consultar)
    yield job, chamadas, estados
    with SessionLocal() as db:
        ids = set(db.scalars(select(FonteCaptura.id))) - anteriores
        avisos = select(Notificacao.id).where(
            Notificacao.tipo == NotificacaoTipo.fonte_indisponivel, Notificacao.entidade_id.in_(ids)
        )
        db.execute(delete(NotificacaoDestinatario).where(NotificacaoDestinatario.notificacao_id.in_(avisos)))
        db.execute(delete(Notificacao).where(Notificacao.id.in_(avisos)))
        db.execute(delete(FonteCaptura).where(FonteCaptura.id.in_(ids)))
        db.commit()


def test_job_baixa_fresco_confirma_e_replay_nao_duplica(coleta_legado, candidatos):
    job, chamadas, _ = coleta_legado
    job.run()
    job.run()
    assert (
        chamadas
        == [
            (nome, True)
            for nome in (
                "siconv_convenio",
                "siconv_plano_aplicacao",
                "siconv_proposta",
                "siconv_programa",
                "siconv_programa_proposta",
            )
        ]
        * 2
    )
    with SessionLocal() as db:
        item = listar(db, busca=candidatos[0].numero).itens[0]
        assert item.confirmacao_portal == "confirmado" and item.origem == "siconv_oficial"
        assert (
            db.scalar(
                select(func.count())
                .select_from(CandidatoLegadoCaptura)
                .where(CandidatoLegadoCaptura.candidato_id == item.id)
            )
            == 1
        )
        capturas = db.scalars(
            select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta").order_by(FonteCaptura.id)
        ).all()
        assert [(c.status, c.itens_alterados) for c in capturas] == [("ok", 3), ("ok", 0)]
        ids_candidatos = select(CandidatoLegadoRegistro.id).where(
            CandidatoLegadoRegistro.numero.in_([c.numero for c in candidatos])
        )
        # Duas rodadas completas, mas somente um aviso por primeira descoberta.
        avisos = list(
            db.scalars(
                select(Notificacao).where(
                    Notificacao.tipo == NotificacaoTipo.convenio_descoberto,
                    Notificacao.entidade_id.in_(ids_candidatos),
                )
            )
        )
        assert len(avisos) == len(candidatos) == 3
        assert len({aviso.entidade_id for aviso in avisos}) == 3


def test_job_portal_ausente_nao_inclui_carteira(coleta_legado, candidatos):
    job, _, estados = coleta_legado
    estados[candidatos[0].numero] = 404
    job.run()
    with SessionLocal() as db:
        assert listar(db, busca=candidatos[0].numero).total == 0
        registro = db.scalar(
            select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero == candidatos[0].numero)
        )
        assert registro is not None
        captura = db.get(CandidatoLegadoCaptura, registro.ultima_captura_id)
        assert captura is not None
        assert captura.confirmacao_portal == "nao_encontrado"
        assert db.scalar(select(Convenio.id).where(Convenio.numero == candidatos[0].numero)) is None


def test_comando_local_baseline_silenciosa_e_incremental_notifica_so_novidade(coleta_legado, candidatos):
    from scripts.descobrir_siconv_local import executar

    job, _, estados = coleta_legado
    executar(baseline_silenciosa=True)
    job.run()
    novo = candidatos[0].model_copy(update={"numero": str(uuid4().int), "id_proposta": str(uuid4().int)})
    candidatos.append(novo)
    estados[novo.numero] = 200
    executar()
    with SessionLocal() as db:
        ids_candidatos = select(CandidatoLegadoRegistro.id).where(
            CandidatoLegadoRegistro.numero.in_([c.numero for c in candidatos])
        )
        avisos = list(
            db.scalars(
                select(Notificacao).where(
                    Notificacao.tipo == NotificacaoTipo.convenio_descoberto,
                    Notificacao.entidade_id.in_(ids_candidatos),
                )
            )
        )
        novo_id = db.scalar(select(CandidatoLegadoRegistro.id).where(CandidatoLegadoRegistro.numero == novo.numero))
        assert len(avisos) == 1 and avisos[0].entidade_id == novo_id
        rodadas = list(
            db.scalars(select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta").order_by(FonteCaptura.id))
        )
        modos = []
        for rodada in rodadas:
            assert rodada.detalhes is not None
            modos.append(rodada.detalhes["modo_descoberta"])
        assert modos == ["baseline_silenciosa", "incremental", "incremental"]
        assert [r.itens_alterados for r in rodadas] == [3, 0, 1]


def test_comando_local_recusa_engine_previamente_carregada_em_outro_banco(coleta_legado, monkeypatch):
    from types import SimpleNamespace

    from sqlalchemy.engine import make_url

    from app.db import base
    from scripts.descobrir_siconv_local import executar

    _, chamadas, _ = coleta_legado
    monkeypatch.setattr(
        base, "engine", SimpleNamespace(url=make_url("postgresql://local@127.0.0.1/sigeo_test_clone_20261007"))
    )
    with pytest.raises(ValueError, match="Conexão carregada difere"):
        executar()
    assert chamadas == []


def test_job_falha_http_aborta_lote_e_preserva_baseline(coleta_legado, candidatos):
    job, _, estados = coleta_legado
    with SessionLocal() as db:
        registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA)
    estados[candidatos[1].numero] = 500
    with pytest.raises(requests.HTTPError):
        job.run()
    with SessionLocal() as db:
        assert listar(db, busca=candidatos[0].numero).itens[0].origem == "snapshot_local"
        assert listar(db, busca=candidatos[1].numero).total == 0
        captura = db.scalars(select(FonteCaptura).where(FonteCaptura.fonte == "siconv_descoberta")).one()
        assert captura.status == "erro" and "500" not in (captura.erro or "")


def test_job_lote_acima_do_limite_nao_grava_parcial(coleta_legado, candidatos):
    job, _, _ = coleta_legado
    with pytest.raises(ValueError, match="limite seguro"):
        job.run(limite=1)
    with SessionLocal() as db:
        assert listar(db, busca=candidatos[0].numero).total == 0


def test_job_limite_invalido_nao_baixa(coleta_legado):
    job, chamadas, _ = coleta_legado
    with pytest.raises(ValueError, match="entre 1 e 1000"):
        job.run(limite=0)
    assert chamadas == []


@pytest.fixture
def candidatos():
    registros = [
        CandidatoLegado(
            numero=str(uuid4().int),
            id_proposta=str(uuid4().int),
            confirmacao_portal="confirmado",
            data_publicacao=date(2026, 10, 1),
            criterio_escopo="prioritarios_ms_celebrados_v2",
            orgao_superior="36000",
            data_assinatura_siconv=date(2026, 10, 1),
            data_publicacao_siconv=date(2026, 10, 1),
            evidencias=(
                EvidenciaLegado(
                    id_item="1",
                    codigo_equipamento="acelerador_linear",
                    descricao="Aquisição de LINAC sintético",
                    relacao="aquisicao",
                ),
            ),
        )
        for _ in range(3)
    ]
    yield registros
    with SessionLocal() as db:
        for registro in db.scalars(
            select(CandidatoLegadoRegistro).where(CandidatoLegadoRegistro.numero.in_([c.numero for c in registros]))
        ):
            avisos = select(Notificacao.id).where(
                Notificacao.tipo == NotificacaoTipo.convenio_descoberto,
                Notificacao.entidade_id == registro.id,
            )
            db.execute(delete(NotificacaoDestinatario).where(NotificacaoDestinatario.notificacao_id.in_(avisos)))
            db.execute(delete(Notificacao).where(Notificacao.id.in_(avisos)))
            registro.ultima_captura_id = None
            db.flush()
            db.delete(registro)
        db.commit()


def listar(db, busca=None, confirmacao=None, pagina=1, tamanho=10):
    return listar_candidatos(db=db, pagina=pagina, tamanho=tamanho, busca=busca, confirmacao=confirmacao)


@pytest.mark.parametrize("defeito", ["sem_escopo", "escopo_v1", "sem_confirmacao", "valido"])
def test_fila_oficial_e_contador_exigem_escopo_atual_confirmado(candidatos, defeito):
    # Arrange: registros históricos são preservados, mas não são descobertas validadas.
    alteracoes = {
        "criterio_escopo": "prioritarios_ms_celebrados_v2",
        "orgao_superior": "36000",
        "data_assinatura_siconv": date(2026, 10, 1),
        "data_publicacao_siconv": date(2026, 10, 1),
    }
    if defeito == "sem_escopo":
        alteracoes.update(criterio_escopo=None, orgao_superior=None)
    elif defeito == "escopo_v1":
        alteracoes.update(criterio_escopo="prioritarios_ms_v1")
    elif defeito == "sem_confirmacao":
        alteracoes.update(confirmacao_portal="nao_consultado", data_publicacao=None)
    registro = candidatos[0].model_copy(update=alteracoes)
    with SessionLocal() as db:
        antes = listar_candidatos(db=db, pagina=1, tamanho=10, busca=None, confirmacao=None, somente_oficiais=True)
        registrar_descoberta(
            db=db,
            candidatos=[registro],
            referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="b" * 64),
            notificar_novos=False,
        )
        # Act
        resultado = listar_candidatos(
            db=db,
            pagina=1,
            tamanho=1,
            busca=registro.numero,
            confirmacao=None,
            somente_oficiais=True,
        )
        # Assert: fila e badge usam a mesma elegibilidade; não apagam evidências.
        esperado = int(defeito == "valido")
        assert resultado.total == len(resultado.itens) == esperado
        assert resultado.novos == antes.novos + esperado
        assert db.scalar(select(CandidatoLegadoRegistro.id).where(CandidatoLegadoRegistro.numero == registro.numero))


def test_replay_silencioso_sem_carteira_monitoramento_ou_aviso(candidatos):
    with SessionLocal() as db:
        antes = [
            db.scalar(select(func.count()).select_from(t)) for t in (Convenio, InstrumentoEquipamento, Notificacao)
        ]
        assert registrar_descoberta(db=db, candidatos=candidatos, referencia=REFERENCIA) == 3
        assert registrar_descoberta(db=db, candidatos=list(reversed(candidatos)), referencia=REFERENCIA) == 0
        depois = [
            db.scalar(select(func.count()).select_from(t)) for t in (Convenio, InstrumentoEquipamento, Notificacao)
        ]
        assert antes == depois
        item = listar(db, busca=candidatos[0].numero).itens[0]
        assert item.numero == candidatos[0].numero and item.origem == "snapshot_local"
        assert item.evidencias[0].nome == "Acelerador Linear"
        capturas = db.scalars(
            select(CandidatoLegadoCaptura).where(CandidatoLegadoCaptura.candidato_id == item.id)
        ).all()
        assert len(capturas) == 1


def test_confirmacao_e_evidencia_antigas_preservadas_em_resposta_parcial(candidatos):
    candidato = candidatos[0].model_copy(
        update={"confirmacao_portal": "confirmado", "data_publicacao": date(2026, 10, 1)}
    )
    with SessionLocal() as db:
        assert registrar_descoberta(db=db, candidatos=[candidato], referencia=REFERENCIA) == 1
        parcial = candidatos[0].model_copy(update={"confirmacao_portal": "nao_encontrado", "evidencias": ()})
        with pytest.raises(ValidationError, match="evidência"):
            registrar_descoberta(db=db, candidatos=[parcial], referencia=REFERENCIA)
        item = listar(db, busca=candidato.numero).itens[0]
        assert item.confirmacao_portal == "confirmado" and item.data_publicacao == date(2026, 10, 1)
        assert len(item.evidencias) == 1
        alterado = candidato.model_copy(
            update={
                "evidencias": (
                    candidato.evidencias[0].model_copy(update={"descricao": "LINAC, descrição oficial revista"}),
                )
            }
        )
        assert registrar_descoberta(db=db, candidatos=[alterado], referencia=REFERENCIA) == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(CandidatoLegadoCaptura)
                .where(CandidatoLegadoCaptura.candidato_id == item.id)
            )
            == 2
        )


def test_origem_oficial_nao_e_confundida_com_demo(candidatos):
    with SessionLocal() as db:
        registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA)
        oficial = ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="b" * 64)
        assert registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=oficial) == 1
        assert listar(db, busca=candidatos[0].numero).itens[0].origem == "siconv_oficial"


def test_lote_invalido_reverte_primeiro_candidato(candidatos):
    invalido = candidatos[1].model_copy(update={"evidencias": ()})
    with SessionLocal() as db:
        with pytest.raises(ValidationError, match="evidência"):
            registrar_descoberta(db=db, candidatos=[candidatos[0], invalido], referencia=REFERENCIA)
        assert listar(db, busca=candidatos[0].numero).total == 0
        with pytest.raises(ValidationError, match="duplicados"):
            registrar_descoberta(db=db, candidatos=[candidatos[0], candidatos[0]], referencia=REFERENCIA)


def test_identidades_divergentes_nao_sobrescrevem_historico(candidatos):
    with SessionLocal() as db:
        registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA)
        divergente = candidatos[0].model_copy(update={"id_proposta": candidatos[1].id_proposta})
        with pytest.raises(ConflictError):
            registrar_descoberta(db=db, candidatos=[divergente], referencia=REFERENCIA)
        mesma_proposta = candidatos[1].model_copy(update={"id_proposta": candidatos[0].id_proposta})
        with pytest.raises(ConflictError):
            registrar_descoberta(db=db, candidatos=[mesma_proposta], referencia=REFERENCIA)
        assert listar(db, busca=candidatos[0].numero).itens[0].id_proposta == candidatos[0].id_proposta


def test_dois_lotes_concorrentes_nao_duplicam_captura(candidatos):
    def gravar():
        with SessionLocal() as db:
            return registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA)

    with ThreadPoolExecutor(max_workers=2) as executor:
        resultados = list(executor.map(lambda _: gravar(), range(2)))
    assert sorted(resultados) == [0, 1]


def test_paginacao_filtro_literal_e_confirmacao(candidatos):
    with SessionLocal() as db:
        registrar_descoberta(db=db, candidatos=candidatos, referencia=REFERENCIA)
        ids = {listar(db, busca=c.numero).itens[0].id for c in candidatos}
        pagina = listar(db, tamanho=2)
        assert pagina.total >= 3 and len(pagina.itens) == 2
        assert len(ids) == 3 and listar(db, busca="%").total == 0
        assert listar(db, busca=candidatos[0].numero, confirmacao="confirmado").total == 1
        assert listar(db, busca=candidatos[0].numero, confirmacao="nao_consultado").total == 0
        assert listar(db, busca=candidatos[0].numero, pagina=2, tamanho=1).itens == []


def test_convenio_incluido_na_carteira_sai_da_fila_sem_apagar_candidato(candidatos):
    with SessionLocal() as db:
        registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA)
        convenio = Convenio(
            numero=candidatos[0].numero, convenente_nome="Instituição sintética", tipo_contratacao="Convênio"
        )
        db.add(convenio)
        db.flush()
        assert listar(db, busca=candidatos[0].numero).total == 0
        assert registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA) == 0
        db.delete(convenio)
        db.commit()


@pytest.mark.parametrize(
    "estado,data", [("inventado", None), ("confirmado", None), ("nao_consultado", date(2026, 10, 1))]
)
def test_banco_rejeita_estado_ou_publicacao_inconsistentes(candidatos, estado, data):
    with SessionLocal() as db:
        registrar_descoberta(db=db, candidatos=[candidatos[0]], referencia=REFERENCIA)
        item = listar(db, busca=candidatos[0].numero).itens[0]
        with pytest.raises(IntegrityError), db.begin_nested():
            db.add(
                CandidatoLegadoCaptura(
                    candidato_id=item.id,
                    confirmacao_portal=estado,
                    data_publicacao=data,
                    origem="snapshot_local",
                    referencia_snapshot="a" * 64,
                    hash_conteudo="b" * 64,
                )
            )
            db.flush()


def test_rota_exige_sessao_valida_filtros_e_nao_expoe_payload_cru(candidatos, headers_autenticados):
    with SessionLocal() as db:
        registrar_descoberta(
            db=db,
            candidatos=[candidatos[0]],
            referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="c" * 64),
        )
    cliente = TestClient(app)
    assert cliente.get("/candidatos-legados").status_code == 401
    for params in ({"pagina": 0}, {"tamanho_pagina": 51}, {"confirmacao": "inventado"}):
        assert cliente.get("/candidatos-legados", params=params, headers=headers_autenticados).status_code == 422
    resposta = cliente.get("/candidatos-legados", params={"busca": candidatos[0].numero}, headers=headers_autenticados)
    assert resposta.status_code == 200 and resposta.json()["total"] == 1
    item = resposta.json()["itens"][0]
    assert item["confirmacao_portal"] == "confirmado" and "hash_conteudo" not in item
    assert "dados_portal" not in item
