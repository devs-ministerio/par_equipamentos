import { createElement, useEffect } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import type { Notificacao } from "@/services/notificacoes";

const JANELA_MS = 7 * 86_400_000;

function chaveVistos(usuarioId: number) {
  return `sisgeo:avisos-instrumento-novo:${usuarioId}`;
}

function lerVistos(usuarioId: number): number[] {
  try {
    const bruto = window.localStorage.getItem(chaveVistos(usuarioId));
    const lista: unknown = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista)
      ? lista.filter((v): v is number => typeof v === "number")
      : [];
  } catch {
    return [];
  }
}

function gravarVistos(usuarioId: number, ids: number[]) {
  try {
    window.localStorage.setItem(
      chaveVistos(usuarioId),
      JSON.stringify(ids.slice(-200)),
    );
  } catch {
    /* Sem armazenamento: o aviso pode repetir, nunca deixa de aparecer. */
  }
}

/** Aviso na tela quando um instrumento novo passa a ser responsabilidade da
 * pessoa logada. A notificação de inclusão diz "responsável: {nome}"; quem só
 * incluiu o instrumento (gestor) não recebe o pop-up, apenas o sino. */
export function useAvisoNovoInstrumento(
  notificacoes: Notificacao[],
  usuario: { id: number; name: string } | null,
  abrir: (destino: string) => void,
) {
  useEffect(() => {
    if (!usuario) return;
    const vistos = lerVistos(usuario.id);
    const agora = Date.now();
    const novos = notificacoes.filter(
      (n) =>
        n.tipo === "inclusao_monitoramento" &&
        !n.lida &&
        !vistos.includes(n.id) &&
        agora - new Date(n.created_at).getTime() < JANELA_MS &&
        (n.corpo ?? "").includes(`responsável: ${usuario.name} ·`),
    );
    if (novos.length === 0) return;
    gravarVistos(usuario.id, [...vistos, ...novos.map((n) => n.id)]);
    for (const aviso of novos.slice(0, 3)) {
      toast.info(aviso.titulo, {
        duration: Infinity,
        closeButton: true,
        icon: createElement(ClipboardCheck, { className: "size-5" }),
        classNames: {
          toast:
            "!items-center !gap-3 !rounded-xl !border-border !border-l-4 !border-l-primary !bg-card !py-4 !pl-4 !pr-4 !shadow-lg",
          icon: "!size-9 !shrink-0 !items-center !justify-center !rounded-full !bg-primary/10 !text-primary",
          title: "!text-sm !font-semibold !leading-snug !text-foreground",
          actionButton:
            "!ml-auto !h-8 !rounded-md !bg-primary !px-3 !text-xs !font-semibold !text-primary-foreground hover:!bg-primary/90",
        },
        action: aviso.destino
          ? { label: "Abrir", onClick: () => abrir(aviso.destino as string) }
          : undefined,
      });
    }
  }, [notificacoes, usuario, abrir]);
}
