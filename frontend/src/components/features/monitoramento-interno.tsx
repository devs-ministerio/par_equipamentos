/** Orquestra dados e ações do monitoramento pós-repasse de um instrumento. */
import { useState } from 'react';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useConvenioPrograma } from '@/hooks/useConvenioPrograma';
import { useMonitoramentoMarcos } from '@/hooks/useMonitoramentoMarcos';
import { useEditarEvento, useExcluirEvento, useInstrumentoTimeline, useRegistrarEvento, useSalvarCadastroInstrumento } from '@/hooks/useInstrumentoTimeline';
import { useAcoesDoInstrumento, useConcluirAcao, useCriarAcao, useEditarAcao, useExcluirAcao } from '@/hooks/useMonitoramentoAcoes';
import { componenteDoProgramaSiconv } from '@/lib/componente-siconv';
import { derivarMonitoramentoInterno } from '@/lib/monitoramento-derivado';
import { mensagemSeguraDoErro } from '@/lib/api-error';
import { ErrorAlert } from '@/components/common/error-alert';
import { Skeleton } from '@/components/ui/skeleton';
import { OperationalDetailSection } from '@/components/common/operational-detail-section';
import { MonitoramentoInternoCabecalho } from './monitoramento-interno-cabecalho';
import { MonitoramentoInternoCadastro } from './monitoramento-interno-cadastro';
import { MonitoramentoInternoFaseGeral, MonitoramentoInternoCronograma } from './monitoramento-interno-fase-cronograma';
import { MonitoramentoInternoAcoes } from './monitoramento-interno-acoes';
import { MonitoramentoInternoEventos } from './monitoramento-interno-eventos';

export function MonitoramentoInterno({ numeroConvenio }: { numeroConvenio: string }) {
  const [erroEscrita, setErroEscrita] = useState<string | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  // Fallback de leitura SICONV; nunca escreve componente no banco.
  const programaQuery = useConvenioPrograma(numeroConvenio);
  const marcosQuery = useMonitoramentoMarcos();
  const timelineQuery = useInstrumentoTimeline(numeroConvenio);
  const acoesQuery = useAcoesDoInstrumento(numeroConvenio);
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

  function tratarErroEscrita(e: unknown): never {
    sessao.tratarSessaoInvalida();
    setErroEscrita(mensagemSeguraDoErro(e));
    throw e;
  }

  async function executarEscrita(acao: () => Promise<unknown>): Promise<void> {
    setErroEscrita(null);
    try {
      await acao();
    } catch (erro) {
      tratarErroEscrita(erro);
    }
  }

  const erroCarregamento = marcosQuery.error || timelineQuery.error || acoesQuery.error;
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
        Ainda não monitorado internamente — escopo é bem menor que os 403 convênios (só os instrumentos que a
        equipe decide acompanhar manualmente, ver <code>backend/scripts/importar_planilha_monitoramento.py</code>).
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

  const marcos = marcosQuery.data;
  const timeline = timelineQuery.data;
  const acoes = acoesQuery.data;
  const inst = timeline.instrumento;

  const {
    fasesGerais, eventosPorMarco, faseAtual, pctAtual, cronogramaFisico, regulatorio,
    eventoLicenca, dataInauguracao, inaugurado, diasInauguracao,
    acoesAbertas, acoesAtrasadas, equipamentoFisico, validadeLicenca,
  } = derivarMonitoramentoInterno(marcos, timeline, acoes);

  const componenteViaSiconv = !inst.componente ? componenteDoProgramaSiconv(programaQuery.data) : null;

  // A fonte não expõe quantidade estruturada; " + " indica múltiplos itens.
  const multiploEquipamento = (inst.equipamento_descricao ?? '').includes(' + ');

  return (
    <div>
      {erroEscrita && (
        <div className="mb-3">
          <ErrorAlert mensagem={erroEscrita} />
        </div>
      )}

      <MonitoramentoInternoCabecalho timeline={timeline} componenteViaSiconv={componenteViaSiconv} dataInauguracao={dataInauguracao} inaugurado={inaugurado} diasInauguracao={diasInauguracao} equipamentoFisico={equipamentoFisico} statusLicenca={eventoLicenca?.status_regulatorio ?? 'Sem registro'} alertaLicenca={validadeLicenca !== null && validadeLicenca < 90} acoesAbertasCount={acoesAbertas.length} acoesAtrasadasCount={acoesAtrasadas.length} />

      <MonitoramentoInternoCadastro
        instrumento={inst}
        podeEditar={sessao.podeEditar}
        aberto={cadastroAberto}
        onAbrir={() => setCadastroAberto(true)}
        onFechar={() => setCadastroAberto(false)}
        onSalvar={(valores) => executarEscrita(() => salvarCadastro.mutateAsync({
              tecnico_titular: valores.tecnicoTitular || null,
              tecnico_suplente: valores.tecnicoSuplente || null,
              nivel_monitoramento: valores.nivelMonitoramento || null,
              tipologia: valores.tipologia || null,
              modalidade_onco: valores.modalidadeOnco || null,
              responsavel_execucao_nome: valores.responsavelExecucaoNome || null,
              responsavel_execucao_contato: valores.responsavelExecucaoContato || null,
              cnes: valores.cnes || null,
            }))}
      />

      <div className="grid gap-4">
        <OperationalDetailSection titulo="Fase e cronograma">
          <MonitoramentoInternoFaseGeral fasesGerais={fasesGerais} faseAtual={faseAtual} pctAtual={pctAtual} />
          <MonitoramentoInternoCronograma
            cronogramaFisico={cronogramaFisico}
            regulatorio={regulatorio}
            eventosPorMarco={eventosPorMarco}
            multiploEquipamento={multiploEquipamento}
          />
        </OperationalDetailSection>

        <OperationalDetailSection titulo={`Ações (${acoes?.length ?? 0})`} abertoPorPadrao={acoesAbertas.length > 0}>
          <MonitoramentoInternoAcoes
            acoes={acoes}
            podeEditar={sessao.podeEditar}
            concluindoAcaoId={concluindoAcaoId}
            onCriar={(valores) => executarEscrita(() => criarAcaoMutation.mutateAsync({
                  descricao: valores.descricao,
                  data_prevista: valores.dataPrevista || null,
                  responsavel: valores.responsavel || null,
                }))}
            onConcluir={(acaoId) => {
              setErroEscrita(null);
              setConcluindoAcaoId(acaoId);
              concluirAcaoMutation.mutate(acaoId, {
                onError: (e) => tratarErroEscrita(e),
                onSettled: () => setConcluindoAcaoId(null),
              });
            }}
            onEditar={(acaoId, valores) => executarEscrita(() => editarAcaoMutation.mutateAsync({
                  acaoId,
                  corpo: {
                    descricao: valores.descricao,
                    data_prevista: valores.dataPrevista || null,
                    responsavel: valores.responsavel || null,
                  },
                }))}
            onExcluir={(acaoId, motivo) => executarEscrita(() => excluirAcaoMutation.mutateAsync({ acaoId, motivo }))}
          />
        </OperationalDetailSection>

        <OperationalDetailSection titulo="Linha do tempo de eventos" abertoPorPadrao={false}>
          <MonitoramentoInternoEventos
            marcos={marcos}
            eventos={timeline.eventos}
            podeEditar={sessao.podeEditar}
            onRegistrar={(valores) => executarEscrita(() => registrarEventoMutation.mutateAsync({
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
                  equipamento_vida_util_anos: valores.equipamentoVidaUtilAnos ? Number(valores.equipamentoVidaUtilAnos) : null,
                }))}
            onEditar={(eventoId, valores) => executarEscrita(() => editarEventoMutation.mutateAsync({
                  eventoId,
                  corpo: {
                    fase_geral_id: valores.faseGeralId ? Number(valores.faseGeralId) : null,
                    data_ocorrencia: valores.dataOcorrencia || null,
                    data_prevista: valores.dataPrevista || null,
                    status_regulatorio: valores.statusRegulatorio || null,
                    numero_documento: valores.numeroDocumento || null,
                    data_validade: valores.dataValidade || null,
                    observacao: valores.observacao || null,
                  },
                }))}
            onExcluir={(eventoId, motivo) => executarEscrita(() => excluirEventoMutation.mutateAsync({ eventoId, motivo }))}
          />
        </OperationalDetailSection>
      </div>
    </div>
  );
}
