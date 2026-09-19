import { lazy, Suspense, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorAlert } from '@/components/common/error-alert';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { Skeleton } from '@/components/ui/skeleton';
import { NavBoxesAnaliseMerito } from '@/components/features/nav-boxes-analise-merito';
import { useRelatoriosDados } from '../hooks/useRelatoriosDados';
import { useFamiliaEquipamento } from '../hooks/use-familia-equipamento';
import { MetodologiaPage } from './metodologia-page';

// Exportadores pesados (jspdf/exceljs, ~1.3MB somados) só entram no bundle
// quando o usuário de fato abre um dos popups -- eram import estático
// direto no chunk desta página antes, mesmo com os 2 cards `desabilitado`
// hoje (Seção 16 da constituição -- "dynamic import", "lazy loading").
const ExportPdfModal = lazy(() => import('../components/modals/export-pdf-modal').then((m) => ({ default: m.ExportPdfModal })));
const ExportXlsxModal = lazy(() => import('../components/modals/export-xlsx-modal').then((m) => ({ default: m.ExportXlsxModal })));

const FILTROS_VAZIOS = { regioes: [], ufs: [], macros: [], regioesSaude: [], municipios: [], cnes: [] };

function CardExportar({
  titulo,
  descricao,
  variante,
  rotuloBotao,
  onClick,
  desabilitado,
}: {
  titulo: string;
  descricao: string;
  variante: 'destructive' | 'success';
  rotuloBotao: string;
  onClick: () => void;
  /** Temporario (2026-08-24, a pedido) -- exportacao desligada por
   * enquanto, sem remover o botao/modal/fetch (so reativar depois tirando
   * essa prop). */
  desabilitado?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-4 border-t border-border py-4 sm:flex-row sm:items-center">
      <div>
        <div className="mb-1 text-sm font-semibold text-foreground">{titulo}</div>
        <div className="max-w-[560px] text-xs leading-relaxed text-muted-foreground">{descricao}</div>
      </div>
      <button
        onClick={onClick}
        disabled={desabilitado}
        title={desabilitado ? 'Exportação temporariamente indisponível' : undefined}
        className={`shrink-0 rounded-md border px-4 py-2 text-xs font-semibold ${
          desabilitado
            ? 'cursor-not-allowed border-border bg-muted text-muted-foreground'
            : variante === 'destructive'
              ? 'cursor-pointer bg-destructive text-white'
              : 'cursor-pointer bg-success text-white'
        }`}
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
  const { macros, coberturaRows, facilities, isLoading: loading, isError, error } = useRelatoriosDados(FAMILIA);
  const [exportPdfAberto, setExportPdfAberto] = useState(false);
  const [exportXlsxAberto, setExportXlsxAberto] = useState(false);

  // Nada exportavel pra essa familia (sem macro-coverage nem estabelecimento
  // cadastrado) -- gap de empty state fechado 2026-09-11, antes os cards de
  // exportacao ficavam ali mudos mesmo sem nenhum dado por tras.
  const semDadoExportavel = !loading && !isError && macros.length === 0 && facilities.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Análise de mérito"
        title="Relatórios e metodologia"
        description="Critérios de cálculo e arquivos para análise externa."
        actions={<NavBoxesAnaliseMerito />}
      />
      <section aria-label="Exportações" className="divide-y divide-border border-b border-border">
        <CardExportar
          titulo="Relatório em PDF"
          descricao="Cobertura e estabelecimentos conforme o recorte selecionado."
          variante="destructive"
          rotuloBotao="Gerar PDF"
          onClick={() => setExportPdfAberto(true)}
          desabilitado
        />
        <CardExportar
          titulo="Planilha Excel"
          descricao="Cobertura, estabelecimentos e memória de cálculo em abas separadas."
          variante="success"
          rotuloBotao="Gerar Excel"
          onClick={() => setExportXlsxAberto(true)}
          desabilitado
        />
      </section>

      {loading && <Skeleton className="h-11 w-full" role="status" aria-label="Carregando" />}
      {isError && <ErrorAlert mensagem={mensagemSeguraDoErro(error)} />}
      {semDadoExportavel && (
        <div className="rounded-[8px] bg-background p-4 text-center text-muted-foreground/70">
          Nenhum dado disponível pra exportação nessa família ainda.
        </div>
      )}

      <MetodologiaPage equipmentFamily={FAMILIA} />

      <Suspense fallback={null}>
        {exportPdfAberto && !loading && !isError && (
          <ExportPdfModal
            onClose={() => setExportPdfAberto(false)}
            equipmentFamily={FAMILIA}
            macros={macros}
            coberturaRowsTodas={coberturaRows}
            facilities={facilities}
            filtrosIniciais={FILTROS_VAZIOS}
          />
        )}

        {exportXlsxAberto && !loading && !isError && (
          <ExportXlsxModal
            onClose={() => setExportXlsxAberto(false)}
            equipmentFamily={FAMILIA}
            macros={macros}
            coberturaRowsTodas={coberturaRows}
            facilities={facilities}
            filtrosIniciais={FILTROS_VAZIOS}
          />
        )}
      </Suspense>
    </div>
  );
}
