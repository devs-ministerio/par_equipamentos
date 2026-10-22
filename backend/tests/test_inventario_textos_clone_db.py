"""Exame real de JSON/texto, com provas e origem protegidas por snapshot."""

import pytest
from sqlalchemy import text

from scripts.inventario_textos_clone import inventariar_textos_clone
from scripts.transferencia_sintetica_recuperacao import integridade_tabelas
from tests.test_preflight_clone_recuperacao_db import banco_preflight as banco_preflight
from tests.test_transferencia_sintetica_recuperacao_db import bancos_transferencia as bancos_transferencia


def test_sinais_de_payload_texto_e_nome_nao_expoem_linhas(banco_preflight):
    conn = banco_preflight
    conn.execute(
        text("""INSERT INTO convenio (numero,convenente_nome,siconv_raw)
        VALUES ('999008','Instituição sintética',jsonb_build_object('itens',jsonb_build_array(
        jsonb_build_object('cpf','12345678900','email','pessoa@privado.invalid'))))""")
    )
    conn.execute(
        text("""INSERT INTO instrumento_equipamento (nr_convenio,nome_convenente,responsavel_execucao_nome)
        VALUES ('999008','Instituição sintética','Pessoa de Teste')""")
    )
    conn.commit()
    conn.execution_options(isolation_level="REPEATABLE READ", postgresql_readonly=True)
    antes = integridade_tabelas(conn)
    resultado = inventariar_textos_clone(conn)
    campos = {(c.tabela, c.coluna): c for c in resultado}
    assert campos["convenio", "siconv_raw"].linhas_com_sinal == 1
    assert dict(campos["convenio", "siconv_raw"].sinais) == {"email": 1, "campo_pessoal_sem_marcador": 1}
    assert campos["instrumento_equipamento", "responsavel_execucao_nome"].linhas_com_sinal == 1
    assert "pessoa@privado.invalid" not in repr(resultado) and "Pessoa de Teste" not in repr(resultado)
    assert integridade_tabelas(conn) == antes


def test_prova_imutavel_e_examinada_sem_update_e_sem_trocar_hash(bancos_transferencia):
    origem, _, _, _, _ = bancos_transferencia
    antes = integridade_tabelas(origem)
    campos = {(c.tabela, c.coluna): c for c in inventariar_textos_clone(origem)}
    assert campos["candidato_legado_recaptura", "payload_oficial"].linhas_examinadas == 1
    assert integridade_tabelas(origem) == antes


def test_inventario_recusa_conexao_com_escrita(banco_preflight):
    with pytest.raises(ValueError, match="read-only"):
        inventariar_textos_clone(banco_preflight)
