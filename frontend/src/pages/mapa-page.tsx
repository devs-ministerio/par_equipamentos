import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { MacroMap } from '@/components/features/macro-map';
import type { PontoEstabelecimento } from '@/components/features/macro-map';
import { SubNivelRows } from '@/components/features/sub-nivel-rows';
import { StatusBadge } from '@/components/common/status-badge';
import { SingleSelectFilter } from '../components/common/single-select-filter';
import {
  fetchEstabelecimentosPage,
  fetchHealthRegionCoverage,
  fetchMacroCoverage,
  fetchMunicipalityCoverage,
} from '../services/api';
import { calcularCoeficiente } from '../utils/coeficiente';
import { formatMilhar, formatMultiplicador } from '../utils/format';
import { distanciaKm } from '../utils/geo';
import { useFamiliaEquipamento } from '../context/familia-equipamento-context';
import { getEquipamento, GEOJSON_MACRORREGIOES_URL } from '../data/constants';
import type { CoberturaRow, Macrorregiao, NivelCoberturaRow } from '../types/domain';

type RegioesSaudeEstado = NivelCoberturaRow[] | 'carregando' | 'erro';

// Leaflet (~150KB) so entra no bundle quando essa pagina realmente monta a
// secao de recorte -- mesmo padrao ja usado pro jsPDF/ExcelJS em
// utils/exportPdf.ts/exportXlsx.ts (lib pesada, usada numa parte especifica
// da UI, carregada sob demanda em vez de inflar o bundle principal que
// TODA pagina paga, mesmo quem nunca abre o Mapa). Import direto do módulo
// (não do barrel `features/mapa-equipamentos`) -- lazy() precisa de um
// import() dedicado pro code-splitting funcionar; importar do barrel
// puxaria `MacroMap`/o resto da feature pro chunk principal também.
const MacroMapReal = lazy(() =>
  import('@/components/features/macro-map-real').then((m) => ({ default: m.MacroMapReal })),
);

// Maior macro nacional (Tomógrafo) tem 964 estabelecimentos distintos --
// folga confortável abaixo do teto de 2000 do endpoint (mesmo já usado pelo
// antigo fetch por UF).
const MAX_ESTABELECIMENTOS_POR_MACRO = 1500;

// Raio de BUSCA/EXIBIÇÃO de estabelecimentos ao redor do município
// selecionado no mapa -- volta a 75km (2026-08-24; chegou a ir a 200km,
// mas o usuário achou ruim de visualizar: com pontos espalhados até
// 200km, o fitBounds precisa enquadrar uma área bem maior, diluindo o
// foco visual no município selecionado). Mesmo valor do critério
// normativo do Tomógrafo, usado também como referência de "vizinhança"
// pras demais famílias.
const RAIO_BUSCA_MUNICIPIO_KM = 75;

/** Card compacto de resumo (Total de equipamentos / Cobertura / Municipio
 * mais proximo / Populacao SUS) mostrado acima do filtro de Macro/
 * Municipio do "Recorte" -- reflete a granularidade mais fina ja
 * selecionada (municipio, se houver; senao a macro). */
function CardInfo({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="min-w-[150px] flex-[1_1_150px] rounded-lg border border-border bg-muted px-3.5 py-2.5">
      <div className="overflow-hidden text-[10.5px] font-bold tracking-[0.03em] text-ellipsis whitespace-nowrap text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`mt-[3px] overflow-hidden text-[17px] font-bold text-ellipsis whitespace-nowrap ${cor ? '' : 'text-foreground'}`}
        style={cor ? { color: cor } : undefined}
        title={valor}
      >
        {valor}
      </div>
    </div>
  );
}

/**
 * Mapa nacional por macrorregiao de saude, com drill-down no painel lateral
 * (decisao 2026-08-22): clicar numa macro no mapa busca as regioes de saude
 * dela (GET /health-region-coverage?macro_code=) e mostra com SubNivelRows --
 * MESMO componente que o Dashboard usa pra expandir uma linha de macro
 * (CoberturaTable), entao a cadeia Regiao de Saude -> Municipio vem de
 * graca, sem duplicar logica (sem botao de detalhe nessa sub-camada --
 * removido 2026-08-24, os cards de resumo acima do filtro substituem essa
 * necessidade).
 *
 * Substitui a versao anterior (mapa colorido por UF, clicar no estado listava
 * as macros dele com a lista crua de estabelecimentos) -- o mapa agora colore
 * CADA MACRO com o dado exato dela (sem media por UF, ver MacroMap.tsx), e o
 * drill-down vai direto a fundo (Regiao de Saude -> Municipio) em vez de
 * parar em "lista de estabelecimentos da macro". A lista crua de
 * estabelecimentos por CNES continua disponivel no Dashboard
 * (EstabelecimentoTable, filtravel por macro).
 */
export function MapaPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();
  const equipamento = getEquipamento(FAMILIA);
  const [geo, setGeo] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const [macros, setMacros] = useState<Macrorregiao[]>([]);
  const [coberturaRows, setCoberturaRows] = useState<CoberturaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [regioesSaude, setRegioesSaude] = useState<RegioesSaudeEstado>('carregando');
  const [pontosMacro, setPontosMacro] = useState<PontoEstabelecimento[]>([]);
  const [municipiosMacro, setMunicipiosMacro] = useState<RegioesSaudeEstado>('carregando');
  const [selectedMunicipioId, setSelectedMunicipioId] = useState<string | null>(null);
  // Total real dentro do raio de busca (pode ser bem maior que os pontos
  // efetivamente plotados -- o backend limita aos mais proximos, ver
  // comentario em app/routers/equipment_offer.py). Null fora do modo
  // municipio (nao se aplica).
  const [totalEstabelecimentosNoRaio, setTotalEstabelecimentosNoRaio] = useState<number | null>(null);
  // Nome do municipio do equipamento mais proximo, pro card "Equipamento
  // mais proximo" -- estado proprio (nao deriva so de pontosMacro) porque
  // o equipamento mais proximo pode estar bem alem do raio VISUAL do mapa
  // (RAIO_BUSCA_MUNICIPIO_KM, mantido pequeno de proposito pra nao pesar o
  // mapa); ver efeito abaixo.
  const [nomeEquipamentoMaisProximo, setNomeEquipamentoMaisProximo] = useState<string | null>(null);
  // Distancia (km) ate o equipamento mais proximo do municipio selecionado
  // -- generalizada pra qualquer familia (2026-08-24), nao so TOMOGRAFO
  // (unica com o campo pronto no pipeline); ver efeito abaixo.
  const [distanciaMaisProximaKm, setDistanciaMaisProximaKm] = useState<number | null>(null);
  // Contorno REAL (poligono oficial) do municipio selecionado -- buscado
  // sob demanda na API de malhas do IBGE (2026-08-24, a pedido: "nao quero
  // circulo, quero de fato o contorno do municipio"). Null enquanto
  // carrega/se nao tiver municipio selecionado/se a busca falhar -- o mapa
  // degrada bem (so fica sem desenhar o contorno extra, mesmo padrao de
  // "silencia e segue" ja usado nos outros fetches auxiliares dessa
  // pagina).
  const [contornoMunicipio, setContornoMunicipio] = useState<GeoJSON.Feature | null>(null);
  // Cache em memoria (na aba, nao sobrevive reload) por codigo IBGE de 7
  // digitos -- fronteira de municipio nao muda durante a sessao, evita
  // rebuscar na API do IBGE se o usuario voltar a selecionar o mesmo
  // municipio.
  const cacheContornosRef = useRef<Map<string, GeoJSON.Feature>>(new Map());

  // Geometria das macros so precisa vir uma vez (nao depende de familia --
  // os 121 codigos de macro sao os mesmos pra qualquer equipamento).
  useEffect(() => {
    let cancelado = false;
    fetch(GEOJSON_MACRORREGIOES_URL)
      .then((r) => r.json())
      .then((geoData) => !cancelado && setGeo(geoData))
      .catch((e: Error) => !cancelado && setError(e.message));
    return () => {
      cancelado = true;
    };
  }, []);

  // Cobertura re-busca ao trocar a familia selecionada no menu -- guarda
  // contra corrida igual DashboardPage (trocar de familia rapido pode
  // fazer a resposta antiga chegar depois e sobrescrever a nova).
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    fetchMacroCoverage(FAMILIA)
      .then((coverage) => {
        if (cancelado) return;
        setMacros(coverage.macros);
        setCoberturaRows(coverage.coberturaRows);
      })
      .catch((e: Error) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [FAMILIA]);

  // Pre-seleciona a primeira macro (ordenada por UF/nome) assim que a lista
  // carrega, se o usuario ainda nao escolheu nenhuma -- a secao "Recorte da
  // macrorregiao" abaixo sempre tem algo pra mostrar, em vez de comecar
  // vazia esperando um clique no mapa nacional (decisao 2026-08-23).
  useEffect(() => {
    if (selectedMacroId || macros.length === 0) return;
    const ordenadas = [...macros].sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome));
    setSelectedMacroId(ordenadas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [macros]);

  // Drill-down: regioes de saude da macro selecionada -- busca de novo ao
  // trocar de familia tambem (os codigos de macro sao os mesmos entre
  // familias, mas o dado de cobertura de cada regiao nao e).
  useEffect(() => {
    let cancelado = false;
    if (!selectedMacroId) {
      setRegioesSaude('carregando');
      return;
    }
    setRegioesSaude('carregando');
    fetchHealthRegionCoverage({ equipmentFamily: FAMILIA, macroCodes: [selectedMacroId] })
      .then((rows) => !cancelado && setRegioesSaude(rows))
      .catch(() => !cancelado && setRegioesSaude('erro'));
    return () => {
      cancelado = true;
    };
  }, [FAMILIA, selectedMacroId]);

  // Municipios da macro selecionada, pro seletor "raio no municipio" abaixo
  // -- SEM min_population (ao contrario da tabela do Dashboard): aqui
  // interessa justamente poder escolher um municipio pequeno, que é o caso
  // que o criterio de raio de 75km existe pra cobrir. Reseta a selecao de
  // municipio ao trocar de macro (o municipio escolhido pertence a outra
  // macro, nao faz sentido manter).
  useEffect(() => {
    let cancelado = false;
    setSelectedMunicipioId(null);
    if (!selectedMacroId) {
      setMunicipiosMacro('carregando');
      return;
    }
    setMunicipiosMacro('carregando');
    fetchMunicipalityCoverage({ equipmentFamily: FAMILIA, macroCodes: [selectedMacroId] })
      .then((rows) => !cancelado && setMunicipiosMacro(rows))
      .catch(() => !cancelado && setMunicipiosMacro('erro'));
    return () => {
      cancelado = true;
    };
  }, [FAMILIA, selectedMacroId]);

  const municipioSelecionado =
    Array.isArray(municipiosMacro) && selectedMunicipioId
      ? municipiosMacro.find((m) => m.chave === selectedMunicipioId)
      : undefined;

  // Pontos de estabelecimento (lat/long) pro recorte abaixo -- so busca sob
  // demanda (nunca os ~8 mil estabelecimentos nacionais de uma vez). ~6% dos
  // estabelecimentos nao tem geocodificacao no CNES (latitude/longitude
  // nulos) -- esses ficam de fora do mapa mas continuam contando nos
  // numeros/tabelas normalmente.
  //
  // Dois modos: sem municipio selecionado, busca por macro_code (visao geral
  // da macro, comportamento original). Com municipio selecionado, busca por
  // RAIO GEOGRAFICO ao redor da sede dele, ignorando fronteira de macro --
  // o tomografo mais proximo desse municipio pode estar numa macro vizinha
  // (o criterio normativo de 75km e geografico puro, ver
  // backend/app/pipeline/geo.py), filtrar so por macro_code esconderia
  // exatamente o ponto que explica a distancia mostrada no badge abaixo.
  useEffect(() => {
    let cancelado = false;

    if (municipioSelecionado?.latitude != null && municipioSelecionado.longitude != null) {
      setTotalEstabelecimentosNoRaio(null);
      fetchEstabelecimentosPage({
        equipmentFamily: FAMILIA,
        near: { lat: municipioSelecionado.latitude, lon: municipioSelecionado.longitude, radiusKm: RAIO_BUSCA_MUNICIPIO_KM },
        page: 1,
        pageSize: MAX_ESTABELECIMENTOS_POR_MACRO,
      })
        .then((res) => {
          if (cancelado) return;
          // Ordem preservada de proposito -- o backend devolve esse modo ja
          // ordenado por distancia (mais proximo primeiro, ver
          // app/routers/equipment_offer.py), entao pontos[0] e sempre o
          // estabelecimento mais proximo do municipio selecionado (usado no
          // card "Equipamento mais proximo" abaixo).
          const pontos: PontoEstabelecimento[] = res.items
            .filter((e) => e.latitude != null && e.longitude != null)
            .map((e) => ({
              cnes: e.cnes,
              lat: e.latitude as number,
              lon: e.longitude as number,
              qtd: e.qtd,
              qtdUso: e.qtdUso,
              susFlag: e.susFlag,
              nome: e.nome,
              uf: e.uf,
              municipio: e.municipio,
            }));
          setPontosMacro(pontos);
          setTotalEstabelecimentosNoRaio(res.total);
        })
        .catch(() => !cancelado && setPontosMacro([]));
      return () => {
        cancelado = true;
      };
    }
    setTotalEstabelecimentosNoRaio(null);

    if (!selectedMacroId) {
      setPontosMacro([]);
      return;
    }
    fetchEstabelecimentosPage({
      equipmentFamily: FAMILIA,
      macroCodes: [selectedMacroId],
      page: 1,
      pageSize: MAX_ESTABELECIMENTOS_POR_MACRO,
    })
      .then((res) => {
        if (cancelado) return;
        const pontos: PontoEstabelecimento[] = res.items
          .filter((e) => e.latitude != null && e.longitude != null)
          .map((e) => ({
            cnes: e.cnes,
            lat: e.latitude as number,
            lon: e.longitude as number,
            qtd: e.qtd,
            qtdUso: e.qtdUso,
            susFlag: e.susFlag,
            nome: e.nome,
            uf: e.uf,
            municipio: e.municipio,
          }));
        setPontosMacro(pontos);
      })
      .catch(() => !cancelado && setPontosMacro([]));
    return () => {
      cancelado = true;
    };
  }, [FAMILIA, selectedMacroId, municipioSelecionado]);

  // Nome do municipio onde fica o equipamento mais proximo -- so calculado
  // quando um municipio esta selecionado E ele proprio nao tem equipamento
  // SUS (oferta, nao ofertaTotal -- corrigido 2026-08-24: um municipio com
  // SO equipamento privado nao tem acesso via SUS nenhum, entao o "mais
  // proximo" continua relevante pra ele; ofertaTotal escondia isso por
  // engano quando so contava privado). Se ja tem SUS proprio, nao ha "mais
  // proximo" relevante pra apontar, mostra so um tracinho (regra
  // confirmada 2026-08-24 -- Almenara/Jacinto/MG tem 1 SUS cada, o
  // tracinho ali e o comportamento certo, nao bug).
  //
  // So TOMOGRAFO tem o campo pre-calculado no pipeline
  // (distance_km_nearest_equipment, sem limite de raio -- ver
  // backend/app/pipeline/geo.py); pras demais familias (2026-08-24, a
  // pedido: "outros equipamentos que nao temos o raio") calcula ao vivo no
  // cliente com Haversine (utils/geo.ts), reaproveitando o mesmo
  // pontosMacro ja buscado pro mapa quando possivel:
  //   1. TOMOGRAFO com distancia dentro do raio visual -> pontosMacro[0]
  //      (ja teria vindo do efeito acima, sem busca extra).
  //   2. TOMOGRAFO com distancia FORA do raio visual (bug real corrigido
  //      2026-08-24, ex.: 385km) -> busca a parte, raio dimensionado
  //      exatamente pra essa distancia ja conhecida (nao infla o mapa).
  //   3. Outras familias, ja tem algo dentro do raio visual -> usa direto
  //      (distancia calculada por Haversine, ja que essas nao tem o campo
  //      pronto do pipeline).
  //   4. Outras familias, nada no raio visual -> UMA tentativa com raio
  //      continental (cobre qualquer par de pontos no Brasil) pra achar o
  //      mais proximo onde quer que esteja -- so 1 busca extra (nao varias
  //      tentativas incrementais), efeito colateral aceitavel em familia
  //      sem cobertura nenhuma (ex.: Ultrassom, 0 estabelecimentos hoje).
  useEffect(() => {
    let cancelado = false;
    setNomeEquipamentoMaisProximo(null);
    setDistanciaMaisProximaKm(null);

    if (!municipioSelecionado || municipioSelecionado.oferta > 0) return;
    if (municipioSelecionado.latitude == null || municipioSelecionado.longitude == null) return;
    const centro = { lat: municipioSelecionado.latitude, lon: municipioSelecionado.longitude };

    // "Municipio - UF" -- municipio sozinho e ambiguo (varios nomes se
    // repetem entre estados, mesmo motivo da chave composta usada nos
    // outros filtros da tela).
    function formatarMunicipioUf(municipio?: string | null, uf?: string | null): string | null {
      if (!municipio) return null;
      return uf ? `${municipio} - ${uf}` : municipio;
    }

    // Aceita tanto PontoEstabelecimento (pontosMacro, ja tem lat/lon
    // certos) quanto EstabelecimentoRow cru (resposta de
    // fetchEstabelecimentosPage, lat/lon podem vir null) -- normaliza os
    // dois pro mesmo formato antes de usar.
    function usarPonto(p: { latitude?: number | null; longitude?: number | null; lat?: number; lon?: number; municipio?: string | null; uf?: string | null } | undefined) {
      const lat = p?.lat ?? p?.latitude;
      const lon = p?.lon ?? p?.longitude;
      if (lat == null || lon == null) return;
      setDistanciaMaisProximaKm(distanciaKm(centro.lat, centro.lon, lat, lon));
      setNomeEquipamentoMaisProximo(formatarMunicipioUf(p?.municipio, p?.uf));
    }

    // pontosMacro NAO e filtrado por SUS (mostra os dois tipos no mapa, de
    // proposito, pro contexto visual -- ver legenda). Pra achar o mais
    // proximo que ATENDE SUS (2026-08-24, a pedido -- mesmo criterio que
    // "oferta" ja usa em todo o resto do app), procura o primeiro com
    // susFlag na lista ja ordenada por distancia; so cai pra busca
    // dedicada (com sus_flag=true no backend) se nao achar nenhum dentro
    // do que ja foi buscado.
    const maisProximoSusNoRaioVisual = pontosMacro.find((p) => p.susFlag && p.qtdUso > 0);

    if (FAMILIA === 'TOMOGRAFO') {
      const distancia = municipioSelecionado.distanciaKmEquipamentoMaisProximo;
      if (distancia == null) return;
      setDistanciaMaisProximaKm(distancia);
      if (distancia <= RAIO_BUSCA_MUNICIPIO_KM && maisProximoSusNoRaioVisual) {
        usarPonto(maisProximoSusNoRaioVisual);
        return;
      }
      fetchEstabelecimentosPage({
        equipmentFamily: FAMILIA,
        near: { ...centro, radiusKm: distancia + 2 },
        susOnly: true,
        inUseSusOnly: true,
        page: 1,
        pageSize: 1,
      })
        .then((res) => !cancelado && usarPonto(res.items[0]))
        .catch(() => {});
      return () => {
        cancelado = true;
      };
    }

    if (maisProximoSusNoRaioVisual) {
      usarPonto(maisProximoSusNoRaioVisual);
      return;
    }

    // RAIO_CONTINENTAL_KM: maior distancia possivel entre 2 pontos dentro
    // do Brasil e ~4300km (extremo norte a extremo sul) -- 4500km cobre
    // com folga, uma unica tentativa em vez de varias incrementais.
    const RAIO_CONTINENTAL_KM = 4500;
    fetchEstabelecimentosPage({
      equipmentFamily: FAMILIA,
      near: { ...centro, radiusKm: RAIO_CONTINENTAL_KM },
      susOnly: true,
      inUseSusOnly: true,
      page: 1,
      pageSize: 1,
    })
      .then((res) => !cancelado && usarPonto(res.items[0]))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [FAMILIA, municipioSelecionado, pontosMacro]);

  // Contorno REAL do municipio selecionado -- busca direto no navegador na
  // API de malhas do IBGE (https://servicodados.ibge.gov.br/api/v3/malhas/
  // municipios/{codigo7}), CORS liberado (Access-Control-Allow-Origin: *,
  // testado 2026-08-24) e sem chave/conta, dado geografico OFICIAL do
  // governo -- mais apropriado pra um projeto do Ministerio da Saude que
  // depender de terceiro. Payload pequeno (~10-25KB por municipio testado,
  // ate pra um contorno complexo tipo Sao Paulo capital) porque busca SO O
  // municipio selecionado, nunca a malha nacional inteira -- nada
  // vendorizado localmente (diferente do geojson de macro, que e reusado
  // em toda visita e por isso compensa empacotar; contorno de municipio so
  // e usado quando aquele municipio especifico e selecionado).
  useEffect(() => {
    let cancelado = false;
    setContornoMunicipio(null);

    const codigo7 = municipioSelecionado?.ibgeCode7;
    if (!codigo7) return;

    const emCache = cacheContornosRef.current.get(codigo7);
    if (emCache) {
      setContornoMunicipio(emCache);
      return;
    }

    fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/municipios/${codigo7}?formato=application/vnd.geo+json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((geoJson: GeoJSON.FeatureCollection) => {
        if (cancelado) return;
        const feature = geoJson.features[0];
        if (!feature) return;
        cacheContornosRef.current.set(codigo7, feature);
        setContornoMunicipio(feature);
      })
      .catch(() => {
        // silencia e segue -- mapa fica so sem o contorno extra (pin do
        // municipio e o resto da tela continuam funcionando normalmente).
      });
    return () => {
      cancelado = true;
    };
  }, [municipioSelecionado]);

  // Objeto estavel (mesma referencia entre renders iguais) -- MacroMapReal
  // redesenha o mapa (Leaflet) sempre que este prop muda de referencia; sem
  // memoizar, qualquer re-render nao relacionado (ex.: digitar no campo de
  // busca de outro filtro) recriava o objeto e disparava um redesenho
  // inteiro do mapa a toa.
  const centroMunicipio = useMemo(
    () =>
      municipioSelecionado?.latitude != null && municipioSelecionado.longitude != null
        ? { lat: municipioSelecionado.latitude, lon: municipioSelecionado.longitude, nome: municipioSelecionado.nome }
        : undefined,
    [municipioSelecionado],
  );

  const macroSelecionada = selectedMacroId ? macros.find((m) => m.id === selectedMacroId) : undefined;
  const coberturaSelecionada = selectedMacroId ? coberturaRows.find((r) => r.macroId === selectedMacroId) : undefined;

  // Dado unificado pros cards de resumo do "Recorte" abaixo -- municipio
  // selecionado tem prioridade (granularidade mais fina); sem municipio,
  // cai pra macro. Mesmo shape dos dois lados (pop/ofertaTotal) pra nao
  // duplicar o JSX dos cards por fonte.
  const infoSelecionado = municipioSelecionado
    ? { pop: municipioSelecionado.pop, ofertaTotal: municipioSelecionado.ofertaTotal }
    : macroSelecionada && coberturaSelecionada
      ? { pop: macroSelecionada.pop, ofertaTotal: coberturaSelecionada.ofertaTotal }
      : undefined;

  const coefSelecionada =
    macroSelecionada && coberturaSelecionada
      ? calcularCoeficiente(coberturaSelecionada.oferta, macroSelecionada.pop, equipamento.produtividade)
      : null;
  const pessoasPorEquipSelecionada =
    macroSelecionada && coberturaSelecionada && coberturaSelecionada.oferta > 0
      ? macroSelecionada.pop / coberturaSelecionada.oferta
      : null;

  if (loading) {
    return <div className="p-[60px] text-center text-muted-foreground">Carregando dados...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive-bg p-6 text-destructive">
        Não foi possível carregar os dados ({error}).
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[2fr_1fr] items-stretch gap-4">
        <div className="rounded-lg bg-card px-4.5 py-4">
          <div className="mb-2.5 text-sm font-semibold">
            Equipamentos — Cobertura por macrorregião de saúde
          </div>
          {geo && (
            <MacroMap
              geo={geo}
              macros={macros}
              coberturaRows={coberturaRows}
              selectedMacroId={selectedMacroId}
              produtividade={equipamento.produtividade}
              onSelectMacro={setSelectedMacroId}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3.5">
            {/* Mesma logica de MacroMap.tsx::escalaCor -- duas gradacoes com
                corte duro em 100% (a mesma "costura" no meio do degrade,
                dois stops na mesma posicao), nao mais um gradiente unico
                atravessando a meta sem distincao visual. var() em vez de hex
                cru -- 4 paradas na mesma barra, arbitrary-value Tailwind
                ficaria ilegivel pra esse caso. */}
            <div
              className="h-2 w-[140px] rounded"
              style={{
                background:
                  'linear-gradient(to right, var(--destructive) 0%, var(--destructive-bg) 50%, var(--success-bg) 50%, var(--success) 100%)',
              }}
            />
            <span className="text-[11px] text-muted-foreground">0x ── 1x ── 2x+</span>
          </div>
        </div>

        {/* Sem altura fixa/maxHeight aqui -- deixa o grid (alignItems:
            'stretch', o default do CSS Grid, so explicito acima por
            clareza) esticar esse card pra bater exatamente com a altura do
            mapa ao lado, self-adjusting pra qualquer tamanho de mapa/
            viewport em vez de um numero magico que desalinhava sempre que
            o mapa nao tinha exatamente essa altura (bug real visto
            2026-08-24). overflow:auto continua so como rede de seguranca,
            caso o conteudo (muitas regioes de saude expandidas) fique mais
            alto que o mapa. */}
        <div className="overflow-auto rounded-lg bg-card px-4.5 py-4">
          {macroSelecionada && coberturaSelecionada ? (
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {macroSelecionada.id}
                </span>
                <div className="text-[15px] font-semibold">
                  {macroSelecionada.nome} <span className="font-normal text-muted-foreground">({macroSelecionada.uf})</span>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-2.5">
                <StatusBadge status={coberturaSelecionada.status} />
                {coefSelecionada?.valor != null && (
                  <span className="text-[12.5px] font-semibold" style={{ color: coefSelecionada.corTexto }}>
                    {formatMultiplicador(coefSelecionada.valor)}
                  </span>
                )}
              </div>

              <div className="mt-2.5 text-xs leading-[1.7] text-muted-foreground">
                {macroSelecionada.pop.toLocaleString('pt-BR')} hab. SUS-dependentes · {coberturaSelecionada.oferta} equipamento
                {coberturaSelecionada.oferta === 1 ? '' : 's'} SUS
                {coberturaSelecionada.ofertaTotal !== coberturaSelecionada.oferta &&
                  ` de ${coberturaSelecionada.ofertaTotal} no total`}
                <br />
                Pessoas por equipamento: {pessoasPorEquipSelecionada != null ? `${formatMilhar(pessoasPorEquipSelecionada)}/1` : '—'}
              </div>

              <div className="mt-4 text-[11px] font-bold tracking-[0.04em] text-muted-foreground uppercase">
                Regiões de saúde
              </div>
              <div className="mt-1.5">
                {regioesSaude === 'carregando' && (
                  <div className="py-2 text-xs text-muted-foreground">Carregando regiões de saúde...</div>
                )}
                {regioesSaude === 'erro' && (
                  <div className="py-2 text-xs text-destructive">
                    Não foi possível carregar as regiões de saúde.
                  </div>
                )}
                {Array.isArray(regioesSaude) && (
                  <SubNivelRows rows={regioesSaude} nivelAtual="regiaoSaude" equipmentFamily={FAMILIA} />
                )}
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-muted-foreground">
              Selecione uma macrorregião no mapa para ver o detalhe por região de saúde.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-card px-4.5 py-4">
        <div className="text-sm font-semibold">Equipamentos — Mapa Rodoviário</div>

        {/* Resumo do que esta selecionado (municipio, se houver -- senao a
            macro) -- pedido explicito (2026-08-24), fica acima do filtro
            de Macro/Municipio abaixo. */}
        {infoSelecionado && (
          <div className="mt-3 flex flex-wrap gap-2.5">
            <CardInfo label="Total de equipamentos" valor={infoSelecionado.ofertaTotal.toLocaleString('pt-BR')} />
            {/* Distancia -- so existe no nivel Municipio (dado geografico
                por municipio). Cor so pro TOMOGRAFO (unica familia com
                criterio normativo de raio, 75km -- Caderno 1 SUS 2017):
                dentro = verde/bom, fora = vermelho/ruim, mesma convencao
                do resto do app. Pras demais familias (2026-08-24, a
                pedido) o valor ainda e calculado e mostrado, so que na cor
                default do CardInfo -- nao ha criterio oficial de raio pra
                colorir contra. */}
            <CardInfo
              label="Distância mais próxima"
              valor={distanciaMaisProximaKm != null ? `${distanciaMaisProximaKm.toFixed(0)} km` : '—'}
              cor={
                FAMILIA === 'TOMOGRAFO' && distanciaMaisProximaKm != null
                  ? distanciaMaisProximaKm <= 75
                    ? 'var(--success)'
                    : 'var(--destructive)'
                  : undefined
              }
            />
            <CardInfo label="Equipamento mais próximo" valor={nomeEquipamentoMaisProximo ?? '—'} />
            <CardInfo label="População SUS" valor={infoSelecionado.pop.toLocaleString('pt-BR')} />
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-xs font-semibold text-muted-foreground">Filtrar por</div>
          <div className="flex flex-wrap items-center gap-2">
            <SingleSelectFilter
              placeholder="Selecione uma macrorregião"
              value={selectedMacroId}
              onChange={setSelectedMacroId}
              options={[...macros]
                .sort((a, b) => a.uf.localeCompare(b.uf) || a.nome.localeCompare(b.nome))
                .map((m) => ({ value: m.id, label: `${m.uf} · ${m.id} · ${m.nome}` }))}
              minWidth={260}
            />
            <SingleSelectFilter
              placeholder="Toda a macrorregião"
              value={selectedMunicipioId}
              onChange={setSelectedMunicipioId}
              clearLabel="Toda a macrorregião"
              options={
                Array.isArray(municipiosMacro)
                  ? [...municipiosMacro]
                      .sort((a, b) => a.nome.localeCompare(b.nome))
                      .map((m) => ({ value: m.chave, label: `${m.nome} (${m.uf})` }))
                  : []
              }
              minWidth={220}
            />
          </div>
        </div>

        {municipioSelecionado && (
          <div className="mt-2.5 text-[12.5px] text-muted-foreground">
            Mostrando{' '}
            {totalEstabelecimentosNoRaio != null && totalEstabelecimentosNoRaio > pontosMacro.length
              ? `os ${pontosMacro.length} estabelecimentos mais próximos (de ${totalEstabelecimentosNoRaio} dentro de ${RAIO_BUSCA_MUNICIPIO_KM} km)`
              : `estabelecimentos num raio de ${RAIO_BUSCA_MUNICIPIO_KM} km`}{' '}
            de <strong>{municipioSelecionado.nome}</strong>.
          </div>
        )}

        {geo && (selectedMacroId || municipioSelecionado) && (
          <>
            <div className="mt-3">
              <Suspense
                fallback={
                  <div className="flex h-[560px] items-center justify-center text-muted-foreground">
                    Carregando mapa...
                  </div>
                }
              >
                <MacroMapReal
                  geo={geo}
                  macroId={selectedMacroId ?? undefined}
                  pontos={pontosMacro}
                  contornoMunicipio={contornoMunicipio}
                  centro={centroMunicipio}
                />
              </Suspense>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3.5">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-foreground" />
                estabelecimento (tamanho = qtd. de equipamentos)
              </span>
              {municipioSelecionado && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-card bg-destructive" />
                  município selecionado
                </span>
              )}
              {municipioSelecionado && (
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block h-2 w-3 rounded-[3px] border-[1.5px] border-dashed border-destructive" />
                  {contornoMunicipio ? 'contorno do município selecionado' : 'buscando contorno do município...'}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
