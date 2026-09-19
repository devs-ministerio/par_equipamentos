/**
 * components/features/resultado-card.tsx
 *
 * Componente de referência combinando os padrões do lib/theme.css:
 * .card-group (elevação seletiva por grupo) + .kpi-row/.kpi (métricas sem
 * desalinhamento) + .table-editorial/.table-scroll (tabela sem scroll de
 * página) + .meta-grid (identificação/detalhes) + .badge/.tabs.
 *
 * Ponto de partida para telas de "1 resultado com métricas + identificação +
 * itens" (convênio, pedido, processo, contrato...). O shape de `Resultado`
 * vem de types/resultado.ts, que é inferido do schema Zod (Seção 8) — nunca
 * redeclarar o tipo aqui.
 *
 * Uso: <ResultadoCard resultado={resultado} />
 */

import { useState } from "react";
import type { Resultado } from "@/types/resultado";

const STATUS_BADGE_CLASS: Record<Resultado["status"], string> = {
  monitorado: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
  em_analise: "alert-destructive",
  concluido: "alert-success",
};

export function ResultadoCard({ resultado }: { resultado: Resultado }) {
  const [abaAtiva, setAbaAtiva] = useState(0);

  return (
    <article className="card-group">
      <div className="card-group-accent" />

      <header className="flex flex-wrap items-start justify-between gap-4 p-5 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="font-semibold text-[hsl(var(--primary))]">
            {resultado.codigo}
          </span>
          <span className="text-[hsl(var(--muted-foreground))]">
            · {resultado.id}
          </span>
        </div>
        <span className={`badge ${STATUS_BADGE_CLASS[resultado.status]}`}>
          {resultado.statusLabel}
        </span>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{resultado.titulo}</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {resultado.documento}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Valor global
          </p>
          <p className="text-xl font-bold text-[hsl(var(--primary))]">
            {resultado.valorGlobal}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {resultado.percentualDesembolsado}% desembolsado
          </p>
        </div>
      </div>

      {/* KPIs: cada valor tem altura fixa e nunca quebra linha (Seção 6/14) */}
      <div className="kpi-row mt-4">
        {resultado.kpis.map((kpi) => (
          <div className="kpi" key={kpi.label}>
            <p className="label">{kpi.label}</p>
            <p className="value">{kpi.value}</p>
            <p className="sub">{kpi.sub ?? " "}</p>
          </div>
        ))}
      </div>

      {/* Identificação: meta-grid, label acima / valor com contraste total abaixo */}
      <section className="meta-grid">
        {resultado.identificacao.map((campo) => (
          <div className="field" key={campo.label}>
            <label>{campo.label}</label>
            <span>{campo.valor}</span>
          </div>
        ))}
      </section>

      {/* Abas: aba ativa por borda inferior, nunca fundo escuro */}
      <div className="tabs px-5">
        <button
          type="button"
          aria-selected={abaAtiva === 0}
          onClick={() => setAbaAtiva(0)}
        >
          Itens do plano ({resultado.itensPlano.length})
        </button>
      </div>

      <div className="table-scroll px-5 pb-5">
        <table className="table-editorial">
          <thead>
            <tr>
              <th>Descrição</th>
              <th className="num">Qtd</th>
              <th className="num">Vl. unitário</th>
              <th className="num">Vl. total</th>
            </tr>
          </thead>
          <tbody>
            {resultado.itensPlano.map((item) => (
              <tr key={item.descricao}>
                <td>{item.descricao}</td>
                <td className="num font-data">{item.qtd}</td>
                <td className="num font-data">{item.valorUnitario}</td>
                <td className="num font-data">{item.valorTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
