import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import {
  PainelBloco,
  PainelCarregando,
  PainelNavegacao,
} from "@/components/features/painel-tecnico-estrutura";
import { PainelTecnicoIndicadores } from "@/components/features/painel-tecnico-indicadores";
import { PainelTecnicoGraficos } from "@/components/features/painel-tecnico-graficos";
import { useFiltrosMeuPainel } from "@/hooks/use-filtros-meu-painel";
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
import { SECOES_MEU_PAINEL } from "@/lib/painel-tecnico-filtro";
import { PainelTecnicoCarteira } from "@/components/features/painel-tecnico-carteira";

export function MonitoramentoMeuPainelPage() {
  const { usuarioAtual } = useAuthSession();
  const gestao =
    usuarioAtual?.role === "admin" || usuarioAtual?.role === "gestor";
  const [colaboradorId, setColaboradorId] = useState<number | undefined>();
  const tecnicos = useTecnicosPainel(gestao);
  const consulta = usePainelTecnico(colaboradorId);
  const carteiraQuery = useCarteiraTecnico(colaboradorId);
  const {
    filtroCarteira,
    setFiltroCarteira,
    faseSel,
    setFaseSel,
    familiaSel,
    setFamiliaSel,
    limparFiltros,
    irParaCarteira,
    alternar,
    chips: chipsDashboard,
  } = useFiltrosMeuPainel();
  const { data: linhas } = carteiraQuery;
  const { data: dados } = consulta;
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
      description={
        gestao
          ? "Carteira e prazos de cada colaborador da equipe."
          : "Sua carteira de instrumentos, prazos e pendências."
      }
      actions={<CardColaborador semBotao acao={seletor} />}
    />
  );

  const falha = consulta.isError
    ? { mensagem: "Não foi possível carregar o painel.", refazer: consulta }
    : carteiraQuery.isError && !linhas
      ? {
          mensagem: "Não foi possível carregar a carteira.",
          refazer: carteiraQuery,
        }
      : null;
  if (falha) {
    return (
      <div>
        {header}
        <ErrorAlert
          mensagem={falha.mensagem}
          onRetry={() => falha.refazer.refetch()}
        />
      </div>
    );
  }
  if (!dados || !linhas) {
    return (
      <div>
        {header}
        <PainelCarregando />
      </div>
    );
  }
  const semRegiao = dados.escopo === "individual" && !dados.ufs?.length;
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
      <PainelNavegacao itens={SECOES_MEU_PAINEL} />
      <div className="-mt-3 space-y-12">
        <PainelBloco id="visao-geral" titulo="Visão geral" ocultarTitulo>
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
