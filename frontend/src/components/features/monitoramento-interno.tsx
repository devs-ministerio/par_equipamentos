/** Monitoramento interno pos-repasse -- acompanhamento manual de entrega/
 * instalação/licenciamento CNEN/inauguração de UM instrumento, depois do
 * repasse (ver backend/app/routers/monitoramento.py). Vive em página
 * própria (pages/monitoramento-instrumento-page.tsx).
 *
 * Orquestrador: busca dado via hooks próprios (Seção 6/C da migração --
 * toda lógica assíncrona fora do componente de UI) e delega a
 * apresentação pros subcomponentes de monitoramento-interno-*.tsx. */
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

  // Fallback de componente via SICONV -- achado 2026-09-10 (bug real do
  // convenio 991708: a planilha da equipe deixou a celula "COMPONENTES DE
  // FINANCIAMENTO" vazia pra essa linha, mas o SICONV TEM essa informacao
  // via NOME_PROGRAMA). So exibido quando `inst.componente` for nulo,
  // nunca escrito no banco. Lookup autenticado por numero (Bloco 5), nao
  // mais siconv.json inteiro (ver docstring de useConvenioPrograma).
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

  // So usa o fallback quando precisa (inst.componente nulo).
  const componenteViaSiconv = !inst.componente ? componenteDoProgramaSiconv(programaQuery.data) : null;

  // Heurística de "mais de 1 equipamento no mesmo convênio" (Plan Mode
  // monitoramento-evolucao 2026-09-19, pedido do usuário: "só use essa
  // possibilidade pra instrumentos que tem mais de um acelerador") --
  // equipamento_descricao (texto do SICONV) já concatena os itens com
  // " + " quando o convênio financia mais de 1 (ex. convênio 947527, "...
  // + ..."). Não existe campo estruturado de quantidade; isso é
  // aproximação sobre texto livre, não uma contagem garantida.
  const multiploEquipamento = (inst.equipamento_descricao ?? '').includes(' + ');

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
        diasInauguracao={diasInauguracao}
        equipamentoFisico={equipamentoFisico}
        statusLicenca={eventoLicenca?.status_regulatorio ?? 'Sem registro'}
        alertaLicenca={validadeLicenca !== null && validadeLicenca < 90}
        acoesAbertasCount={acoesAbertas.length}
        acoesAtrasadasCount={acoesAtrasadas.length}
      />

      {/* "Acesso operacional" saiu daqui (achado 2026-09-15, pedido do
          usuário: "pode remover a parte com acesso operacional") -- status
          de sessão/login/logout já fica no UserMenu do header (todas as
          páginas), essa seção só duplicava a mesma informação. */}

      <MonitoramentoInternoCadastro
        instrumento={inst}
        podeEditar={sessao.podeEditar}
        aberto={cadastroAberto}
        onAbrir={() => setCadastroAberto(true)}
        onFechar={() => setCadastroAberto(false)}
        onSalvar={async (valores) => {
          setErroEscrita(null);
          try {
            await salvarCadastro.mutateAsync({
              tecnico_titular: valores.tecnicoTitular || null,
              tecnico_suplente: valores.tecnicoSuplente || null,
              nivel_monitoramento: valores.nivelMonitoramento || null,
              tipologia: valores.tipologia || null,
              modalidade_onco: valores.modalidadeOnco || null,
              responsavel_execucao_nome: valores.responsavelExecucaoNome || null,
              responsavel_execucao_contato: valores.responsavelExecucaoContato || null,
              cnes: valores.cnes || null,
            });
          } catch (e) {
            tratarErroEscrita(e);
          }
        }}
      />

      {/* Agrupamento progressivo (achado da auditoria visual: "página muito
          longa sem índice local ou agrupamento progressivo") -- fase/
          cronograma abertos por padrão (visão executiva do estado atual),
          ações/timeline fecháveis (histórico, consultado sob demanda). */}
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
            onCriar={async (valores) => {
              setErroEscrita(null);
              try {
                await criarAcaoMutation.mutateAsync({
                  descricao: valores.descricao,
                  data_prevista: valores.dataPrevista || null,
                  responsavel: valores.responsavel || null,
                });
              } catch (e) {
                tratarErroEscrita(e);
              }
            }}
            onConcluir={(acaoId) => {
              setErroEscrita(null);
              setConcluindoAcaoId(acaoId);
              concluirAcaoMutation.mutate(acaoId, {
                onError: (e) => tratarErroEscrita(e),
                onSettled: () => setConcluindoAcaoId(null),
              });
            }}
            onEditar={async (acaoId, valores) => {
              setErroEscrita(null);
              try {
                await editarAcaoMutation.mutateAsync({
                  acaoId,
                  corpo: {
                    descricao: valores.descricao,
                    data_prevista: valores.dataPrevista || null,
                    responsavel: valores.responsavel || null,
                  },
                });
              } catch (e) {
                tratarErroEscrita(e);
                throw e;
              }
            }}
            onExcluir={async (acaoId, motivo) => {
              setErroEscrita(null);
              try {
                await excluirAcaoMutation.mutateAsync({ acaoId, motivo });
              } catch (e) {
                tratarErroEscrita(e);
                throw e;
              }
            }}
          />
        </OperationalDetailSection>

        <OperationalDetailSection titulo="Linha do tempo de eventos" abertoPorPadrao={false}>
          <MonitoramentoInternoEventos
            marcos={marcos}
            eventos={timeline.eventos}
            podeEditar={sessao.podeEditar}
            onRegistrar={async (valores) => {
              setErroEscrita(null);
              try {
                await registrarEventoMutation.mutateAsync({
                  marco_id: Number(valores.marcoId),
                  fase_geral_id: valores.faseGeralId ? Number(valores.faseGeralId) : null,
                  data_ocorrencia: valores.dataOcorrencia || null,
                  data_prevista: valores.dataPrevista || null,
                  status_regulatorio: valores.statusRegulatorio || null,
                  numero_documento: valores.numeroDocumento || null,
                  data_validade: valores.dataValidade || null,
                  observacao: valores.observacao || null,
                  // So tem efeito no backend quando o marco e cronograma_entrega
                  // -- ignorado pra qualquer outro.
                  equipamento_marca: valores.equipamentoMarca || null,
                  equipamento_modelo: valores.equipamentoModelo || null,
                  equipamento_numero_serie: valores.equipamentoNumeroSerie || null,
                  equipamento_vida_util_anos: valores.equipamentoVidaUtilAnos ? Number(valores.equipamentoVidaUtilAnos) : null,
                });
              } catch (e) {
                tratarErroEscrita(e);
              }
            }}
            onEditar={async (eventoId, valores) => {
              setErroEscrita(null);
              try {
                await editarEventoMutation.mutateAsync({
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
                });
              } catch (e) {
                tratarErroEscrita(e);
                throw e;
              }
            }}
            onExcluir={async (eventoId, motivo) => {
              setErroEscrita(null);
              try {
                await excluirEventoMutation.mutateAsync({ eventoId, motivo });
              } catch (e) {
                tratarErroEscrita(e);
                throw e;
              }
            }}
          />
        </OperationalDetailSection>
      </div>
    </div>
  );
}
