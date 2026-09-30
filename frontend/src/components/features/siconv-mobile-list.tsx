import type { ReactNode } from "react";
import type { SiconvEntrada } from "@/types/monitoramento";
import {
  corrigirTextoSiconv,
  fmtData,
  fmtMoeda,
} from "@/lib/monitoramento-format";

export type SiconvAba =
  | "itens"
  | "empenhos"
  | "desembolsos"
  | "licitacoes"
  | "termos"
  | "fornecedores";

function Registro({
  titulo,
  campos,
}: {
  titulo: ReactNode;
  campos: { rotulo: string; valor: ReactNode }[];
}) {
  return (
    <article className="min-w-0 border-b border-border py-3 first:pt-0 last:border-0">
      <div className="break-words text-sm font-semibold leading-snug text-foreground">
        {titulo}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {campos.map((campo) => (
          <div key={campo.rotulo} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {campo.rotulo}
            </dt>
            <dd className="m-0 break-words text-xs tabular-nums text-foreground">
              {campo.valor || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function SiconvMobileList({
  aba,
  siconv,
}: {
  aba: SiconvAba;
  siconv: SiconvEntrada;
}) {
  if (aba === "itens")
    return (
      <div>
        {siconv.itens_plano_aplicacao.map((item) => (
          <Registro
            key={item.ID_ITEM_PAD}
            titulo={corrigirTextoSiconv(item.DESCRICAO_ITEM)}
            campos={[
              { rotulo: "Quantidade", valor: item.QTD_ITEM },
              {
                rotulo: "Valor unitário",
                valor: fmtMoeda(item.VALOR_UNITARIO_ITEM),
              },
              { rotulo: "Valor total", valor: fmtMoeda(item.VALOR_TOTAL_ITEM) },
            ]}
          />
        ))}
      </div>
    );

  if (aba === "empenhos")
    return (
      <div>
        {siconv.empenhos.map((item) => (
          <Registro
            key={item.ID_EMPENHO}
            titulo={item.NR_EMPENHO}
            campos={[
              {
                rotulo: "Situação",
                valor: corrigirTextoSiconv(item.DESC_SITUACAO_EMPENHO),
              },
              { rotulo: "Valor", valor: fmtMoeda(item.VALOR_EMPENHO) },
            ]}
          />
        ))}
      </div>
    );

  if (aba === "desembolsos")
    return (
      <div>
        {siconv.desembolsos.map((item) => (
          <Registro
            key={item.ID_DESEMBOLSO}
            titulo={fmtData(item.DATA_DESEMBOLSO)}
            campos={[
              {
                rotulo: "Valor desembolsado",
                valor: fmtMoeda(item.VL_DESEMBOLSADO),
              },
            ]}
          />
        ))}
      </div>
    );

  if (aba === "licitacoes")
    return (
      <div>
        {siconv.licitacoes.map((item) => (
          <Registro
            key={item.ID_LICITACAO}
            titulo={item.NR_PROCESSO_LICITACAO}
            campos={[
              {
                rotulo: "Modalidade",
                valor:
                  corrigirTextoSiconv(
                    item.TP_PROCESSO_COMPRA || item.MODALIDADE_LICITACAO,
                  ) || "—",
              },
              {
                rotulo: "Situação",
                valor: corrigirTextoSiconv(item.STATUS_LICITACAO),
              },
              { rotulo: "Valor", valor: fmtMoeda(item.VALOR_LICITACAO) },
            ]}
          />
        ))}
      </div>
    );

  if (aba === "termos")
    return (
      <div>
        {siconv.termos_aditivos.map((item, index) => (
          <Registro
            key={index}
            titulo={item.TIPO_TA}
            campos={[
              { rotulo: "Valor global", valor: fmtMoeda(item.VL_GLOBAL_TA) },
              {
                rotulo: "Justificativa",
                valor: corrigirTextoSiconv(
                  (item.JUSTIFICATIVA_TA || "").slice(0, 200),
                ),
              },
            ]}
          />
        ))}
      </div>
    );

  return (
    <div>
      {siconv.pagamentos.map((item, index) => (
        <Registro
          key={item.NR_MOV_FIN || index}
          titulo={corrigirTextoSiconv(item.NOME_FORNECEDOR)}
          campos={[
            { rotulo: "Data", valor: fmtData(item.DATA_PAG) },
            { rotulo: "Valor pago", valor: fmtMoeda(item.VL_PAGO) },
            { rotulo: "Documento", valor: corrigirTextoSiconv(item.DESC_DL) },
          ]}
        />
      ))}
    </div>
  );
}
