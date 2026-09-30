/** Card de convenio -- 2 camadas de informacao, nao 1 accordion escondendo
 * tudo atras de 1 clique (feedback direto: o que mais importa pra
 * escanear -- status, objeto, grade financeira -- precisa aparecer sem
 * clicar em nada, so o dado tecnico profundo (SICONV/TransfereGov/
 * monitoramento) fica atras de "Ver mais detalhes"). Camada 1 sempre
 * visivel: identificacao, status, objeto, financeiro (`ConvenioCardHeader`).
 * Camada 2 (collapse proprio, so essa parte): dados aninhados
 * (`ConvenioCardDetalhes`) -- ambas extraidas pra arquivo proprio (Secao 6
 * da migracao: componente >200 linhas). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { corrigirTextoSiconv } from "@/lib/monitoramento-format";
import { fetchConvenioDetalhe } from "@/services/convenios";
import type { ConvenioUnificado } from "@/types/monitoramento";
import { estiloCard } from "./monitoramento-ui";
import { ConvenioCardHeader } from "./convenio-card-header";
import { ConvenioCardDetalhes } from "./convenio-card-detalhes";

export function ConvenioCard({
  c,
  monitorado = false,
  faseMonitoramento = null,
}: {
  c: ConvenioUnificado;
  monitorado?: boolean;
  faseMonitoramento?: string | null;
}) {
  // So controla a camada 2 (dado tecnico aninhado) -- a camada 1 (status/
  // objeto/financeiro) e sempre renderizada, nao precisa de estado.
  const [detalheAberto, setDetalheAberto] = useState(false);

  // A carga oficial ganha payload técnico sob demanda; a manual nunca o
  // consulta como se fosse SICONV, pois seu detalhe é só monitoramento.
  const detalheQuery = useQuery({
    queryKey: ["convenio-detalhe", c.numero],
    queryFn: () => fetchConvenioDetalhe(c.numero),
    enabled: detalheAberto,
    staleTime: 5 * 60 * 1000,
  });
  const cDetalhado = detalheQuery.data ?? c;

  // corrigirTextoSiconv -- o dump SICONV tem acento corrompido em "?" (byte
  // perdido na origem, ver comentario em lib/monitoramento-format.ts), so
  // corrigivel na exibicao pro vocabulario burocratico fechado que se repete.
  const programaSiconv = corrigirTextoSiconv(c.programa);

  return (
    <div
      className={cn(
        estiloCard,
        "mb-3 min-w-0 max-sm:px-4 max-sm:py-3.5",
        // Convenio com monitoramento interno ativo ganha destaque visual --
        // e o unico dado editavel da pagina, precisa ser achavel sem abrir
        // card por card (ver useInstrumentosMonitorados.ts).
        monitorado && "border-l-[3px] border-l-success",
      )}
    >
      <ConvenioCardHeader
        c={c}
        monitorado={monitorado}
        faseMonitoramento={faseMonitoramento}
        equipamentos={[
          ...new Set(c.equipamentos.map((equipamento) => equipamento.nome)),
        ]}
        programaSiconv={programaSiconv}
        valorPagoFornecedor={c.valorPagoFornecedor}
        pagamentosCount={c.pagamentosCount}
      />

      {/* ---------- Camada 2: dado tecnico aninhado, atras de 1 clique ---------- */}
      <details
        className="mt-3 border-t border-border pt-2.5"
        open={detalheAberto}
        onToggle={(e) =>
          setDetalheAberto((e.target as HTMLDetailsElement).open)
        }
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold text-primary">
          {detalheAberto ? "Menos detalhes" : "Mais detalhes"}
        </summary>
        {detalheAberto && detalheQuery.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Carregando detalhes...
          </p>
        ) : (
          <ConvenioCardDetalhes c={cDetalhado} monitorado={monitorado} />
        )}
      </details>
    </div>
  );
}
