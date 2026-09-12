import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '../common/modal';
import { MultiSelectFilter } from '../common/multi-select-filter';
import { ExportSecaoAba } from '../features/export-secao-aba';
import { colors } from '../../styles/tokens';
import { REGIOES } from '../../data/constants';
import { useFiltrosMacro } from '../../hooks/useFiltrosMacro';
import { fetchEstabelecimentosPage, type FacilityOption } from '../../services/api';
import { CAMPOS_XLSX_COBERTURA, CAMPOS_XLSX_ESTABELECIMENTO, gerarXlsxTomografos } from '../../utils/export-xlsx';
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
}

function toggleNoSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  next.has(key) ? next.delete(key) : next.add(key);
  return next;
}

export function ExportXlsxModal({ onClose, equipmentFamily, macros, coberturaRowsTodas, facilities, filtrosIniciais }: Props) {
  // "usar filtros da tela" x "exportar tudo" -- quando desligado, o hook roda
  // sem recorte nenhum e a planilha sai completa.
  const [usarFiltros, setUsarFiltros] = useState(true);

  const filtros = useFiltrosMacro({
    macros,
    coberturaRows: coberturaRowsTodas,
    facilities,
    inicial: filtrosIniciais,
  });

  const [usarCobertura, setUsarCobertura] = useState(true);
  const [usarEstabelecimentos, setUsarEstabelecimentos] = useState(true);
  const [camposCobertura, setCamposCobertura] = useState(new Set(CAMPOS_XLSX_COBERTURA.map((c) => c.key)));
  const [camposEstabelecimentos, setCamposEstabelecimentos] = useState(
    new Set(CAMPOS_XLSX_ESTABELECIMENTO.map((c) => c.key)),
  );

  const nadaSelecionado = !usarCobertura && !usarEstabelecimentos;

  async function buscarEstabelecimentos(): Promise<EstabelecimentoRow[]> {
    const PAGE_SIZE = 2000;
    let page = 1;
    let todos: EstabelecimentoRow[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetchEstabelecimentosPage({
        equipmentFamily,
        states: usarFiltros ? filtros.estadosFiltro : undefined,
        macroCodes: usarFiltros ? filtros.macrosFiltro : undefined,
        healthRegionCodes: usarFiltros ? filtros.regioesSaudeFiltro : undefined,
        municipalities: usarFiltros ? filtros.municipiosFiltro : undefined,
        cnesCodes: usarFiltros ? filtros.cnesFiltro : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      todos = todos.concat(res.items);
      if (todos.length >= res.total || res.items.length < PAGE_SIZE) break;
      page += 1;
    }
    return todos;
  }

  // Geracao da planilha e uma ACAO sob demanda (disparada pelo clique em
  // "Gerar Excel"), nao leitura automatica de tela -- por isso `useMutation`,
  // nao `useQuery` (2026-09-11). `buscarEstabelecimentos` continua paginando
  // manualmente ate esgotar o total (endpoint nao devolve tudo de uma vez).
  const gerarMutation = useMutation({
    mutationFn: async () => {
      // a aba de Cobertura precisa dos estabelecimentos pra montar a quebra
      // por regiao de saude e municipio (os niveis do drill-down).
      const estabelecimentos = await buscarEstabelecimentos();
      const linhasCobertura = usarFiltros ? filtros.filteredRows : coberturaRowsTodas;

      await gerarXlsxTomografos({
        equipmentFamily,
        filtrosResumo: usarFiltros ? filtros.filtrosResumo : '',
        cobertura: usarCobertura
          ? { rows: linhasCobertura, macros, estabelecimentos, campos: camposCobertura }
          : undefined,
        estabelecimentos: usarEstabelecimentos
          ? { rows: estabelecimentos, campos: camposEstabelecimentos }
          : undefined,
      });
    },
    onSuccess: onClose,
  });
  const gerando = gerarMutation.isPending;
  const erro = gerarMutation.isError ? 'Não foi possível gerar a planilha. Tente novamente.' : null;

  return (
    <Modal onClose={onClose} maxWidth={580}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16213e' }}>Exportar Excel</div>
          <div style={{ color: colors.mutedText, fontSize: 13, marginTop: 6 }}>
            A planilha sai com uma aba de <strong>Metodologia</strong> explicando os cálculos, mais as abas de dados
            que você escolher.
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
          marginTop: 14,
          background: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: 12,
        }}
      >
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#16213e' }}
        >
          <input
            type="checkbox"
            checked={usarFiltros}
            onChange={() => setUsarFiltros((v) => !v)}
            style={{ width: 15, height: 15, accentColor: colors.primary }}
          />
          Aplicar filtros na exportação
        </label>
        <div style={{ fontSize: 11.5, color: colors.mutedText, marginTop: 4, marginBottom: usarFiltros ? 10 : 0 }}>
          {usarFiltros
            ? 'A planilha sai só com o recorte escolhido abaixo.'
            : 'A planilha sai com todos os dados, sem nenhum recorte.'}
        </div>

        {usarFiltros && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <MultiSelectFilter
              placeholder="CNES"
              options={filtros.cnesOptions}
              selected={filtros.filtroCnes}
              onChange={filtros.setFiltroCnes}
            />
            <MultiSelectFilter
              placeholder="Região"
              options={REGIOES.map((r) => ({ value: r, label: r }))}
              selected={filtros.filtroRegioes}
              onChange={(v) => {
                filtros.setFiltroRegioes(v);
                filtros.setFiltroUfs([]);
                filtros.setFiltroMacros([]);
                filtros.setFiltroRegioesSaude([]);
                filtros.setFiltroMunicipios([]);
                filtros.setFiltroCnes([]);
              }}
            />
            <MultiSelectFilter
              placeholder="Estado (UF)"
              options={filtros.ufOptions}
              selected={filtros.filtroUfs}
              onChange={(v) => {
                filtros.setFiltroUfs(v);
                filtros.setFiltroMacros([]);
                filtros.setFiltroRegioesSaude([]);
                filtros.setFiltroMunicipios([]);
                filtros.setFiltroCnes([]);
              }}
            />
            <MultiSelectFilter
              placeholder="Macrorregião de Saúde"
              options={filtros.macroOptions}
              selected={filtros.filtroMacros}
              onChange={(v) => {
                filtros.setFiltroMacros(v);
                filtros.setFiltroRegioesSaude([]);
                filtros.setFiltroMunicipios([]);
                filtros.setFiltroCnes([]);
              }}
            />
            <MultiSelectFilter
              placeholder="Região de Saúde"
              options={filtros.regiaoSaudeOptions}
              selected={filtros.filtroRegioesSaude}
              onChange={(v) => {
                filtros.setFiltroRegioesSaude(v);
                filtros.setFiltroMunicipios([]);
                filtros.setFiltroCnes([]);
              }}
            />
            <MultiSelectFilter
              placeholder="Município"
              options={filtros.municipioOptions}
              selected={filtros.filtroMunicipios}
              onChange={(v) => {
                filtros.setFiltroMunicipios(v);
                filtros.setFiltroCnes([]);
              }}
            />
            {filtros.hasAnyFilter && (
              <button
                onClick={filtros.limparFiltros}
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
        )}
      </div>

      <ExportSecaoAba
        titulo="Aba: Cobertura por macrorregião"
        descricao="Detalha até município, com agrupamento (+/−) por macrorregião e região de saúde."
        ativa={usarCobertura}
        onToggleAtiva={() => setUsarCobertura((v) => !v)}
        campos={CAMPOS_XLSX_COBERTURA}
        selecionados={camposCobertura}
        onToggleCampo={(key) => setCamposCobertura((prev) => toggleNoSet(prev, key))}
      />

      <ExportSecaoAba
        titulo="Aba: Estabelecimento por equipamento"
        descricao="Um estabelecimento por linha, com os subtipos (canais) numa coluna."
        ativa={usarEstabelecimentos}
        onToggleAtiva={() => setUsarEstabelecimentos((v) => !v)}
        campos={CAMPOS_XLSX_ESTABELECIMENTO}
        selecionados={camposEstabelecimentos}
        onToggleCampo={(key) => setCamposEstabelecimentos((prev) => toggleNoSet(prev, key))}
      />

      {erro && <div style={{ marginTop: 12, fontSize: 12, color: colors.hipoRed }}>{erro}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          onClick={onClose}
          style={{ ...botaoBase, background: '#fff', color: '#475066', border: `1px solid ${colors.border}` }}
        >
          Cancelar
        </button>
        <button
          onClick={() => gerarMutation.mutate()}
          disabled={nadaSelecionado || gerando}
          style={{
            ...botaoBase,
            border: 'none',
            background: nadaSelecionado || gerando ? '#9aa5c7' : colors.hiperGreen,
            color: '#fff',
            cursor: nadaSelecionado || gerando ? 'default' : 'pointer',
          }}
        >
          {gerando ? 'Gerando...' : '⬇ Gerar Excel'}
        </button>
      </div>
    </Modal>
  );
}

const botaoBase = {
  flex: 1,
  padding: '11px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
};
