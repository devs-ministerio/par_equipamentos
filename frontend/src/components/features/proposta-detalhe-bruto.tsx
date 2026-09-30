import {
  campo,
  campoData,
  campoNum,
  campoObjeto,
  lista,
} from "@/lib/campo-cru";
import { enderecoProposta } from "@/lib/proposta-metas-resumo";
import { fmtMoeda } from "@/lib/monitoramento-format";
import { Campo, Secao } from "./monitoramento-ui";
import {
  SecaoAnaliseTecnica,
  SecaoOrigemRecurso,
} from "./proposta-detalhe-parecer";
import { PropostaDetalheTimelineFinanceira } from "./proposta-detalhe-timeline-financeira";

const MESES = [
  "",
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** Camada 2 da proposta: campos crus adicionais capturados no momento da
 * descoberta -- natureza jurídica, endereço, problema/resultado
 * esperado/público alvo (texto livre que a equipe usa pra avaliar mérito),
 * metas (entregas previstas) e cronograma de desembolso (parcelas
 * financeiras previstas). Nem toda proposta tem tudo preenchido na API --
 * cada bloco só aparece quando tem dado real. */
export function DetalheBrutoProposta({
  metasResumo,
}: {
  metasResumo: unknown;
}) {
  if (!metasResumo || typeof metasResumo !== "object") return null;
  const proposta = campoObjeto(metasResumo, "proposta");
  const metas = lista(metasResumo, "metas");
  const cronograma = lista<{
    nr_ref_mes_data_especif?: unknown;
    nr_ref_ano_data_especif?: unknown;
    vl_cronograma_desembolso?: unknown;
  }>(metasResumo, "cronograma_desembolso");

  const endereco = enderecoProposta(proposta);
  const naturezaJuridica = campo(proposta, "nm_natureza_juridica");
  const unidadeGestora = campo(proposta, "nm_unidade_gestora");
  const problema = campo(proposta, "ds_problema_proposta");
  const resultadoEsperado = campo(proposta, "ds_resultado_esperado_proposta");
  const publicoAlvo = campo(proposta, "ds_publico_alvo_proposta");

  const temAlgo =
    endereco ||
    naturezaJuridica ||
    unidadeGestora ||
    problema ||
    resultadoEsperado ||
    publicoAlvo ||
    metas.length ||
    cronograma.length;
  if (!temAlgo) return null;

  return (
    <>
      {(endereco || naturezaJuridica || unidadeGestora) && (
        <div className="mt-3 grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
          {naturezaJuridica && (
            <Campo label="Natureza jurídica">{naturezaJuridica}</Campo>
          )}
          {unidadeGestora && (
            <Campo label="Unidade gestora">{unidadeGestora}</Campo>
          )}
          {endereco && <Campo label="Endereço">{endereco}</Campo>}
        </div>
      )}

      {/* Texto rolável -- texto livre da API pode passar de 1 parágrafo,
          estourava o card em vez de ficar contido num box com scroll. */}
      {(problema || resultadoEsperado || publicoAlvo) && (
        <div className="mt-3 grid gap-2">
          {problema && (
            <Campo label="Problema a resolver">
              <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-[11.5px] leading-relaxed">
                {problema}
              </div>
            </Campo>
          )}
          {resultadoEsperado && (
            <Campo label="Resultado esperado">
              <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-[11.5px] leading-relaxed">
                {resultadoEsperado}
              </div>
            </Campo>
          )}
          {publicoAlvo && (
            <Campo label="Público alvo">
              <div className="max-h-24 overflow-y-auto rounded-md border border-border bg-background p-2 text-[11.5px] leading-relaxed">
                {publicoAlvo}
              </div>
            </Campo>
          )}
        </div>
      )}

      {metas.length > 0 && (
        <Secao titulo="Metas / entregas previstas" contagem={metas.length}>
          <ul className="m-0 list-none space-y-3 p-0">
            {metas.map((m, i) => {
              const etapas = lista(m, "etapas_proposta");
              return (
                <li key={i} className="text-xs text-foreground">
                  {campo(m, "nm_meta") ||
                    `Meta #${campo(m, "cd_meta") ?? i + 1}`}
                  {etapas.map((e, j) => {
                    const itens = lista(e, "itens");
                    return (
                      <div key={j} className="ml-3 mt-1">
                        <div className="text-[11px] text-muted-foreground">
                          {campo(e, "nm_etapa")}
                          {(campo(e, "dt_inicio") || campo(e, "dt_fim")) &&
                            ` (${campoData(e, "dt_inicio")} → ${campoData(e, "dt_fim")})`}
                        </div>
                        {/* Item por item do que será comprado. */}
                        {itens.length > 0 && (
                          <div className="mt-1.5 min-w-0">
                            <div className="space-y-2 sm:hidden">
                              {itens.map((it, k) => (
                                <div key={k} className="min-w-0 rounded-md border border-border bg-background p-2.5">
                                  <div className="break-words text-xs font-semibold text-foreground">{campo(it, "nm_item") || "—"}</div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                    <Campo label="Quantidade">{campoNum(it, "qt_quantidade") ?? "—"}</Campo>
                                    <Campo label="Valor unitário">{fmtMoeda(campoNum(it, "vl_unitario_item"))}</Campo>
                                    <Campo label="Valor total">{fmtMoeda(campoNum(it, "vl_total_item"))}</Campo>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="hidden overflow-x-auto sm:block">
                            <table className="w-full min-w-[420px] border-collapse text-[11.5px]">
                              <thead>
                                <tr className="text-left text-[10px] uppercase text-muted-foreground">
                                  <th className="py-0.5 pr-2">Item</th>
                                  <th className="py-0.5 pr-2 text-right">
                                    Qtd
                                  </th>
                                  <th className="py-0.5 pr-2 text-right">
                                    Vl. unitário
                                  </th>
                                  <th className="py-0.5 text-right">
                                    Vl. total
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {itens.map((it, k) => (
                                  <tr
                                    key={k}
                                    className="border-t border-border"
                                  >
                                    <td
                                      className="py-1 pr-2 text-foreground"
                                      title={campo(it, "ds_item") ?? undefined}
                                    >
                                      {campo(it, "nm_item") || "—"}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">
                                      {campoNum(it, "qt_quantidade") ?? "—"}
                                    </td>
                                    <td className="py-1 pr-2 text-right tabular-nums">
                                      {fmtMoeda(
                                        campoNum(it, "vl_unitario_item"),
                                      )}
                                    </td>
                                    <td className="py-1 text-right font-semibold tabular-nums">
                                      {fmtMoeda(campoNum(it, "vl_total_item"))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </li>
              );
            })}
          </ul>
        </Secao>
      )}

      {cronograma.length > 0 && (
        <Secao
          titulo="Cronograma de desembolso previsto"
          contagem={cronograma.length}
        >
          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
            {cronograma.map((c, i) => {
              const mes = Number(c.nr_ref_mes_data_especif) || 0;
              const ano = c.nr_ref_ano_data_especif;
              const valor =
                typeof c.vl_cronograma_desembolso === "number"
                  ? c.vl_cronograma_desembolso
                  : null;
              return (
                <Campo
                  key={i}
                  label={`${MESES[mes] || "—"}/${ano ?? "—"}`}
                  legenda={campo(c, "origem_recurso") ?? undefined}
                >
                  {fmtMoeda(valor)}
                </Campo>
              );
            })}
          </div>
        </Secao>
      )}

      <SecaoAnaliseTecnica analises={lista(metasResumo, "analise")} />
      <SecaoOrigemRecurso
        distribuicoes={lista(metasResumo, "distribuicao_recurso")}
      />
      <PropostaDetalheTimelineFinanceira
        parceria={campoObjeto(metasResumo, "parceria")}
        timeline={campoObjeto(metasResumo, "timeline_financeira")}
      />
    </>
  );
}
