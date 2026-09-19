/** 4 familias de cor pro vocabulario de status (situacao de convenio tem
 * ~9 variacoes reais no dado -- ver MonitoramentoEquipamentosPage.tsx pra
 * legenda visivel na tela). Ordem de checagem importa: ANULADO/REJEITADO
 * antes de PRESTA (senao "PRESTAÇÃO DE CONTAS REJEITADA" cairia no laranja
 * por conter "PRESTA"). */
export type SituacaoVariant = 'destructive' | 'success' | 'warning' | 'muted';

export function situacaoVariant(situacao: string | null | undefined): SituacaoVariant {
  const s = (situacao || '').toUpperCase();
  if (s.includes('ANULADO') || s.includes('REJEITAD') || s.includes('INDEFERIDO')) return 'destructive';
  if (s.includes('EXECU') || s.includes('NORMAL') || s.includes('DEFERIDO') || s.includes('CONCLU') || s.includes('APROVAD')) return 'success';
  if (s.includes('PRESTA') || s.includes('ANALISE') || s.includes('ANÁLISE') || s.includes('CAPTA') || s.includes('DILIG') || s.includes('AGUARDANDO') || s.includes('COMPLEMENT')) return 'warning';
  return 'muted';
}

export const VARIANT_DOT_CLASSES: Record<SituacaoVariant, string> = {
  destructive: 'bg-destructive',
  success: 'bg-success',
  warning: 'bg-warning',
  muted: 'bg-muted-foreground',
};

/** Legenda das 4 familias -- usada no topo da lista principal
 * (MonitoramentoEquipamentosPage.tsx) pra deixar o vocabulario de cor
 * explicito antes do usuario escanear ~300 badges. */
export const LEGENDA_STATUS: { variant: SituacaoVariant; rotulo: string }[] = [
  { variant: 'success', rotulo: 'Em execução / Normal / aprovada' },
  { variant: 'warning', rotulo: 'Prestação de contas em curso' },
  { variant: 'destructive', rotulo: 'Anulado / rejeitado / indeferido' },
  { variant: 'muted', rotulo: 'Demais situações' },
];

/** Cor por urgencia de vencimento (licenca CNEN, mas generico) -- achado
 * 2026-09-09, movido pra ca de MonitoramentoInterno.tsx pra reaproveitar
 * tambem no Painel de Gestao. `dias` negativo = ja venceu. */
export function classeValidade(dias: number): string {
  if (dias < 0) return 'text-destructive';
  if (dias < 90) return 'text-destructive';
  if (dias < 180) return 'text-warning';
  return 'text-success';
}

/** `aria-describedby` composto (helper + erro do campo) -- `undefined`
 * quando nenhum dos 2 existe, pra não poluir o DOM com atributo vazio. */
export function idsDescricaoCampo(id: string, temErro: boolean, temHelper: boolean): string | undefined {
  const ids = [temHelper ? `${id}-helper` : null, temErro ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}
