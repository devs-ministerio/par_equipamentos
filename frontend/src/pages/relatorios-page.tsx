import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { NavBoxesAnaliseMerito } from '@/components/features/nav-boxes-analise-merito';
import { ExportPdfModal } from '../components/modals/export-pdf-modal';
import { ExportXlsxModal } from '../components/modals/export-xlsx-modal';
import { useRelatoriosDados } from '../hooks/useRelatoriosDados';
import { useFamiliaEquipamento } from '../context/familia-equipamento-context';
import { MetodologiaPage } from './metodologia-page';

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
    <div className="flex-1 rounded-[10px] bg-white px-6.5 py-6">
      <div className="mb-1.5 text-base font-bold text-[#16213e]">{titulo}</div>
      <div className="mb-[18px] text-[13px] leading-[1.6] text-muted-foreground">{descricao}</div>
      <button
        onClick={onClick}
        disabled={desabilitado}
        title={desabilitado ? 'Exportação temporariamente indisponível' : undefined}
        className={`rounded-[8px] border-none px-5 py-2.5 text-[13px] font-bold ${
          desabilitado
            ? 'cursor-not-allowed bg-[#d8dce5] text-muted-foreground/70'
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
      <Card className="py-0">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5.5">
          <div>
            <div className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-primary uppercase">
              Análise de mérito
            </div>
            <h1 className="m-0 text-3xl font-extrabold tracking-[-0.03em] text-foreground">
              Relatórios e Informações
            </h1>
            <p className="mt-2.5 max-w-[720px] text-[13.5px] leading-relaxed text-muted-foreground">
              Exporte a tabela de cobertura e a lista de estabelecimentos, e confira a metodologia de cálculo.
            </p>
          </div>
          <NavBoxesAnaliseMerito />
        </CardContent>
      </Card>
      <div className="flex items-stretch gap-4">
        <CardExportar
          titulo="⬇ Exportar PDF"
          descricao="Relatório com a tabela de cobertura e/ou a lista de estabelecimentos, com o recorte de filtro que você escolher no próprio popup."
          variante="destructive"
          rotuloBotao="Gerar PDF"
          onClick={() => setExportPdfAberto(true)}
          desabilitado
        />
        <CardExportar
          titulo="⬇ Exportar Excel"
          descricao="Planilha com abas de cobertura, estabelecimentos e a metodologia de cálculo, com o recorte de filtro que você escolher no próprio popup."
          variante="success"
          rotuloBotao="Gerar Excel"
          onClick={() => setExportXlsxAberto(true)}
          desabilitado
        />
      </div>

      {loading && <div className="p-3 text-center text-muted-foreground/70">Carregando dados...</div>}
      {isError && (
        <div className="rounded-[8px] bg-destructive-bg p-4 text-destructive">
          Não foi possível carregar os dados pra exportação ({error?.message ?? 'erro desconhecido'}).
        </div>
      )}
      {semDadoExportavel && (
        <div className="rounded-[8px] bg-background p-4 text-center text-muted-foreground/70">
          Nenhum dado disponível pra exportação nessa família ainda.
        </div>
      )}

      <MetodologiaPage equipmentFamily={FAMILIA} />

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
    </div>
  );
}
