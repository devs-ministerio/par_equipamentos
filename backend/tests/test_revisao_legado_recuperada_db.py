"""Revisão SQL real da prova salva, sem aprovar ou inserir carteira."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Convenio, FonteCaptura, InstrumentoEquipamento, User, UserRole
from app.db.models_legado import CandidatoLegadoDecisao, CandidatoLegadoRecaptura
from app.domain_errors import AuthorizationError, ConflictError, NotFoundError
from app.schemas_aprovacao_legado import AprovacaoLegadoCreate
from app.services.recapturas_legado import registrar_recaptura
from app.services.revisao_legado import preparar_revisao
from tests.test_notificacoes_destinatarios_db import matriz as matriz
from tests.test_prova_recaptura_legado import dados as dados
from tests.test_recapturas_legado_service_db import preparar


def preparar_prova(db, dados, *, notificar_novos=False):
    referencia, captura, origem = preparar(db, dados, notificar_novos=notificar_novos)
    prova = registrar_recaptura(db=db, referencia=referencia, captura=captura, origem=origem)
    pedido = AprovacaoLegadoCreate(
        chave=uuid4(),
        captura_id=referencia.captura_id,
        recaptura_id=prova.id,
        hash_revisado=prova.hash_conteudo,
        versao=0,
        justificativa="Evidência revisada pela gestão",
    )
    return referencia, captura, origem, prova, pedido


@pytest.mark.parametrize("perfil", ["admin", "gestor"])
def test_revisao_jsonb_preserva_hash_e_nao_faz_commit_ou_inclusao(matriz, dados, perfil, monkeypatch):
    db, usuarios, *_ = matriz
    ref, _, _, prova, pedido = preparar_prova(db, dados)
    db.expire_all()

    def commit_proibido():
        raise AssertionError("Revisão não pode confirmar a aprovação")

    monkeypatch.setattr(db, "commit", commit_proibido)
    resultado = preparar_revisao(db=db, usuario_id=usuarios[perfil].id, candidato_id=ref.candidato_id, dados=pedido)
    assert resultado.recaptura_id == prova.id and resultado.hash_conteudo == prova.hash_conteudo
    assert resultado.situacao_anterior == "novo" and resultado.versao == 0
    assert resultado.projecao.situacao == "Em execução"
    assert db.scalar(select(func.count()).select_from(Convenio)) == 1
    assert db.scalar(select(func.count()).select_from(InstrumentoEquipamento)) == 1
    assert db.scalar(select(func.count()).select_from(CandidatoLegadoDecisao)) == 0


@pytest.mark.parametrize(
    "perfil", ["titular", "leitor", "inativo", "suspenso", "excluido", "admin_excluido", "gestor_inativo", "ausente"]
)
def test_perfil_sem_permissao_bloqueado_antes_de_consultar_candidato(matriz, dados, perfil):
    db, usuarios, *_ = matriz
    _, _, _, _, pedido = preparar_prova(db, dados)
    usuario_id = usuarios[perfil].id if perfil != "ausente" else 999999
    with pytest.raises(AuthorizationError):
        preparar_revisao(db=db, usuario_id=usuario_id, candidato_id=999999, dados=pedido)


@pytest.mark.parametrize("defeito", ["versao", "captura", "recaptura", "hash", "candidato"])
def test_pedido_obsoleto_ou_identidade_alheia_nao_prepara_aprovacao(matriz, dados, defeito):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    campo = {"captura": "captura_id", "recaptura": "recaptura_id", "hash": "hash_revisado", "versao": "versao"}
    if defeito != "candidato":
        pedido = pedido.model_copy(update={campo[defeito]: "0" * 64 if defeito == "hash" else 999999})
    with pytest.raises((ConflictError, NotFoundError)):
        preparar_revisao(
            db=db,
            usuario_id=usuarios["admin"].id,
            candidato_id=999999 if defeito == "candidato" else ref.candidato_id,
            dados=pedido,
        )


@pytest.mark.parametrize(
    "defeito",
    [
        "parcial",
        "fonte",
        "expirada",
        "futura",
        "invertida",
        "hashes",
        "origem",
        "payload",
        "payload_alterado",
        "hash_salvo",
        "situacao_salva",
        "valor_salvo",
    ],
)
def test_prova_adulterada_ou_rodada_invalida_recusada(matriz, dados, defeito):
    db, usuarios, *_ = matriz
    ref, _, _, prova, pedido = preparar_prova(db, dados)
    registro = db.get(CandidatoLegadoRecaptura, prova.id)
    rodada = db.get(FonteCaptura, prova.fonte_captura_id)
    if defeito == "parcial":
        rodada.status = "parcial"
    elif defeito == "fonte":
        rodada.fonte = "outra_fonte"
    elif defeito == "expirada":
        rodada.iniciado_em = datetime.now(UTC) - timedelta(hours=25)
    elif defeito == "futura":
        rodada.iniciado_em = datetime.now(UTC) + timedelta(hours=1)
    elif defeito == "invertida":
        rodada.finalizado_em = rodada.iniciado_em - timedelta(seconds=1)
    elif defeito in ("hashes", "origem"):
        detalhes = deepcopy(rodada.detalhes)
        if defeito == "hashes":
            del detalhes["hashes_filhas"]["pagamentos"]
        else:
            detalhes["iniciado_em"] = (rodada.iniciado_em - timedelta(seconds=1)).isoformat()
        rodada.detalhes = detalhes
    elif defeito in ("payload", "payload_alterado"):
        payload = deepcopy(registro.payload_oficial)
        if defeito == "payload":
            del payload["filhas"]
        else:
            payload["convenio"]["VL_GLOBAL_CONV"] = "2000"
        registro.payload_oficial = payload
    elif defeito == "hash_salvo":
        registro.hash_conteudo = "0" * 64
    elif defeito == "situacao_salva":
        registro.situacao = "Situação que não veio da fonte"
    else:
        registro.valor_global = 1
    db.commit()
    with pytest.raises(ConflictError):
        preparar_revisao(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    assert db.scalar(select(func.count()).select_from(Convenio)) == 1


def test_recaptura_mais_nova_exige_nova_revisao(matriz, dados):
    db, usuarios, *_ = matriz
    ref, captura, origem, _, pedido = preparar_prova(db, dados)
    registrar_recaptura(
        db=db, referencia=ref, captura=captura, origem=origem.model_copy(update={"iniciado_em": datetime.now(UTC)})
    )
    with pytest.raises(ConflictError, match="última recaptura"):
        preparar_revisao(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)


def test_numero_incorporado_por_outra_operacao_nao_pode_ser_sobrescrito(matriz, dados):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    db.add(Convenio(numero="999001", convenente_nome="Cadastro preservado"))
    db.commit()
    with pytest.raises(ConflictError, match="carteira"):
        preparar_revisao(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    assert db.scalar(select(Convenio.convenente_nome).where(Convenio.numero == "999001")) == "Cadastro preservado"


def test_rele_usuario_desautorizado_mesmo_com_objeto_antigo_na_session(matriz, dados):
    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    usuario_id = usuarios["admin"].id
    antigo = db.get(User, usuario_id)
    assert antigo.role == UserRole.admin
    with Session(db.get_bind()) as outra:
        usuario = outra.get(User, usuario_id)
        assert usuario is not None
        usuario.role = UserRole.leitor
        outra.commit()
    with pytest.raises(AuthorizationError):
        preparar_revisao(db=db, usuario_id=usuario_id, candidato_id=ref.candidato_id, dados=pedido)


@pytest.mark.parametrize("acao", ["iniciar_analise", "rejeitar"])
def test_estado_humano_e_versao_sao_revalidados(matriz, dados, acao):
    from app.schemas_legado import DecisaoLegadoCreate
    from app.services.decisoes_legado import registrar_decisao

    db, usuarios, *_ = matriz
    ref, _, _, _, pedido = preparar_prova(db, dados)
    decisao = registrar_decisao(
        db=db,
        usuario=usuarios["admin"],
        candidato_id=ref.candidato_id,
        dados=DecisaoLegadoCreate(
            acao=acao, chave=uuid4(), captura_id=ref.captura_id, versao=0, justificativa="Análise humana registrada"
        ),
    )
    with pytest.raises(ConflictError):
        preparar_revisao(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    pedido = pedido.model_copy(update={"versao": decisao.id})
    if acao == "rejeitar":
        with pytest.raises(ConflictError, match="encerrada"):
            preparar_revisao(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    else:
        resultado = preparar_revisao(
            db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido
        )
        assert resultado.situacao_anterior == "em_analise" and resultado.versao == decisao.id
