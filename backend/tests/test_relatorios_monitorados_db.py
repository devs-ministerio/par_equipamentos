"""Paridade da extração de monitoramento com a prévia e os arquivos."""

from collections import Counter
from dataclasses import replace
from datetime import date
from io import BytesIO
from typing import Final

import pytest
from docx import Document
from openpyxl import load_workbook
from sqlalchemy import select

from app.db.models import (
    CancelamentoUnidadePlanejada,
    Convenio,
    EventoMarco,
    InstrumentoEquipamento,
    ItemPlano,
    PropostaCandidata,
    User,
)
from app.repositories.monitoramento import obter_marco_por_codigo
from app.routers.relatorios import consultar_monitorados
from app.services.fatos_instrumento import carregar_etapas
from app.services.relatorios import FiltroRelatorio, montar_relatorio
from app.services.relatorios_monitorados import montar_relatorio_monitorado
from tests.test_relatorios_entregues_db import db, entregas  # noqa: F401

pytestmark = pytest.mark.db


@pytest.mark.parametrize("previsao", [None, date(2026, 4, 12)])
def test_entregas_com_inauguracao_ou_previsao(entregas, previsao):  # noqa: F811
    sessao, numero, marca = entregas
    inst = sessao.scalars(select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == numero)).one()
    item = sessao.scalars(select(ItemPlano).where(ItemPlano.instrumento_id == inst.id)).one()
    item.quantidade_planejada = 4
    marco = obter_marco_por_codigo(sessao, "cronograma_previsao_inauguracao")
    assert marco is not None
    sessao.add_all(
        [
            CancelamentoUnidadePlanejada(item_id=item.id, motivo="Uma unidade retirada do planejamento"),
            EventoMarco(
                instrumento_id=inst.id, marco_id=marco.id, data_ocorrencia=date(2026, 3, 20), data_prevista=previsao
            ),
        ]
    )
    sessao.flush()
    etapa = carregar_etapas(db=sessao, instrumentos=[inst])[0]
    assert etapa.conclusao_resultado is None
    assert etapa.previsao_inauguracao == previsao
    assert etapa.modo_operacao == (None if previsao else "inaugurada")

    tipo: Final = "equipamentos_monitorados"
    nivel: Final = "completo"
    filtro = FiltroRelatorio(escopo="brasil", busca=marca)
    previa = consultar_monitorados(
        tipo,
        filtro,
        nivel,
        [],
        1,
        20,
        db=sessao,
        usuario=User(),
    )
    assert previa.total == 4
    situacao_entrega = "Entregue, a inaugurar" if previsao else "Em operação"
    ix = previa.colunas.index("Situação (Equipamento)")
    assert Counter(linha[ix] for linha in previa.linhas) == {"Planejado": 1, situacao_entrega: 2, "Cancelado": 1}
    for formato in ("xlsx", "docx"):
        arquivo = montar_relatorio(db=sessao, formato=formato, nivel=nivel, tipo_relatorio=tipo, filtro=filtro)
        if formato == "xlsx":
            pasta = load_workbook(BytesIO(arquivo), read_only=True)
            registros = list(pasta["Registros"].iter_rows(max_row=len(previa.linhas) + 1, values_only=True))
            pasta.close()
            assert registros[0] == previa.colunas
            assert [r[ix] for r in registros[1:]] == [r[ix] for r in previa.linhas]
        else:
            doc = Document(BytesIO(arquivo))
            assert [p.text for p in doc.paragraphs if p.style.name == "Heading 1" and " - " in p.text] == [
                f"Convênio - {numero}"
            ]
            ficha = doc.tables[-1]
            assert ficha.autofit is False and len(ficha.columns) == 7
            qtd = previa.colunas.index("Qtd")
            assert [(r.cells[2].text, int(r.cells[3].text)) for r in ficha.rows[1:]] == [
                (r[ix], r[qtd]) for r in previa.linhas
            ]

    operacao = montar_relatorio_monitorado(
        db=sessao,
        tipo=tipo,
        nivel="simplificado",
        filtro=filtro,
        situacoes=("em_operacao",),
    )
    assert operacao.total == (0 if previsao else 2)
    arquivo_simplificado = montar_relatorio(db=sessao, formato="docx", nivel="simplificado", tipo_relatorio=tipo, filtro=filtro)
    doc = Document(BytesIO(arquivo_simplificado))
    paragrafos = [p.text for p in doc.paragraphs]
    assert any("4 equipamentos" in p for p in paragrafos)
    assert not any(
        p.startswith(("Quantidade de Equipamentos:", "Planejado:", "Entregue, a inaugurar:", "Em operação:", "Cancelado:"))
        or "Documento gerado automaticamente" in p or "Aceleradores Lineares:" in p
        for p in paragrafos
    )
    assert any([c.text for c in r.cells] == ["Cancelado", "1", "25%"] for r in doc.tables[0].rows)
    assert "Convênio" in next(p for p in paragrafos if p.startswith("Filtros:"))
    tabela = doc.tables[-1]
    assert len(doc.tables) == 2 and len(tabela.columns) == 9 and len(tabela.rows) == 4
    assert tabela.autofit is False
    linhas_word = [tuple(c.text for c in linha.cells) for linha in tabela.rows[1:]]
    assert any(linha[0] == numero and situacao_entrega in linha[4] for linha in linhas_word)
    instrumentos = montar_relatorio_monitorado(
        db=sessao, tipo="instrumentos_monitorados", nivel="completo", filtro=filtro
    )
    campos = dict(zip(instrumentos.colunas, instrumentos.linhas[0], strict=True))
    assert campos["Qtd Planejado"] == 1
    assert campos["Qtd Entregue"] == 2
    assert campos["Qtd em Operação"] == (0 if previsao else 2)
    assert campos["% Em Operação"] == ("0%" if previsao else "67%")
    concluidos = montar_relatorio_monitorado(
        db=sessao,
        tipo="instrumentos_monitorados",
        nivel="simplificado",
        filtro=FiltroRelatorio(escopo="brasil", busca=marca, situacao="Concluído"),
    )
    assert concluidos.total == 0


def test_completo_preserva_quantidade_quando_falta_detalhe_da_entrega(entregas, monkeypatch):  # noqa: F811
    sessao, _, marca = entregas
    from app.services import relatorios_equipamentos_modelo

    monkeypatch.setattr(relatorios_equipamentos_modelo, "listar_unidades_entregues", lambda *_a, **_kw: [])
    filtro = FiltroRelatorio(escopo="brasil", busca=marca)
    relatorio = montar_relatorio_monitorado(
        db=sessao, tipo="equipamentos_monitorados", nivel="completo", filtro=filtro
    )
    linha, = relatorio.linhas
    assert relatorio.total == linha[relatorio.colunas.index("Qtd")] == 2
    assert linha[relatorio.colunas.index("Data de Entrega do Equipamento")] is None


def test_previa_de_propostas_confere_com_word_e_excel(entregas):  # noqa: F811
    sessao, _, marca = entregas
    id_proposta = int(marca, 16)
    sessao.add(
        PropostaCandidata(
            id_proposta=id_proposta + 16777216,
            cnpj_ente_recebedor="00000000000002",
            nm_proponente=f"Parceria {marca}",
            ds_objeto="Aquisição de equipamento",
            situacao_proposta="Em análise",
            id_programa=1,
            nm_programa="Programa sintético",
            componente_batido="x",
            tem_parceria=True,
            cd_parceria=f"PAR{marca}",
        )
    )
    sessao.flush()
    filtro = FiltroRelatorio(escopo="brasil", busca=marca, etapa="propostas")
    tipo: Final = "instrumentos_repasse"
    nivel: Final = "simplificado"
    previa = consultar_monitorados(tipo, filtro, nivel, [], 1, 20, db=sessao, usuario=User())
    assert previa.total == 1
    assert previa.linhas == [(str(id_proposta), f"Entregues {marca} proposta")]

    xlsx = montar_relatorio(db=sessao, formato="xlsx", nivel=nivel, tipo_relatorio=tipo, filtro=filtro)
    pasta = load_workbook(BytesIO(xlsx), read_only=True)
    try:
        assert [str(linha[0]) for linha in list(pasta["Propostas"].values)[1:]] == [str(id_proposta)]
    finally:
        pasta.close()
    docx = montar_relatorio(db=sessao, formato="docx", nivel=nivel, tipo_relatorio=tipo, filtro=filtro)
    titulos = [p.text for p in Document(BytesIO(docx)).paragraphs if " -- Proposta " in p.text]
    assert titulos == [f"Entregues {marca} proposta -- Proposta {id_proposta}"]

    # O tipo dedicado exclui formalizadas mesmo sem etapa explícita.
    novo_filtro = replace(filtro, etapa=None)
    previa_dedicada = consultar_monitorados("propostas", novo_filtro, "completo", [], 1, 20, db=sessao, usuario=User())
    assert previa_dedicada.total == 1
    assert len(previa_dedicada.colunas) == len(previa_dedicada.linhas[0])  # colunas sem dado são omitidas
    assert previa_dedicada.linhas[0][:2] == (str(id_proposta), f"Entregues {marca} proposta")
    assert "Parceria Vinculada" not in previa_dedicada.colunas
    xlsx = montar_relatorio(db=sessao, formato="xlsx", nivel="completo", tipo_relatorio="propostas", filtro=novo_filtro)
    pasta = load_workbook(BytesIO(xlsx), read_only=True)
    try:
        assert pasta.sheetnames == ["Resumo", "Propostas"]
        assert pasta["Propostas"]["A2"].value == str(id_proposta)
        resumo = [linha[:2] for linha in pasta["Resumo"].values]
        assert ("Quantidade de Propostas", 1) in resumo
        assert "FAF" in next(valor for nome, valor in resumo if nome == "Filtros")
    finally:
        pasta.close()
    word = montar_relatorio(db=sessao, formato="docx", nivel="completo", tipo_relatorio="propostas", filtro=novo_filtro)
    documento = Document(BytesIO(word))
    texto = "\n".join(p.text for p in documento.paragraphs)
    assert "Quantidade de Propostas: 1" in texto and "FAF" in texto
    assert "Documento gerado automaticamente" not in texto
    titulo = next(p for p in documento.paragraphs if p.text.startswith("Proposta - "))
    assert titulo.text == f"Proposta - {id_proposta}" and titulo.style.font.bold
    assert len(documento.tables) == 2
    ficha = documento.tables[1]
    assert ficha.autofit is False and [c.text for c in ficha.rows[0].cells] == ["Campo", "Informação"]
    assert all(r.cells[0].paragraphs[0].runs[0].bold for r in ficha.rows if len(r._tr.tc_lst) == 1)
    assert any([c.text for c in r.cells] == ["Proponente", f"Entregues {marca} proposta"] for r in ficha.rows)


def test_recorte_brasil_inclui_todas_as_contratacoes(entregas):  # noqa: F811
    sessao, _, marca = entregas
    numero = f"PYP{marca}"
    conv = Convenio(numero=numero, objeto="x", convenente_nome="x", uf="RS", situacao="Em execução")
    sessao.add(conv)
    sessao.flush()
    inst = InstrumentoEquipamento(
        nr_convenio=numero,
        nome_convenente=f"Entregues {marca} persus",
        tipo_contratacao="PERSUS I",
        uf="RS",
        ano_instrumento=2025,
    )
    sessao.add(inst)
    sessao.flush()
    sessao.add(
        ItemPlano(
            convenio_id=conv.id,
            instrumento_id=inst.id,
            origem="manual",
            id_origem=f"manual:{numero}:1",
            descricao="Mamógrafo digital com tomossíntese",
            controla_unidade=True,
            quantidade_planejada=1,
        )
    )
    sessao.flush()
    base = FiltroRelatorio(escopo="brasil", busca=marca)

    def contratacoes(filtro: FiltroRelatorio) -> tuple[set[str], str]:
        relatorio = montar_relatorio_monitorado(
            db=sessao, tipo="equipamentos_monitorados", nivel="completo", filtro=filtro
        )
        ix = relatorio.colunas.index("Contratação")
        tipos = {linha[ix] for linha in relatorio.linhas}
        return {tipo for tipo in tipos if isinstance(tipo, str)}, dict(relatorio.cabecalho)["Filtros"]

    assert contratacoes(base) == ({"Convênio", "PERSUS I"}, "Todos os Equipamentos em Oncologia · Convênio, PERSUS I")
    assert contratacoes(replace(base, tipo_contratacao="PERSUS I")) == (
        {"PERSUS I"}, "Todos os Equipamentos em Oncologia · PERSUS I"
    )


def test_contexto_usa_nome_do_cnes_ou_do_convenente(db):  # noqa: F811
    from uuid import uuid4

    from app.db.models import CnesEstabelecimento
    from app.services.monitoramento_instrumentos import InstrumentoComFase
    from app.services.relatorios_contexto import carregar_contextos

    marca = uuid4().hex[:6]
    cnes = "9" + str(int(marca, 16) % 10**6).zfill(6)
    db.add(CnesEstabelecimento(cnes=cnes, nome_estabelecimento=f"Hospital CNES {marca}"))
    db.flush()
    com = InstrumentoEquipamento(
        nr_convenio=f"CTA{marca}", nome_convenente=f"Convenente A {marca}", tipo_contratacao="Convênio",
        uf="RS", municipio="PORTO ALEGRE", cnes=cnes, ano_instrumento=2025,
    )
    sem = InstrumentoEquipamento(
        nr_convenio=f"CTB{marca}", nome_convenente=f"Convenente B {marca}", tipo_contratacao="Convênio",
        uf="SP", ano_instrumento=2025,
    )
    db.add_all([com, sem])
    db.flush()
    contextos = carregar_contextos(db, [InstrumentoComFase(com, "Concluído"), InstrumentoComFase(sem, "Concluído")])
    assert contextos[com.nr_convenio].estabelecimento == f"Hospital CNES {marca}"
    assert contextos[com.nr_convenio].municipio == "Porto Alegre"
    assert contextos[sem.nr_convenio].estabelecimento == f"Convenente B {marca}"
    assert contextos[com.nr_convenio].regiao == "Sul"
    assert contextos[sem.nr_convenio].regiao == "Sudeste"


def test_valores_por_familia_so_com_preco_unitario_uniforme(db):  # noqa: F811
    from uuid import uuid4

    from app.repositories.relatorios_contexto import valores_por_familia

    marca = uuid4().hex[:6]
    conv = Convenio(numero=f"VF{marca}", objeto="x", convenente_nome="x", uf="RS")
    db.add(conv)
    db.flush()

    def novo(sufixo, itens):
        inst = InstrumentoEquipamento(
            nr_convenio=f"VF{marca}{sufixo}", nome_convenente="x", tipo_contratacao="Convênio", uf="RS", ano_instrumento=2025
        )
        db.add(inst)
        db.flush()
        for n, (valor, qtd) in enumerate(itens, 1):
            db.add(ItemPlano(
                convenio_id=conv.id, instrumento_id=inst.id, origem="manual", id_origem=f"manual:{marca}{sufixo}:{n}",
                descricao="Mamógrafo digital", controla_unidade=True, quantidade_planejada=qtd, valor_total=valor,
            ))
        db.flush()
        return inst.id

    uniforme = novo("a", [(100, 1), (300, 3)])
    sem_preco = novo("b", [(100, 1), (None, 1)])
    sem_qtd = novo("c", [(100, 1), (100, None)])
    precos_diferentes = novo("d", [(100, 1), (300, 1)])
    resultado = valores_por_familia(db, {uniforme, sem_preco, sem_qtd, precos_diferentes})
    assert {i for i, _ in resultado} == {uniforme}
    assert next(iter(resultado.values())) == (400.0, 4)


def test_equipamentos_com_valor_data_e_unidade(entregas):  # noqa: F811
    sessao, numero, marca = entregas
    inst = sessao.scalars(select(InstrumentoEquipamento).where(InstrumentoEquipamento.nr_convenio == numero)).one()
    item = sessao.scalars(select(ItemPlano).where(ItemPlano.instrumento_id == inst.id)).one()
    item.valor_total = 1000
    sessao.flush()
    filtro = FiltroRelatorio(escopo="brasil", busca=marca)
    completo = montar_relatorio_monitorado(db=sessao, tipo="equipamentos_monitorados", nivel="completo", filtro=filtro)
    simples = montar_relatorio_monitorado(db=sessao, tipo="equipamentos_monitorados", nivel="simplificado", filtro=filtro)
    assert len(completo.colunas) == 25 and len(simples.colunas) == 16
    cols = completo.colunas
    unidades = [linha for linha in completo.linhas if linha[cols.index("Série")]]
    assert [u[cols.index("Valor do Equipamento")] for u in unidades] == [500.0, 500.0]
    assert {u[cols.index("Data de Entrega do Equipamento")] for u in unidades} == {date(2026, 3, 10)}
    assert {u[cols.index("Marca")] for u in unidades} == {"Acme"}
    sc = simples.colunas
    entregue = next(linha for linha in simples.linhas if linha[sc.index("Situação (Equipamento)")] != "Planejado")
    assert entregue[sc.index("Data de Entrega do Equipamento")] == date(2026, 3, 10)
    assert entregue[sc.index("Valor do Equipamento")] == 1000.0
    assert simples.arquivo_base == "equipamentos" and simples.legenda
