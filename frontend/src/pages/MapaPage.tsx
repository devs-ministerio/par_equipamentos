import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { BrazilMap } from '../components/mapa/BrazilMap';
import { ExportPdfModal } from '../components/modals/ExportPdfModal';
import { fetchEstabelecimentosPage, fetchFacilities, fetchMacroCoverage } from '../services/api';
import type { FacilityOption } from '../services/api';
import { statusMeta } from '../utils/status';
import { formatMilhar } from '../utils/format';
import { svgParaPng } from '../utils/captureSvg';
import { colors } from '../styles/tokens';
import type { CoberturaRow, EstabelecimentoRow, Macrorregiao } from '../types/domain';

const MAX_ESTABELECIMENTOS_POR_UF = 2000; // maior estado (SP) tem ~1700

// TODO(risco pendente, revisao senior 2026-08-21): geometria dos estados
// buscada ao vivo, a cada carregamento, de um repositorio GitHub de
// terceiro (nao-oficial) via CDN publico -- sem fallback local, sem cache,
// sem controle de versao desse arquivo. Pra uma ferramenta de ministerio,
// o ideal e vendorizar esse geojson como asset local versionado (ex.:
// frontend/src/data/brazil-states.geojson) assim que alguem com acesso a
// internet puder baixa-lo -- o agente que fez essa revisao rodava num
// sandbox sem acesso de rede de saida e nao pode baixar o arquivo aqui.
const GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/codeforamerica/click_that_hood@master/public/data/brazil-states.geojson';
const FAMILIA = 'TOMOGRAFO';

function LegendPill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{label}</div>
    </div>
  );
}

export function MapaPage() {
  const [geo, setGeo] = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null);
  const [macros, setMacros] = useState<Macrorregiao[]>([]);
  const [coberturaRows, setCoberturaRows] = useState<CoberturaRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUf, setSelectedUf] = useState<string | null>(null);

  const [ufEstabelecimentos, setUfEstabelecimentos] = useState<EstabelecimentoRow[]>([]);
  const [ufEstabLoading, setUfEstabLoading] = useState(false);
  const [macrosExpandidas, setMacrosExpandidas] = useState<Set<string>>(new Set());
  const [macroHover, setMacroHover] = useState<string | null>(null);
  const [exportPdfAberto, setExportPdfAberto] = useState(false);
  const mapaContainerRef = useRef<HTMLDivElement>(null);

  async function capturarMapa() {
    if (!mapaContainerRef.current) return null;
    return svgParaPng(mapaContainerRef.current);
  }

  function toggleMacroExpandida(macroId: string) {
    setMacrosExpandidas((prev) => {
      const next = new Set(prev);
      next.has(macroId) ? next.delete(macroId) : next.add(macroId);
      return next;
    });
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetch(GEOJSON_URL).then((r) => r.json()), fetchMacroCoverage(FAMILIA), fetchFacilities(FAMILIA)])
      .then(([geoData, coverage, facilityOptions]) => {
        setGeo(geoData);
        setMacros(coverage.macros);
        setCoberturaRows(coverage.coberturaRows);
        setFacilities(facilityOptions);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // busca so quando um estado e selecionado -- em vez de trazer os ~8000
  // estabelecimentos nacionais pra so mostrar o recorte de 1 UF por vez.
  useEffect(() => {
    setMacrosExpandidas(new Set());
    if (!selectedUf) {
      setUfEstabelecimentos([]);
      return;
    }
    setUfEstabLoading(true);
    fetchEstabelecimentosPage({
      equipmentFamily: FAMILIA,
      states: [selectedUf],
      page: 1,
      pageSize: MAX_ESTABELECIMENTOS_POR_UF,
    })
      .then((res) => setUfEstabelecimentos(res.items))
      .catch(() => setUfEstabelecimentos([]))
      .finally(() => setUfEstabLoading(false));
  }, [selectedUf]);

  const ufCobertura = useMemo(() => {
    const porUf: Record<string, number[]> = {};
    coberturaRows.forEach((r) => {
      const macro = macros.find((m) => m.id === r.macroId);
      if (!macro) return;
      (porUf[macro.uf] ??= []).push(r.cobertura);
    });
    const media: Record<string, number> = {};
    for (const [uf, valores] of Object.entries(porUf)) {
      media[uf] = Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;
    }
    return media;
  }, [macros, coberturaRows]);

  // soma populacao / soma oferta por UF (ponderado, mesma logica da
  // CoberturaTable/KpiCard) -- alimenta o "pessoas por tomografo" do tooltip
  // do mapa.
  const ufPessoasPorTomografo = useMemo(() => {
    const pop: Record<string, number> = {};
    const oferta: Record<string, number> = {};
    coberturaRows.forEach((r) => {
      const macro = macros.find((m) => m.id === r.macroId);
      if (!macro) return;
      pop[macro.uf] = (pop[macro.uf] ?? 0) + macro.pop;
      oferta[macro.uf] = (oferta[macro.uf] ?? 0) + r.oferta;
    });
    const resultado: Record<string, number | null> = {};
    for (const uf of Object.keys(pop)) {
      resultado[uf] = oferta[uf] > 0 ? pop[uf] / oferta[uf] : null;
    }
    return resultado;
  }, [macros, coberturaRows]);

  // ordena pelo numero no final do nome (ex.: "RRAS1" antes de "RRAS10") --
  // ordem alfabetica pura colocaria RRAS10..RRAS19 antes de RRAS2. Estados
  // cuja macro nao termina em numero caem no fallback por nome.
  const ufMacros = selectedUf
    ? macros
        .filter((m) => m.uf === selectedUf)
        .sort((a, b) => {
          const na = Number(a.nome.match(/(\d+)$/)?.[1]);
          const nb = Number(b.nome.match(/(\d+)$/)?.[1]);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return a.nome.localeCompare(b.nome);
        })
    : [];
  const ufPessoasPorTomografoSelecionado = selectedUf ? (ufPessoasPorTomografo[selectedUf] ?? null) : null;

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center', color: colors.subtleText }}>Carregando dados...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 24, background: '#fde8e8', color: colors.hipoRed, borderRadius: 8 }}>
        Não foi possível carregar os dados ({error}).
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 8 }}>
        <button
          onClick={() => setExportPdfAberto(true)}
          disabled={!selectedUf}
          title={selectedUf ? undefined : 'Selecione um estado no mapa primeiro'}
          style={{
            padding: '7px 16px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: selectedUf ? 'pointer' : 'not-allowed',
            border: `1px solid ${colors.border}`,
            background: selectedUf ? '#fff' : '#f4f6fb',
            color: selectedUf ? colors.hipoRed : colors.subtleText,
          }}
        >
          ⬇ PDF
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
            Tomógrafos — Cobertura por macrorregião de saúde
          </div>
          {geo && (
            <BrazilMap
              ref={mapaContainerRef}
              geo={geo}
              ufCobertura={ufCobertura}
              ufPessoasPorTomografo={ufPessoasPorTomografo}
              onSelectUf={(uf) => setSelectedUf(uf)}
            />
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <LegendPill color={colors.hipoRed} bg={colors.hipoRedBg} label="Hipossuficiente" />
            <LegendPill color={colors.hiperGreen} bg={colors.hiperGreenBg} label="Hiperssuficiente" />
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 8, padding: '16px 18px', maxHeight: 620, overflow: 'auto' }}>
          {selectedUf ? (
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{selectedUf}</div>
              <div style={{ fontSize: 12, color: colors.mutedText, marginBottom: 12 }}>
                Pessoas por tomógrafo:{' '}
                {ufPessoasPorTomografoSelecionado != null ? `${formatMilhar(ufPessoasPorTomografoSelecionado)}/1` : '—'}
              </div>
              {ufEstabLoading && (
                <div style={{ fontSize: 12, color: colors.subtleText, marginBottom: 8 }}>Carregando estabelecimentos...</div>
              )}

              {ufMacros.map((m) => {
                const row = coberturaRows.find((r) => r.macroId === m.id);
                const cobertura = row?.cobertura ?? 0;
                const meta = statusMeta(cobertura);
                // mesma logica da barra da coluna "Cobertura" no Dashboard --
                // a listra no meio e a meta oficial (100 mil/aparelho), a
                // barra enche PRA MAIS quanto PIOR a cobertura (mais gente
                // dividindo o mesmo aparelho).
                const pessoasPorEquip = row && row.oferta > 0 ? m.pop / row.oferta : null;
                const fillPercent = pessoasPorEquip != null ? Math.min(100, (pessoasPorEquip / 100_000) * 50) : 0;
                const expandida = macrosExpandidas.has(m.id);
                const estabelecimentosDaMacro = ufEstabelecimentos.filter((e) => e.macroId === m.id);
                return (
                  <div key={m.id} style={{ borderTop: '1px solid #f0f1f5' }}>
                    <div
                      onClick={() => toggleMacroExpandida(m.id)}
                      onMouseEnter={() => setMacroHover(m.id)}
                      onMouseLeave={() => setMacroHover((v) => (v === m.id ? null : v))}
                      style={{
                        padding: '10px 6px',
                        cursor: 'pointer',
                        borderRadius: 6,
                        background: macroHover === m.id ? colors.primaryLight : 'transparent',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: macroHover === m.id ? colors.primary : 'inherit',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            color: colors.subtleText,
                            transform: expandida ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s',
                            display: 'inline-block',
                          }}
                        >
                          ▶
                        </span>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: colors.subtleText }}>{m.id}</span>
                        {m.nome}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <div style={{ width: 80, height: 4, borderRadius: 2, background: '#eef0f4', overflow: 'clip', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${fillPercent}%`, background: meta.color }} />
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: '50%',
                              width: 1,
                              background: '#475066',
                              transform: 'translateX(-50%)',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 20,
                            background: meta.bg,
                            color: meta.color,
                          }}
                        >
                          {meta.label}
                        </span>
                      </div>
                    </div>

                    {expandida && (
                      <div style={{ padding: '0 6px 10px 24px' }}>
                        {!ufEstabLoading && estabelecimentosDaMacro.length === 0 && (
                          <div style={{ fontSize: 12, color: colors.subtleText }}>Nenhum estabelecimento cadastrado.</div>
                        )}
                        {estabelecimentosDaMacro.map((e) => (
                          <div key={e.cnes} style={{ padding: '7px 0', borderTop: '1px solid #f0f1f5' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: 10,
                                  color: '#98a0b3',
                                  background: '#f4f6fb',
                                  padding: '2px 5px',
                                  borderRadius: 3,
                                }}
                              >
                                {e.cnes}
                              </span>
                              <span style={{ fontSize: 10, color: '#98a0b3' }}>qtd: {e.qtd}</span>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 500, marginTop: 2 }}>{e.nome}</div>
                            <div style={{ fontSize: 11, color: '#667085' }}>
                              {e.municipio} · {e.tipos.map((t) => `${t.tipo} (${t.qtd})`).join(', ')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: colors.subtleText, fontSize: 13 }}>
              Selecione um estado no mapa para ver o detalhe por macrorregião de saúde.
            </div>
          )}
        </div>
      </div>

      {exportPdfAberto && (
        <ExportPdfModal
          onClose={() => setExportPdfAberto(false)}
          equipmentFamily={FAMILIA}
          macros={macros}
          coberturaRowsTodas={coberturaRows}
          facilities={facilities}
          filtrosIniciais={{
            regioes: [],
            ufs: selectedUf ? [selectedUf] : [],
            macros: [],
            regioesSaude: [],
            municipios: [],
            cnes: [],
          }}
          capturarMapa={capturarMapa}
        />
      )}
    </div>
  );
}
