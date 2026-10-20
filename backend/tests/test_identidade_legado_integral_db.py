"""Identidade textual coerente do dump à aprovação, sem fontes externas."""

from copy import deepcopy

import pytest
from psycopg import Error as DatabaseDriverError
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from alembic import command
from app.db.models import Convenio, Notificacao, NotificacaoTipo
from app.schemas_captura_legado import ConvenioRecapturado
from app.schemas_filhas_legado import RegistroFilho
from app.schemas_portal_legado import DimConvenioPortal
from app.schemas_prova_recaptura_legado import CapturaLegadoParaPromocao
from app.services.aprovacao_legado import aprovar_entrada
from app.services.descoberta_legado import ConvenioDump
from app.services.descoberta_prioritaria_ms import descobrir_prioritarios_ms
from tests.test_cadeia_migrations_recuperacao_db import banco_migrations as banco_migrations
from tests.test_fluxo_radar_schema_versionado_db import preparar_fluxo
from tests.test_fluxo_radar_schema_versionado_db import radar_versionado as radar_versionado
from tests.test_prova_recaptura_legado import dados as dados


@pytest.mark.parametrize("numero", ["999001", "000999001", "7ATEST"])
def test_mesma_identidade_textual_preservada_em_todos_contratos(numero):
    assert ConvenioDump(ID_PROPOSTA="111001", NR_CONVENIO=numero).NR_CONVENIO == numero
    assert RegistroFilho(NR_CONVENIO=numero).NR_CONVENIO == numero
    assert (
        ConvenioRecapturado(
            NR_CONVENIO=numero, ID_PROPOSTA="111001", SIT_CONVENIO="Em execução", VL_GLOBAL_CONV="0"
        ).NR_CONVENIO
        == numero
    )
    assert DimConvenioPortal(codigo=numero, numero=f"{numero}/2026", objeto="Aquisição").codigo == numero


@pytest.mark.parametrize("numero", ["7Atest", "7A-TEST", "7A/TEST", "7A TEST", "", "-999", "7ÁTEST"])
def test_identidade_invalida_nao_e_silenciosamente_corrigida(numero):
    for construtor in (
        lambda: ConvenioDump(ID_PROPOSTA="111001", NR_CONVENIO=numero),
        lambda: RegistroFilho(NR_CONVENIO=numero),
        lambda: ConvenioRecapturado(
            NR_CONVENIO=numero, ID_PROPOSTA="111001", SIT_CONVENIO="Em execução", VL_GLOBAL_CONV="0"
        ),
        lambda: DimConvenioPortal(codigo=numero, numero="Identificação oficial", objeto="Aquisição"),
    ):
        with pytest.raises(ValidationError):
            construtor()


def test_alfa_fora_do_recorte_nao_interrompe_descoberta_nem_burla_criterios(dados):
    outros = []
    propostas = [dados["proposta"]]
    itens = dados["itens"].copy()
    for indice, motivo in enumerate(("outro_orgao", "sem_publicacao", "obra"), start=1):
        proposta = str(111001 + indice)
        convenio = {**dados["convenio"], "NR_CONVENIO": f"7ATEST{indice}", "ID_PROPOSTA": proposta}
        if motivo == "sem_publicacao":
            convenio["DIA_PUBL_CONV"] = ""
        outros.append(convenio)
        propostas.append({"ID_PROPOSTA": proposta, "COD_ORGAO_SUP": "51000" if motivo == "outro_orgao" else "36000"})
        itens.append(
            {
                "ID_PROPOSTA": proposta,
                "ID_ITEM_PAD": str(indice + 1),
                "DESCRICAO_ITEM": "Construção de hospital com sala de mamografia"
                if motivo == "obra"
                else "Aquisição de mamógrafo",
            }
        )
    encontrados = descobrir_prioritarios_ms(
        convenios=outros + [dados["convenio"]],
        propostas=propostas,
        itens=itens,
        programas=[],
        vinculos=[],
        conhecidos=set(),
    )
    assert [c.numero for c in encontrados] == ["999001"]


@pytest.mark.parametrize("campo", ["portal", "filha"])
def test_letras_nao_autorizam_cruzamento_com_outra_identidade(dados, campo):
    dados["convenio"]["NR_CONVENIO"] = "7ATEST"
    dados["portal"]["dimConvenio"]["codigo"] = "7ATEST"
    if campo == "portal":
        dados["portal"]["dimConvenio"]["codigo"] = "999001"
    else:
        dados["filhas"]["pagamentos"] = [{"NR_CONVENIO": "7AOUTRO", "NR_MOV_FIN": "1", "VL_PAGO": "10"}]
    with pytest.raises(ValidationError):
        CapturaLegadoParaPromocao.model_validate(dados)


def test_aprovacao_versionada_preserva_letras_em_fonte_carteira_e_aviso(radar_versionado, dados):
    db, usuarios = radar_versionado
    dados["convenio"]["NR_CONVENIO"] = "7ATEST"
    dados["portal"]["dimConvenio"]["codigo"] = "7ATEST"
    dados["portal"]["dimConvenio"]["numero"] = "7ATEST/2026"
    dados["filhas"]["pagamentos"] = [{"NR_CONVENIO": "7ATEST", "NR_MOV_FIN": "1", "VL_PAGO": "10,50"}]
    original = deepcopy(dados)
    ref, _, pedido = preparar_fluxo(db, dados)
    resultado = aprovar_entrada(db=db, usuario_id=usuarios["admin"].id, candidato_id=ref.candidato_id, dados=pedido)
    assert resultado.situacao == "aprovado"
    convenio = db.scalar(select(Convenio))
    assert convenio.numero == "7ATEST" and convenio.numero_instrumento == "7ATEST/2026"
    assert convenio.siconv_raw["pagamentos"][0]["NR_CONVENIO"] == "7ATEST"
    aviso = db.scalar(select(Notificacao).where(Notificacao.tipo == NotificacaoTipo.aprovacao_carteira))
    assert "7ATEST" in aviso.titulo and dados == original


def test_migration_preserva_numericos_restringe_down_e_reaplica(banco_migrations):
    conn, config = banco_migrations
    command.upgrade(config, "a6e24b7f5d39")
    conn.execute(text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('000999001','111001')"))
    conn.commit()
    command.upgrade(config, "head")
    assert conn.scalar(text("SELECT numero FROM candidato_legado")) == "000999001"
    conn.commit()
    command.downgrade(config, "a6e24b7f5d39")
    with pytest.raises(DBAPIError) as erro, conn.begin_nested():
        conn.execute(text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('7ATEST','111002')"))
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conn.commit()
    command.upgrade(config, "head")
    conn.execute(text("INSERT INTO candidato_legado (numero,id_proposta) VALUES ('7ATEST','111002')"))
    conn.commit()
    with pytest.raises(DBAPIError, match="preserve identidades") as erro:
        command.downgrade(config, "a6e24b7f5d39")
    assert isinstance(erro.value.orig, DatabaseDriverError)
    assert erro.value.orig.sqlstate == "23514"
    conn.rollback()
    assert list(conn.scalars(text("SELECT numero FROM candidato_legado ORDER BY numero"))) == ["000999001", "7ATEST"]
    assert conn.scalar(text("SELECT version_num FROM alembic_version")) == "b7f35c806e4a"
