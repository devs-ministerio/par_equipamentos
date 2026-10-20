"""ZIP/HTTP sintéticos → coletor → Services → PostgreSQL real isolado."""

from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Convenio, FonteCaptura, InstrumentoEquipamento, Notificacao, NotificacaoDestinatario
from app.db.models_legado import (
    CandidatoLegadoCaptura,
    CandidatoLegadoDecisao,
    CandidatoLegadoRecaptura,
    CandidatoLegadoRegistro,
)
from app.domain_errors import ConflictError, NotFoundError
from scripts import coletar_recaptura_legado as coletor
from scripts.job_recaptura_legado_local import recapturar_candidato
from tests.test_coletar_recaptura_legado import csv_zip
from tests.test_coletar_recaptura_legado import fontes as fontes
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_recapturas_legado_service_db import preparar


def rodar(db, candidato_id):
    return recapturar_candidato(db=db, candidato_id=candidato_id, fabrica_sessao=sessionmaker(bind=db.get_bind()))


def contar(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


def test_coleta_publica_prova_sem_aprovar_e_sem_transacao_durante_rede(matriz, dados, fontes, monkeypatch):
    db, *_ = matriz
    ref, _, _ = preparar(db, dados)
    baixar = coletor._baixar_zip

    def download_sem_transacao(*args, **kwargs):
        assert not db.in_transaction()
        return baixar(*args, **kwargs)

    monkeypatch.setattr(coletor, "_baixar_zip", download_sem_transacao)
    resultado = rodar(db, ref.candidato_id)
    prova = db.get(CandidatoLegadoRecaptura, resultado.id)
    assert prova is not None and prova.payload_oficial["convenio"]["NR_CONVENIO"] == "999001"
    assert contar(db, FonteCaptura) == contar(db, CandidatoLegadoRecaptura) == 1
    assert contar(db, Convenio) == contar(db, InstrumentoEquipamento) == 1
    assert contar(db, CandidatoLegadoDecisao) == contar(db, Notificacao) == 0


def test_falha_preserva_prova_anterior_registra_rodada_e_deduplica_alerta(matriz, dados, fontes):
    db, usuarios, *_ = matriz
    ref, _, _ = preparar(db, dados)
    primeira = rodar(db, ref.candidato_id)
    arquivos, *_ = fontes
    arquivos["siconv_pagamento"] = csv_zip([], ["NR_CONVENIO"])
    for _ in range(2):
        with pytest.raises(ValueError, match="colunas obrigatórias"):
            rodar(db, ref.candidato_id)
    assert contar(db, CandidatoLegadoRecaptura) == 1
    assert db.get(CandidatoLegadoRecaptura, primeira.id).hash_conteudo == primeira.hash_conteudo
    assert list(db.scalars(select(FonteCaptura.status).order_by(FonteCaptura.id))) == ["ok", "erro", "erro"]
    assert contar(db, Notificacao) == 1
    destinatarios = set(db.scalars(select(NotificacaoDestinatario.usuario_id)))
    assert destinatarios == {usuarios["admin"].id, usuarios["gestor"].id}
    assert contar(db, Convenio) == contar(db, InstrumentoEquipamento) == 1


def test_decisao_durante_download_impede_publicacao_sem_falso_alerta_de_fonte(matriz, dados, fontes, monkeypatch):
    db, usuarios, *_ = matriz
    ref, _, _ = preparar(db, dados)
    baixar = coletor._baixar_zip
    fabrica = sessionmaker(bind=db.get_bind())

    def rejeitar_na_consulta(nome, **kwargs):
        if nome == "siconv_pagamento":
            with fabrica() as concorrente:
                concorrente.add(
                    CandidatoLegadoDecisao(
                        candidato_id=ref.candidato_id,
                        captura_id=ref.captura_id,
                        usuario_id=usuarios["admin"].id,
                        chave=uuid4(),
                        situacao_anterior="novo",
                        situacao="rejeitado",
                        justificativa="Revisão sintética concorrente",
                    )
                )
                concorrente.commit()
        return baixar(nome, **kwargs)

    # Materializar IDs antes de iniciar o ensaio; o Service termina a leitura.
    _ = usuarios["admin"].id
    db.rollback()
    monkeypatch.setattr(coletor, "_baixar_zip", rejeitar_na_consulta)
    with pytest.raises(ConflictError, match="encerrada"):
        rodar(db, ref.candidato_id)
    assert contar(db, CandidatoLegadoRecaptura) == contar(db, FonteCaptura) == contar(db, Notificacao) == 0
    assert contar(db, CandidatoLegadoDecisao) == 1


def test_nova_coleta_mantem_historico_append_only(matriz, dados, fontes):
    db, *_ = matriz
    ref, _, _ = preparar(db, dados)
    primeira = rodar(db, ref.candidato_id)
    segunda = rodar(db, ref.candidato_id)
    assert primeira.id != segunda.id and primeira.hash_conteudo == segunda.hash_conteudo
    assert contar(db, FonteCaptura) == contar(db, CandidatoLegadoRecaptura) == 2
    assert contar(db, Convenio) == contar(db, InstrumentoEquipamento) == 1


def test_candidato_inexistente_falha_antes_da_rede(matriz, fontes):
    db, *_ = matriz
    with pytest.raises(NotFoundError):
        rodar(db, 999999)
    assert fontes[1] == [] and contar(db, FonteCaptura) == 0


@pytest.mark.parametrize(
    "campo,valor",
    [
        ("origem", "snapshot_local"),
        ("criterio_escopo", "prioritarios_ms_v1"),
    ],
)
def test_descoberta_sem_prova_de_escopo_vigente_nao_inicia_download(matriz, dados, fontes, campo, valor):
    db, *_ = matriz
    ref, _, _ = preparar(db, dados)
    captura = db.get(CandidatoLegadoCaptura, ref.captura_id)
    assert captura is not None
    setattr(captura, campo, valor)
    db.commit()
    with pytest.raises(ConflictError):
        rodar(db, ref.candidato_id)
    assert fontes[1] == [] and contar(db, FonteCaptura) == 0


@pytest.mark.parametrize("defeito", ["sem_captura", "sem_portal", "encerrado"])
def test_preflight_bloqueia_pendencia_ou_decisao_sem_chamar_fonte(matriz, dados, fontes, defeito):
    db, usuarios, *_ = matriz
    ref, _, _ = preparar(db, dados)
    if defeito == "sem_captura":
        registro = db.get(CandidatoLegadoRegistro, ref.candidato_id)
        assert registro is not None
        registro.ultima_captura_id = None
    elif defeito == "sem_portal":
        captura = db.get(CandidatoLegadoCaptura, ref.captura_id)
        assert captura is not None
        captura.confirmacao_portal = "nao_encontrado"
        captura.data_publicacao = None
    else:
        db.add(
            CandidatoLegadoDecisao(
                candidato_id=ref.candidato_id,
                captura_id=ref.captura_id,
                usuario_id=usuarios["gestor"].id,
                chave=uuid4(),
                situacao_anterior="novo",
                situacao="rejeitado",
                justificativa="Revisão sintética encerrada",
            )
        )
    db.commit()
    with pytest.raises(ConflictError):
        rodar(db, ref.candidato_id)
    assert fontes[1] == [] and contar(db, FonteCaptura) == contar(db, CandidatoLegadoRecaptura) == 0
