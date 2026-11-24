import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { CardColaborador } from "@/components/features/card-colaborador";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useMonitoramentoResumo } from "@/hooks/useMonitoramentoResumo";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useMonitoramentoInternoFiltros } from "@/hooks/use-monitoramento-interno-filtros";
import { rotulosEquipamentoDoInstrumento } from "@/lib/monitoramento-filtro-equipamentos";
import { PainelGestaoFiltros } from "@/components/features/painel-gestao-filtros";
import { PainelGestaoRecortes } from "@/components/features/painel-gestao-recortes";
import { MonitoramentoPainelGeografia } from "@/components/features/monitoramento-painel-geografia";
import {
  PainelBloco,
  PainelNavegacao,
} from "@/components/features/painel-tecnico-estrutura";
import {
  PainelSecaoEvolucao,
  PainelSecaoVisaoGeral,
} from "@/components/features/painel-gestao-secao-geral";
import { PainelSecaoAndamento } from "@/components/features/painel-gestao-secao-andamento";
import { PainelSecaoComposicao } from "@/components/features/painel-gestao-secao-composicao";
import {
  ROTULO_FILTRO_LOCAL,
  aplicarFiltrosLocais,
  derivarPainel,
  type FiltroLocal,
  type FiltrosLocais,
} from "@/lib/painel-gestao-derivados";
import type { ReferenciaPeriodo } from "@/lib/referencia-periodo-painel";

const SECOES = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "evolucao", rotulo: "Evolução" },
  { id: "andamento", rotulo: "Andamento" },
  { id: "composicao", rotulo: "Composição" },
  { id: "territorio", rotulo: "Território" },
];

const header = (
  <PageHeader
    eyebrow="Monitoramento interno"
    title="Painel de gestão"
    description="Visão consolidada dos instrumentos monitorados: andamento, composição e território."
    actions={<CardColaborador />}
  />
);

export function MonitoramentoPainelPage() {
  const [locais, setLocais] = useState<FiltrosLocais>({});
  const alternarLocal = (campo: FiltroLocal, valor: string) =>
    setLocais((atual) => {
      const proximo = { ...atual };
      if (atual[campo] === valor) delete proximo[campo];
      else proximo[campo] = valor;
      return proximo;
    });
  const resumoQuery = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const conveniosQuery = useConveniosLista();
  const sessao = useAuthSession();
  const resumo = resumoQuery.data;
  const instrumentos = instrumentosQuery.data;
  const convenios = conveniosQuery.data?.itens;
  // O ano do firmado prevalece; cargas sem convênio usam o ano do cadastro.
  const instrumentosComAno = useMemo(() => {
    const anoPorNumero = new Map(
      convenios?.map((c) => [c.numero, c.anoInstrumento]),
    );
    return (instrumentos ?? []).map((i) => ({
      ...i,
      ano_instrumento:
        anoPorNumero.get(i.nr_convenio) ?? i.ano_instrumento ?? null,
    }));
  }, [instrumentos, convenios]);
  const filtros = useMonitoramentoInternoFiltros(
    instrumentosComAno,
    convenios ?? [],
    resumo?.inauguracoes ?? null,
    resumo?.etapas_por_instrumento ?? null,
  );
  const anoSelecionado = (referencia: ReferenciaPeriodo) =>
    filtros.referencia === referencia && filtros.anoInicio === filtros.anoFim
      ? filtros.anoInicio
      : null;
  const alternarAno = (referencia: ReferenciaPeriodo, ano: string) => {
    const valor = anoSelecionado(referencia) === ano ? null : ano;
    filtros.setPeriodo(valor, valor, valor ? referencia : "ano_instrumento");
  };
  const equipamentosPorNumero = useMemo(
    () =>
      new Map(
        (convenios ?? []).map((item) => [
          item.numero,
          rotulosEquipamentoDoInstrumento(item.equipamentos),
        ]),
      ),
    [convenios],
  );

  if (
    resumoQuery.isError ||
    instrumentosQuery.isError ||
    conveniosQuery.isError
  ) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar o painel de gestão."
          onRetry={() => {
            resumoQuery.refetch();
            instrumentosQuery.refetch();
            conveniosQuery.refetch();
          }}
        />
      </div>
    );
  }
  if (!resumo || !instrumentos || !convenios) {
    return (
      <div>
        {header}
        <div className="grid gap-3" role="status" aria-label="Carregando">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const instrumentosFiltrados = aplicarFiltrosLocais(
    filtros.filtrados,
    resumo,
    locais,
  );
  const d = derivarPainel(instrumentosFiltrados, resumo, convenios);
  const comum = { d, filtros, locais, alternarLocal };
  return (
    <div className="space-y-6 pb-8">
      {header}
      <PainelNavegacao
        itens={SECOES}
        filtros={<PainelGestaoFiltros filtros={filtros} />}
      />
      <PainelGestaoRecortes
        filtros={filtros}
        recortesGraficos={(
          Object.entries(locais) as [FiltroLocal, string][]
        ).map(([campo, valor]) => ({
          rotulo: ROTULO_FILTRO_LOCAL[campo],
          valor,
          remover: () => alternarLocal(campo, valor),
        }))}
        limpar={() => {
          filtros.limparFiltros();
          setLocais({});
        }}
      />
      <div className="-mt-3 space-y-12">
        <PainelSecaoVisaoGeral {...comum} />
        <PainelSecaoEvolucao
          {...comum}
          anoSelecionado={anoSelecionado}
          alternarAno={alternarAno}
        />
        <PainelSecaoAndamento {...comum} />
        <PainelSecaoComposicao
          d={d}
          filtros={filtros}
          mostrarCompletude={sessao.usuarioAtual?.role === "admin"}
        />
        <PainelBloco id="territorio" titulo="Território">
          <MonitoramentoPainelGeografia
            instrumentos={instrumentosFiltrados}
            equipamentosPorNumero={equipamentosPorNumero}
          />
        </PainelBloco>
      </div>
    </div>
  );
}
