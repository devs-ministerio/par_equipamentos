from __future__ import annotations

from types import SimpleNamespace

from scripts.auditar_tags_legadas import coletar_pendencias


class _Result:
    def __init__(self, *, rows=(), scalars=()):
        self._rows = rows
        self._scalars = scalars

    def __iter__(self):
        return iter(self._rows)

    def scalars(self):
        return iter(self._scalars)


class _Db:
    def __init__(self, resultados):
        self._resultados = iter(resultados)

    def execute(self, _statement):
        return next(self._resultados)


def test_coletar_pendencias_retorna_apenas_tag_sem_marcador():
    convenio = SimpleNamespace(
        id=7,
        numero="123",
        tipo_contratacao="Convênio",
        origem_dado=None,
        equipamentos_tags=["Mamógrafo", "Ultrassom"],
        siconv_raw={"itens_plano_aplicacao": [{"DESCRICAO_ITEM": "Ultrassom diagnóstico"}]},
    )
    db = _Db(
        [
            _Result(rows=[(7, "Mamógrafo")]),
            _Result(scalars=[convenio]),
        ]
    )

    assert coletar_pendencias(db) == [
        {
            "convenio": "123",
            "tipo_contratacao": "Convênio",
            "origem_dado": None,
            "tag_legada": "Ultrassom",
            "marcadores_atuais": ["Mamógrafo"],
            "descricao_fonte": ["Ultrassom diagnóstico"],
        }
    ]
