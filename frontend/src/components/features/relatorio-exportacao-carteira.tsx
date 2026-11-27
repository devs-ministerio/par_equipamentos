import { useState } from "react";
import { FileText } from "lucide-react";
import { ControleDesktop } from "@/components/common/controles-filtro";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { RecortePainel } from "@/components/common/chips-filtros-ativos";
import type { FiltroRelatorio } from "@/services/relatorios";
import { RelatorioPreviaExportacao } from "./relatorio-previa-exportacao";
import {
  ID_EXPORTAR_RELATORIO,
  ID_TIPO_RELATORIO,
} from "./relatorio-cabecalho";
import { Opcoes } from "./painel-gestao-filtros-campos";

const TIPOS = {
  propostas: "Propostas",
  instrumentos_monitorados: "Instrumentos",
  equipamentos_monitorados: "Equipamentos",
} as const;

type Visao = keyof typeof TIPOS;

function compativel(visao: Visao, { etapa, situacaoOrigem }: FiltroRelatorio) {
  const etapaDoTipo = visao === "propostas" ? "propostas" : "monitorado";
  if (etapa && etapa !== etapaDoTipo) return false;

  switch (situacaoOrigem) {
    case "monitoramento":
      return etapaDoTipo === "monitorado";
    case "instrumento":
      return false;
    case "proposta":
      return etapaDoTipo === "propostas";
    default:
      return true;
  }
}

export function RelatorioExportacaoCarteira({
  filtro,
  recortes,
  escopo,
  bloqueio,
}: {
  filtro: FiltroRelatorio;
  recortes: Pick<RecortePainel, "rotulo" | "valor">[];
  escopo: string;
  bloqueio?: string;
}) {
  const [selecao, setSelecao] = useState<Visao | "">("");
  const [aberto, setAberto] = useState(false);
  const [sessao, setSessao] = useState(0);
  const visao = selecao && compativel(selecao, filtro) ? selecao : "";
  const opcoes = (Object.keys(TIPOS) as Visao[]).map((tipo) => ({
    value: tipo,
    label: TIPOS[tipo],
    desabilitada: !compativel(tipo, filtro),
  }));

  return (
    <Dialog
      open={aberto}
      onOpenChange={(novo) => {
        if (novo) setSessao((atual) => atual + 1);
        setAberto(novo);
      }}
    >
      <section
        id={ID_EXPORTAR_RELATORIO}
        tabIndex={-1}
        aria-labelledby="relatorio-exportar-titulo"
        className="scroll-mt-24 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              id="relatorio-exportar-titulo"
              className="font-display text-lg font-bold tracking-tight"
            >
              Exportar
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Escolha o tipo de relatório e clique em Configurar para baixar em
              Word ou Excel.
            </p>
            {bloqueio && (
              <p className="mt-0.5 text-sm text-muted-foreground">{bloqueio}</p>
            )}
          </div>
          <div className="flex w-full flex-wrap gap-2 [&>button]:h-[42px] sm:w-auto">
            <ControleDesktop
              id={ID_TIPO_RELATORIO}
              disabled={!!bloqueio}
              rotuloBotao={visao ? TIPOS[visao] : "Tipo de relatório"}
              className="border border-input px-2.5 text-sm font-semibold text-foreground"
              classePopover="w-[min(230px,calc(100vw-2rem))]"
              controle={{
                rotulo: "Tipo de relatório",
                icone: FileText,
                ativo: !!visao,
                conteudo: (fechar) => (
                  <Opcoes
                    rotulo="Tipo de relatório"
                    opcoes={opcoes}
                    valor={visao || null}
                    selecionar={(valor) => {
                      const opcao = opcoes.find(({ value }) => value === valor);
                      if (opcao && !opcao.desabilitada) setSelecao(opcao.value);
                      fechar();
                    }}
                  />
                ),
              }}
            />
            <DialogTrigger asChild>
              <Button type="button" disabled={!visao || !!bloqueio}>
                Configurar
              </Button>
            </DialogTrigger>
          </div>
        </div>
      </section>

      {visao && (
        <DialogContent
          showCloseButton={false}
          className="max-h-[85dvh] overflow-y-auto p-5 sm:max-w-3xl"
        >
          <DialogHeader className="flex-row flex-wrap items-center justify-between gap-x-4">
            <div className="flex min-w-0 flex-col gap-2">
              <DialogTitle>{TIPOS[visao]}</DialogTitle>
              <DialogDescription className="wrap-break-word">
                {escopo}
              </DialogDescription>
            </div>
            {recortes.length > 0 && (
              <ul
                aria-label="Filtros principais"
                className="flex min-w-0 max-w-full flex-wrap gap-1.5 sm:max-w-[65%] sm:justify-end"
              >
                {recortes.map(({ rotulo, valor }) => (
                  <li
                    key={rotulo}
                    className="max-w-full wrap-break-word rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary"
                  >
                    {rotulo}: {valor}
                  </li>
                ))}
              </ul>
            )}
          </DialogHeader>
          <RelatorioPreviaExportacao
            key={sessao}
            tipo={visao}
            filtroBase={
              visao === "propostas" ? { ...filtro, etapa: visao } : filtro
            }
          />
          <div className="flex justify-end border-t pt-3">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
