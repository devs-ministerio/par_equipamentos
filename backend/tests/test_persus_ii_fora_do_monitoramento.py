"""PERSUS II não pode ser incluído no monitoramento interno (decisão de 18/11/2026)."""

from __future__ import annotations

import pytest

from app.db.models import User, UserRole
from app.domain_errors import ValidationError
from app.services.monitoramento_instrumentos import NovoInstrumentoMonitorado, criar_instrumento_monitorado


def _dados(tipo: str) -> NovoInstrumentoMonitorado:
    return NovoInstrumentoMonitorado(
        nr_convenio="PS2-000000",
        cnpj_convenente=None,
        nome_convenente="Hospital de teste",
        tipo_contratacao=tipo,
        tecnico_titular_id=1,
    )


def test_persus_ii_e_recusado_antes_de_qualquer_acesso_ao_banco():
    admin = User(name="Admin", email="admin@example.com", password_hash="x", role=UserRole.admin)

    with pytest.raises(ValidationError, match="PERSUS II"):
        criar_instrumento_monitorado(dados=_dados("PERSUS II"), db=None, usuario=admin)  # type: ignore[arg-type]
