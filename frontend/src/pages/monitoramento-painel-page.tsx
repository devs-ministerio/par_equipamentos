import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorAlert } from '@/components/common/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonitoramentoResumo } from '@/hooks/useMonitoramentoResumo';
import { useMonitoramentoInstrumentos } from '@/hooks/useInstrumentosMonitorados';
import { useMonitoramentoMarcos } from '@/hooks/useMonitoramentoMarcos';
import { useConveniosLista } from '@/hooks/useConveniosLista';
import { normalizarTexto } from '@/utils/texto';
import { fmtMoeda } from '@/lib/monitoramento-format';
import type { ContagemRotulo } from '@/services/monitoramento-resumo';
import type { InstrumentoEquipamento } from '@/services/monitoramento-instrumentos';
import { AgendaExecutiva, DistribuicaoHorizontal, DivergenciasConclusao, MetricasExecutivas, PainelSecao } from '@/components/features/monitoramento-painel-visuals';

type InstrumentoPainel = Pick<InstrumentoEquipamento, 'nr_convenio' | 'uf' | 'componente' | 'tipo_contratacao' | 'equipamento_descricao' | 'tecnico_titular'>;

function extrairFamiliaEquipamento(descricao: string | null): string {
  if (!descricao) return 'Não informado';
  const texto = normalizarTexto(descricao);
  if (texto.includes('acelerador linear')) return 'Acelerador Linear';
  if (texto.includes('mamograf')) return 'Mamógrafo';
  if (texto.includes('pet') && texto.includes('ct')) return 'PET-CT';
  if (texto.includes('tomograf')) return 'Tomógrafo';
  if (texto.includes('ressonancia')) return 'Ressonância Magnética';
  if (texto.includes('ultrasson') || texto.includes('ultrasom')) return 'Ultrassom';
  if (texto.includes('braquiterapia')) return 'Braquiterapia';
  if (texto.includes('endoscopia')) return 'Endoscopia';
  if (texto.includes('cintilograf') || texto.includes('gama camara') || texto.includes('gama probe')) return 'Medicina Nuclear';
  return 'Outro';
}

function contarPor(instrumentos: InstrumentoPainel[], campo: 'uf' | 'componente' | 'tipo_contratacao'): ContagemRotulo[] {
  const contagem = new Map<string, number>();
  for (const instrumento of instrumentos) {
    const rotulo = instrumento[campo] || 'Não informado';
    contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
  }
  return [...contagem.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
}

const header = <PageHeader eyebrow="Monitoramento interno" title="Painel de gestão" description="Execução, riscos e próximos marcos do acompanhamento pós-repasse." actions={<Link to="/monitoramento-equipamentos/instrumentos" className="text-sm font-semibold text-primary">Abrir mesa de trabalho →</Link>} />;

export function MonitoramentoPainelPage() {
  const resumoQuery = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const marcosQuery = useMonitoramentoMarcos();
  const conveniosQuery = useConveniosLista();
  const resumo = resumoQuery.data;
  const instrumentos = instrumentosQuery.data as InstrumentoPainel[] | undefined;
  const marcos = marcosQuery.data;
  const convenios = conveniosQuery.data?.itens;

  if (resumoQuery.isError || instrumentosQuery.isError || marcosQuery.isError || conveniosQuery.isError) {
    return <div>{header}<ErrorAlert mensagem="Não foi possível carregar o painel de gestão." onRetry={() => { resumoQuery.refetch(); instrumentosQuery.refetch(); marcosQuery.refetch(); conveniosQuery.refetch(); }} /></div>;
  }
  if (!resumo || !instrumentos || !marcos || !convenios) {
    return <div>{header}<div className="grid gap-3" role="status" aria-label="Carregando"><Skeleton className="h-24" /><Skeleton className="h-72" /></div></div>;
  }

  const conveniosPorNumero = new Map(convenios.map((item) => [item.numero, item]));
  let valorGlobal = 0;
  let valorPago = 0;
  for (const numero of resumo.nr_convenios) {
    const convenio = conveniosPorNumero.get(numero);
    if (!convenio) continue;
    valorGlobal += convenio.financeiro.global ?? 0;
    valorPago += convenio.valorPagoFornecedor ?? 0;
  }
  const percentualPago = valorGlobal > 0 ? valorPago / valorGlobal : null;
  const fasesPorRotulo = new Map(resumo.distribuicao_fase.map((item) => [item.rotulo, item.quantidade]));
  const fases = [
    { rotulo: 'Não iniciado', quantidade: fasesPorRotulo.get('Não iniciado') ?? 0 },
    ...marcos.filter((marco) => marco.grupo === 'fase_geral' && marco.rotulo !== 'Não iniciado')
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((marco) => ({ rotulo: marco.rotulo, quantidade: fasesPorRotulo.get(marco.rotulo) ?? 0 })),
  ];
  const semTecnico = instrumentos.filter((item) => !item.tecnico_titular).length;
  const inauguracoesAtrasadas = resumo.inauguracoes.filter((item) => !item.realizada && item.dias < 0).length;
  const licencasCriticas = resumo.licencas_vencendo.filter((item) => item.dias < 90).length;
  const alertas = resumo.acoes_atrasadas + inauguracoesAtrasadas + licencasCriticas;
  const equipamentos = new Map<string, number>();
  for (const instrumento of instrumentos) {
    const familia = extrairFamiliaEquipamento(instrumento.equipamento_descricao);
    equipamentos.set(familia, (equipamentos.get(familia) ?? 0) + 1);
  }
  const porEquipamento = [...equipamentos.entries()].map(([rotulo, quantidade]) => ({ rotulo, quantidade })).sort((a, b) => b.quantidade - a.quantidade);
  const divergenciasPorFonte = resumo.divergencias_conclusao_por_fonte.map((item) => `${item.rotulo}: ${item.quantidade}`).join(' · ');

  return (
    <div>
      <PageHeader eyebrow="Monitoramento interno" title="Painel de gestão" description="Execução, riscos e próximos marcos do acompanhamento pós-repasse." actions={<Link to="/monitoramento-equipamentos/instrumentos" className="text-sm font-semibold text-primary">Abrir mesa de trabalho →</Link>} />
      <MetricasExecutivas itens={[
        { rotulo: 'Instrumentos', valor: resumo.total_instrumentos, detalhe: `${fasesPorRotulo.get('Concluído') ?? 0} em fase concluída` },
        { rotulo: 'Execução física média', valor: resumo.pct_execucao_fisica_medio == null ? '—' : `${Math.round(resumo.pct_execucao_fisica_medio * 100)}%`, detalhe: 'Avanço médio dos marcos' },
        { rotulo: 'Investimento monitorado', valor: fmtMoeda(valorGlobal), detalhe: `${percentualPago == null ? '—' : Math.round(percentualPago * 100) + '%'} pago ao fornecedor`, tom: 'ok' },
        { rotulo: 'Pontos de atenção', valor: alertas + resumo.divergencias_conclusao.length, detalhe: `${resumo.acoes_atrasadas} ações · ${licencasCriticas} licenças · ${inauguracoesAtrasadas} inaugurações · ${resumo.divergencias_conclusao.length} conclusões externas`, tom: alertas + resumo.divergencias_conclusao.length > 0 ? 'alerta' : 'ok' },
      ]} />

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
        <div className="grid gap-8">
          <PainelSecao titulo="Estágio dos instrumentos" apoio="Distribuição atual, não acumulada"><DistribuicaoHorizontal itens={fases} total={resumo.total_instrumentos} /></PainelSecao>
          <PainelSecao titulo="Divergências de conclusão" apoio={divergenciasPorFonte || 'Concluído internamente, pendente na fonte externa'}><DivergenciasConclusao itens={resumo.divergencias_conclusao} /></PainelSecao>
          <PainelSecao titulo="Composição da carteira" apoio={`${resumo.total_instrumentos} instrumentos monitorados`}>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
              <div><h3 className="mb-2 text-xs font-semibold text-muted-foreground">Por equipamento</h3><DistribuicaoHorizontal itens={porEquipamento} limite={7} /></div>
              <div><h3 className="mb-2 text-xs font-semibold text-muted-foreground">Por UF</h3><DistribuicaoHorizontal itens={contarPor(instrumentos, 'uf')} limite={7} /></div>
              <div><h3 className="mb-2 text-xs font-semibold text-muted-foreground">Por contratação</h3><DistribuicaoHorizontal itens={contarPor(instrumentos, 'tipo_contratacao')} limite={5} /></div>
              <div><h3 className="mb-2 text-xs font-semibold text-muted-foreground">Por técnico titular</h3><DistribuicaoHorizontal itens={resumo.por_tecnico_titular} limite={6} /></div>
            </div>
          </PainelSecao>
        </div>

        <aside className="grid content-start gap-8">
          <PainelSecao titulo="Agenda crítica" apoio="Prazos mais próximos"><AgendaExecutiva inauguracoes={resumo.inauguracoes} licencas={resumo.licencas_vencendo} /></PainelSecao>
          <PainelSecao titulo="Qualidade do acompanhamento">
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between py-3 text-sm"><span>Sem técnico titular</span><strong className={semTecnico ? 'text-warning' : 'text-success'}>{semTecnico}</strong></div>
              <div className="flex items-center justify-between py-3 text-sm"><span>Ações pendentes</span><strong>{resumo.acoes_pendentes}</strong></div>
              <div className="flex items-center justify-between py-3 text-sm"><span>Licenças CNEN deferidas</span><strong>{resumo.licencas_cnen_deferidas}/{resumo.total_instrumentos}</strong></div>
            </div>
            <Link to="/monitoramento-equipamentos/instrumentos" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">Tratar pendências <ArrowRight size={14} /></Link>
          </PainelSecao>
        </aside>
      </div>
    </div>
  );
}
