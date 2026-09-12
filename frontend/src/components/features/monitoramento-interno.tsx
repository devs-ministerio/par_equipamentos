/** Monitoramento interno pos-repasse -- acompanhamento manual de entrega/
 * instalação/licenciamento CNEN/inauguração de UM instrumento, depois do
 * repasse (ver backend/app/routers/monitoramento.py). Vive em página
 * própria (pages/monitoramento-instrumento-page.tsx).
 *
 * Orquestrador: busca dado via hooks próprios (Seção 6/C da migração --
 * toda lógica assíncrona fora do componente de UI) e delega a
 * apresentação pros subcomponentes de monitoramento-interno-*.tsx. */
import { useState } from 'react';
import { useJson } from '@/hooks/useJson';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useMonitoramentoMarcos } from '@/hooks/useMonitoramentoMarcos';
import { useInstrumentoTimeline, useRegistrarEvento, useSalvarCadastroInstrumento } from '@/hooks/useInstrumentoTimeline';
import { useAcoesDoInstrumento, useConcluirAcao, useCriarAcao } from '@/hooks/useMonitoramentoAcoes';
import { componenteDoProgramaSiconv } from '@/lib/componente-siconv';
import { derivarMonitoramentoInterno } from '@/lib/monitoramento-derivado';
import type { SiconvEntrada } from '@/types/monitoramento';
import { ApiError } from '@/lib/api-error';
import { MonitoramentoInternoAcesso } from './monitoramento-interno-acesso';
import { MonitoramentoInternoCabecalho } from './monitoramento-interno-cabecalho';
import { MonitoramentoInternoCadastro } from './monitoramento-interno-cadastro';
import { MonitoramentoInternoFaseGeral, MonitoramentoInternoCronograma } from './monitoramento-interno-fase-cronograma';
import { MonitoramentoInternoAcoes } from './monitoramento-interno-acoes';
import { MonitoramentoInternoEventos } from './monitoramento-interno-eventos';

function mensagemErro(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : String(e);
}

export function MonitoramentoInterno({ numeroConvenio }: { numeroConvenio: string }) {
  const [erroEscrita, setErroEscrita] = useState<string | null>(null);

  // Fallback de componente via SICONV -- achado 2026-09-10 (bug real do
  // convenio 991708: a planilha da equipe deixou a celula "COMPONENTES DE
  // FINANCIAMENTO" vazia pra essa linha, mas o SICONV TEM essa informacao
  // via NOME_PROGRAMA). So exibido quando `inst.componente` for nulo,
  // nunca escrito no banco.
  const { dados: siconvTodos } = useJson<SiconvEntrada[]>('/monitoramento-equipamentos/siconv.json');

  const marcosQuery = useMonitoramentoMarcos();
  const timelineQuery = useInstrumentoTimeline(numeroConvenio);
  const acoesQuery = useAcoesDoInstrumento(numeroConvenio);
  const sessao = useAuthSession();

  const salvarCadastro = useSalvarCadastroInstrumento(numeroConvenio);
  const registrarEventoMutation = useRegistrarEvento(numeroConvenio);
  const criarAcaoMutation = useCriarAcao(numeroConvenio);
  const concluirAcaoMutation = useConcluirAcao();
  const [concluindoAcaoId, setConcluindoAcaoId] = useState<number | null>(null);

  function tratarErroEscrita(e: unknown): never {
    sessao.tratarSessaoInvalida();
    setErroEscrita(mensagemErro(e));
    throw e;
  }

  const erroCarregamento = marcosQuery.error || timelineQuery.error || acoesQuery.error;
  if (erroCarregamento) {
    return <p className="text-warning text-sm">⚠️ {mensagemErro(erroCarregamento)}</p>;
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
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  const marcos = marcosQuery.data;
  const timeline = timelineQuery.data;
  const acoes = acoesQuery.data;
  const inst = timeline.instrumento;

  const {
    fasesGerais, eventosPorMarco, faseAtual, pctAtual, cronogramaFisico, regulatorio,
    eventoLicenca, diasValidade, dataInauguracao, inaugurado, diasInauguracao,
    acoesAbertas, acoesAtrasadas, equipamentoFisico, validadeLicenca, textoLicenca,
  } = derivarMonitoramentoInterno(marcos, timeline, acoes);

  // So calcula o fallback quando precisa (inst.componente nulo) -- cruza
  // siconv.json pelo nr_convenio, mesma logica ja usada no card principal.
  const componenteViaSiconv = !inst.componente
    ? componenteDoProgramaSiconv(siconvTodos?.find((e) => e.convenio.NR_CONVENIO === inst.nr_convenio)?.programa?.NOME_PROGRAMA)
    : null;

  return (
    <div>
      {erroEscrita && (
        <p className="text-warning text-[12.5px] mb-3" role="alert">
          ⚠️ {erroEscrita}
        </p>
      )}

      <MonitoramentoInternoCabecalho
        timeline={timeline}
        componenteViaSiconv={componenteViaSiconv}
        dataInauguracao={dataInauguracao}
        inaugurado={inaugurado}
        diasInauguracao={diasInauguracao}
        equipamentoFisico={equipamentoFisico}
        statusLicenca={eventoLicenca?.status_regulatorio ?? 'Sem registro'}
        textoLicenca={textoLicenca}
        alertaLicenca={validadeLicenca !== null && validadeLicenca < 90}
        acoesAbertasCount={acoesAbertas.length}
        acoesAtrasadasCount={acoesAtrasadas.length}
      />

      <MonitoramentoInternoAcesso
        checandoSessao={sessao.checandoSessao}
        nomeUsuario={sessao.usuarioAtual?.name}
        role={sessao.usuarioAtual?.role}
        podeEditar={sessao.podeEditar}
        autenticado={sessao.autenticado}
        erroLogin={sessao.erroLogin ? mensagemErro(sessao.erroLogin) : null}
        onEntrar={async (valores) => {
          setErroEscrita(null);
          await sessao.login({ email: valores.email, senha: valores.senha });
        }}
        onSair={sessao.sair}
      />

      <MonitoramentoInternoCadastro
        instrumento={inst}
        podeEditar={sessao.podeEditar}
        onSalvar={async (valores) => {
          setErroEscrita(null);
          try {
            await salvarCadastro.mutateAsync({
              tecnico_titular: valores.tecnicoTitular || null,
              tecnico_suplente: valores.tecnicoSuplente || null,
              nivel_monitoramento: valores.nivelMonitoramento || null,
              finalidade: valores.finalidade || null,
              modalidade_onco: valores.modalidadeOnco || null,
              responsavel_execucao_nome: valores.responsavelExecucaoNome || null,
              responsavel_execucao_contato: valores.responsavelExecucaoContato || null,
            });
          } catch (e) {
            tratarErroEscrita(e);
          }
        }}
      />

      <MonitoramentoInternoFaseGeral fasesGerais={fasesGerais} faseAtual={faseAtual} pctAtual={pctAtual} />

      <MonitoramentoInternoCronograma
        cronogramaFisico={cronogramaFisico}
        regulatorio={regulatorio}
        eventosPorMarco={eventosPorMarco}
        eventoLicenca={eventoLicenca}
        diasValidade={diasValidade}
      />

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
      />

      <MonitoramentoInternoEventos
        marcos={marcos}
        eventos={timeline.eventos}
        podeEditar={sessao.podeEditar}
        onRegistrar={async (valores) => {
          setErroEscrita(null);
          try {
            await registrarEventoMutation.mutateAsync({
              marco_id: Number(valores.marcoId),
              data_ocorrencia: valores.dataOcorrencia || null,
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
      />
    </div>
  );
}
