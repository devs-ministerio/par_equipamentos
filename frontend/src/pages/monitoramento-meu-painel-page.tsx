import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PainelBloco,
  PainelNavegacao,
} from "@/components/features/painel-tecnico-estrutura";
import { PainelTecnicoIndicadores } from "@/components/features/painel-tecnico-indicadores";
import { PainelTecnicoGraficos } from "@/components/features/painel-tecnico-graficos";
import { derivarMeuPainel } from "@/lib/painel-tecnico-derivados";
import { SeletorColaboradorPainel } from "@/components/features/seletor-colaborador-painel";
import { CardColaborador } from "@/components/features/card-colaborador";
import { PainelTecnicoPrazos } from "@/components/features/painel-tecnico-prazos";
import { montarMetricasPainel } from "@/lib/monitoramento-painel-metricas";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useMonitoramentoResumo } from "@/hooks/useMonitoramentoResumo";
import { useAuthSession } from "@/hooks/useAuthSession";
import {
  useCarteiraTecnico,
  usePainelTecnico,
  useTecnicosPainel,
} from "@/hooks/use-painel-tecnico";
import { PainelTecnicoCarteira } from "@/components/features/painel-tecnico-carteira";
import { type FiltroCarteira } from "@/lib/painel-tecnico-filtro";

const SECOES = [
  { id: "visao-geral", rotulo: "Visão geral" },
  { id: "carteira", rotulo: "Carteira" },
  { id: "prazos", rotulo: "Prazos e pendências" },
];

export function MonitoramentoMeuPainelPage() {
  const { usuarioAtual } = useAuthSession();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const [colaboradorId, setColaboradorId] = useState<number | undefined>();
  const tecnicos = useTecnicosPainel(gestao);
  const consulta = usePainelTecnico(colaboradorId);
  const carteiraQuery = useCarteiraTecnico(colaboradorId);
  const [filtroCarteira, setFiltroCarteira] = useState<FiltroCarteira>("todos");
  const [faseSel, setFaseSel] = useState<string | undefined>();
  const [familiaSel, setFamiliaSel] = useState<string | undefined>();
  const linhas = carteiraQuery.data;
  const dados = consulta.data;
  const limparFiltros = () => {
    setFiltroCarteira("todos");
    setFaseSel(undefined);
    setFamiliaSel(undefined);
  };
  const resumo = useMonitoramentoResumo();
  const instrumentosQuery = useMonitoramentoInstrumentos();
  const conveniosQuery = useConveniosLista();

  const titulo = gestao ? "Painéis da equipe" : "Meu painel";
  const seletor = gestao ? (
    <SeletorColaboradorPainel
      tecnicos={tecnicos.data ?? []}
      colaboradorId={colaboradorId}
      onSelecionar={(id) => {
        setColaboradorId(id);
        limparFiltros();
      }}
    />
  ) : undefined;
  const header = (
    <PageHeader
      eyebrow="Monitoramento interno"
      title={titulo}
      actions={<CardColaborador semBotao acao={seletor} />}
    />
  );

  if (consulta.isError) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar o painel."
          onRetry={() => consulta.refetch()}
        />
      </div>
    );
  }
  if (carteiraQuery.isError && !linhas) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem="Não foi possível carregar a carteira."
          onRetry={() => carteiraQuery.refetch()}
        />
      </div>
    );
  }
  if (!dados || !linhas) {
    return (
      <div>
        {header}
        <div
          className="grid gap-3"
          role="status"
          aria-label="Carregando painel"
        >
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  const semRegiao =
    dados.escopo === "individual" && (dados.ufs ?? []).length === 0;
  const c = dados.carteira;
  const equipamentosResumo = resumo.data?.equipamentos_por_instrumento ?? [];
  const {
    faltam,
    faltamAbertos,
    concluidos,
    novosRadar,
    valorRadar,
    pendentes,
    atrasadas,
    numerosMonitorados,
    numerosEquipamentos,
    linhasSituacao,
    linhasCarteira,
  } = derivarMeuPainel(linhas, equipamentosResumo, faseSel, familiaSel);
  const chipsDashboard = [
    ...(faseSel
      ? [{ rotulo: faseSel, onRemover: () => setFaseSel(undefined) }]
      : []),
    ...(familiaSel
      ? [{ rotulo: familiaSel, onRemover: () => setFamiliaSel(undefined) }]
      : []),
  ];
  const prazos =
    resumo.data && instrumentosQuery.data && conveniosQuery.data
      ? montarMetricasPainel(
          instrumentosQuery.data.filter((i) =>
            numerosMonitorados.has(i.nr_convenio),
          ),
          resumo.data,
          conveniosQuery.data.itens,
        )
      : null;
  const fontesPrazosComErro = [
    resumo,
    instrumentosQuery,
    conveniosQuery,
  ].filter((query) => query.isError);
  const irParaCarteira = () =>
    requestAnimationFrame(() =>
      document
        .getElementById("carteira")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  const alternar = (f: FiltroCarteira) => {
    setFiltroCarteira((atual) => (atual === f ? "todos" : f));
    if (filtroCarteira !== f) irParaCarteira();
  };
  return (
    <div className="space-y-6 pb-8">
      {header}
      {tecnicos.isError && (
        <ErrorAlert
          mensagem="Não foi possível carregar a lista de colaboradores."
          onRetry={() => tecnicos.refetch()}
        />
      )}
      {semRegiao && (
        <ErrorAlert mensagem="Este colaborador ainda não tem região de monitoramento definida." />
      )}
      <PainelNavegacao itens={SECOES} />
      <div className="space-y-12">
        <PainelBloco id="visao-geral" titulo="Visão geral">
          <PainelTecnicoIndicadores
            carteira={c}
            faltam={faltam.length}
            faltamAbertos={faltamAbertos}
            pendentes={pendentes}
            atrasadas={atrasadas}
            concluidos={concluidos}
            novosRadar={novosRadar.length}
            valorRadar={valorRadar}
            filtro={filtroCarteira}
            semFiltroGrafico={!faseSel && !familiaSel}
            alternar={alternar}
            restaurar={() => {
              limparFiltros();
              irParaCarteira();
            }}
          />
          <PainelTecnicoGraficos
            linhasSituacao={linhasSituacao}
            faseSel={faseSel}
            onFase={setFaseSel}
            familiaSel={familiaSel}
            onFamilia={setFamiliaSel}
            resumo={resumo}
            numerosEquipamentos={numerosEquipamentos}
          />
        </PainelBloco>
        <PainelBloco id="carteira" titulo="Carteira">
          <PainelTecnicoCarteira
            linhas={linhasCarteira}
            total={linhas.length}
            chips={chipsDashboard}
            filtro={filtroCarteira}
            onLimpar={() => setFiltroCarteira("todos")}
          />
        </PainelBloco>
        <PainelBloco id="prazos" titulo="Prazos e pendências">
          <PainelTecnicoPrazos
            prazos={prazos}
            fontesComErro={fontesPrazosComErro}
            pendentes={pendentes}
            filaTruncada={resumo.data?.fila_acoes_truncada ?? false}
          />
        </PainelBloco>
      </div>
    </div>
  );
}
