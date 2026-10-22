"""Carteira sintética mínima com contrastes explícitos para exportação."""

from dataclasses import dataclass, replace
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db.models import CnesEstabelecimento, Convenio, EquipamentoCatalogo, EquipamentoMarcador

PREFIXO = "RELATORIO_MATRIZ_"
EQUIPAMENTO = "Mamógrafo matriz"


@dataclass(frozen=True)
class RegistroMatriz:
    numero: str
    uf: str = "BA"
    municipio: str = "SALVADOR"
    cnes: str = "0000701"
    ano: int | None = 2025
    programa: str = "Programa matriz A"
    situacao: str = "Em execução"
    tipo: str | None = "Convênio"
    global_: Decimal | None = Decimal("1234.56")
    mamografo: bool = True
    oculto: bool = False


REGISTROS = (
    RegistroMatriz("9007001"),
    RegistroMatriz(
        "9007002", uf="PE", municipio="RECIFE", cnes="0000702", ano=2024, global_=Decimal("2000.00"), mamografo=False
    ),
    RegistroMatriz(
        "9007003", ano=2026, programa="Programa matriz B", situacao="Concluído", tipo="TED", global_=Decimal("0")
    ),
    RegistroMatriz(
        "9007004",
        uf="SP",
        municipio="SAO PAULO",
        cnes="0000703",
        programa="Programa matriz B",
        tipo="FAF",
        global_=None,
        mamografo=False,
    ),
    RegistroMatriz("9007005", ano=None, tipo=None, global_=Decimal("100.00"), mamografo=False),
    replace(RegistroMatriz("9007006"), oculto=True),
)


def criar_carteira_matriz(db: Session) -> list[Convenio]:
    db.add_all(
        [
            CnesEstabelecimento(cnes=registro.cnes, nome_estabelecimento=f"Unidade sintética {registro.uf}")
            for registro in (REGISTROS[0], REGISTROS[1], REGISTROS[3])
        ]
    )
    catalogo = EquipamentoCatalogo(codigo="pytest_matriz_mamografo", nome=EQUIPAMENTO, prioritario=False)
    db.add(catalogo)
    db.flush()
    convenios = []
    for registro in REGISTROS:
        convenio = Convenio(
            numero=registro.numero,
            convenente_nome=PREFIXO + registro.numero,
            convenente_cnpj="00000000000001",
            uf=registro.uf,
            municipio=registro.municipio,
            cnes=registro.cnes,
            ano_instrumento=registro.ano,
            programa=registro.programa,
            situacao=registro.situacao,
            tipo_contratacao=registro.tipo,
            valor_global=registro.global_,
            valor_repasse=registro.global_,
            valor_pago_fornecedor=0,
            data_publicacao=date(2025, 1, 31),
            data_inicio_vigencia=date(2025, 2, 1),
            data_final_vigencia=date(2026, 12, 31),
            objeto="Aquisição sintética " + "descrição extensa para conferir quebra de linhas. " * 12,
            fora_escopo_equipamentos=registro.oculto,
        )
        db.add(convenio)
        db.flush()
        if registro.mamografo:
            db.add(
                EquipamentoMarcador(
                    convenio_id=convenio.id,
                    equipamento_catalogo_id=catalogo.id,
                    descricao_original=EQUIPAMENTO,
                    tipo_evidencia="planilha",
                    relacao="aquisicao",
                    confianca=100,
                    chave_evidencia="matriz-relatorio",
                )
            )
        convenios.append(convenio)
    db.flush()
    return convenios
