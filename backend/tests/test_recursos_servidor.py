"""Só interfaces de kernel/arquivo são substituídas, não a medição testada."""

from pathlib import Path
from types import SimpleNamespace

import pytest

from tests import recursos_servidor


def test_linux_usa_pico_pos_exec_e_converte_kb_para_bytes(monkeypatch):
    # Given: kernel informa pico do novo processo, não máximo herdado do pai.
    monkeypatch.setattr(Path, "read_text", lambda *_args, **_kwargs: "Name: servidor\nVmHWM:\t1234 kB\n")
    # When / Then
    assert recursos_servidor.pico_rss_servidor(plataforma="linux") == (1234 * 1024, "proc_vm_hwm_pos_exec")


@pytest.mark.parametrize("status", ["VmRSS: 1234 kB", "VmHWM: 1234 bytes"])
def test_linux_sem_pico_ou_unidade_validada_nao_inventa_fallback(monkeypatch, status):
    # Given
    monkeypatch.setattr(Path, "read_text", lambda *_args, **_kwargs: status)
    # When / Then
    with pytest.raises(RuntimeError, match="VmHWM"):
        recursos_servidor.pico_rss_servidor(plataforma="linux")


def test_darwin_preserva_unidade_bytes_do_kernel(monkeypatch):
    # Given
    monkeypatch.setattr(recursos_servidor.resource, "getrusage", lambda _alvo: SimpleNamespace(ru_maxrss=1234))
    # When / Then
    assert recursos_servidor.pico_rss_servidor(plataforma="darwin") == (1234, "rusage_darwin_bytes")


def test_plataforma_nao_validada_nao_publica_metadado_falso():
    # Given / When / Then
    with pytest.raises(RuntimeError, match="Plataforma"):
        recursos_servidor.pico_rss_servidor(plataforma="outra")
