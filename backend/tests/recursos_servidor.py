"""Pico do servidor após exec; rusage Linux pode incluir o pai pré-exec."""

import resource
import sys
from pathlib import Path


def pico_rss_servidor(*, plataforma: str = sys.platform) -> tuple[int, str]:
    if plataforma.startswith("linux"):
        for linha in Path("/proc/self/status").read_text(encoding="utf-8").splitlines():
            campos = linha.split()
            if len(campos) == 3 and campos[0] == "VmHWM:" and campos[2] == "kB":
                return int(campos[1]) * 1024, "proc_vm_hwm_pos_exec"
        raise RuntimeError("Kernel não informou VmHWM em kB; não usar RSS do pai como fallback.")
    if plataforma == "darwin":
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "rusage_darwin_bytes"
    raise RuntimeError("Plataforma sem medição RSS validada para este ensaio.")
