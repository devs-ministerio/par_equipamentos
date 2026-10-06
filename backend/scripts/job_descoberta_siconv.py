"""Coleta fresca para o Radar legado; nunca inclui na carteira/monitoramento.

Exige chave do Portal e schema atualizado. Não executar em produção antes
da homologação e aprovação de deploy. Nenhum schedule é ativado aqui.
"""

import argparse
from hashlib import sha256

from app.db.base import SessionLocal
from app.pipeline.portal_transparencia import _headers, _sessao_com_retry, buscar_convenio_por_numero_dto
from app.repositories.descoberta_legado import ler_snapshot_csv, numeros_legados_conhecidos
from app.schemas_legado import ReferenciaDescoberta
from app.services.candidatos_legados import registrar_descoberta
from app.services.capturas_fonte import captura
from app.services.descoberta_legado import confirmar_no_portal, descobrir_legado
from scripts.coletar_siconv_legado import DIR_CACHE, _baixar_zip


def run(*, limite: int = 1000) -> None:
    if not 1 <= limite <= 1000:
        raise ValueError("Limite de candidatos deve estar entre 1 e 1000.")
    with captura("siconv_descoberta") as rodada:
        _headers()
        hash_convenios = sha256(_baixar_zip("siconv_convenio", atualizar_cache=True)).hexdigest()
        hash_itens = sha256(_baixar_zip("siconv_plano_aplicacao", atualizar_cache=True)).hexdigest()
        referencia = ReferenciaDescoberta(
            origem="siconv_oficial", hash_snapshot=sha256((hash_convenios + hash_itens).encode()).hexdigest()
        )
        with SessionLocal() as db:
            candidatos = descobrir_legado(
                ler_snapshot_csv(DIR_CACHE / "siconv_convenio.csv.zip", colunas={"ID_PROPOSTA", "NR_CONVENIO"}),
                ler_snapshot_csv(
                    DIR_CACHE / "siconv_plano_aplicacao.csv.zip",
                    colunas={"ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"},
                ),
                conhecidos=numeros_legados_conhecidos(db),
            )
            if len(candidatos) > limite:
                # Não processar sempre os primeiros nem declarar sucesso parcial.
                raise ValueError("Descoberta excedeu o limite seguro de consultas; lote não aplicado.")
            with _sessao_com_retry() as sessao:
                confirmados = [
                    confirmar_no_portal(c, buscar_convenio_por_numero_dto(c.numero, session=sessao)) for c in candidatos
                ]
            rodada.itens_verificados = len(confirmados)
            rodada.itens_alterados = registrar_descoberta(db=db, candidatos=confirmados, referencia=referencia)
            rodada.detalhes["candidatos_sem_confirmacao"] = sum(
                c.confirmacao_portal != "confirmado" for c in confirmados
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limite", type=int, default=1000)
    run(limite=parser.parse_args().limite)
