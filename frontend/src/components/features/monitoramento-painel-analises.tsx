import { resumirCarteiraPainel } from "@/lib/monitoramento-painel-analise";
import { PALETA_CATEGORICA } from "@/lib/monitoramento-painel-palette";
import type { InstrumentoEquipamento } from "@/services/monitoramento-instrumentos";

export function MonitoramentoPainelAnalises({
  instrumentos,
  fases,
}: {
  instrumentos: InstrumentoEquipamento[];
  fases: string[];
}) {
  const dados = resumirCarteiraPainel(instrumentos, fases);
  const total = instrumentos.length;
  const maiorAno = Math.max(1, ...dados.anos.map((item) => item.quantidade));
  const maiorUf = Math.max(1, ...dados.ufs.map((item) => item.quantidade));
  const contratacoesVisiveis = dados.contratacoes.slice(0, 5);
  const outrasContratacoes = dados.contratacoes
    .slice(5)
    .reduce((soma, item) => soma + item.quantidade, 0);
  if (outrasContratacoes)
    contratacoesVisiveis.push({
      rotulo: "Outras",
      quantidade: outrasContratacoes,
    });

  return (
    <section
      className="mt-9 border-t border-border pt-6"
      aria-labelledby="panorama-carteira-titulo"
    >
      <h2
        id="panorama-carteira-titulo"
        className="font-display text-2xl font-semibold tracking-tight"
      >
        Panorama dos Instrumentos e Programas
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Distribuição dos mecanismos de financiamento e aquisição
      </p>

      <div className="mt-6 grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">Fase atual</h3>
            <span className="text-xs text-muted-foreground">
              {total} instrumentos
            </span>
          </div>
          {total ? (
            <>
              <div
                className="mt-5 flex h-7 w-full overflow-hidden bg-muted"
                role="img"
                aria-label={dados.fases
                  .filter((item) => item.quantidade)
                  .map((item) => `${item.rotulo}: ${item.quantidade}`)
                  .join("; ")}
              >
                {dados.fases.map(
                  (item, indice) =>
                    item.quantidade > 0 && (
                      <div
                        key={item.rotulo}
                        title={`${item.rotulo}: ${item.quantidade}`}
                        style={{
                          width: `${(item.quantidade / total) * 100}%`,
                          backgroundColor:
                            PALETA_CATEGORICA[
                              indice % PALETA_CATEGORICA.length
                            ],
                        }}
                        className="h-full border-r border-card/80 last:border-r-0"
                      />
                    ),
                )}
              </div>
              <div className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                {dados.fases.map((item, indice) => (
                  <div
                    key={item.rotulo}
                    className="flex items-center justify-between gap-3 border-b border-border/70 py-1 text-xs"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <i
                        aria-hidden="true"
                        className="size-2.5 shrink-0"
                        style={{
                          backgroundColor:
                            PALETA_CATEGORICA[
                              indice % PALETA_CATEGORICA.length
                            ],
                        }}
                      />
                      <span className="truncate" title={item.rotulo}>
                        {item.rotulo}
                      </span>
                    </span>
                    <strong className="font-data tabular-nums">
                      {item.quantidade}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhum instrumento neste recorte.
            </p>
          )}
        </div>

        <div className="min-w-0 border-t border-border pt-4">
          <h3 className="text-base font-semibold">Ano do instrumento</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ano de referência do registro.
          </p>
          {dados.anos.length ? (
            <div
              className="mt-5 flex h-52 items-end gap-2 border-b border-border pb-1 sm:gap-3"
              role="img"
              aria-label={dados.anos
                .map((item) => `${item.rotulo}: ${item.quantidade}`)
                .join("; ")}
            >
              {dados.anos.map((item) => (
                <div
                  key={item.rotulo}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="font-data text-xs font-semibold tabular-nums">
                    {item.quantidade}
                  </span>
                  <div
                    title={`${item.rotulo}: ${item.quantidade}`}
                    className="w-full max-w-12 bg-primary"
                    style={{
                      height: `${Math.max(4, (item.quantidade / maiorAno) * 154)}px`,
                    }}
                  />
                  <span className="font-data text-[11px] tabular-nums text-muted-foreground">
                    {item.rotulo}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhum ano informado.
            </p>
          )}
          {(dados.anosOmitidos > 0 || dados.semAno > 0) && (
            <p className="mt-3 text-xs text-muted-foreground">
              {dados.anosOmitidos > 0 &&
                `${dados.anosOmitidos} anos anteriores não exibidos. `}
              {dados.semAno > 0 && `${dados.semAno} registros sem ano.`}
            </p>
          )}
        </div>

        <div className="min-w-0 border-t border-border pt-4">
          <h3 className="text-base font-semibold">Tipo de contratação</h3>
          {total ? (
            <>
              <div
                className="mt-5 flex h-4 overflow-hidden bg-muted"
                role="img"
                aria-label={contratacoesVisiveis
                  .map((item) => `${item.rotulo}: ${item.quantidade}`)
                  .join("; ")}
              >
                {contratacoesVisiveis.map((item, indice) => (
                  <div
                    key={item.rotulo}
                    title={`${item.rotulo}: ${item.quantidade}`}
                    style={{
                      width: `${(item.quantidade / total) * 100}%`,
                      backgroundColor:
                        PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length],
                    }}
                    className="border-r border-card/80 last:border-r-0"
                  />
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {contratacoesVisiveis.map((item, indice) => (
                  <div
                    key={item.rotulo}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <i
                        aria-hidden="true"
                        className="size-2.5 shrink-0"
                        style={{
                          backgroundColor:
                            PALETA_CATEGORICA[
                              indice % PALETA_CATEGORICA.length
                            ],
                        }}
                      />
                      <span className="truncate" title={item.rotulo}>
                        {item.rotulo}
                      </span>
                    </span>
                    <strong className="font-data tabular-nums">
                      {item.quantidade}
                    </strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhum instrumento neste recorte.
            </p>
          )}
        </div>

        <div className="min-w-0 border-t border-border pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold">Concentração por UF</h3>
            <span className="text-xs text-muted-foreground">
              Top 5: {dados.concentracaoTop5Uf}%
            </span>
          </div>
          {dados.ufs.length ? (
            <ol className="mt-4 space-y-2">
              {dados.ufs.slice(0, 7).map((item) => (
                <li
                  key={item.rotulo}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-3 text-xs"
                >
                  <span>{item.rotulo}</span>
                  <span className="relative h-px bg-border">
                    <i
                      aria-hidden="true"
                      className="absolute -top-1 left-0 size-2 rounded-full bg-primary"
                      style={{
                        left: `calc(${(item.quantidade / maiorUf) * 100}% - 4px)`,
                      }}
                    />
                  </span>
                  <strong className="text-right font-data tabular-nums">
                    {item.quantidade}
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhum instrumento neste recorte.
            </p>
          )}
          {dados.semUf > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {dados.semUf} registros sem UF informada.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
