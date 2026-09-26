import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/common/error-alert";
import {
  estiloInput,
  rotuloCampo,
} from "@/components/features/monitoramento-ui";
import { REGIOES } from "@/data/constants";
import { UF_INFO } from "@/data/geo-reference";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  baixarArquivo,
  gerarRelatorio,
  type EscopoRelatorio,
  type FormatoRelatorio,
  type NivelRelatorio,
} from "@/services/relatorios";

const UFS_ORDENADAS = Object.entries(UF_INFO)
  .map(([uf, info]) => ({ uf, nome: info.nome }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

const ESCOPOS: { valor: EscopoRelatorio; rotulo: string }[] = [
  { valor: "brasil", rotulo: "Brasil" },
  { valor: "regiao", rotulo: "Região" },
  { valor: "uf", rotulo: "UF" },
  { valor: "municipio", rotulo: "Município" },
  { valor: "cnes", rotulo: "CNES" },
];

/** Gerador de relatórios Excel/Word (Plan Mode docs/arquitetura/
 * planmode-relatorios-2026-09-25.md, Bloco 3) -- substitui os cards de
 * exportação client-side (jspdf/exceljs) desativados desde 2026-08-24: a
 * geração agora roda no backend, cobrindo cobertura + convênios +
 * monitoramento interno numa chamada só (`GET /relatorios`). */
export function RelatorioGeradorForm() {
  const [escopo, setEscopo] = useState<EscopoRelatorio>("brasil");
  const [regiao, setRegiao] = useState("");
  const [uf, setUf] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [cnes, setCnes] = useState("");
  const [nivel, setNivel] = useState<NivelRelatorio>("simplificado");
  const [gerando, setGerando] = useState<FormatoRelatorio | null>(null);
  const [erro, setErro] = useState<unknown>(null);

  const podeGerar =
    escopo === "brasil" ||
    (escopo === "regiao" && regiao !== "") ||
    (escopo === "uf" && uf !== "") ||
    (escopo === "municipio" && uf !== "" && municipio.trim() !== "") ||
    (escopo === "cnes" && cnes.trim() !== "");

  async function gerar(formato: FormatoRelatorio) {
    setErro(null);
    setGerando(formato);
    try {
      const arquivo = await gerarRelatorio(formato, nivel, {
        escopo,
        regiao: escopo === "regiao" ? regiao : undefined,
        uf: escopo === "uf" || escopo === "municipio" ? uf : undefined,
        municipio: escopo === "municipio" ? municipio.trim() : undefined,
        cnes: escopo === "cnes" ? cnes.trim() : undefined,
      });
      baixarArquivo(arquivo);
    } catch (e) {
      setErro(e);
    } finally {
      setGerando(null);
    }
  }

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
              placeholder="Nome exato do município"
            />
          </label>
        )}

        {escopo === "cnes" && (
          <label className="flex flex-col gap-1">
            <span className={rotuloCampo}>CNES</span>
            <input
              className={cn(estiloInput, "bg-background")}
              value={cnes}
              onChange={(e) => setCnes(e.target.value)}
              placeholder="Código CNES"
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className={rotuloCampo}>Nível</span>
          <select
            className={cn(estiloInput, "bg-background")}
            value={nivel}
            onChange={(e) => setNivel(e.target.value as NivelRelatorio)}
          >
            <option value="simplificado">Simplificado</option>
            <option value="completo">Completo</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!podeGerar || gerando !== null}
          onClick={() => void gerar("xlsx")}
        >
          {gerando === "xlsx" ? "Gerando Excel…" : "Gerar Excel"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!podeGerar || gerando !== null}
          onClick={() => void gerar("docx")}
        >
          {gerando === "docx" ? "Gerando Word…" : "Gerar Word"}
        </Button>
      </div>

      {erro !== null && <ErrorAlert mensagem={mensagemSeguraDoErro(erro)} />}
    </div>
  );
}
