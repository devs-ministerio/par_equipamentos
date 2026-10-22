"""Entradas inseguras são rejeitadas antes de SQL, navegador ou envio."""

import sys

import pytest

from scripts.verificar_convite_navegador_local import main


@pytest.mark.parametrize(
    "app,caixa",
    [
        ("https://sigeo.example.com", "http://127.0.0.1:8002/enviar"),
        ("http://127.0.0.1:5181", "https://email.example.com/enviar"),
        ("http://localhost:5181", "http://127.0.0.1:8002/enviar"),
    ],
)
def test_enderecos_nao_autorizados_impedem_ensaio(tmp_path, monkeypatch, app, caixa):
    # Arrange: nenhum segredo/banco é necessário para rejeitar o destino.
    arquivo = tmp_path / "local.env"
    arquivo.write_text(f"APP_PUBLIC_URL={app}\nMAIL_API_URL={caixa}\n", encoding="utf-8")
    arquivo.chmod(0o600)
    monkeypatch.setattr(sys, "argv", ["verificar-convite", "--env", str(arquivo)])
    # Act / Assert
    with pytest.raises(ValueError, match="local"):
        main()


@pytest.mark.parametrize("tipo", ["publico", "symlink"])
def test_arquivo_inseguro_impede_ensaio(tmp_path, monkeypatch, tipo):
    # Arrange
    arquivo = tmp_path / "local.env"
    arquivo.write_text("APP_PUBLIC_URL=http://127.0.0.1:5181\n", encoding="utf-8")
    arquivo.chmod(0o644 if tipo == "publico" else 0o600)
    entrada = tmp_path / "atalho.env" if tipo == "symlink" else arquivo
    if tipo == "symlink":
        entrada.symlink_to(arquivo)
    monkeypatch.setattr(sys, "argv", ["verificar-convite", "--env", str(entrada)])
    # Act / Assert
    with pytest.raises(ValueError, match="0600"):
        main()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://sintetico@banco.example.com/sigeo_homologacao_clone_20000101",
        "postgresql+psycopg://sintetico@127.0.0.1/producao",
    ],
)
def test_banco_remoto_ou_fora_do_clone_impede_sql(tmp_path, monkeypatch, url):
    # Arrange: URLs da UI/caixa corretas não autorizam outro banco.
    arquivo = tmp_path / "local.env"
    arquivo.write_text(
        f"APP_PUBLIC_URL=http://127.0.0.1:5181\nMAIL_API_URL=http://127.0.0.1:8002/enviar\nDATABASE_URL={url}\n",
        encoding="utf-8",
    )
    arquivo.chmod(0o600)
    monkeypatch.setattr(sys, "argv", ["verificar-convite", "--env", str(arquivo)])
    # Act / Assert: preflight recusa antes de abrir conexão ou navegador.
    with pytest.raises(ValueError):
        main()
