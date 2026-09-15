/** Pecas de UI compartilhadas entre ConvenioCard e MonitoramentoInterno --
 * paleta clara reaproveitando as variaveis Tailwind/shadcn (mesma linguagem
 * visual do Dashboard/Painel Geral), pagina continua fora do AppLayout
 * (decisao 2026-09-03, ver MonitoramentoEquipamentosPage.tsx). */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Sombra suave em vez de so borda -- cartao "flutua" sobre o fundo
 * (bg-background) ao inves de se misturar nele, mesma linguagem visual
 * do protótipo de referencia (Stitch, 2026-09-08) adaptada pros tokens
 * do projeto. */
export const estiloCard = 'bg-card border border-border rounded-[10px] px-5 py-4 shadow-[0_1px_3px_rgba(22,33,62,0.06)]';

export const estiloInput = 'border border-border rounded-lg px-3 py-2.5 text-[12.5px] font-inherit outline-none';

export const rotuloCampo = 'text-[10.5px] text-muted-foreground uppercase tracking-[.03em]';

/** Tabela SICONV/TransfereGov pode ter varias colunas numericas -- em tela
 * estreita (celular) isso nao cabe sem espremer o dado a ponto de ficar
 * ilegivel. Envolve a tabela nesse wrapper (`overflow-x-auto`) em vez de
 * deixar o layout inteiro da pagina estourar horizontalmente -- so a
 * tabela rola, o resto do card fica no lugar. */
export const estiloTabelaWrapper = 'overflow-x-auto [-webkit-overflow-scrolling:touch]';
export const estiloTabela = 'w-full min-w-[420px] border-collapse text-[12.5px]';
export const estiloTh = 'text-left text-muted-foreground text-[10.5px] font-semibold py-0.5 pr-2 pl-0 border-b border-border';
export const estiloTd = 'py-1 pr-2 pl-0 border-b border-border';

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

const VARIANT_CLASSES: Record<SituacaoVariant, string> = {
  destructive: 'bg-destructive-bg text-destructive border-destructive/20',
  success: 'bg-success-bg text-success border-success/20',
  warning: 'bg-warning-bg text-warning border-warning/20',
  muted: 'bg-background text-muted-foreground border-muted-foreground/20',
};

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

export function StatusPill({ texto }: { texto: string | null | undefined }) {
  const variant = situacaoVariant(texto);
  return (
    <span className={cn(
      'inline-flex items-center gap-[5px] py-[3px] pr-2.5 pl-2 rounded-full text-[10.5px] font-bold whitespace-nowrap border',
      VARIANT_CLASSES[variant],
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', VARIANT_DOT_CLASSES[variant])} />
      {texto || '—'}
    </span>
  );
}

export function Campo({ label, legenda, children }: { label: string; legenda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className={rotuloCampo}>{label}</div>
      <div className="text-[13px]">{children}</div>
      {legenda && <div className="text-[10px] text-muted-foreground mt-px">{legenda}</div>}
    </div>
  );
}

/** Cor por urgencia de vencimento (licenca CNEN, mas generico) -- achado
 * 2026-09-09, movido pra ca de MonitoramentoInterno.tsx pra reaproveitar
 * tambem no Painel de Gestao. `dias` negativo = ja venceu. */
export function classeValidade(dias: number): string {
  if (dias < 0) return 'text-destructive';
  if (dias < 90) return 'text-destructive';
  if (dias < 180) return 'text-warning';
  return 'text-success';
}

/** {rotulo, quantidade} generico -- distribuicao por fase/tecnico/UF/
 * componente/tipo de contratacao (achado 2026-09-09, movido pra ca de
 * MonitoramentoOverviewPage.tsx pra ser reaproveitado tambem no Painel
 * de Gestao, ver MonitoramentoPainelPage.tsx). */
export type ContagemRotulo = { rotulo: string; quantidade: number };

/** Barra horizontal simples (sem lib de grafico -- so CSS, mais leve). */
export function BarraDistribuicao({ itens, corBarra }: { itens: ContagemRotulo[]; corBarra: string }) {
  const max = Math.max(1, ...itens.map((i) => i.quantidade));
  return (
    <div className="grid gap-2">
      {itens.map((item) => (
        <div key={item.rotulo}>
          <div className="flex justify-between text-xs mb-0.5">
            <span>{item.rotulo}</span>
            <strong>{item.quantidade}</strong>
          </div>
          <div className="h-2 rounded-full bg-background">
            <div className="h-full rounded-full" style={{ width: `${(item.quantidade / max) * 100}%`, background: corBarra }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Card com título/subtítulo/ação opcional -- usado pelas seções operacionais
 * de MonitoramentoInterno (Acesso, Cadastro, Fase geral, Cronograma, Ações,
 * Timeline). Extraído do próprio arquivo (era função interna) pra ser
 * reaproveitado pelos subcomponentes depois do split (Seção 6). */
export function SecaoOperacional({
  titulo,
  subtitulo,
  acao,
  destaque = false,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
  destaque?: boolean;
  // Opcional (achado 2026-09-15) -- MonitoramentoInternoAcesso ficou só
  // com header+ação depois que o login parou de abrir form inline aqui.
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn('mb-4 gap-0 py-0', destaque && 'bg-muted/50')}>
      <CardHeader className={cn('grid-cols-[1fr_auto] gap-3 py-3.5', children != null && 'border-b')}>
        <div>
          <CardTitle className="text-sm font-semibold tracking-[-0.01em] text-foreground">{titulo}</CardTitle>
          {subtitulo && <CardDescription className="mt-1 text-xs leading-snug">{subtitulo}</CardDescription>}
        </div>
        {acao}
      </CardHeader>
      {children != null && <CardContent className="py-3.5">{children}</CardContent>}
    </Card>
  );
}

/** `aria-describedby` composto (helper + erro do campo) -- `undefined`
 * quando nenhum dos 2 existe, pra não poluir o DOM com atributo vazio. */
export function idsDescricaoCampo(id: string, temErro: boolean, temHelper: boolean): string | undefined {
  const ids = [temHelper ? `${id}-helper` : null, temErro ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Mensagem de erro de campo de form -- `id` é o alvo do `aria-describedby`
 * do input correspondente (ver idsDescricaoCampo). */
export function ErroCampo({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p id={id} role="alert" className="text-[10.5px] text-destructive mt-1 mb-0">
      {mensagem}
    </p>
  );
}

/** Texto de ajuda de campo de form (ex. formato esperado) -- mesmo esquema
 * de id do erro acima. */
export function AjudaCampo({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="text-[10.5px] text-muted-foreground mt-1 mb-0">
      {texto}
    </p>
  );
}

export function Secao({
  titulo, contagem, acao, children,
}: { titulo: string; contagem?: number; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-[18px]">
      <h4 className="text-[11px] font-extrabold uppercase tracking-[.05em] text-primary m-0 mb-2.5 pb-1.5 border-b border-border flex justify-between items-center gap-2.5">
        <span>{titulo}{contagem !== undefined ? ` — ${contagem}` : ''}</span>
        {/* Acao opcional na mesma linha do titulo -- achado 2026-09-10,
            pedido do usuario: titulo + link relacionado (ex. "Monitoramento
            interno" + "Ver detalhes →") ficavam empilhados e repetiam a
            mesma frase, essa prop deixa os 2 juntos sem duplicar texto. */}
        {acao && <span className="normal-case tracking-normal font-semibold">{acao}</span>}
      </h4>
      {children}
    </div>
  );
}
