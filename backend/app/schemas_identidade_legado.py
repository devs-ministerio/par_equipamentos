"""Identidade textual do SICONV: não remover letras ou converter para inteiro."""

from typing import Annotated

from pydantic import Field

NumeroConvenioLegado = Annotated[str, Field(pattern=r"^[0-9A-Z]+$")]
