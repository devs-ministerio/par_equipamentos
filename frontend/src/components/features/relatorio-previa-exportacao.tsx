import { useState } from "react";
import { ErrorAlert } from "@/components/common/error-alert";
import { Pagination } from "@/components/common/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import type { FaseAcompanhamento } from "@/lib/fases-acompanhamento";
import { useGerarRelatorio } from "@/hooks/use-gerar-relatorio";
import { useRelatorioPrevia } from "@/hooks/use-relatorio-previa";
import {
  LIMITE_PREVIA_RELATORIO,
  type PreviaRelatorio,
} from "@/services/relatorios-previa";
import type {
  FiltroRelatorio,
  NivelRelatorio,
  SituacaoEquipamento,
  TipoRelatorio,
} from "@/services/relatorios";
import { RelatorioBotoesGerar } from "./relatorio-botoes-gerar";
import { RelatorioMonitoradosFiltros } from "./relatorio-monitorados-filtros";

function tabela({ colunas, linhas }: PreviaRelatorio) {
  return (
    <div
      className="max-w-full overflow-x-auto"
      role="region"
      aria-label="Registros do relatório"
      tabIndex={0}
    >
      <table className="w-full min-w-max text-left text-sm">
        <thead className="bg-muted/60">
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna} scope="col" className="px-3 py-2">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhas.map((linha, indice) => (
            <tr key={indice}>
              {linha.map((celula, i) => (
                <td key={colunas[i]} className="max-w-64 px-3 py-2">
                  {celula ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RelatorioPreviaExportacao({
  tipo,
  filtroBase,
}: {
  tipo: Exclude<TipoRelatorio, "analise_merito">;
  filtroBase: FiltroRelatorio;
}) {
  const equipamentos = tipo === "equipamentos_monitorados";
  const instrumentos = tipo === "instrumentos_monitorados";
  const fasePrincipal =
    filtroBase.situacaoOrigem === "monitoramento" && filtroBase.situacao;
  const [nivelSelecionado, setNivel] = useState<NivelRelatorio>("simplificado");
  const nivel = instrumentos ? "completo" : nivelSelecionado;
  const [situacoes, setSituacoes] = useState<SituacaoEquipamento[] | null>(
    null,
  );
  const [fases, setFases] = useState<FaseAcompanhamento[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const filtro: FiltroRelatorio = {
    ...filtroBase,
    situacoesEquipamento: equipamentos ? (situacoes ?? undefined) : undefined,
    fasesInstrumento:
      instrumentos && !fasePrincipal ? (fases ?? undefined) : undefined,
  };
  const semSelecao =
    (equipamentos && situacoes?.length === 0) ||
    (instrumentos && !fasePrincipal && fases?.length === 0);
  const previa = useRelatorioPrevia(tipo, nivel, filtro, pagina, !semSelecao);
  const exportacao = useGerarRelatorio(tipo);
  const dados = previa.data;

  return (
    <>
      {(equipamentos || (instrumentos && !fasePrincipal)) && (
        <RelatorioMonitoradosFiltros
          equipamentos={equipamentos}
          selecionadas={situacoes}
          fases={fases}
          onSituacoesChange={(valor) => {
            setSituacoes(valor);
            setPagina(1);
          }}
          onFasesChange={(valor) => {
            setFases(valor);
            setPagina(1);
          }}
        />
      )}
      {semSelecao && (
        <p
          role="status"
          className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground"
        >
          {equipamentos
            ? "Selecione uma situação para ver a prévia."
            : "Selecione uma fase para ver a prévia."}
        </p>
      )}
      {!semSelecao && previa.isError && (
        <ErrorAlert
          mensagem={mensagemSeguraDoErro(previa.error)}
          onRetry={() => void previa.refetch()}
        />
      )}
      {!semSelecao && previa.isPending && (
        <Skeleton
          role="status"
          aria-label="Carregando prévia"
          className="h-44"
        />
      )}
      {!semSelecao && dados && (
        <section
          className="min-w-0 overflow-hidden rounded-xl border bg-card"
          aria-labelledby="relatorios-previa"
        >
          <h2
            id="relatorios-previa"
            className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-lg font-semibold"
          >
            Prévia{" "}
            <span className="text-sm font-medium text-muted-foreground">
              {dados.total.toLocaleString("pt-BR")} {dados.unidade}
            </span>
          </h2>
          {dados.total_linhas === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              Nenhum registro bate com esse filtro.
            </p>
          ) : (
            <>
              {tabela(dados)}
              <Pagination
                page={pagina}
                pageSize={LIMITE_PREVIA_RELATORIO}
                totalItems={dados.total_linhas}
                onPageChange={setPagina}
                mobileStacked
              />
            </>
          )}
        </section>
      )}
      <RelatorioBotoesGerar
        emDialogo
        desabilitarSimplificado={instrumentos}
        nivel={nivel}
        onNivelChange={(novo) => {
          setNivel(novo);
          setPagina(1);
        }}
        podeGerar={!semSelecao && previa.isSuccess}
        gerando={exportacao.gerando}
        erro={exportacao.erro}
        onGerar={(formato) => void exportacao.gerar(formato, nivel, filtro)}
      />
    </>
  );
}
