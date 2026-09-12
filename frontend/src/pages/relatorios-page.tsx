import { useEffect, useState } from 'react';
import { ExportPdfModal } from '../components/modals/export-pdf-modal';
import { ExportXlsxModal } from '../components/modals/export-xlsx-modal';
import { fetchFacilities, fetchMacroCoverage } from '../services/api';
import type { FacilityOption } from '../services/api';
import { useFamiliaEquipamento } from '../context/familia-equipamento-context';
import { colors } from '../styles/tokens';
import { MetodologiaPage } from './metodologia-page';
import type { CoberturaRow, Macrorregiao } from '../types/domain';

const FILTROS_VAZIOS = { regioes: [], ufs: [], macros: [], regioesSaude: [], municipios: [], cnes: [] };

function CardExportar({
  titulo,
  descricao,
  corBotao,
  rotuloBotao,
  onClick,
  desabilitado,
}: {
  titulo: string;
  descricao: string;
  corBotao: string;
  rotuloBotao: string;
  onClick: () => void;
  /** Temporario (2026-08-24, a pedido) -- exportacao desligada por
   * enquanto, sem remover o botao/modal/fetch (so reativar depois tirando
   * essa prop). */
  desabilitado?: boolean;
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '24px 26px', flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#16213e', marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 13, color: colors.mutedText, lineHeight: 1.6, marginBottom: 18 }}>{descricao}</div>
      <button
        onClick={onClick}
        disabled={desabilitado}
        title={desabilitado ? 'Exportação temporariamente indisponível' : undefined}
        style={{
          padding: '10px 20px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          cursor: desabilitado ? 'not-allowed' : 'pointer',
          border: 'none',
          background: desabilitado ? '#d8dce5' : corBotao,
          color: desabilitado ? colors.subtleText : '#fff',
        }}
      >
        {rotuloBotao}
      </button>
    </div>
  );
}

/**
 * Pagina de Relatorios -- exportacoes (PDF/Excel, movidas do Dashboard pra
 * cá, decisao 2026-08-22) + a Metodologia (que antes tinha item proprio no
 * menu, agora vira secao aqui). Busca macro-coverage/facilities sozinha
 * (mesmo padrao ja usado em Dashboard/Mapa) porque os modais de exportacao
 * precisam desse dado -- nao herda o filtro que o usuario tenha deixado
 * aplicado no Dashboard (cada modal ja tem seu proprio seletor de filtro
 * embutido, entao da pra escolher de novo aqui sem perda de funcionalidade).
 */
export function RelatoriosPage() {
  const { familia: FAMILIA } = useFamiliaEquipamento();
  const [macros, setMacros] = useState<Macrorregiao[]>([]);
  const [coberturaRows, setCoberturaRows] = useState<CoberturaRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportPdfAberto, setExportPdfAberto] = useState(false);
  const [exportXlsxAberto, setExportXlsxAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchMacroCoverage(FAMILIA), fetchFacilities(FAMILIA)])
      .then(([coverage, facilityOptions]) => {
        if (cancelado) return;
        setMacros(coverage.macros);
        setCoberturaRows(coverage.coberturaRows);
        setFacilities(facilityOptions);
      })
      .catch((e: Error) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setLoading(false));
    return () => {
      cancelado = true;
    };
  }, [FAMILIA]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#16213e' }}>Relatórios e Informações</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <CardExportar
          titulo="⬇ Exportar PDF"
          descricao="Relatório com a tabela de cobertura e/ou a lista de estabelecimentos, com o recorte de filtro que você escolher no próprio popup."
          corBotao={colors.hipoRed}
          rotuloBotao="Gerar PDF"
          onClick={() => setExportPdfAberto(true)}
          desabilitado
        />
        <CardExportar
          titulo="⬇ Exportar Excel"
          descricao="Planilha com abas de cobertura, estabelecimentos e a metodologia de cálculo, com o recorte de filtro que você escolher no próprio popup."
          corBotao={colors.hiperGreen}
          rotuloBotao="Gerar Excel"
          onClick={() => setExportXlsxAberto(true)}
          desabilitado
        />
      </div>

      {loading && <div style={{ padding: 12, textAlign: 'center', color: colors.subtleText }}>Carregando dados...</div>}
      {error && (
        <div style={{ padding: 16, background: '#fde8e8', color: colors.hipoRed, borderRadius: 8 }}>
          Não foi possível carregar os dados pra exportação ({error}).
        </div>
      )}

      <MetodologiaPage equipmentFamily={FAMILIA} />

      {exportPdfAberto && !loading && !error && (
        <ExportPdfModal
          onClose={() => setExportPdfAberto(false)}
          equipmentFamily={FAMILIA}
          macros={macros}
          coberturaRowsTodas={coberturaRows}
          facilities={facilities}
          filtrosIniciais={FILTROS_VAZIOS}
        />
      )}

      {exportXlsxAberto && !loading && !error && (
        <ExportXlsxModal
          onClose={() => setExportXlsxAberto(false)}
          equipmentFamily={FAMILIA}
          macros={macros}
          coberturaRowsTodas={coberturaRows}
          facilities={facilities}
          filtrosIniciais={FILTROS_VAZIOS}
        />
      )}
    </div>
  );
}
