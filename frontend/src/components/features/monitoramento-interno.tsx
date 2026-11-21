/** Orquestra dados e ações do monitoramento pós-repasse de um instrumento. */
import { useState } from "react";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useConvenioPrograma } from "@/hooks/useConvenioPrograma";
import { useMonitoramentoMarcos } from "@/hooks/useMonitoramentoMarcos";
import {
  useEditarEvento,
  useExcluirEvento,
  useInstrumentoTimeline,
  useRegistrarEvento,
  useSalvarCadastroInstrumento,
} from "@/hooks/useInstrumentoTimeline";
import {
  useAcoesDoInstrumento,
  useConcluirAcao,
  useCriarAcao,
  useEditarAcao,
  useExcluirAcao,
} from "@/hooks/useMonitoramentoAcoes";
import { componenteDoProgramaSiconv } from "@/lib/componente-siconv";
import { derivarMonitoramentoInterno } from "@/lib/monitoramento-derivado";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { ApiError } from "@/lib/api-error";
import { ErrorAlert } from "@/components/common/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { OperationalDetailSection } from "@/components/common/operational-detail-section";
import { MonitoramentoInternoCabecalho } from "./monitoramento-interno-cabecalho";
import { MonitoramentoInternoCadastro } from "./monitoramento-interno-cadastro";
import { MonitoramentoInternoCronograma } from "./monitoramento-interno-fase-cronograma";
import { MonitoramentoInternoFaseGeral } from "./monitoramento-interno-fase-geral";
import { ConclusaoAcompanhamento } from "./conclusao-acompanhamento";
import { DocumentosInstrumento } from "./documentos-instrumento";
import { useEquipamentosInstrumento } from "@/hooks/useEquipamentosInstrumento";
import { EquipamentosInstrumento } from "./equipamentos-instrumento";
import { LicencaOperacaoCard } from "./licenca-operacao-card";
import { MonitoramentoInternoAcoes } from "./monitoramento-interno-acoes";
import type {
  CriarAcaoFormValues,
  EnviarEventoFormValues,
} from "@/lib/validations/monitoramento";
import { MonitoramentoInternoLancamentos } from "./monitoramento-interno-lancamentos";
import { MonitoramentoInternoEventos } from "./monitoramento-interno-eventos";

export function MonitoramentoInterno({
  numeroConvenio,
}: {
  numeroConvenio: string;
}) {
  return (
    <MonitoramentoInternoConteudo
      key={numeroConvenio}
      numeroConvenio={numeroConvenio}
    />
  );
}

function MonitoramentoInternoConteudo({
  numeroConvenio,
}: {
  numeroConvenio: string;
}) {
  const [erroEscrita, setErroEscrita] = useState<string | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  // Fallback de leitura SICONV; nunca escreve componente no banco.
  const programaQuery = useConvenioPrograma(numeroConvenio);
  const marcosQuery = useMonitoramentoMarcos();
  const equipamentosQuery = useEquipamentosInstrumento(numeroConvenio);
  const timelineQuery = useInstrumentoTimeline(numeroConvenio);
  // Instrumento sem acompanhamento (timeline vazia) também dá 404 nas ações: só consulta depois de a timeline confirmar.
  const acoesQuery = useAcoesDoInstrumento(
    numeroConvenio,
    timelineQuery.isSuccess && timelineQuery.data !== null,
  );
  const sessao = useAuthSession();

  const salvarCadastro = useSalvarCadastroInstrumento(numeroConvenio);
  const registrarEventoMutation = useRegistrarEvento(numeroConvenio);
  const editarEventoMutation = useEditarEvento(numeroConvenio);
  const excluirEventoMutation = useExcluirEvento(numeroConvenio);
  const criarAcaoMutation = useCriarAcao(numeroConvenio);
  const concluirAcaoMutation = useConcluirAcao();
  const editarAcaoMutation = useEditarAcao();
  const excluirAcaoMutation = useExcluirAcao();
  const [concluindoAcaoId, setConcluindoAcaoId] = useState<number | null>(null);

  function tratarErroEscrita(e: unknown): void {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      sessao.tratarSessaoInvalida();
    }
    setErroEscrita(mensagemSeguraDoErro(e));
  }

  async function executarEscrita(acao: () => Promise<unknown>): Promise<void> {
    setErroEscrita(null);
    try {
      await acao();
    } catch (erro) {
      tratarErroEscrita(erro);
      throw erro;
    }
  }

  const erroCarregamento =
    marcosQuery.error || timelineQuery.error || acoesQuery.error;
  if (erroCarregamento) {
    return (
      <ErrorAlert
        mensagem={mensagemSeguraDoErro(erroCarregamento)}
        onRetry={() => {
          marcosQuery.refetch();
          timelineQuery.refetch();
          acoesQuery.refetch();
        }}
      />
    );
  }
  if (timelineQuery.isSuccess && timelineQuery.data === null) {
    return (
      <p className="text-[12.5px] text-muted-foreground italic">
        Ainda não monitorado internamente — escopo é bem menor que os 403
        convênios (só os instrumentos que a equipe decide acompanhar
        manualmente, ver{" "}
        <code>backend/scripts/importar_planilha_monitoramento.py</code>).
      </p>
    );
  }
  if (!marcosQuery.data || !timelineQuery.data) {
    return (
      <div className="grid gap-2" role="status" aria-label="Carregando">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const itensControlados = equipamentosQuery.data?.itens ?? [];
  const totaisEquipamentos = itensControlados.length
    ? {
        entregues: itensControlados.reduce(
          (t, i) => t + i.quantidade_entregue,
          0,
        ),
        planejadas: itensControlados.reduce(
          (t, i) =>
            t +
            Math.max(
              (i.quantidade_planejada ?? i.quantidade_entregue) -
                i.quantidade_cancelada,
              0,
            ),
          0,
        ),
        canceladas: itensControlados.reduce(
          (t, i) => t + i.quantidade_cancelada,
          0,
        ),
      }
    : null;
  const marcos = marcosQuery.data;
  const timeline = timelineQuery.data;
  const acoes = acoesQuery.data;
  const inst = timeline.instrumento;
  // A permissão do instrumento em cache não sobrepõe a sessão atual.
  const podeEditar =
    inst.pode_editar && sessao.podeEditar && !sessao.erroSessao;
  // Concluído trava todas as edições; só "Reabrir" (podeEditar) segue liberado.
  const concluido = inst.fase_atual === "Concluído";
  const podeEditarConteudo = podeEditar && !concluido;

  const {
    eventosPorMarco,
    cronogramaFisico,
    dataInauguracao,
    eventoInauguracao,
    inaugurado,
    inauguracaoDispensada,
    diasInauguracao,
    acoesAbertas,
    acoesAtrasadas,
  } = derivarMonitoramentoInterno(marcos, timeline, acoes);

  const registrarEvento = (valores: EnviarEventoFormValues) =>
    executarEscrita(() =>
      registrarEventoMutation.mutateAsync({
        marco_id: Number(valores.marcoId),
        fase_geral_id: valores.faseGeralId ? Number(valores.faseGeralId) : null,
        confirmar_inauguracao: valores.confirmarInauguracao ?? false,
        data_ocorrencia: valores.dataOcorrencia || null,
        data_prevista: valores.dataPrevista || null,
        status_regulatorio: valores.statusRegulatorio || null,
        numero_documento: valores.numeroDocumento || null,
        data_validade: valores.dataValidade || null,
        observacao: valores.observacao || null,
        equipamento_marca: valores.equipamentoMarca || null,
        equipamento_modelo: valores.equipamentoModelo || null,
        equipamento_numero_serie: valores.equipamentoNumeroSerie || null,
        equipamento_vida_util_anos: valores.equipamentoVidaUtilAnos
          ? Number(valores.equipamentoVidaUtilAnos)
          : null,
      }),
    );

  const criarAcao = (valores: CriarAcaoFormValues) =>
    executarEscrita(() =>
      criarAcaoMutation.mutateAsync({
        descricao: valores.descricao,
        data_prevista: valores.dataPrevista || null,
        responsavel: valores.responsavel || null,
      }),
    );

  const componenteViaSiconv = !inst.componente
    ? componenteDoProgramaSiconv(programaQuery.data)
    : null;

  // A fonte não expõe quantidade estruturada; " + " indica múltiplos itens.
  const multiploEquipamento = (inst.equipamento_descricao ?? "").includes(
    " + ",
  );

  return (
    <div>
      {erroEscrita && (
        <div className="mb-3">
          <ErrorAlert mensagem={erroEscrita} />
        </div>
      )}

      <MonitoramentoInternoCabecalho
        timeline={timeline}
        componenteViaSiconv={componenteViaSiconv}
        dataInauguracao={dataInauguracao}
        inaugurado={inaugurado}
        inauguracaoDispensada={inauguracaoDispensada}
        diasInauguracao={diasInauguracao}
        acoesAbertasCount={acoesAbertas.length}
        acoesAtrasadasCount={acoesAtrasadas.length}
        equipamentos={totaisEquipamentos}
      />

      <EquipamentosInstrumento
        numeroConvenio={numeroConvenio}
        podeEditarInstrumento={podeEditarConteudo}
        aoSessaoInvalida={sessao.tratarSessaoInvalida}
        previsaoInauguracao={
          inaugurado ? null : (eventoInauguracao?.data_prevista ?? null)
        }
        inauguracaoRealizada={inaugurado}
      />

      <LicencaOperacaoCard numeroConvenio={numeroConvenio} />

      <MonitoramentoInternoCadastro
        instrumento={inst}
        podeEditar={podeEditarConteudo}
        aberto={cadastroAberto}
        onAbrir={() => setCadastroAberto(true)}
        onFechar={() => setCadastroAberto(false)}
        onSalvar={(valores) =>
          executarEscrita(() =>
            salvarCadastro.mutateAsync({
              tecnico_titular_id: valores.tecnicoTitular
                ? Number(valores.tecnicoTitular)
                : null,
              tecnico_suplente_id: valores.tecnicoSuplente
                ? Number(valores.tecnicoSuplente)
                : null,
              nivel_monitoramento: valores.nivelMonitoramento || null,
              tipologia: valores.tipologia || null,
              modalidade_onco: valores.modalidadeOnco || null,
              responsavel_execucao_nome:
                valores.responsavelExecucaoNome || null,
              responsavel_execucao_contato:
                valores.responsavelExecucaoContato || null,
              cnes: valores.cnes || null,
            }),
          )
        }
      />

      <div className="grid gap-4">
        <OperationalDetailSection titulo="Fase e cronograma">
          <MonitoramentoInternoFaseGeral
            faseAtual={inst.fase_atual}
            acao={
              <ConclusaoAcompanhamento
                numeroConvenio={numeroConvenio}
                podeEditarInstrumento={podeEditar}
                aoSessaoInvalida={sessao.tratarSessaoInvalida}
                aoErro={setErroEscrita}
              />
            }
          />
          <MonitoramentoInternoCronograma
            cronogramaFisico={cronogramaFisico}
            entregaPorItem={itensControlados.some(
              (i) => i.quantidade_entregue > 0,
            )}
            documentos={
              <DocumentosInstrumento
                numeroConvenio={numeroConvenio}
                podeEditarInstrumento={podeEditarConteudo}
                aoSessaoInvalida={sessao.tratarSessaoInvalida}
              />
            }
            acao={
              <MonitoramentoInternoLancamentos
                marcos={marcos}
                fase={inst.fase_atual}
                podeEditar={podeEditarConteudo}
                onRegistrarEvento={registrarEvento}
                onCriarAcao={criarAcao}
              />
            }
            eventosPorMarco={eventosPorMarco}
            multiploEquipamento={multiploEquipamento}
          />
        </OperationalDetailSection>

        <OperationalDetailSection
          titulo={`Ações (${acoesQuery.total ?? acoes?.length ?? 0})`}
          abertoPorPadrao={acoesAbertas.length > 0}
        >
          {acoes && (acoesQuery.total ?? 0) > acoes.length && (
            <p className="m-0 mb-2 text-[12.5px] text-muted-foreground">
              Mostrando {acoes.length} de {acoesQuery.total} ações.
            </p>
          )}
          <MonitoramentoInternoAcoes
            acoes={acoes}
            podeEditar={podeEditarConteudo}
            concluindoAcaoId={concluindoAcaoId}
            onConcluir={(acaoId) => {
              setErroEscrita(null);
              setConcluindoAcaoId(acaoId);
              concluirAcaoMutation.mutate(acaoId, {
                onError: (e) => tratarErroEscrita(e),
                onSettled: () => setConcluindoAcaoId(null),
              });
            }}
            onEditar={(acaoId, valores) =>
              executarEscrita(() =>
                editarAcaoMutation.mutateAsync({
                  acaoId,
                  corpo: {
                    descricao: valores.descricao,
                    data_prevista: valores.dataPrevista || null,
                    responsavel: valores.responsavel || null,
                  },
                }),
              )
            }
            onExcluir={(acaoId, motivo) =>
              executarEscrita(() =>
                excluirAcaoMutation.mutateAsync({ acaoId, motivo }),
              )
            }
          />
        </OperationalDetailSection>

        <OperationalDetailSection titulo="Eventos" abertoPorPadrao={false}>
          <MonitoramentoInternoEventos
            marcos={marcos}
            eventos={timeline.eventos}
            podeEditar={podeEditarConteudo}
            onEditar={(eventoId, valores) =>
              executarEscrita(() =>
                editarEventoMutation.mutateAsync({
                  eventoId,
                  corpo: {
                    fase_geral_id: valores.faseGeralId
                      ? Number(valores.faseGeralId)
                      : null,
                    data_ocorrencia: valores.dataOcorrencia || null,
                    data_prevista: valores.dataPrevista || null,
                    status_regulatorio: valores.statusRegulatorio || null,
                    numero_documento: valores.numeroDocumento || null,
                    data_validade: valores.dataValidade || null,
                    observacao: valores.observacao || null,
                  },
                }),
              )
            }
            onExcluir={(eventoId, motivo, anularInauguracao) =>
              executarEscrita(() =>
                excluirEventoMutation.mutateAsync({
                  eventoId,
                  motivo,
                  anularInauguracao,
                }),
              )
            }
          />
        </OperationalDetailSection>
      </div>
    </div>
  );
}
