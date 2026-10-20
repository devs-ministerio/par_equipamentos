"""Uma montagem DOCX por processo; não é fila nem limite entre réplicas."""

from collections.abc import Iterator
from contextlib import contextmanager
from threading import Lock

from app.domain_errors import RelatorioOcupadoError

_GERACAO_DOCX = Lock()


@contextmanager
def reservar_geracao_docx() -> Iterator[None]:
    if not _GERACAO_DOCX.acquire(blocking=False):
        raise RelatorioOcupadoError()
    try:
        yield
    finally:
        _GERACAO_DOCX.release()
