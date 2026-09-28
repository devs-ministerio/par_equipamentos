import { Braces, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AuditoriaItem } from "@/services/auditoria";

const ROTULOS_ACAO: Record<string, string> = {
  login_sucesso: "Login",
  login_falha: "Falha de login",
  login_bloqueado: "Login em conta bloqueada",
  logout: "Logout",
  conta_ativada: "Conta ativada",
  refresh_reuso_detectado: "Sessão possivelmente roubada",
  criar_usuario: "Usuário criado",
  atualizar_usuario: "Usuário editado",
  reenviar_convite: "Convite reenviado",
  enviar_redefinicao_senha: "Redefinição de senha enviada",
  inativar_usuario: "Usuário inativado",
  reativar_usuario: "Usuário reativado",
};

function formatarValor(valor: unknown): string {
  if (typeof valor === "string") return valor;
  if (valor === null || valor === undefined) return "—";
  return JSON.stringify(valor, null, 2);
}

/** Detalhes em diálogo: mantém a tabela de auditoria densa e evita que um
 * payload grande desloque todas as linhas subsequentes. */
export function AuditoriaDialogDetalhes({
  item,
  onOpenChange,
}: {
  item: AuditoriaItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detalhes = item?.details ?? {};
  const detalhesFormatados = JSON.stringify(detalhes, null, 2);

  async function copiarDetalhes() {
    if (!detalhesFormatados) return;
    try {
      await navigator.clipboard.writeText(detalhesFormatados);
      toast.success("Detalhes copiados.");
    } catch {
      toast.error("Não foi possível copiar os detalhes.");
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[42rem] gap-0 overflow-hidden p-0">
        {item && (
          <>
            <DialogHeader className="border-b border-border bg-muted/35 px-6 py-5 text-left">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Braces aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle>Detalhes da ação</DialogTitle>
                  <DialogDescription className="mt-1">
                    Registro #{item.id} ·{" "}
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <Metadado
                rotulo="Ação"
                valor={
                  <Badge variant="secondary">
                    {ROTULOS_ACAO[item.action] ?? item.action}
                  </Badge>
                }
              />
              <Metadado
                rotulo="Responsável"
                valor={item.usuario_nome ?? "Sistema"}
              />
            </div>
            <div className="border-b border-border px-6 py-4">
              <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
                Entidade
              </p>
              <p className="mt-1 text-sm text-foreground">
                {item.entity_name}
                {item.entity_id !== null && ` #${item.entity_id}`}
              </p>
            </div>
            <div className="max-h-[min(46vh,28rem)] overflow-y-auto px-6 py-5">
              {Object.keys(detalhes).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Este evento não registrou campos adicionais.
                </p>
              ) : (
                <dl className="divide-y divide-border border-y border-border">
                  {Object.entries(detalhes).map(([chave, valor]) => (
                    <div
                      key={chave}
                      className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"
                    >
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {chave}
                      </dt>
                      <dd className="overflow-x-auto text-sm whitespace-pre-wrap break-words text-foreground">
                        {formatarValor(valor)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            <DialogFooter className="border-t border-border bg-muted/20 px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copiarDetalhes()}
                disabled={Object.keys(detalhes).length === 0}
              >
                <Copy aria-hidden="true" /> Copiar detalhes
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metadado({
  rotulo,
  valor,
}: {
  rotulo: string;
  valor: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-6 py-4">
      <p className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {rotulo}
      </p>
      <div className="mt-1.5 truncate text-sm text-foreground">{valor}</div>
    </div>
  );
}
