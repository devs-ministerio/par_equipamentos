import { useCallback, useMemo } from "react";
import { useConveniosLista } from "@/hooks/useConveniosLista";
import { useMonitoramentoInstrumentos } from "@/hooks/useInstrumentosMonitorados";
import { useDadosOficiaisOpcoes } from "@/hooks/use-dados-oficiais-opcoes";
import { filtrarDadosOficiais } from "@/lib/filtrar-dados-oficiais";
import { municipiosDoInstrumento } from "@/lib/municipio-filtro";
import { opcoesAgrupadas, opcoesUnicas } from "@/lib/relatorio-opcoes";
import { normalizarTexto } from "@/utils/texto";
import type { ConvenioUnificado } from "@/types/monitoramento";
import type { FiltroDadosOficiais } from "@/types/dados-oficiais";
import type { useRelatorioInstrumentosFiltros } from "@/hooks/use-relatorio-instrumentos-filtros";
import type { SituacaoDecodificada } from "@/lib/situacao-relatorio";

const situacaoExibida = (item: ConvenioUnificado) => item.situacao;
const SEM_MONITORADOS = new Set<string>();
type IgnorarExtra = "municipio" | "cnes" | "estabelecimento";
type Filtros = ReturnType<typeof useRelatorioInstrumentosFiltros>;

/** Convênios do relatório: recorte em cascata por todos os filtros, opções de cada seletor e fase do monitoramento. */
export function useRelatorioConvenios(
  filtros: Filtros,
  situacaoEscolhida: SituacaoDecodificada | null,
) {
  const {
    uf,
    anoInicio,
    anoFim,
    programa,
    tipoContratacao,
    equipamento,
    municipio,
    cnes,
    nomeEstabelecimento,
  } = filtros;
  const origemSituacao = situacaoEscolhida?.origem ?? null;
  const situacaoInstrumento =
    origemSituacao === "instrumento" ? situacaoEscolhida!.valor : null;

  const conveniosQuery = useConveniosLista();
  const convenios = useMemo(
    () => conveniosQuery.data?.itens ?? [],
    [conveniosQuery.data],
  );
  const totalConveniosFonte = conveniosQuery.data?.total ?? 0;

  // Período de 2 datas (Bloco 8, 2026-09-27) -- substitui o antigo `ano`
  // único de `filtrarDadosOficiais` (que continua servindo só Dados
  // Oficiais, sem mudança). Aplicado igual município/CNES/Estabelecimento:
  // fora da cascata de Dados Oficiais, direto no filtro combinado abaixo.
  const dentroDoPeriodo = useCallback(
    (anoInstrumento: number | null) => {
      if (!anoInicio && !anoFim) return true;
      if (anoInstrumento === null) return false;
      if (anoInicio && anoInstrumento < Number(anoInicio)) return false;
      return !(anoFim && anoInstrumento > Number(anoFim));
    },
    [anoInicio, anoFim],
  );

  // Filtro único, cascateando TODOS os campos entre si -- achado ao vivo
  // 2026-09-26: `município`/`CNES`/`Estabelecimento` viviam fora da cascata
  // de `filtrarDadosOficiais` (não estreitavam nem eram estreitados pelos
  // demais seletores). `ignorarDO` cobre o vocabulário de Dados Oficiais
  // (uf/equipamento/situação/programa/tipo); `ignorarExtra` cobre os 3
  // campos exclusivos desta página -- cada seletor ignora só o próprio
  // critério, senão uma seleção elimina a opção necessária pra desfazê-la.
  const filtrarTudo = useCallback(
    (ignorarDO?: FiltroDadosOficiais, ignorarExtra?: IgnorarExtra) => {
      const base = filtrarDadosOficiais(
        convenios,
        {
          uf: uf ? [uf] : [],
          municipio: [],
          cnes: [],
          equipamento: equipamento ? [equipamento] : [],
          situacao: situacaoInstrumento ? [situacaoInstrumento] : [],
          anoInicio: null,
          anoFim: null,
          programa: programa ? [programa] : [],
          tipoContratacao: tipoContratacao ? [tipoContratacao] : [],
          monitorado: null,
        },
        SEM_MONITORADOS,
        situacaoExibida,
        ignorarDO,
      );
      return base.filter(
        (item) =>
          dentroDoPeriodo(item.anoInstrumento) &&
          (ignorarExtra === "municipio" ||
            !municipio ||
            municipiosDoInstrumento(item).some(
              (nome) => normalizarTexto(nome) === municipio,
            )) &&
          (ignorarExtra === "cnes" || !cnes || item.cnes === cnes) &&
          (ignorarExtra === "estabelecimento" ||
            !nomeEstabelecimento ||
            normalizarTexto(item.cnesNomeEstabelecimento ?? "") ===
              nomeEstabelecimento),
      );
    },
    [
      convenios,
      uf,
      situacaoInstrumento,
      dentroDoPeriodo,
      programa,
      tipoContratacao,
      equipamento,
      municipio,
      cnes,
      nomeEstabelecimento,
    ],
  );

  const filtrarConvenios = useCallback(
    (ignorar?: FiltroDadosOficiais) => filtrarTudo(ignorar),
    [filtrarTudo],
  );

  const {
    ufs,
    equipamentoOptions,
    anoOptions,
    situacaoOptions: situacaoInstrumentoOptions,
    tipoContratacaoOptions,
    programaOptions,
  } = useDadosOficiaisOpcoes({
    classeEquipamento: "prioritario",
    filtrar: filtrarConvenios,
    situacaoExibida,
  });

  const municipioOptions = useMemo(
    () =>
      opcoesAgrupadas(filtrarTudo(undefined, "municipio"), (item) =>
        municipiosDoInstrumento(item),
      ),
    [filtrarTudo],
  );
  const cnesOptions = useMemo(
    () => opcoesUnicas(filtrarTudo(undefined, "cnes"), (item) => item.cnes),
    [filtrarTudo],
  );

  const instrumentosQuery = useMonitoramentoInstrumentos();
  const faseMonitoramento = useMemo(
    () =>
      new Map(
        (instrumentosQuery.data ?? []).map((i) => [
          i.nr_convenio,
          i.fase_atual ?? "Não iniciado",
        ]),
      ),
    [instrumentosQuery.data],
  );

  const conveniosFiltrados = useMemo(() => {
    if (origemSituacao === "proposta") return [];
    const base = filtrarTudo();
    if (origemSituacao !== "monitoramento") return base;
    const alvo = normalizarTexto(situacaoEscolhida!.valor);
    return base.filter(
      (item) =>
        normalizarTexto(faseMonitoramento.get(item.numero) ?? "") === alvo,
    );
  }, [filtrarTudo, origemSituacao, situacaoEscolhida, faseMonitoramento]);

  const valorGlobalInstrumentos = useMemo(
    () =>
      conveniosFiltrados.reduce(
        (total, item) => total + (item.financeiro.global ?? 0),
        0,
      ),
    [conveniosFiltrados],
  );

  return {
    convenios,
    conveniosQuery,
    totalConveniosFonte,
    conveniosFiltrados,
    faseMonitoramento,
    valorGlobalInstrumentos,
    ufs,
    equipamentoOptions,
    anoOptions,
    situacaoInstrumentoOptions,
    tipoContratacaoOptions,
    programaOptions,
    municipioOptions,
    cnesOptions,
  };
}
