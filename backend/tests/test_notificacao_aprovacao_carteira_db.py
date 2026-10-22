"""Aprovação interna → destinatários → contrato HTTP da central existente."""

import pytest
from fastapi.testclient import TestClient

from app.auth import require_current_user
from app.db.base import get_db
from app.db.models import InstrumentoEquipamento, Notificacao, NotificacaoTipo
from app.main import app
from app.repositories.notificacoes import criar_notificacao
from app.services.aprovacao_legado import aprovar_entrada
from app.services.notificacoes import listar_notificacoes
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_revisao_legado_recuperada_db import preparar_prova


def listar(db, usuario):
    return listar_notificacoes(
        db=db,
        usuario_id=usuario.id,
        limit=20,
        offset=0,
        apenas_nao_lidas=False,
        tipo=NotificacaoTipo.aprovacao_carteira,
    )


@pytest.mark.parametrize("perfil", ["admin", "gestor", "titular", "leitor", "admin_excluido", "gestor_inativo"])
def test_aviso_real_da_aprovacao_so_aparece_para_destinatarios_gerenciais(matriz, dados, perfil):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    aprovar_entrada(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    pagina = listar(db, usuarios[perfil])
    assert pagina.total == pagina.nao_lidas == (1 if perfil in ("admin", "gestor") else 0)
    if pagina.itens:
        assert pagina.itens[0].destino == "/monitoramento-equipamentos?busca=999001"
        assert pagina.itens[0].notificacao.tipo == NotificacaoTipo.aprovacao_carteira


def test_destino_usa_convenio_e_nao_instrumento_com_id_colidente(matriz, dados):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    decisao = aprovar_entrada(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    # As sequences independentes criam a mesma PK em entidades diferentes.
    instrumento = InstrumentoEquipamento(nr_convenio="777777", nome_convenente="Instituição sintética alheia")
    db.add(instrumento)
    db.commit()
    aviso = listar(db, usuarios["admin"]).itens[0]
    assert instrumento.id == aviso.notificacao.entidade_id
    assert aviso.destino == "/monitoramento-equipamentos?busca=999001"
    assert decisao.situacao == "aprovado"


def test_referencia_ausente_nao_inventa_link_para_instrumento(matriz):
    db, usuarios, *_ = matriz
    criar_notificacao(
        db,
        Notificacao(
            tipo=NotificacaoTipo.aprovacao_carteira,
            titulo="Aviso sintético antigo",
            entidade_id=999999,
        ),
    )
    db.commit()
    assert listar(db, usuarios["admin"]).itens[0].destino is None


def test_http_serializa_tipo_e_destino_da_aprovacao_sem_nova_rota(matriz, dados, monkeypatch):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    aprovar_entrada(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)

    def banco_sintetico():
        yield db

    # Autenticação substituída somente para testar o contrato de leitura,
    # não serve como prova de login/cookie/CSRF ou endpoint de aprovação.
    substituicoes = app.dependency_overrides.copy()
    substituicoes[get_db] = banco_sintetico
    substituicoes[require_current_user] = lambda: usuarios["admin"]
    monkeypatch.setattr(app, "dependency_overrides", substituicoes)
    with TestClient(app) as client:
        resposta = client.get("/notificacoes?tipo=aprovacao_carteira")
    assert resposta.status_code == 200
    pagina = resposta.json()
    assert pagina["total"] == pagina["nao_lidas"] == 1
    assert pagina["itens"][0]["tipo"] == "aprovacao_carteira"
    assert pagina["itens"][0]["destino"] == "/monitoramento-equipamentos?busca=999001"
    assert pagina["itens"][0]["lida"] is False
