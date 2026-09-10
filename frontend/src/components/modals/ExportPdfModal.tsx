import { useMemo, useState } from 'react';
import { Modal } from '../common/Modal';
import { MultiSelectFilter } from '../common/MultiSelectFilter';
import { colors } from '../../styles/tokens';
import { REGIOES } from '../../data/constants';
import { useFiltrosMacro } from '../../hooks/useFiltrosMacro';
import { fetchEstabelecimentosPage, type FacilityOption } from '../../services/api';
import { CAMPOS_COBERTURA, CAMPOS_ESTABELECIMENTO, gerarPdfMapa, gerarPdfTomografos } from '../../utils/exportPdf';
import type { ImagemCapturada } from '../../utils/captureSvg';
import type { CoberturaRow, EstabelecimentoRow, Macrorregiao } from '../../types/domain';

interface Props {
  onClose: () => void;
  equipmentFamily: string;
  macros: Macrorregiao[];
  coberturaRowsTodas: CoberturaRow[];
  facilities: FacilityOption[];
  filtrosIniciais: {
    regioes: string[];
    ufs: string[];
    macros: string[];
    regioesSaude: string[];
    municipios: string[];
    cnes: string[];
  };
  /** Se presente, ativa o layout de relatorio da aba Mapa (mapa + lista de
   * UFs/macros + cobertura, sempre incluida) em vez do layout generico so de
   * tabelas do Dashboard. */
  capturarMapa?: () => Promise<ImagemCapturada | null>;
}

function toggleNoSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  next.has(key) ? next.delete(key) : next.add(key);
  return next;
}

export function ExportPdfModal({
  onClose,
  equipmentFamily,
  macros,
  coberturaRowsTodas,
  facilities,
  filtrosIniciais,
  capturarMapa,
}: Props) {
  const modoMapa = Boolean(capturarMapa);
  const {
    filtroRegioes,
    filtroUfs,
    filtroMacros,
    filtroRegioesSaude,
    filtroMunicipios,
    filtroCnes,
    setFiltroRegioes,
    setFiltroUfs,
    setFiltroMacros,
    setFiltroRegioesSaude,
    setFiltroMunicipios,
    setFiltroCnes,
    ufOptions,
    macroOptions,
    regiaoSaudeOptions,
    municipioOptions,
    cnesOptions,
    filteredRows,
    estadosFiltro,
    macrosFiltro,
    regioesSaudeFiltro,
    municipiosFiltro,
    cnesFiltro,
    hasAnyFilter,
    limparFiltros,
    filtrosResumo,
  } = useFiltrosMacro({
    macros,
    coberturaRows: coberturaRowsTodas,
    facilities,
    inicial: filtrosIniciais,
  });

  const [usarCobertura, setUsarCobertura] = useState(true);
  const [usarEstabelecimentos, setUsarEstabelecimentos] = useState(true);
  const [camposCobertura, setCamposCobertura] = useState(new Set(CAMPOS_COBERTURA.map((c) => c.key)));
  const [camposEstabelecimentos, setCamposEstabelecimentos] = useState(
    new Set(CAMPOS_ESTABELECIMENTO.map((c) => c.key)),
  );
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // no layout com mapa, a cobertura entra sempre (faz parte fixa do relatorio)
  // -- so Estabelecimentos continua opcional.
  const nadaSelecionado = modoMapa ? false : !usarCobertura && !usarEstabelecimentos;

  // agrupa as macros (ja filtradas) por UF pra alimentar a lista ao lado do
  // mapa no layout da aba Mapa -- mesma ordenacao numero-aware usada no
  // painel da aba Mapa (RRAS1 antes de RRAS10).
  const ufsComMacros = useMemo(() => {
    const porUf = new Map<string, Macrorregiao[]>();
    filteredRows.forEach((r) => {
      const macro = macros.find((m) => m.id === r.macroId);
      if (!macro) return;
      if (!porUf.has(macro.uf)) porUf.set(macro.uf, []);
      porUf.get(macro.uf)!.push(macro);
    });
    return [...porUf.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([uf, ms]) => ({
        uf,
        macros: ms
          .sort((a, b) => {
            const na = Number(a.nome.match(/(\d+)$/)?.[1]);
            const nb = Number(b.nome.match(/(\d+)$/)?.[1]);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return a.nome.localeCompare(b.nome);
          })
          .map((m) => ({ codigo: m.id, nome: m.nome })),
      }));
  }, [filteredRows, macros]);

  // busca TODOS os estabelecimentos que batem com o filtro escolhido aqui no
  // popup (nao so a pagina que a EstabelecimentoTable do Dashboard mostra) --
  // pagina em loop ate esgotar o total.
  async function fetchTodosEstabelecimentos(): Promise<EstabelecimentoRow[]> {
    const PAGE_SIZE = 2000;
    let page = 1;
    let todos: EstabelecimentoRow[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetchEstabelecimentosPage({
        equipmentFamily,
        states: estadosFiltro,
        macroCodes: macrosFiltro,
        healthRegionCodes: regioesSaudeFiltro,
        municipalities: municipiosFiltro,
        cnesCodes: cnesFiltro,
        page,
        pageSize: PAGE_SIZE,
      });
      todos = todos.concat(res.items);
      if (todos.length >= res.total || res.items.length < PAGE_SIZE) break;
      page += 1;
    }
    return todos;
  }

  async function gerar() {
    if (nadaSelecionado || gerando) return;
    setGerando(true);
    setErro(null);
    try {
      const estabelecimentos = usarEstabelecimentos ? await fetchTodosEstabelecimentos() : undefined;

      if (capturarMapa) {
        const mapa = await capturarMapa();
        if (!mapa) throw new Error('mapa indisponível');
        await gerarPdfMapa({
          filtrosResumo,
          mapa,
          ufsComMacros,
          cobertura: { rows: filteredRows, macros, campos: camposCobertura },
          estabelecimentos: estabelecimentos ? { rows: estabelecimentos, campos: camposEstabelecimentos } : undefined,
        });
      } else {
        await gerarPdfTomografos({
          filtrosResumo,
          cobertura: usarCobertura ? { rows: filteredRows, macros, campos: camposCobertura } : undefined,
          estabelecimentos: estabelecimentos ? { rows: estabelecimentos, campos: camposEstabelecimentos } : undefined,
        });
      }
      onClose();
    } catch {
      setErro('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={560}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16213e' }}>Exportar PDF</div>
          <div style={{ color: colors.mutedText, fontSize: 13, marginTop: 6 }}>
            Escolha o recorte de dados e quais tabelas/campos entram no relatório.
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: 20,
            lineHeight: 1,
            color: colors.subtleText,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: '12px',
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#475066', marginBottom: 8 }}>Filtros aplicados</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <MultiSelectFilter placeholder="CNES" options={cnesOptions} selected={filtroCnes} onChange={setFiltroCnes} />
          <MultiSelectFilter
            placeholder="Região"
            options={REGIOES.map((r) => ({ value: r, label: r }))}
            selected={filtroRegioes}
            onChange={(v) => {
              setFiltroRegioes(v);
              setFiltroUfs([]);
              setFiltroMacros([]);
              setFiltroRegioesSaude([]);
              setFiltroMunicipios([]);
              setFiltroCnes([]);
            }}
          />
          <MultiSelectFilter
            placeholder="Estado (UF)"
            options={ufOptions}
            selected={filtroUfs}
            onChange={(v) => {
              setFiltroUfs(v);
              setFiltroMacros([]);
              setFiltroRegioesSaude([]);
              setFiltroMunicipios([]);
              setFiltroCnes([]);
            }}
          />
          <MultiSelectFilter
            placeholder="Macrorregião de Saúde"
            options={macroOptions}
            selected={filtroMacros}
            onChange={(v) => {
              setFiltroMacros(v);
              setFiltroRegioesSaude([]);
              setFiltroMunicipios([]);
              setFiltroCnes([]);
            }}
          />
          <MultiSelectFilter
            placeholder="Região de Saúde"
            options={regiaoSaudeOptions}
            selected={filtroRegioesSaude}
            onChange={(v) => {
              setFiltroRegioesSaude(v);
              setFiltroMunicipios([]);
              setFiltroCnes([]);
            }}
          />
          <MultiSelectFilter
            placeholder="Município"
            options={municipioOptions}
            selected={filtroMunicipios}
            onChange={(v) => {
              setFiltroMunicipios(v);
              setFiltroCnes([]);
            }}
          />
          {hasAnyFilter && (
            <button
              onClick={limparFiltros}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid #f0a0a0',
                background: '#fff0f0',
                color: '#c0392b',
              }}
            >
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {modoMapa ? (
        <div style={{ marginTop: 14, fontSize: 11.5, color: colors.subtleText }}>
          O mapa, a lista de UFs/macrorregiões e a tabela de cobertura sempre entram nesse relatório.
        </div>
      ) : (
        <SecaoTabela
          titulo="Cobertura por macrorregião e equipamento"
          ativa={usarCobertura}
          onToggleAtiva={() => setUsarCobertura((v) => !v)}
          campos={CAMPOS_COBERTURA}
          selecionados={camposCobertura}
          onToggleCampo={(key) => setCamposCobertura((prev) => toggleNoSet(prev, key))}
        />
      )}

      <SecaoTabela
        titulo="Estabelecimentos"
        ativa={usarEstabelecimentos}
        onToggleAtiva={() => setUsarEstabelecimentos((v) => !v)}
        campos={CAMPOS_ESTABELECIMENTO}
        selecionados={camposEstabelecimentos}
        onToggleCampo={(key) => setCamposEstabelecimentos((prev) => toggleNoSet(prev, key))}
      />

      {erro && <div style={{ marginTop: 12, fontSize: 12, color: colors.hipoRed }}>{erro}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ ...botaoBase, background: '#fff', color: '#475066', border: `1px solid ${colors.border}` }}>
          Cancelar
        </button>
        <button
          onClick={gerar}
          disabled={nadaSelecionado || gerando}
          style={{
            ...botaoBase,
            border: 'none',
            background: nadaSelecionado || gerando ? '#9aa5c7' : colors.primary,
            color: '#fff',
            cursor: nadaSelecionado || gerando ? 'default' : 'pointer',
          }}
        >
          {gerando ? 'Gerando...' : '⬇ Gerar PDF'}
        </button>
      </div>
    </Modal>
  );
}

function SecaoTabela({
  titulo,
  ativa,
  onToggleAtiva,
  campos,
  selecionados,
  onToggleCampo,
}: {
  titulo: string;
  ativa: boolean;
  onToggleAtiva: () => void;
  campos: { key: string; label: string }[];
  selecionados: Set<string>;
  onToggleCampo: (key: string) => void;
}) {
  return (
    <div style={{ marginTop: 14, border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: '#fafbfd',
          borderBottom: ativa ? `1px solid ${colors.border}` : 'none',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: 13,
          color: '#16213e',
        }}
      >
        <input type="checkbox" checked={ativa} onChange={onToggleAtiva} style={{ width: 15, height: 15, accentColor: colors.primary }} />
        {titulo}
      </label>
      {ativa && (
        <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {campos.map((c) => (
            <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475066', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selecionados.has(c.key)}
                onChange={() => onToggleCampo(c.key)}
                style={{ width: 13, height: 13, accentColor: colors.primary }}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const botaoBase = {
  flex: 1,
  padding: '11px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
};
