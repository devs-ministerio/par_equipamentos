"""Conferência HTTP com sessão, PostgreSQL e gates reais; sem mock do domínio."""

from datetime import UTC, datetime, timedelta

import pytest

from app.db.models import FonteCaptura, User, UserRole
from tests.test_aprovacao_legado_http_db import (
    fluxo_aprovacao as fluxo_aprovacao,
)
from tests.test_aprovacao_legado_http_db import (
    postar,
    sem_inclusao,
)
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_radar_append_only_recuperado_db import historico_protegido as historico_protegido
from tests.test_radar_runtime_restrito_db import runtime as runtime


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_consulta_segura_repetivel_sem_decisao_ou_transacao_retida(fluxo_aprovacao, perfil):
    db, _, ref, prova, _, cliente = fluxo_aprovacao
    with cliente(perfil) as http:
        resposta = http.get(f"/candidatos-legados/{ref.candidato_id}/prova")
        assert resposta.status_code == 200
        resumo = resposta.json()
        assert set(resumo) == {
            "candidato_id",
            "captura_id",
            "recaptura_id",
            "hash_revisado",
            "versao",
            "numero",
            "situacao",
            "valor_global",
            "convenente_nome",
            "municipio",
            "uf",
            "capturado_em",
        }
        assert resumo["numero"] == "999001" and resumo["situacao"] == "Em execução"
        assert resumo["valor_global"] == "1000.50"
        assert resumo["hash_revisado"] == prova.hash_conteudo
        assert resumo["captura_id"] == ref.captura_id and resumo["recaptura_id"] == prova.id
        assert resumo["versao"] == 0
        datetime.fromisoformat(resumo["capturado_em"])
        assert not db.in_transaction()
        assert http.get(f"/candidatos-legados/{ref.candidato_id}/prova").json() == resumo
        assert not db.in_transaction()
    sem_inclusao(db)


@pytest.mark.parametrize("perfil,codigo", [(None, 401), ("titular", 403), ("leitor", 403)])
def test_sem_autorizacao_nao_consulta_prova_nem_revela_existencia(fluxo_aprovacao, perfil, codigo):
    db, _, ref, _, _, cliente = fluxo_aprovacao
    with cliente(perfil) as http:
        for identificador in (ref.candidato_id, 999999):
            assert http.get(f"/candidatos-legados/{identificador}/prova").status_code == codigo
    sem_inclusao(db)


@pytest.mark.parametrize("defeito", ["futura", "parcial"])
def test_rodada_invalida_nao_fornece_referencia_para_aprovacao(fluxo_aprovacao, defeito):
    db, _, ref, prova, _, cliente = fluxo_aprovacao
    rodada = db.get(FonteCaptura, prova.fonte_captura_id)
    if defeito == "parcial":
        rodada.status = "parcial"
    else:
        rodada.iniciado_em = datetime.now(UTC) + timedelta(hours=1)
    db.commit()
    with cliente("admin") as http:
        resposta = http.get(f"/candidatos-legados/{ref.candidato_id}/prova")
        assert resposta.status_code == 409 and "hash_revisado" not in resposta.json()
        assert not db.in_transaction()
    sem_inclusao(db)


def test_referencia_consultada_funciona_no_post_sem_upload_de_payload(fluxo_aprovacao):
    _, _, ref, _, pedido, cliente = fluxo_aprovacao
    with cliente("gestor") as http:
        resumo = http.get(f"/candidatos-legados/{ref.candidato_id}/prova").json()
        corpo = {chave: resumo[chave] for chave in ("captura_id", "recaptura_id", "hash_revisado", "versao")}
        corpo.update(
            chave=str(pedido.chave),
            justificativa="Conferência humana do resumo oficial",
            tecnico_titular_id=pedido.tecnico_titular_id,
        )
        resposta = postar(http, ref.candidato_id, corpo)
        assert resposta.status_code == 200 and resposta.json()["situacao"] == "aprovado"
        assert http.get(f"/candidatos-legados/{ref.candidato_id}/prova").status_code == 409


def test_perda_de_permissao_apos_login_impede_consulta(fluxo_aprovacao):
    db, usuarios, ref, _, _, cliente = fluxo_aprovacao
    with cliente("gestor") as http:
        db.get(User, usuarios["gestor"]).role = UserRole.leitor
        db.commit()
        assert http.get(f"/candidatos-legados/{ref.candidato_id}/prova").status_code == 403
    sem_inclusao(db)


@pytest.mark.parametrize("identificador,codigo", [(999999, 404), (0, 422), (-1, 422), ("texto", 422)])
def test_identificador_inexistente_ou_invalido(fluxo_aprovacao, identificador, codigo):
    _, _, _, _, _, cliente = fluxo_aprovacao
    with cliente("admin") as http:
        assert http.get(f"/candidatos-legados/{identificador}/prova").status_code == codigo
