import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent } from '../ui/dialog';
import { FilterWorkspace } from '../common/filter-workspace';
import { MultiSelectFilter } from '../common/multi-select-filter';
import { ExportSecaoTabela } from '../features/export-secao-tabela';
import { REGIOES } from '../../data/constants';
import { useFiltrosMacro } from '../../hooks/useFiltrosMacro';
import { fetchEstabelecimentosPage, type FacilityOption } from '../../services/api';
import { CAMPOS_COBERTURA, CAMPOS_ESTABELECIMENTO, gerarPdfMapa, gerarPdfTomografos } from '../../utils/export-pdf';
import type { ImagemCapturada } from '../../utils/capture-svg';
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
  if (next.has(key)) next.delete(key); else next.add(key);
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

  // Geracao do PDF e uma ACAO sob demanda (disparada pelo clique em "Gerar
  // PDF"), nao leitura automatica de tela -- por isso `useMutation`, nao
  // `useQuery` (2026-09-11). `fetchTodosEstabelecimentos` continua paginando
  // manualmente ate esgotar o total (endpoint nao devolve tudo de uma vez).
  const gerarMutation = useMutation({
    mutationFn: async () => {
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
    },
    onSuccess: onClose,
  });
  const gerando = gerarMutation.isPending;
  const erro = gerarMutation.isError ? 'Não foi possível gerar o PDF. Tente novamente.' : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-label="Janela de diálogo"
        showCloseButton={false}
        className="max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-[10px] bg-card p-8"
      >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[22px] font-extrabold text-[#16213e]">Exportar PDF</div>
          <div className="mt-1.5 text-[13px] text-muted-foreground">
            Escolha o recorte de dados e quais tabelas/campos entram no relatório.
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="cursor-pointer border-none bg-transparent p-1 text-xl leading-none text-muted-foreground/70"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 rounded-[6px] border border-border bg-background p-3">
        <FilterWorkspace className="mb-0 border-0 py-0" hasAnyFilter={hasAnyFilter} onClear={limparFiltros}>
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
        </FilterWorkspace>
      </div>

      {modoMapa ? (
        <div className="mt-3.5 text-[11.5px] text-muted-foreground/70">
          O mapa, a lista de UFs/macrorregiões e a tabela de cobertura sempre entram nesse relatório.
        </div>
      ) : (
        <ExportSecaoTabela
          titulo="Cobertura por macrorregião e equipamento"
          ativa={usarCobertura}
          onToggleAtiva={() => setUsarCobertura((v) => !v)}
          campos={CAMPOS_COBERTURA}
          selecionados={camposCobertura}
          onToggleCampo={(key) => setCamposCobertura((prev) => toggleNoSet(prev, key))}
        />
      )}

      <ExportSecaoTabela
        titulo="Estabelecimentos"
        ativa={usarEstabelecimentos}
        onToggleAtiva={() => setUsarEstabelecimentos((v) => !v)}
        campos={CAMPOS_ESTABELECIMENTO}
        selecionados={camposEstabelecimentos}
        onToggleCampo={(key) => setCamposEstabelecimentos((prev) => toggleNoSet(prev, key))}
      />

      {erro && <div className="mt-3 text-xs text-destructive">{erro}</div>}

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onClose}
          className="flex-1 rounded-[8px] border border-border bg-white px-4 py-2.75 text-[13px] font-bold text-muted-foreground"
        >
          Cancelar
        </button>
        <button
          onClick={() => gerarMutation.mutate()}
          disabled={nadaSelecionado || gerando}
          className={`flex-1 rounded-[8px] border-none px-4 py-2.75 text-[13px] font-bold text-white ${
            nadaSelecionado || gerando ? 'cursor-default bg-[#9aa5c7]' : 'cursor-pointer bg-primary'
          }`}
        >
          {gerando ? 'Gerando...' : '⬇ Gerar PDF'}
        </button>
      </div>
      </DialogContent>
    </Dialog>
  );
}
