/** Ponto público de exportação da feature "monitoramento-equipamento"
 * (monitoramento interno pós-repasse -- entrega/instalação/licença CNEN/
 * inauguração, ver CLAUDE.md seção "Monitoramento interno de equipamento").
 * Consumidores fora da feature (src/pages/Monitoramento*.tsx) devem importar
 * só a partir daqui, nunca direto de components/hooks/lib/types -- mantém
 * a feature livre pra reorganizar o interior sem quebrar quem consome. */

export { API_BASE_URL } from './lib/api';
export { fmtData, fmtMoeda, pct } from './lib/format';
export { componenteDoProgramaSiconv } from './lib/componenteSiconv';
export { EQUIPAMENTOS_ALVO, equipamentosDoConvenio } from './lib/equipamentoTags';
export type { EquipamentoAlvo } from './lib/equipamentoTags';
export { mesclarConvenios } from './lib/mesclarConvenios';

export { useJson } from './hooks/useJson';
export { useInstrumentosMonitorados } from './hooks/useInstrumentosMonitorados';

export { ConvenioCard } from './components/ConvenioCard';
export { MonitoramentoInterno } from './components/MonitoramentoInterno';
export { SecaoComponentes } from './components/SecaoComponentes';
export { SiconvSubAbas } from './components/SiconvSubAbas';
export {
  BarraDistribuicao,
  Campo,
  corValidade,
  estiloCard,
  estiloInput,
  estiloTabela,
  estiloTabelaWrapper,
  estiloTd,
  estiloTh,
  LEGENDA_STATUS,
  rotuloCampo,
  Secao,
  situacaoCor,
  StatusPill,
} from './components/ui';
export type { ContagemRotulo } from './components/ui';

export type {
  ComponenteOncologia,
  ComponentePropostaApi,
  ConvenioPortal,
  ConvenioUnificado,
  EtapaExpandida,
  ProgramaTransfereGov,
  PropostaExpandida,
  SiconvEntrada,
  TransfereGovEnte,
} from './types';
