/** Dado aninhado do SICONV (empenhos/desembolsos/licitacoes/itens/termos
 * aditivos) como sub-abas em vez de secoes sempre-visiveis empilhadas --
 * ideia puxada do prototipo Stitch (so a estrutura, o dado e 100% real, ver
 * ConvenioCard.tsx). Reduz rolagem: card com bastante linha em todas as
 * tabelas nao vira uma coluna gigante, só a aba ativa renderiza. */
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  corrigirTextoSiconv,
  fmtData,
  fmtMoeda,
} from "@/lib/monitoramento-format";
import type { SiconvEntrada } from "@/types/monitoramento";
import { SiconvMobileList, type SiconvAba } from "./siconv-mobile-list";
import {
  estiloTabela,
  estiloTabelaWrapper,
  estiloTd,
  estiloTh,
} from "./monitoramento-ui";

type AbaKey = SiconvAba;

const numTh = cn(estiloTh, "text-right");
const numTd = cn(estiloTd, "text-right");

export function SiconvSubAbas({ siconv }: { siconv: SiconvEntrada }) {
  const contagens: Record<AbaKey, number> = {
    itens: siconv.itens_plano_aplicacao.length,
    empenhos: siconv.empenhos.length,
    desembolsos: siconv.desembolsos.length,
    licitacoes: siconv.licitacoes.length,
    termos: siconv.termos_aditivos.length,
    fornecedores: siconv.pagamentos.length,
  };
  const rotulos: Record<AbaKey, string> = {
    itens: "Itens do plano",
    empenhos: "Empenhos",
    desembolsos: "Desembolsos",
    licitacoes: "Licitações",
    termos: "Termos aditivos",
    fornecedores: "Fornecedores",
  };
  const ordem: AbaKey[] = [
    "itens",
    "empenhos",
    "desembolsos",
    "licitacoes",
    "termos",
    "fornecedores",
  ];
  // Abre por padrao na primeira aba que tem linha -- convenio raramente
  // tem as 5 preenchidas, nao faz sentido abrir numa vazia.
  const [aba, setAba] = useState<AbaKey>(
    () => ordem.find((k) => contagens[k] > 0) ?? "itens",
  );

  return (
    <div>
      <div className="mb-2.5 grid grid-cols-2 gap-1 border-b border-border sm:flex sm:flex-wrap">
        {ordem.map((k) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            disabled={contagens[k] === 0}
            className={cn(
              "min-h-11 border-none border-b-2 bg-transparent px-2.5 py-1.5 text-left text-[11.5px] font-semibold sm:min-h-0",
              aba === k ? "border-b-primary" : "border-b-transparent",
              contagens[k] === 0
                ? "text-muted-foreground/70 cursor-default"
                : aba === k
                  ? "text-primary cursor-pointer"
                  : "text-muted-foreground cursor-pointer",
            )}
          >
            {rotulos[k]} ({contagens[k]})
          </button>
        ))}
      </div>

      <div className="min-w-0 sm:hidden">
        {contagens[aba] === 0 ? <VazioMsg /> : <SiconvMobileList aba={aba} siconv={siconv} />}
      </div>

      <div className="hidden sm:block">

      {aba === "itens" &&
        (contagens.itens === 0 ? (
          <VazioMsg />
        ) : (
          <div className={estiloTabelaWrapper}>
            <table className={estiloTabela}>
              <thead>
                <tr>
                  <th className={estiloTh}>Descrição</th>
                  <th className={numTh}>Qtd</th>
                  <th className={numTh}>Vl. unitário</th>
                  <th className={numTh}>Vl. total</th>
                </tr>
              </thead>
              <tbody>
                {siconv.itens_plano_aplicacao.map((it) => (
                  <tr key={it.ID_ITEM_PAD}>
                    <td className={estiloTd}>
                      {corrigirTextoSiconv(it.DESCRICAO_ITEM)}
                    </td>
                    <td className={numTd}>{it.QTD_ITEM}</td>
                    <td className={numTd}>
                      {fmtMoeda(it.VALOR_UNITARIO_ITEM)}
                    </td>
                    <td className={numTd}>{fmtMoeda(it.VALOR_TOTAL_ITEM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {aba === "empenhos" &&
        (contagens.empenhos === 0 ? (
          <VazioMsg />
        ) : (
          <div className={estiloTabelaWrapper}>
            <table className={estiloTabela}>
              <thead>
                <tr>
                  <th className={estiloTh}>Nº empenho</th>
                  <th className={estiloTh}>Situação</th>
                  <th className={numTh}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {siconv.empenhos.map((e) => (
                  <tr key={e.ID_EMPENHO}>
                    <td className={estiloTd}>{e.NR_EMPENHO}</td>
                    <td className={estiloTd}>
                      {corrigirTextoSiconv(e.DESC_SITUACAO_EMPENHO)}
                    </td>
                    <td className={numTd}>{fmtMoeda(e.VALOR_EMPENHO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {aba === "desembolsos" &&
        (contagens.desembolsos === 0 ? (
          <VazioMsg />
        ) : (
          <div className={estiloTabelaWrapper}>
            <table className={estiloTabela}>
              <thead>
                <tr>
                  <th className={estiloTh}>Data</th>
                  <th className={numTh}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {siconv.desembolsos.map((d) => (
                  <tr key={d.ID_DESEMBOLSO}>
                    <td className={estiloTd}>{fmtData(d.DATA_DESEMBOLSO)}</td>
                    <td className={numTd}>{fmtMoeda(d.VL_DESEMBOLSADO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {aba === "licitacoes" &&
        (contagens.licitacoes === 0 ? (
          <VazioMsg />
        ) : (
          <div className={estiloTabelaWrapper}>
            <table className={estiloTabela}>
              <thead>
                <tr>
                  <th className={estiloTh}>Processo</th>
                  <th className={estiloTh}>Modalidade</th>
                  <th className={estiloTh}>Status</th>
                  <th className={numTh}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {siconv.licitacoes.map((l) => (
                  <tr key={l.ID_LICITACAO}>
                    <td className={estiloTd}>{l.NR_PROCESSO_LICITACAO}</td>
                    <td className={estiloTd}>
                      {corrigirTextoSiconv(
                        l.TP_PROCESSO_COMPRA || l.MODALIDADE_LICITACAO,
                      ) || "—"}
                    </td>
                    <td className={estiloTd}>
                      {corrigirTextoSiconv(l.STATUS_LICITACAO)}
                    </td>
                    <td className={numTd}>{fmtMoeda(l.VALOR_LICITACAO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {aba === "termos" &&
        (contagens.termos === 0 ? (
          <VazioMsg />
        ) : (
          <div className={estiloTabelaWrapper}>
            <table className={estiloTabela}>
              <thead>
                <tr>
                  <th className={estiloTh}>Tipo</th>
                  <th className={numTh}>Valor global</th>
                  <th className={estiloTh}>Justificativa</th>
                </tr>
              </thead>
              <tbody>
                {siconv.termos_aditivos.map((t, i) => (
                  <tr key={i}>
                    <td className={estiloTd}>{t.TIPO_TA}</td>
                    <td className={numTd}>{fmtMoeda(t.VL_GLOBAL_TA)}</td>
                    <td className={cn(estiloTd, "max-w-[360px]")}>
                      {corrigirTextoSiconv(
                        (t.JUSTIFICATIVA_TA || "").slice(0, 200),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {aba === "fornecedores" &&
        (contagens.fornecedores === 0 ? (
          <VazioMsg />
        ) : (
          <div className={estiloTabelaWrapper}>
            <table className={estiloTabela}>
              <thead>
                <tr>
                  <th className={estiloTh}>Fornecedor</th>
                  <th className={estiloTh}>Data</th>
                  <th className={estiloTh}>Documento</th>
                  <th className={numTh}>Valor pago</th>
                </tr>
              </thead>
              <tbody>
                {siconv.pagamentos.map((p, i) => (
                  <tr key={p.NR_MOV_FIN || i}>
                    <td className={estiloTd}>
                      {corrigirTextoSiconv(p.NOME_FORNECEDOR)}
                    </td>
                    <td className={estiloTd}>{fmtData(p.DATA_PAG)}</td>
                    <td className={estiloTd}>
                      {corrigirTextoSiconv(p.DESC_DL)}
                    </td>
                    <td className={numTd}>{fmtMoeda(p.VL_PAGO)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function VazioMsg() {
  return (
    <p className="text-xs text-muted-foreground italic">
      Sem registro nessa categoria.
    </p>
  );
}
