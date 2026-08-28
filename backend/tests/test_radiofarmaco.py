"""Testa distancia/tempo ate o radiofarmaco PET mais proximo, isolado de
banco e das APIs externas -- mesmo espirito de test_cobertura.py e
test_geo.py. Ver app/pipeline/radiofarmaco.py."""
from app.pipeline.radiofarmaco import (
    ProdutorRadiofarmaco,
    carregar_produtores_radiofarmaco_pet,
    horas_aviao,
    horas_rodovia,
    produtor_mais_proximo,
)

SAO_PAULO = ProdutorRadiofarmaco(
    id="1", empresa="teste SP", municipio="Sao Paulo", uf="SP",
    status_producao="confirmada", latitude=-23.5589, longitude=-46.7337,
)
BELEM = ProdutorRadiofarmaco(
    id="2", empresa="teste PA", municipio="Belem", uf="PA",
    status_producao="confirmada", latitude=-1.4558, longitude=-48.5044,
)


def test_carrega_produtores_do_csv_vendorizado():
    produtores = carregar_produtores_radiofarmaco_pet()
    assert len(produtores) == 13
    assert all(p.latitude and p.longitude for p in produtores)


def test_produtor_mais_proximo_escolhe_o_de_menor_distancia():
    # ponto perto de Sao Paulo (mesma cidade) -- tem que escolher SAO_PAULO,
    # nao BELEM, mesmo com BELEM tambem na lista.
    ponto_sp = (-23.55, -46.63)
    resultado = produtor_mais_proximo(ponto_sp, [SAO_PAULO, BELEM])
    assert resultado is not None
    produtor, distancia_km = resultado
    assert produtor is SAO_PAULO
    assert distancia_km < 20


def test_produtor_mais_proximo_vazio_devolve_none():
    assert produtor_mais_proximo((-23.55, -46.63), []) is None


def test_horas_rodovia_cresce_com_a_distancia():
    assert horas_rodovia(700) > horas_rodovia(70)
    assert horas_rodovia(0) == 0


def test_horas_aviao_tem_piso_do_tempo_de_solo():
    # mesmo distancia zero, o tempo de solo (embarque/desembarque) nao some.
    assert horas_aviao(0) == 1.5


def test_horas_aviao_menor_que_rodovia_pra_distancia_longa():
    # justamente o caso que a portaria se preocupa: municipio longe do
    # produtor mais proximo, onde só avião cabe nas 2h da meia-vida do FDG.
    distancia = 1500  # ex.: Manaus -> Sao Paulo, ordem de grandeza
    assert horas_aviao(distancia) < horas_rodovia(distancia)
