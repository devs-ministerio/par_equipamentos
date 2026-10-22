"""Jobs do espelho registram captura, preservam dado e não inundam avisos."""

from uuid import uuid4

import pytest
from sqlalchemy import func

from app.db.base import SessionLocal
from app.db.models import (
    Convenio,
    FonteCaptura,
    Notificacao,
    NotificacaoDestinatario,
    NotificacaoTipo,
    PropostaCandidata,
)
from scripts import job_verificacao_siconv
from scripts.job_descoberta_transferegov import LIMITE_AVISOS_INDIVIDUAIS, avisar_propostas_novas


def _apagar_notificacoes(db, ids: list[int]) -> None:
    db.query(NotificacaoDestinatario).filter(NotificacaoDestinatario.notificacao_id.in_(ids)).delete()
    db.query(Notificacao).filter(Notificacao.id.in_(ids)).delete()


def test_dump_siconv_vazio_falha_registra_erro_e_preserva_convenio(monkeypatch):
    numero = str(uuid4().int)[:12]
    db = SessionLocal()
    ultimo_id = db.query(func.coalesce(func.max(FonteCaptura.id), 0)).scalar()
    try:
        db.add(Convenio(numero=numero, convenente_nome="Teste", tipo_contratacao="Convênio", situacao="Em execução"))
        db.commit()
        monkeypatch.setattr(job_verificacao_siconv, "_filtrar_por_numero_convenio", lambda *a, **k: [])
        with pytest.raises(RuntimeError, match="não retornou nenhum convênio"):
            job_verificacao_siconv.run()
        db.expire_all()
        assert db.query(Convenio).filter_by(numero=numero).one().situacao == "Em execução"
        captura = (
            db.query(FonteCaptura)
            .filter(FonteCaptura.fonte == "siconv_legado", FonteCaptura.id > ultimo_id)
            .order_by(FonteCaptura.id.desc())
            .first()
        )
        assert captura is not None and captura.status == "erro"
    finally:
        ids = [c.id for c in db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id)]
        _apagar_notificacoes(
            db,
            [
                n.id
                for n in db.query(Notificacao).filter(
                    Notificacao.tipo == NotificacaoTipo.fonte_indisponivel, Notificacao.entidade_id.in_(ids)
                )
            ],
        )
        db.query(FonteCaptura).filter(FonteCaptura.id > ultimo_id).delete()
        db.query(Convenio).filter_by(numero=numero).delete()
        db.commit()
        db.close()


@pytest.mark.parametrize(
    ("quantidade", "carga_inicial", "esperado"),
    [(3, False, 3), (LIMITE_AVISOS_INDIVIDUAIS + 1, False, 1), (3, True, 1), (0, True, 0)],
)
def test_avisos_de_proposta_nova_nao_inundam(quantidade, carga_inicial, esperado):
    db = SessionLocal()
    marcador = f"pytest-{uuid4().hex}"
    criadas: list[int] = []
    try:
        propostas = []
        for i in range(quantidade):
            p = PropostaCandidata(
                id_proposta=-int(uuid4().int % 10**9) - i - 1,
                cnpj_ente_recebedor="12345678000199",
                nm_proponente=marcador,
                ds_objeto="x",
                nm_programa="p",
                id_programa=1,
                componente_batido="c",
            )
            db.add(p)
            propostas.append(p)
        db.flush()
        novos = [(p.id, f"Proposta nova {marcador}", "corpo") for p in propostas]
        criados = avisar_propostas_novas(db, novos, carga_inicial=carga_inicial)
        assert criados == esperado
        criadas = [
            n.id
            for n in db.query(Notificacao).filter(
                Notificacao.tipo == NotificacaoTipo.proposta_candidata,
                Notificacao.entidade_id.in_([p.id for p in propostas] or [0]),
            )
        ]
        assert len(criadas) == esperado
    finally:
        db.rollback()
        db.close()
