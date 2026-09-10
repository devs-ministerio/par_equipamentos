/** Ponto público de exportação da feature "dashboard-cobertura" (análise de
 * mérito hipo/hiperssuficiência por macro/região de saúde/município, ver
 * CLAUDE.md seção "Estrutura de pastas do frontend"). Consumidores fora da
 * feature devem importar só a partir daqui, nunca direto de components/ --
 * mantém a feature livre pra reorganizar o interior sem quebrar quem
 * consome.
 *
 * `KpiCard`/`MultiSelectFilter` NÃO estão aqui de propósito -- são
 * presentacionais puros usados também fora do dashboard (Monitoramento,
 * modais de exportação do Relatórios), então moram em
 * `src/components/common/` em vez de dentro desta feature. */
export { CoberturaTable } from './components/CoberturaTable';
export { EstabelecimentoTable } from './components/EstabelecimentoTable';
export { NivelCoberturaTable } from './components/NivelCoberturaTable';
export { SubNivelRows } from './components/SubNivelRows';
export { MunicipioDetalheModal } from './components/MunicipioDetalheModal';
export { BotaoDetalhe } from './components/BotaoDetalhe';
export { InfoIcon } from './components/InfoIcon';
export { StatusFilterButtons } from './components/StatusFilterButtons';
