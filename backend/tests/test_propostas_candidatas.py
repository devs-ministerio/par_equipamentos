"""Contrato de leitura do Radar de Convênios."""

from datetime import UTC, datetime
from uuid import uuid4

from app.auth import hash_password
from app.db.base import SessionLocal
from app.db.models import PropostaCandidata, User, UserRole
from app.repositories.propostas_candidatas import FiltrosPropostaCandidata, listar_propostas_paginadas
from app.routers.propostas_candidatas import listar_propostas_candidatas


def criar_usuario_teste(db):
    usuario = User(
        name="Usuário Pytest",
        email=f"pytest-propostas-{uuid4()}@example.com",
        password_hash=hash_password("senha"),
        role=UserRole.colaborador,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def test_listagem_de_propostas_nao_expoe_ciclo_legado_de_revisao():
    db = SessionLocal()
    usuario = proposta = None
    try:
        usuario = criar_usuario_teste(db)
        proposta = PropostaCandidata(
            id_proposta=888_000_001,
            cnpj_ente_recebedor="00000000000000",
            nm_proponente="Proponente Pytest — apagar",
            ds_objeto="Objeto de teste",
            nm_programa="Programa de teste",
            id_programa=1,
            componente_batido="Tomógrafo",
            vl_global_proposta=1000,
            situacao_proposta="Em análise",
        )
        db.add(proposta)
        db.commit()
        db.refresh(proposta)

        resultado = listar_propostas_candidatas(pagina=1, tamanho_pagina=50, db=db, usuario=usuario)
        item = next(p for p in resultado.itens if p.id == proposta.id)

        assert item.id_proposta == proposta.id_proposta
        assert not hasattr(item, "status")
        assert not hasattr(item, "revisado_em")
    finally:
        if proposta is not None:
            db.query(PropostaCandidata).filter_by(id=proposta.id).delete()
        if usuario is not None:
            db.query(User).filter_by(id=usuario.id).delete()
        db.commit()
        db.close()


def test_paginas_desempatam_datas_iguais_sem_repetir_ou_perder_propostas():
    # Arrange: simula inserção em lote, na qual created_at pode ser idêntico.
    programa = uuid4().int % 10**12 + 1
    base_proposta = uuid4().int % 10**12 + 1
    instante = datetime(2026, 10, 9, tzinfo=UTC)
    with SessionLocal() as db:
        propostas = [
            PropostaCandidata(
                id_proposta=base_proposta + indice,
                cnpj_ente_recebedor="00000000000000",
                nm_proponente="Proponente sintético de paginação",
                ds_objeto="Aquisição sintética",
                nm_programa="Programa sintético de paginação",
                id_programa=programa,
                componente_batido="Tomógrafo",
                created_at=instante,
            )
            for indice in range(6)
        ]
        db.add_all(propostas)
        db.flush()
        esperado = sorted([p.id for p in propostas], reverse=True)
        # Act: páginas independentes, com o mesmo filtro e duas linhas por página.
        paginas = [
            listar_propostas_paginadas(
                db, filtros=FiltrosPropostaCandidata(id_programa=programa), pagina=pagina, tamanho_pagina=2
            )
            for pagina in (1, 2, 3)
        ]
        # Assert: desempate por ID mantém ordenação estável e cada linha aparece uma vez.
        assert [total for total, _ in paginas] == [6, 6, 6]
        assert [p.id for _, itens in paginas for p in itens] == esperado
        db.rollback()
