/** Pecas de UI compartilhadas entre ConvenioCard e MonitoramentoInterno --
 * paleta clara reaproveitando as variaveis Tailwind/shadcn (mesma linguagem
 * visual do Dashboard/Painel Geral), pagina continua fora do AppLayout
 * (decisao 2026-09-03, ver MonitoramentoEquipamentosPage.tsx). */
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  situacaoVariant,
  VARIANT_DOT_CLASSES,
  type SituacaoVariant,
} from "@/lib/monitoramento-status";
import { mensagemSeguraDoErro } from "@/lib/api-error";

/** Sombra suave em vez de so borda -- cartao "flutua" sobre o fundo
 * (bg-background) ao inves de se misturar nele, mesma linguagem visual
 * do protótipo de referencia (Stitch, 2026-09-08) adaptada pros tokens
 * do projeto. */
export const estiloCard =
  "bg-card border border-border rounded-[10px] px-5 py-4";

export const estiloInput =
  "min-h-11 border border-border rounded-lg px-3 py-2.5 text-[12.5px] font-inherit outline-none focus-visible:ring-2 focus-visible:ring-primary";

export const rotuloCampo =
  "text-[10.5px] text-muted-foreground uppercase tracking-[.03em]";

/** Tabela SICONV/TransfereGov pode ter varias colunas numericas -- em tela
 * estreita (celular) isso nao cabe sem espremer o dado a ponto de ficar
 * ilegivel. Envolve a tabela nesse wrapper (`overflow-x-auto`) em vez de
 * deixar o layout inteiro da pagina estourar horizontalmente -- so a
 * tabela rola, o resto do card fica no lugar. */
export const estiloTabelaWrapper =
  "overflow-x-auto [-webkit-overflow-scrolling:touch]";
export const estiloTabela =
  "w-full min-w-[420px] border-collapse text-[12.5px]";
export const estiloTh =
  "text-left text-muted-foreground text-[10.5px] font-semibold py-0.5 pr-2 pl-0 border-b border-border";
export const estiloTd = "py-1 pr-2 pl-0 border-b border-border";

const VARIANT_CLASSES: Record<SituacaoVariant, string> = {
  destructive: "bg-destructive-bg text-destructive border-destructive/20",
  success: "bg-success-bg text-success border-success/20",
  warning: "bg-warning-bg text-warning border-warning/20",
  muted: "bg-background text-muted-foreground border-muted-foreground/20",
};

export function StatusPill({ texto }: { texto: string | null | undefined }) {
  const variant = situacaoVariant(texto);
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-[5px] break-words rounded-full border py-[3px] pr-2.5 pl-2 text-[10.5px] font-bold",
        VARIANT_CLASSES[variant],
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          VARIANT_DOT_CLASSES[variant],
        )}
      />
      {texto || "—"}
    </span>
  );
}

export function Campo({
  label,
  legenda,
  children,
}: {
  label: string;
  legenda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={rotuloCampo}>{label}</div>
      <div className="min-w-0 break-words text-[13px] tabular-nums">
        {children}
      </div>
      {legenda && (
        <div className="text-[10px] text-muted-foreground mt-px">{legenda}</div>
      )}
    </div>
  );
}

/** Card com título/subtítulo/ação opcional -- usado pelas seções operacionais
 * de MonitoramentoInterno (Acesso, Cadastro, Fase geral, Cronograma, Ações,
 * Timeline). Extraído do próprio arquivo (era função interna) pra ser
 * reaproveitado pelos subcomponentes depois do split (Seção 6). */
export function SecaoOperacional({
  titulo,
  subtitulo,
  acao,
  destaque = false,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
  destaque?: boolean;
  // Opcional (achado 2026-09-15) -- MonitoramentoInternoAcesso ficou só
  // com header+ação depois que o login parou de abrir form inline aqui.
  children?: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "mb-4 border-t border-border pt-3.5",
        destaque && "bg-muted/35 px-4 pb-4",
      )}
    >
      <header
        className={cn(
          "grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:gap-3",
          children != null && "mb-3",
        )}
      >
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            {titulo}
          </h3>
          {subtitulo && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {subtitulo}
            </p>
          )}
        </div>
        {acao}
      </header>
      {children}
    </section>
  );
}

/** Mensagem de erro de campo de form -- `id` é o alvo do `aria-describedby`
 * do input correspondente (ver idsDescricaoCampo). */
export function ErroCampo({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p
      id={id}
      role="alert"
      className="text-[10.5px] text-destructive mt-1 mb-0"
    >
      {mensagem}
    </p>
  );
}

/** Texto de ajuda de campo de form (ex. formato esperado) -- mesmo esquema
 * de id do erro acima. */
export function AjudaCampo({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="text-[10.5px] text-muted-foreground mt-1 mb-0">
      {texto}
    </p>
  );
}

/** Confirmação de exclusão lógica com motivo obrigatório (Plan Mode
 * monitoramento-evolucao 2026-09-19) -- compartilhado entre eventos e
 * ações, já que os dois seguem a mesma disciplina append-only (nunca
 * DELETE físico, sempre motivo + autor registrados). */
export function ConfirmarExclusaoComMotivo({
  onExcluir,
  onCancelar,
}: {
  onExcluir: (motivo: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="mt-2 rounded-md border border-destructive/30 bg-destructive-bg/40 p-2.5">
      <label className="text-[11px] text-muted-foreground block mb-1">
        Motivo da exclusão
      </label>
      <textarea
        className={cn(estiloInput, "w-full min-h-[50px] bg-background")}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Explique por que este lançamento está sendo excluído..."
      />
      <ErroCampo id="motivo-exclusao-error" mensagem={erro ?? undefined} />
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          disabled={enviando}
          onClick={async () => {
            if (motivo.trim().length < 3) {
              setErro("Explique o motivo (mínimo 3 caracteres).");
              return;
            }
            setErro(null);
            setEnviando(true);
            try {
              await onExcluir(motivo.trim());
            } catch (e) {
              setErro(mensagemSeguraDoErro(e));
            } finally {
              setEnviando(false);
            }
          }}
          className={cn(
            estiloInput,
            "cursor-pointer bg-destructive text-destructive-foreground border-none text-[11.5px] font-semibold py-1 px-2.5",
          )}
        >
          {enviando ? "Excluindo..." : "Confirmar exclusão"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-[11.5px] text-muted-foreground hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function Secao({
  titulo,
  contagem,
  acao,
  children,
}: {
  titulo: string;
  contagem?: number;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-[18px]">
      <h4 className="text-[11px] font-extrabold uppercase tracking-[.05em] text-primary m-0 mb-2.5 pb-1.5 border-b border-border flex justify-between items-center gap-2.5">
        <span>
          {titulo}
          {contagem !== undefined ? ` — ${contagem}` : ""}
        </span>
        {/* Acao opcional na mesma linha do titulo -- achado 2026-09-10,
            pedido do usuario: titulo + link relacionado (ex. "Monitoramento
            interno" + "Ver detalhes →") ficavam empilhados e repetiam a
            mesma frase, essa prop deixa os 2 juntos sem duplicar texto. */}
        {acao && (
          <span className="normal-case tracking-normal font-semibold">
            {acao}
          </span>
        )}
      </h4>
      {children}
    </div>
  );
}
