import { createElement, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import type { Notificacao } from "@/services/notificacoes";

const JANELA_MS = 7 * 86_400_000;

/** Aviso na tela quando um instrumento novo passa a ser responsabilidade da
 * pessoa logada. A notificação de inclusão diz "responsável: {nome}"; quem só
 * incluiu o instrumento (gestor) não recebe o pop-up, apenas o sino.
 * O pop-up fica até ser aberto ou fechado e volta a cada carregamento da página
 * enquanto a notificação não for aberta ("Abrir" a marca como lida); dentro da
 * mesma sessão da página, fechar no × não o reabre. */
export function useAvisoNovoInstrumento(
  notificacoes: Notificacao[],
  usuario: { id: number; name: string } | null,
  abrir: (notificacao: Notificacao) => void,
) {
  const mostradas = useRef(new Set<number>());
  useEffect(() => {
    if (!usuario) return;
    const agora = Date.now();
    const novos = notificacoes.filter(
      (n) =>
        n.tipo === "inclusao_monitoramento" &&
        !n.lida &&
        !mostradas.current.has(n.id) &&
        agora - new Date(n.created_at).getTime() < JANELA_MS &&
        (n.corpo ?? "").includes(`responsável: ${usuario.name} ·`),
    );
    if (novos.length === 0) return;
    for (const aviso of novos) mostradas.current.add(aviso.id);
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
        action: { label: "Abrir", onClick: () => abrir(aviso) },
      });
    }
  }, [notificacoes, usuario, abrir]);
}
