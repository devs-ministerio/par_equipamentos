import { useState } from "react";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { cn } from "@/lib/utils";
import { estagioDeFato, situacaoDeFato } from "@/lib/proposta-status";
import { Campo, estiloCard, StatusPill } from "./monitoramento-ui";
import { DetalheBrutoProposta } from "./proposta-detalhe-bruto";
import { LinhaDoTempoProposta } from "./proposta-linha-do-tempo";
import type { usePropostasCandidatas } from "@/hooks/use-propostas-candidatas";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";
import { formatarCnpj } from "@/utils/texto";
import { AdicionarMonitoramentoButton } from "./adicionar-monitoramento-button";

/** O CNES descoberto é somente leitura na proposta; correções são feitas no
 * instrumento monitorado após a inclusão explícita. */
function CnesDestaque({
  cnes,
  nomeEstabelecimento,
}: {
  cnes: string | null;
  nomeEstabelecimento: string | null;
}) {
  if (!cnes) return null;

  return (
    <div className="relative mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-foreground">
      {nomeEstabelecimento && <span>{nomeEstabelecimento}</span>}
      {cnes && (
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10.5px] font-bold text-primary">
          CNES {cnes}
        </span>
      )}
    </div>
  );
}

export function CardProposta({
  p,
  instrumentoMonitorado,
}: {
  p: ReturnType<typeof usePropostasCandidatas>["propostas"][number];
  instrumentoMonitorado?: InstrumentoEquipamento;
}) {
  const [detalheAberto, setDetalheAberto] = useState(false);
  const principal =
    p.equipamentos.find((equipamento) => equipamento.relacao !== "mencao") ??
    p.equipamentos[0];
  const ano = p.data_proposta?.slice(0, 4);

  return (
    <div className={cn(estiloCard, "mb-3")}>
      {/* ---------- Camada 1: sempre visível ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-[5px] bg-secondary px-[9px] py-0.5 font-mono text-[11.5px] font-bold text-primary">
              Proposta #{p.id_proposta}
            </span>
            {ano && (
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {ano}
              </span>
            )}
            {/* A evidência vem exclusivamente do catálogo central do backend. */}
            {principal ? (
              <span className="rounded-full border border-border bg-background px-[11px] py-1 text-[13px] font-extrabold text-foreground">
                {principal.nome}
              </span>
            ) : null}
          </div>
          <div className="text-[15px] font-bold text-foreground">
            {p.nm_proponente}
          </div>
          <CnesDestaque
            cnes={p.cnes}
            nomeEstabelecimento={p.cnes_nome_estabelecimento}
          />
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatarCnpj(p.cnpj_ente_recebedor) || "—"} · {p.municipio || "—"}/
            {p.uf || "—"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusPill texto={situacaoDeFato(p)} />
          <div className="text-right">
            <div className="text-[10px] uppercase text-muted-foreground">
              Valor planejado
            </div>
            <div className="text-base font-extrabold text-foreground">
              {fmtMoeda(p.vl_global_proposta)}
            </div>
          </div>
        </div>
      </div>

      <p className="mb-0 mt-3 rounded-md border border-border bg-background px-2.5 py-2 text-[12.5px] leading-normal">
        <strong className="mr-1 text-[10.5px] uppercase text-muted-foreground">
          Componente:
        </strong>
        {p.componente_batido}
      </p>

      {/* ---------- Camada 2: dado técnico aninhado, atrás de 1 clique ---------- */}
      <details
        className="mt-3 border-t border-border pt-2.5"
        open={detalheAberto}
        onToggle={(e) =>
          setDetalheAberto((e.target as HTMLDetailsElement).open)
        }
      >
        <summary className="cursor-pointer text-xs font-bold text-primary">
          {detalheAberto ? "Menos detalhes" : "Mais detalhes"}
        </summary>
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
          <Campo label="Programa">{p.nm_programa}</Campo>
          <Campo label="Data da proposta">
            {p.data_proposta
              ? p.data_proposta.split("-").reverse().join("/")
              : "—"}
          </Campo>
          <Campo label="Parceria formalizada">
            {p.tem_parceria ? p.cd_parceria : "Não"}
          </Campo>
        </div>
        {p.ds_objeto && (
          <p className="mb-0 mt-2.5 text-xs text-muted-foreground">
            {p.ds_objeto}
          </p>
        )}

        <LinhaDoTempoProposta
          metasResumo={p.metas_resumo}
          dataProposta={p.data_proposta}
        />

        <DetalheBrutoProposta metasResumo={p.metas_resumo} />

        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">
            Monitoramento interno
          </p>
          {instrumentoMonitorado ? (
            <p className="m-0 text-[11px] text-muted-foreground">
              Este instrumento já está no monitoramento interno (
              {instrumentoMonitorado.nr_convenio}).
            </p>
          ) : estagioDeFato(p) === "confirmada" ? (
            <AdicionarMonitoramentoButton
              dados={{
                nr_convenio: p.cd_parceria ?? "",
                cnpj_convenente: p.cnpj_ente_recebedor,
                nome_convenente: p.nm_proponente,
                tipo_contratacao: "Parceria TransfereGov",
                municipio: p.municipio,
                uf: p.uf,
                cnes: p.cnes,
                programa: p.nm_programa,
                componente: p.componente_batido,
                proposta_candidata_id: p.id,
                referencia: `parceria ${p.cd_parceria ?? p.id_proposta}`,
                descricao: `${p.nm_proponente} — ${p.municipio || "—"}/${p.uf || "—"}`,
              }}
            />
          ) : (
            <p className="m-0 text-xs text-muted-foreground">
              Disponível após a confirmação da parceria no TransfereGov.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
