/** Cada estatistica de cobertura e o SEU PROPRIO card (2026-08-22, pedido
 * explicito) -- alinhados entre si (mesma altura/padding, `flex: 1` divide o
 * espaco igual) e, como as duas familias usam a mesma estrutura, tambem
 * alinhados verticalmente entre os cards de Tomografo e Ressonancia na
 * mesma linha do grid. Numero em preto/neutro de proposito (nao mais
 * vermelho/laranja/verde por gravidade, decisao 2026-08-22) -- esses 3 sao
 * "quantos", nao "quao grave"; quem carrega o sinal de gravidade agora e o
 * Ranking (barra por severidade) e o Mapa (gradiente), pra nao competir/
 * repetir o mesmo alerta em 3 lugares diferentes da mesma tela. */
export function PainelGeralStatCard({
  valor,
  label,
}: {
  valor: string;
  label: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-border bg-background px-3 py-4 text-center">
      <div className="font-display text-[22px] font-bold tracking-[-0.01em] text-foreground">
        {valor}
      </div>
      <div className="mt-[5px] text-[10.5px] leading-[1.35] text-muted-foreground/70">
        {label}
      </div>
    </div>
  );
}
