"""Publicação atômica das descobertas e revalidações da mesma coleta oficial."""

from hashlib import sha256

from sqlalchemy.orm import Session

from app.domain_errors import ValidationError
from app.repositories.candidatos_legados import alvos_revalidacao, obter_registros
from app.schemas_coleta_recaptura_legado import AlvoRecapturaLegado
from app.schemas_legado import ReferenciaDescoberta
from app.schemas_revalidacao_legado import RevalidacoesCiclo
from app.services.candidatos_legados import registrar_descoberta
from app.services.descoberta_legado import CandidatoLegado
from app.services.revalidacao_legado import registrar_inelegibilidade


def selecionar_revalidacoes(*, db: Session, limite: int = 1000) -> list[AlvoRecapturaLegado]:
    try:
        if type(limite) is not int or not 1 <= limite <= 1000:
            raise ValidationError("Limite de revalidação deve estar entre 1 e 1000.")
        alvos = alvos_revalidacao(db, limite=limite)
        if len(alvos) > limite:
            raise ValidationError("Fila excedeu o limite de revalidação; ciclo não aplicado.")
        return alvos
    finally:
        db.rollback()  # Leitura termina antes de qualquer download ou Portal.


def publicar_ciclo(
    *,
    db: Session,
    candidatos: list[CandidatoLegado],
    referencia: ReferenciaDescoberta,
    revalidacoes: RevalidacoesCiclo,
    notificar_novos: bool,
) -> tuple[int, int]:
    try:
        referencia = ReferenciaDescoberta.model_validate(referencia.model_dump())
        revalidacoes = RevalidacoesCiclo.model_validate(revalidacoes.model_dump())
        if type(notificar_novos) is not bool:
            raise ValidationError("Modo de notificação deve ser booleano explícito.")
        if referencia.origem != "siconv_oficial":
            raise ValidationError("Ciclo integrado exige snapshots oficiais.")
        if {c.numero for c in candidatos} & {e.alvo.numero for e in revalidacoes.entradas}:
            raise ValidationError("O mesmo candidato não pode ser elegível e inelegível no ciclo.")
        if revalidacoes.entradas:
            base = revalidacoes.entradas[0].escopo
            if any(
                e.escopo.hashes != base.hashes or e.escopo.iniciado_em != base.iniciado_em
                for e in revalidacoes.entradas
            ):
                raise ValidationError("Revalidações pertencem a coletas diferentes.")
            esperado = sha256(
                (base.hashes["siconv_convenio"] + base.hashes["siconv_plano_aplicacao"]).encode()
            ).hexdigest()
            if referencia.hash_snapshot != esperado:
                raise ValidationError("Descoberta e revalidações não usam o mesmo snapshot.")
        descobertos = registrar_descoberta(
            db=db,
            candidatos=candidatos,
            referencia=referencia,
            notificar_novos=notificar_novos,
            _confirmar_transacao=False,
        )
        anteriores = obter_registros(db, {e.alvo.numero for e in revalidacoes.entradas})
        capturas_anteriores = {numero: r.ultima_captura_id for numero, r in anteriores.items()}
        alterados = 0
        for entrada in revalidacoes.entradas:
            identificador = registrar_inelegibilidade(
                db=db, alvo=entrada.alvo, escopo=entrada.escopo, _confirmar_transacao=False
            )
            alterados += identificador != capturas_anteriores.get(entrada.alvo.numero)
        db.commit()
        return descobertos, alterados
    except Exception:
        db.rollback()
        raise
