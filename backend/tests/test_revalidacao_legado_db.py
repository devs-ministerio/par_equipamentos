"""Revalidação real em PostgreSQL; só download/HTTP externos são substituídos."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Convenio, FonteCaptura, InstrumentoEquipamento, Notificacao
from app.db.models_legado import CandidatoLegadoCaptura, CandidatoLegadoDecisao, CandidatoLegadoRegistro
from app.domain_errors import ConflictError, NotFoundError
from app.schemas_legado import DecisaoLegadoCreate, ReferenciaDescoberta
from app.schemas_revalidacao_legado import FONTES_ESCOPO, EscopoLegadoColetado
from app.services.aprovacao_legado import aprovar_entrada
from app.services.candidatos_legados import listar_candidatos, registrar_descoberta
from app.services.decisoes_legado import registrar_decisao
from app.services.revalidacao_legado import preparar_revalidacao, registrar_inelegibilidade
from scripts.job_revalidacao_legado_local import revalidar_candidato
from tests.test_coletar_recaptura_legado import csv_zip
from tests.test_coletar_recaptura_legado import fontes as fontes
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import candidato
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_radar_append_only_recuperado_db import historico_protegido as historico_protegido
from tests.test_radar_runtime_restrito_db import runtime as runtime
from tests.test_recapturas_legado_service_db import preparar
from tests.test_revisao_legado_recuperada_db import preparar_prova


def prova(dados):
    return EscopoLegadoColetado.model_validate(
        dict(
            iniciado_em=datetime.now(UTC),
            convenio=dados["convenio"],
            proposta=dados["proposta"],
            itens=dados["itens"],
            programas=dados["programas"]["catalogo"],
            vinculos=dados["programas"]["vinculos"],
            hashes={fonte: "a" * 64 for fonte in FONTES_ESCOPO},
            payload_protegido_local=True,
        )
    )


def contar(db, modelo):
    return db.scalar(select(func.count()).select_from(modelo))


def alvo_preparado(db, dados):
    referencia, *_ = preparar(db, dados)
    alvo = preparar_revalidacao(db=db, candidato_id=referencia.candidato_id)
    assert not db.in_transaction()
    return alvo


def test_inelegibilidade_append_only_retira_fila_sem_rejeitar_nem_notificar(matriz, dados):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    anterior = db.get(CandidatoLegadoCaptura, alvo.captura_id).hash_conteudo
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso de capacitação em acelerador linear"
    escopo = prova(dados)
    # Act
    nova_id = registrar_inelegibilidade(db=db, alvo=alvo, escopo=escopo)
    replay = registrar_inelegibilidade(db=db, alvo=alvo, escopo=escopo)
    # Assert
    assert replay == nova_id != alvo.captura_id
    assert contar(db, CandidatoLegadoCaptura) == 2 and contar(db, FonteCaptura) == 1
    assert db.get(CandidatoLegadoCaptura, alvo.captura_id).hash_conteudo == anterior
    nova = db.get(CandidatoLegadoCaptura, nova_id)
    assert nova.elegivel is False and nova.motivo_inelegibilidade == "fora_recorte_oficial"
    rodada = db.get(FonteCaptura, nova.fonte_captura_id)
    assert rodada.status == "ok" and rodada.detalhes["escopo_oficial"] == escopo.model_dump(mode="json")
    pagina = listar_candidatos(db=db, pagina=1, tamanho=10, busca=None, confirmacao=None)
    assert pagina.total == pagina.novos == 0
    assert contar(db, CandidatoLegadoDecisao) == contar(db, Notificacao) == 0
    assert contar(db, Convenio) == contar(db, InstrumentoEquipamento) == 1


@pytest.mark.parametrize(
    "defeito", ["elegivel", "vazia", "fonte_omitida", "hash", "identidade", "expirada", "futura", "catalogo_omitido"]
)
def test_prova_invalida_ou_positiva_preserva_fila(matriz, dados, defeito):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    pacote = prova(dados).model_dump()
    if defeito != "elegivel":
        pacote["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    if defeito == "vazia":
        pacote["itens"] = []
    if defeito == "fonte_omitida":
        pacote["hashes"].pop("siconv_proposta")
    if defeito == "hash":
        pacote["hashes"]["siconv_proposta"] = "invalido"
    if defeito == "identidade":
        pacote["convenio"]["NR_CONVENIO"] = "999002"
    if defeito == "expirada":
        pacote["iniciado_em"] = datetime.now(UTC) - timedelta(hours=25)
    if defeito == "futura":
        pacote["iniciado_em"] = datetime.now(UTC) + timedelta(minutes=1)
    if defeito == "catalogo_omitido":
        pacote.pop("programas")
    # Act / Assert: model_copy não contorna a revalidação do Service.
    with pytest.raises((ValidationError, ConflictError)):
        registrar_inelegibilidade(db=db, alvo=alvo, escopo=EscopoLegadoColetado.model_validate(pacote))
    assert db.get(CandidatoLegadoRegistro, alvo.candidato_id).ultima_captura_id == alvo.captura_id
    assert contar(db, CandidatoLegadoCaptura) == 1 and contar(db, FonteCaptura) == 0


def test_decisao_encerrada_preservada_e_impede_ocultacao(matriz, dados):
    # Arrange
    db, usuarios, *_ = matriz
    alvo = alvo_preparado(db, dados)
    registrar_decisao(
        db=db,
        usuario=usuarios["admin"],
        candidato_id=alvo.candidato_id,
        dados=DecisaoLegadoCreate(
            acao="rejeitar", chave=uuid4(), captura_id=alvo.captura_id, versao=0, justificativa="Análise técnica"
        ),
    )
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    # Act / Assert
    with pytest.raises(ConflictError, match="encerrada"):
        registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    assert contar(db, CandidatoLegadoDecisao) == 1 and contar(db, FonteCaptura) == 0


def test_concorrencia_mesma_prova_cria_uma_captura(matriz, dados):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    dados["itens"][0]["DESCRICAO_ITEM"] = "Consultoria de acelerador de negócios"
    escopo = prova(dados)
    bind = db.get_bind()
    barreira = Barrier(2)

    def executar():
        with Session(bind) as sessao:
            barreira.wait(timeout=10)
            return registrar_inelegibilidade(db=sessao, alvo=alvo, escopo=escopo)

    # Act
    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(pool.map(lambda _: executar(), range(2)))
    # Assert
    assert resultados[0] == resultados[1]
    assert contar(db, CandidatoLegadoCaptura) == 2 and contar(db, FonteCaptura) == 1


def test_worker_cinco_fontes_sem_portal_financeiro_ou_transacao_na_rede(matriz, dados, fontes, monkeypatch):
    # Arrange
    from scripts import coletar_recaptura_legado as coletor

    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    arquivos, chamadas, caches, _ = fontes
    arquivos["siconv_plano_aplicacao"] = csv_zip(
        [
            {
                "ID_PROPOSTA": "111001",
                "ID_ITEM_PAD": "1",
                "DESCRICAO_ITEM": "Curso sobre acelerador linear. contato pessoa@example.org",
            }
        ],
        ["ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"],
    )
    baixar = coletor._baixar_zip

    def observar(*args, **kwargs):
        assert not db.in_transaction()
        return baixar(*args, **kwargs)

    monkeypatch.setattr(coletor, "_baixar_zip", observar)
    # Act
    novo = revalidar_candidato(db=db, candidato_id=alvo.candidato_id, fabrica_sessao=sessionmaker(bind=db.get_bind()))
    # Assert
    assert set(chamadas) == FONTES_ESCOPO and len(chamadas) == 5
    assert all(not cache.exists() for cache in caches)
    registro = db.get(CandidatoLegadoCaptura, novo)
    rodada = db.get(FonteCaptura, registro.fonte_captura_id)
    assert "pessoa@example.org" not in str(rodada.detalhes)
    assert registro.elegivel is False


def test_fonte_incompleta_preserva_fila_e_alerta_gerenciais_uma_vez(matriz, dados, fontes):
    # Arrange
    db, usuarios, *_ = matriz
    alvo = alvo_preparado(db, dados)
    arquivos, _, caches, _ = fontes
    arquivos["siconv_proposta"] = csv_zip([], ["ID_PROPOSTA", "COD_ORGAO_SUP"])
    fabrica = sessionmaker(bind=db.get_bind())
    # Act
    for _ in range(2):
        with pytest.raises(ConflictError, match="Identidade oficial ausente"):
            revalidar_candidato(db=db, candidato_id=alvo.candidato_id, fabrica_sessao=fabrica)
    # Assert
    assert contar(db, CandidatoLegadoCaptura) == 1 and contar(db, Notificacao) == 1
    assert list(db.scalars(select(FonteCaptura.status).order_by(FonteCaptura.id))) == ["erro", "erro"]
    assert db.get(CandidatoLegadoRegistro, alvo.candidato_id).ultima_captura_id == alvo.captura_id
    assert all(not cache.exists() for cache in caches)


def test_nova_descoberta_elegivel_pode_retornar_sem_blacklist(matriz, dados):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    negada = registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    dados["itens"][0]["DESCRICAO_ITEM"] = "Aquisição de mamógrafo com treinamento incluso"
    # Act
    registrar_descoberta(
        db=db,
        candidatos=[candidato(dados)],
        referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="f" * 64),
        notificar_novos=False,
    )
    # Assert
    registro = db.get(CandidatoLegadoRegistro, alvo.candidato_id)
    atual = db.get(CandidatoLegadoCaptura, registro.ultima_captura_id)
    assert atual.elegivel and atual.id != negada
    assert contar(db, CandidatoLegadoCaptura) == 3
    assert listar_candidatos(db=db, pagina=1, tamanho=10, busca=None, confirmacao=None).total == 1


def test_fila_inelegivel_nao_pode_receber_nova_decisao_humana(matriz, dados):
    # Arrange
    db, usuarios, *_ = matriz
    alvo = alvo_preparado(db, dados)
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    captura_id = registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    # Act / Assert
    with pytest.raises(ConflictError, match="Somente descobertas"):
        registrar_decisao(
            db=db,
            usuario=usuarios["admin"],
            candidato_id=alvo.candidato_id,
            dados=DecisaoLegadoCreate(
                acao="iniciar_analise", chave=uuid4(), captura_id=captura_id, versao=0, justificativa="Teste de fila"
            ),
        )
    assert contar(db, CandidatoLegadoDecisao) == 0


def test_captura_concorrente_preservada_sem_publicar_resultado_obsoleto(matriz, dados):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    novo = candidato(dados).model_copy(
        update={"evidencias": (candidato(dados).evidencias[0].model_copy(update={"id_item": "2"}),)}
    )
    registrar_descoberta(
        db=db,
        candidatos=[novo],
        referencia=ReferenciaDescoberta(origem="siconv_oficial", hash_snapshot="f" * 64),
        notificar_novos=False,
    )
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    # Act / Assert
    with pytest.raises(ConflictError, match="captura mudou"):
        registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    assert contar(db, CandidatoLegadoCaptura) == 2 and contar(db, FonteCaptura) == 0


def test_mutacao_da_colecao_hashes_nao_contorna_parse_do_service(matriz, dados):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    escopo = prova(dados)
    escopo.hashes.pop("siconv_proposta")
    # Act / Assert
    with pytest.raises(ValidationError, match="cinco fontes"):
        registrar_inelegibilidade(db=db, alvo=alvo, escopo=escopo)
    assert contar(db, FonteCaptura) == 0 and contar(db, CandidatoLegadoCaptura) == 1


def test_revalidacao_funciona_com_runtime_sem_privilegios_administrativos(runtime, dados):
    # Arrange
    db, *_ = runtime
    alvo = alvo_preparado(db, dados)
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    # Act
    nova_id = registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    # Assert
    assert db.get(CandidatoLegadoCaptura, nova_id).elegivel is False
    assert contar(db, CandidatoLegadoCaptura) == 2 and contar(db, FonteCaptura) == 1


def test_escopo_persistido_pode_ser_reparseado_sem_perder_datas(dados):
    # Arrange
    escopo = prova(dados)
    # Act
    reparseado = EscopoLegadoColetado.model_validate(escopo.model_dump(mode="json"))
    # Assert
    assert reparseado == escopo
    assert reparseado.convenio.DIA_ASSIN_CONV is not None
    assert reparseado.convenio.DIA_ASSIN_CONV.isoformat() == "2026-10-01"


@pytest.mark.parametrize("tipo", ["orgao_fora_ms", "obra"])
def test_criterio_canonico_rejeita_obra_ou_aquisicao_fora_ms(matriz, dados, tipo):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    if tipo == "orgao_fora_ms":
        dados["proposta"]["COD_ORGAO_SUP"] = "28000"
    else:
        dados["itens"][0]["DESCRICAO_ITEM"] = (
            "Construção de hospital com salas de tomografia e radioterapia com acelerador linear"
        )
    # Act
    id_nova = registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    # Assert
    assert db.get(CandidatoLegadoCaptura, id_nova).elegivel is False
    assert contar(db, Convenio) == contar(db, InstrumentoEquipamento) == 1


def test_aprovacao_concorrente_real_nao_e_desfeita_pela_revalidacao(matriz, dados):
    # Arrange: revisão começa antes da aprovação em outra conexão.
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    admin_id = usuarios["admin"].id
    alvo = preparar_revalidacao(db=db, candidato_id=ref.candidato_id)
    with Session(db.get_bind()) as concorrente:
        decisao = aprovar_entrada(db=concorrente, usuario_id=admin_id, candidato_id=ref.candidato_id, dados=pedido)
        decisao_id = decisao.id
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    # Act / Assert
    with pytest.raises(ConflictError, match="encerrada"):
        registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    assert db.get(CandidatoLegadoDecisao, decisao_id).situacao == "aprovado"
    assert contar(db, Convenio) == 2 and contar(db, InstrumentoEquipamento) == 1
    assert contar(db, CandidatoLegadoCaptura) == 1


@pytest.mark.parametrize(
    "defeito", ["id_invalido", "ausente", "sem_captura", "nao_oficial", "encerrado", "incorporado"]
)
def test_preflight_recusa_estado_improprio_antes_da_coleta(matriz, dados, defeito):
    # Arrange
    db, usuarios, *_ = matriz
    alvo = alvo_preparado(db, dados)
    identificador = alvo.candidato_id
    if defeito == "id_invalido":
        identificador = True
    elif defeito == "ausente":
        identificador = 999999
    elif defeito == "sem_captura":
        registro = CandidatoLegadoRegistro(numero="999002", id_proposta="111002")
        db.add(registro)
        db.commit()
        identificador = registro.id
    elif defeito == "nao_oficial":
        registrar_descoberta(
            db=db,
            candidatos=[candidato(dados)],
            referencia=ReferenciaDescoberta(origem="snapshot_local", hash_snapshot="e" * 64),
            notificar_novos=False,
        )
    elif defeito == "encerrado":
        registrar_decisao(
            db=db,
            usuario=usuarios["admin"],
            candidato_id=alvo.candidato_id,
            dados=DecisaoLegadoCreate(
                acao="rejeitar", chave=uuid4(), captura_id=alvo.captura_id, versao=0, justificativa="Revisão encerrada"
            ),
        )
    else:
        db.add(Convenio(numero=alvo.numero, tipo_contratacao="Convênio", convenente_nome="Instituição sintética"))
        db.commit()
    # Act / Assert
    with pytest.raises((ValueError, ConflictError, NotFoundError)):
        preparar_revalidacao(db=db, candidato_id=identificador)
    assert not db.in_transaction()
    assert contar(db, FonteCaptura) == 0


@pytest.mark.parametrize("defeito", ["ausente", "identidade", "nao_oficial", "incorporado"])
def test_publicacao_reconfere_estado_apos_download(matriz, dados, defeito):
    # Arrange
    db, *_ = matriz
    alvo = alvo_preparado(db, dados)
    if defeito == "ausente":
        alvo = alvo.model_copy(update={"candidato_id": 999999})
    elif defeito == "identidade":
        alvo = alvo.model_copy(update={"numero": "999002"})
        dados["convenio"]["NR_CONVENIO"] = "999002"
    elif defeito == "nao_oficial":
        registrar_descoberta(
            db=db,
            candidatos=[candidato(dados)],
            referencia=ReferenciaDescoberta(origem="snapshot_local", hash_snapshot="e" * 64),
            notificar_novos=False,
        )
        registro = db.get(CandidatoLegadoRegistro, alvo.candidato_id)
        alvo = alvo.model_copy(update={"captura_id": registro.ultima_captura_id})
    else:
        db.add(Convenio(numero=alvo.numero, tipo_contratacao="Convênio", convenente_nome="Instituição sintética"))
        db.commit()
    dados["itens"][0]["DESCRICAO_ITEM"] = "Curso sobre acelerador linear"
    # Act / Assert
    with pytest.raises((ConflictError, NotFoundError)):
        registrar_inelegibilidade(db=db, alvo=alvo, escopo=prova(dados))
    assert contar(db, FonteCaptura) == 0
