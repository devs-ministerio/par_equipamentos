"""Coleta fresca para o Radar legado; nunca inclui na carteira/monitoramento.

Exige chave do Portal e schema atualizado. Não executar em produção antes
da homologação e aprovação de deploy. Nenhum schedule é ativado aqui.
"""

from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory

from app.db.base import SessionLocal
from app.domain_errors import ConflictError
from app.pipeline.portal_transparencia import _headers, _sessao_com_retry, buscar_convenio_por_numero_dto
from app.repositories.descoberta_legado import ler_snapshot_csv, numeros_legados_conhecidos
from app.schemas_legado import ReferenciaDescoberta
from app.services.capturas_fonte import captura
from app.services.ciclo_descoberta_legado import publicar_ciclo, selecionar_revalidacoes
from app.services.descoberta_legado import confirmar_no_portal
from app.services.descoberta_prioritaria_ms import descobrir_prioritarios_ms
from scripts.coletar_siconv_legado import _baixar_zip
from scripts.revalidar_snapshot_legado import preparar_snapshot


def run(*, limite: int = 1000, baseline_silenciosa: bool = False) -> None:
    if type(limite) is not int or not 1 <= limite <= 1000:
        raise ValueError("Limite de candidatos deve estar entre 1 e 1000.")
    if type(baseline_silenciosa) is not bool:
        raise ValueError("Modo baseline deve ser booleano explícito.")
    conflito: ConflictError | None = None
    inconclusivos = 0
    with captura("siconv_descoberta") as rodada, TemporaryDirectory(prefix="sigeo-descoberta-") as diretorio:
        cache = Path(diretorio)
        rodada.detalhes["modo_descoberta"] = "baseline_silenciosa" if baseline_silenciosa else "incremental"
        _headers()
        with SessionLocal() as db:
            conhecidos = numeros_legados_conhecidos(db)
            alvos = selecionar_revalidacoes(db=db)
        hash_convenios = sha256(_baixar_zip("siconv_convenio", atualizar_cache=True, diretorio_cache=cache)).hexdigest()
        hash_itens = sha256(
            _baixar_zip("siconv_plano_aplicacao", atualizar_cache=True, diretorio_cache=cache)
        ).hexdigest()
        hashes_escopo = {
            nome: sha256(_baixar_zip(nome, atualizar_cache=True, diretorio_cache=cache)).hexdigest()
            for nome in ("siconv_proposta", "siconv_programa", "siconv_programa_proposta")
        }
        referencia = ReferenciaDescoberta(
            origem="siconv_oficial", hash_snapshot=sha256((hash_convenios + hash_itens).encode()).hexdigest()
        )
        candidatos = descobrir_prioritarios_ms(
            convenios=ler_snapshot_csv(
                cache / "siconv_convenio.csv.zip",
                colunas={"ID_PROPOSTA", "NR_CONVENIO", "DIA_ASSIN_CONV", "DIA_PUBL_CONV", "SIT_CONVENIO"},
            ),
            itens=ler_snapshot_csv(
                cache / "siconv_plano_aplicacao.csv.zip",
                colunas={"ID_PROPOSTA", "ID_ITEM_PAD", "DESCRICAO_ITEM"},
            ),
            propostas=ler_snapshot_csv(cache / "siconv_proposta.csv.zip", colunas={"ID_PROPOSTA", "COD_ORGAO_SUP"}),
            programas=ler_snapshot_csv(
                cache / "siconv_programa.csv.zip",
                colunas={"ID_PROGRAMA", "NOME_PROGRAMA", "COD_ORGAO_SUP_PROGRAMA"},
            ),
            vinculos=ler_snapshot_csv(
                cache / "siconv_programa_proposta.csv.zip", colunas={"ID_PROPOSTA", "ID_PROGRAMA"}
            ),
            conhecidos=conhecidos,
            limite=limite,
        )
        revalidacoes = preparar_snapshot(
            cache=cache,
            alvos=alvos,
            elegiveis={c.numero for c in candidatos},
            hashes={"siconv_convenio": hash_convenios, "siconv_plano_aplicacao": hash_itens, **hashes_escopo},
            iniciado_em=rodada.iniciado_em,
        )
        if len(candidatos) > limite:
            # Não processar sempre os primeiros nem declarar sucesso parcial.
            raise ValueError("Descoberta excedeu o limite seguro de consultas; lote não aplicado.")
        with _sessao_com_retry() as sessao:
            confirmados = [
                confirmar_no_portal(c, buscar_convenio_por_numero_dto(c.numero, session=sessao)) for c in candidatos
            ]
        rodada.itens_verificados = len(confirmados) + len(revalidacoes.entradas)
        rodada.detalhes["hashes_escopo"] = hashes_escopo
        rodada.detalhes["candidatos_sem_confirmacao"] = sum(c.confirmacao_portal != "confirmado" for c in confirmados)
        inconclusivos = len(revalidacoes.inconclusivos)
        rodada.detalhes["revalidacoes_inconclusivas"] = inconclusivos
        if inconclusivos:
            rodada.parcial = "Parte da fila histórica não teve identidade ou itens retornados; histórico preservado."
        try:
            with SessionLocal() as db:
                novos, revalidados = publicar_ciclo(
                    db=db,
                    candidatos=confirmados,
                    referencia=referencia,
                    revalidacoes=revalidacoes,
                    notificar_novos=not baseline_silenciosa,
                )
            rodada.itens_alterados = novos + revalidados
            rodada.detalhes["revalidacoes_publicadas"] = revalidados
        except ConflictError as erro:
            # Fonte íntegra com revisão concorrente não é fonte indisponível.
            conflito = erro
            rodada.detalhes["publicacao"] = "conflito_revisao"
    if conflito is not None:
        raise conflito
    if inconclusivos:
        raise ValueError("Ciclo parcial: revalidações inconclusivas preservadas para nova consulta.")


if __name__ == "__main__":
    # A entrada por CLI permanece restrita ao ensaio local durante recuperação.
    from scripts.descobrir_siconv_local import main

    main()
