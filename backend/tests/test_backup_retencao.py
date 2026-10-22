"""Política de nomeação, retenção e atraso dos backups; sem rede, banco ou credencial."""

import json
from datetime import datetime, timedelta, timezone

import pytest

from scripts import backup_retencao as b

AGORA = datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc)


def objeto(dias_atras: float, ident: int, *, hash_: bool = True, tamanho: int = 1000) -> list[b.ObjetoBackup]:
    momento = AGORA - timedelta(days=dias_atras)
    chave = b.chave_dump(momento, str(ident))
    itens = [b.ObjetoBackup(chave, momento, tamanho)]
    if hash_:
        itens.append(b.ObjetoBackup(chave + ".sha256", momento, 90))
    return itens


def test_chave_usa_utc_data_hora_e_execucao():
    # Arrange: horário em Brasília deve virar UTC na chave.
    local = datetime(2026, 10, 22, 23, 30, 5, tzinfo=timezone(timedelta(hours=-3)))
    # Act / Assert
    assert b.chave_dump(local, "42") == "sigeo/producao/2026/10/23/sigeo-20261023T023005Z-42.dump.age"


@pytest.mark.parametrize("agora,execucao", [(datetime(2026, 10, 22), "1"), (AGORA, "abc"), (AGORA, "")])
def test_chave_recusa_entrada_invalida(agora, execucao):
    with pytest.raises(ValueError):
        b.chave_dump(agora, execucao)


def test_listagem_ignora_arquivos_fora_do_padrao():
    # Arrange: objeto alheio ao fluxo nunca pode ser candidato a exclusão.
    chave = b.chave_dump(AGORA, "7")
    documento = {
        "Contents": [
            {"Key": chave, "LastModified": "2026-10-22T11:00:00.000Z", "Size": 10},
            {"Key": "sigeo/producao/leia-me.txt", "LastModified": "2020-01-01T00:00:00.000Z", "Size": 1},
            {"Key": "outro/2026/10/22/sigeo-x.dump.age", "LastModified": "2020-01-01T00:00:00.000Z", "Size": 1},
        ]
    }
    # Act / Assert
    assert [o.chave for o in b.interpretar_listagem(documento)] == [chave]
    assert b.interpretar_listagem({}) == []


def test_atraso_exige_dump_com_hash_e_nao_vazio():
    limite = timedelta(hours=24)
    assert b.backup_atrasado([], AGORA, limite)[0]
    assert b.backup_atrasado(objeto(0.1, 1, hash_=False), AGORA, limite)[0]
    assert b.backup_atrasado(objeto(0.1, 1, tamanho=0), AGORA, limite)[0]
    assert not b.backup_atrasado(objeto(0.1, 1), AGORA, limite)[0]


def test_atraso_usa_o_mais_recente_valido_e_respeita_o_limite():
    limite = timedelta(hours=24)
    antigo = objeto(3, 1)
    recente_sem_hash = objeto(0.05, 2, hash_=False)
    assert b.backup_atrasado(antigo + recente_sem_hash, AGORA, limite)[0]
    assert not b.backup_atrasado(objeto(23.9 / 24, 3), AGORA, limite)[0]
    assert b.backup_atrasado(objeto(25 / 24, 4), AGORA, limite)[0]


def test_expiracao_apaga_apenas_antigos_e_preserva_os_mais_recentes():
    # Arrange: 4 backups; só o de 9 dias passou de 7 e há 3 mais novos.
    objetos = objeto(0.5, 1) + objeto(1.5, 2) + objeto(5, 3) + objeto(9, 4)
    # Act
    apagar = b.selecionar_expirados(objetos, AGORA, timedelta(days=7), minimo_validos=3)
    # Assert
    chave_velha = b.chave_dump(AGORA - timedelta(days=9), "4")
    assert apagar == sorted([chave_velha, chave_velha + ".sha256"])


def test_expiracao_nunca_deixa_menos_que_o_minimo_mesmo_com_tudo_velho():
    # Arrange: falha prolongada; tudo passou de 7 dias.
    objetos = objeto(20, 1) + objeto(21, 2) + objeto(22, 3) + objeto(30, 4)
    # Act
    apagar = b.selecionar_expirados(objetos, AGORA, timedelta(days=7), minimo_validos=3)
    # Assert: só o quarto (o mais velho) sai.
    chave_velha = b.chave_dump(AGORA - timedelta(days=30), "4")
    assert apagar == sorted([chave_velha, chave_velha + ".sha256"])


def test_expiracao_remove_resto_de_upload_incompleto_so_depois_da_retencao():
    objetos = objeto(0.5, 1) + objeto(1, 2) + objeto(2, 3) + objeto(9, 8, hash_=False) + objeto(2, 9, hash_=False)
    apagar = b.selecionar_expirados(objetos, AGORA, timedelta(days=7), minimo_validos=3)
    assert apagar == [b.chave_dump(AGORA - timedelta(days=9), "8")]


def test_expiracao_sem_objetos_nao_apaga_nada():
    assert b.selecionar_expirados([], AGORA, timedelta(days=7), 3) == []


def test_cli_atraso_e_expirados_usam_a_listagem(tmp_path, capsys):
    # Arrange: dump recente com hash.
    chave = b.chave_dump(datetime.now(timezone.utc) - timedelta(hours=1), "5")
    agora = datetime.now(timezone.utc) - timedelta(hours=1)
    iso = agora.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    arquivo = tmp_path / "lista.json"
    arquivo.write_text(
        json.dumps(
            {
                "Contents": [
                    {"Key": chave, "LastModified": iso, "Size": 10},
                    {"Key": chave + ".sha256", "LastModified": iso, "Size": 10},
                ]
            }
        ),
        encoding="utf-8",
    )
    # Act / Assert
    assert b.main(["atraso", "--listagem", str(arquivo)]) == 0
    assert b.main(["expirados", "--listagem", str(arquivo)]) == 0
    assert capsys.readouterr().out == ""
    assert b.main(["expirados", "--listagem", str(arquivo), "--dias", "0"]) == 2
