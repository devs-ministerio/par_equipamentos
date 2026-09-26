import { useState } from "react";
import {
  estiloInput,
  rotuloCampo,
} from "@/components/features/monitoramento-ui";
import { RelatorioBotoesGerar } from "@/components/features/relatorio-botoes-gerar";
import { REGIOES } from "@/data/constants";
import { UF_INFO } from "@/data/geo-reference";
import { useGerarRelatorio } from "@/hooks/use-gerar-relatorio";
import { cn } from "@/lib/utils";
import {
  type EscopoRelatorio,
  type NivelRelatorio,
} from "@/services/relatorios";

const UFS_ORDENADAS = Object.entries(UF_INFO)
  .map(([uf, info]) => ({ uf, nome: info.nome }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

// Sem CNES: Análise de mérito (cobertura/déficit) não tem granularidade
// por estabelecimento (MacroCoverage/MunicipalityCoverage não têm essa
// coluna, mesma limitação do CLAUDE.md) -- o backend rejeita com 422,
// aqui só evita oferecer um caminho sem saída.
const ESCOPOS: { valor: EscopoRelatorio; rotulo: string }[] = [
  { valor: "brasil", rotulo: "Brasil" },
  { valor: "regiao", rotulo: "Região" },
  { valor: "uf", rotulo: "UF" },
  { valor: "municipio", rotulo: "Município" },
];

/** Gerador do relatório de Análise de Mérito (cobertura/déficit) -- Plan
 * Mode docs/arquitetura/planmode-relatorios-2026-09-25.md, Blocos 3 e 6.
 * O relatório de Instrumentos e Repasse (convênios/propostas/monitoramento)
 * ganhou filtros/prévia próprios em `monitoramento-relatorios-page.tsx`
 * (Bloco 7) -- filtros dos dois relatórios divergiram demais pra caber
 * neste mesmo formulário. */
export function RelatorioGeradorForm() {
  const [escopo, setEscopo] = useState<EscopoRelatorio>("brasil");
  const [regiao, setRegiao] = useState("");
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [nivel, setNivel] = useState<NivelRelatorio>("simplificado");
  const { gerando, erro, gerar } = useGerarRelatorio("analise_merito");

  const podeGerar =
    escopo === "brasil" ||
    (escopo === "regiao" && regiao !== "") ||
    (escopo === "uf" && uf !== "") ||
    (escopo === "municipio" && uf !== "" && municipio.trim() !== "");

  return (
    <div className="flex flex-col gap-4 border-t border-border py-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className={rotuloCampo}>Filtro</span>
          <select
            className={cn(estiloInput, "bg-background")}
            value={escopo}
            onChange={(e) => setEscopo(e.target.value as EscopoRelatorio)}
          >
            {ESCOPOS.map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>

        {escopo === "regiao" && (
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Região</span>
            <select
              className={cn(estiloInput, "bg-background")}
              value={regiao}
              onChange={(e) => setRegiao(e.target.value)}
            >
              <option value="">Selecione…</option>
              {REGIOES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}

        {(escopo === "uf" || escopo === "municipio") && (
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>UF</span>
            <select
              className={cn(estiloInput, "bg-background")}
              value={uf}
              onChange={(e) => setUf(e.target.value)}
            >
              <option value="">Selecione…</option>
              {UFS_ORDENADAS.map((u) => (
                <option key={u.uf} value={u.uf}>
                  {u.nome} ({u.uf})
                </option>
              ))}
            </select>
          </label>
        )}

        {escopo === "municipio" && (
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>Município</span>
            <input
              className={cn(estiloInput, "bg-background")}
              value={municipio}
              onChange={(e) => setMunicipio(e.target.value)}
              placeholder="Nome do município"
            />
          </label>
        )}
      </div>

      <RelatorioBotoesGerar
        nivel={nivel}
        onNivelChange={setNivel}
        podeGerar={podeGerar}
        gerando={gerando}
        erro={erro}
        onGerar={(formato) =>
          void gerar(formato, nivel, {
            escopo,
            regiao: escopo === "regiao" ? regiao : undefined,
            uf: escopo === "uf" || escopo === "municipio" ? uf : undefined,
            municipio: escopo === "municipio" ? municipio.trim() : undefined,
          })
        }
      />
    </div>
  );
}
