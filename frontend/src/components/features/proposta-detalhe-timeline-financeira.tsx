import type { ReactNode } from "react";
import { campo, campoData, campoNum, campoTexto, lista } from "@/lib/campo-cru";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { Campo, Secao, StatusPill } from "./monitoramento-ui";

interface Props {
  parceria: Record<string, unknown> | null;
  timeline: Record<string, unknown> | null;
}

/** Dados financeiros oficiais que só existem após a criação da parceria.
 * Fica separado do detalhe bruto da proposta para não misturar o projeto
 * planejado com sua execução financeira posterior. */
export function PropostaDetalheTimelineFinanceira({
  parceria,
  timeline,
}: Props) {
  if (!parceria) return null;
  const contas = timeline ? lista(timeline, "contas") : [];
  const empenhos = timeline ? lista(timeline, "empenhos") : [];
  const documentos = timeline ? lista(timeline, "documentos_habeis") : [];
  const ordens = timeline ? lista(timeline, "ordens_pagamento") : [];

  return (
    <Secao titulo="Timeline financeira (pós-parceria)">
      <div className="mb-2.5 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Campo label="Parceria">
          {campoTexto(parceria, "cd_parceria") || "—"}
          <span className="ml-1 text-[10px] text-muted-foreground">
            (id {campoNum(parceria, "id_parceria")})
          </span>
        </Campo>
        <Campo label="Situação da parceria">
          {campo(parceria, "in_situacao_parceria") || "—"}
        </Campo>
      </div>

      {contas.map((conta, index) => (
        <Campo
          key={`conta-${index}`}
          label="Conta bancária"
          legenda={campo(conta, "tx_descricao") ?? undefined}
        >
          {campo(conta, "nm_banco")} — ag. {campo(conta, "nm_agencia")} (
          {campo(conta, "sg_uf_agencia")}), conta {campo(conta, "tx_conta")}
        </Campo>
      ))}

      {(empenhos.length > 0 || documentos.length > 0 || ordens.length > 0) && (
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-[11.5px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-muted-foreground">
                <th className="py-0.5 pr-2">Etapa</th>
                <th className="py-0.5 pr-2">Nº</th>
                <th className="py-0.5 pr-2">Situação</th>
                <th className="py-0.5 pr-2">Data</th>
                <th className="py-0.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {empenhos.map((empenho, index) => (
                <LinhaFinanceira
                  key={`emp-${index}`}
                  etapa="Empenho (SIAFI)"
                  numero={
                    campoTexto(empenho, "numero_empenho") ||
                    campoNum(empenho, "nr_empenho")
                  }
                  situacao={campo(empenho, "in_situacao_siafi")}
                  data={campoData(empenho, "data_emissao")}
                  valor={fmtMoeda(campoNum(empenho, "valor_empenho"))}
                />
              ))}
              {documentos.map((documento, index) => (
                <LinhaFinanceira
                  key={`doc-${index}`}
                  etapa="Documento hábil"
                  numero={campo(documento, "nr_documento_habil")}
                  situacao={campo(documento, "in_situacao_dh")}
                  data={campoData(documento, "dt_emissao")}
                  valor={fmtMoeda(campoNum(documento, "vl_documento_habil"))}
                />
              ))}
              {ordens.map((ordem, index) => (
                <LinhaFinanceira
                  key={`op-${index}`}
                  etapa="Ordem de pagamento"
                  numero={campo(ordem, "nr_ordem_pagamento")}
                  situacao={
                    <StatusPill texto={campo(ordem, "in_situacao_op")} />
                  }
                  data={campoData(ordem, "dt_emissao_op")}
                  valor={fmtMoeda(campoNum(ordem, "vl_ordem_pagamento"))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
}

interface LinhaFinanceiraProps {
  etapa: string;
  numero: ReactNode;
  situacao: ReactNode;
  data: ReactNode;
  valor: ReactNode;
}

function LinhaFinanceira({
  etapa,
  numero,
  situacao,
  data,
  valor,
}: LinhaFinanceiraProps) {
  return (
    <tr className="border-t border-border">
      <td className="py-1 pr-2 text-muted-foreground">{etapa}</td>
      <td className="py-1 pr-2 font-mono">{numero}</td>
      <td className="py-1 pr-2">{situacao}</td>
      <td className="py-1 pr-2">{data}</td>
      <td className="py-1 text-right tabular-nums">{valor}</td>
    </tr>
  );
}
