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
import { Button } from "@/components/ui/button";
import { DetalhesAnimados } from "@/components/common/detalhes-animados";
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
    // O resumo não possui versão/data de atualização. Seu conteúdo faz parte
    // da chave para não reaproveitar detalhe antigo após atualizar a listagem.
    queryKey: ["convenio-detalhe", c.numero, c],
    queryFn: () => fetchConvenioDetalhe(c.numero),
    enabled: detalheAberto && c.dadosOficiaisDisponiveis,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const cDetalhado = c.dadosOficiaisDisponiveis ? (detalheQuery.data ?? c) : c;

  // corrigirTextoSiconv -- o dump SICONV tem acento corrompido em "?" (byte
  // perdido na origem, ver comentario em lib/monitoramento-format.ts), so
  // corrigivel na exibicao pro vocabulario burocratico fechado que se repete.
  const programaSiconv = corrigirTextoSiconv(cDetalhado.programa);

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
        c={cDetalhado}
        monitorado={monitorado}
        faseMonitoramento={faseMonitoramento}
        equipamentos={[
          ...new Set(
            cDetalhado.equipamentos.map((equipamento) => equipamento.nome),
          ),
        ]}
        programaSiconv={programaSiconv}
        valorPagoFornecedor={cDetalhado.valorPagoFornecedor}
        pagamentosCount={cDetalhado.pagamentosCount}
      />

      {/* ---------- Camada 2: dado tecnico aninhado, atras de 1 clique ---------- */}
      <DetalhesAnimados
        className="mt-4 border-t border-border pt-3"
        aberto={detalheAberto}
        onAbertoChange={setDetalheAberto}
      >
        {c.dadosOficiaisDisponiveis && detalheQuery.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Carregando detalhes...
          </p>
        ) : c.dadosOficiaisDisponiveis && detalheQuery.isError ? (
          <div className="mt-3 space-y-2">
            <p role="alert" className="text-xs text-destructive">
              Não foi possível carregar os detalhes. Tente novamente.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void detalheQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <ConvenioCardDetalhes c={cDetalhado} monitorado={monitorado} />
        )}
      </DetalhesAnimados>
    </div>
  );
}
