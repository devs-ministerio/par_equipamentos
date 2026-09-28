/** Tabela da trilha de auditoria (Módulo de Auditoria, 2026-09-28) --
 * `Quem` mostra "Sistema" quando `usuario_nome` é `null` (ação automática,
 * ex. pipeline). Ações de segurança (login_falha/login_bloqueado/
 * refresh_reuso_detectado) recebem destaque visual pra saltar aos olhos
 * sem alerta proativo (decisão do usuário: só visibilidade nesta rodada). */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACOES_SEGURANCA, type AuditoriaItem } from "@/services/auditoria";

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

function rotuloAcao(acao: string): string {
  return ROTULOS_ACAO[acao] ?? acao;
}

function badgeAcao(acao: string) {
  const variant = ACOES_SEGURANCA.has(acao) ? "destructive" : "secondary";
  return <Badge variant={variant}>{rotuloAcao(acao)}</Badge>;
}

function formatarQuando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function DetalhesCelula({
  item,
  onVerDetalhes,
}: {
  item: AuditoriaItem;
  onVerDetalhes: (item: AuditoriaItem) => void;
}) {
  if (!item.details || Object.keys(item.details).length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => onVerDetalhes(item)}>
      Ver detalhes
    </Button>
  );
}

export function AuditoriaTabela({
  itens,
  carregando,
  onVerDetalhes,
}: {
  itens: AuditoriaItem[];
  carregando: boolean;
  onVerDetalhes: (item: AuditoriaItem) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          <TableHead>Quem</TableHead>
          <TableHead>Ação</TableHead>
          <TableHead>Entidade</TableHead>
          <TableHead>Detalhes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {carregando && (
          <TableRow>
            <TableCell
              colSpan={5}
              className="p-4 text-center text-sm text-muted-foreground"
            >
              Carregando...
            </TableCell>
          </TableRow>
        )}
        {!carregando && itens.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={5}
              className="p-4 text-center text-sm text-muted-foreground"
            >
              Nenhum evento encontrado.
            </TableCell>
          </TableRow>
        )}
        {itens.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap text-sm">
              {formatarQuando(item.created_at)}
            </TableCell>
            <TableCell className="text-sm">
              {item.usuario_nome ?? "Sistema"}
              {item.usuario_email && (
                <div className="text-xs text-muted-foreground">
                  {item.usuario_email}
                </div>
              )}
            </TableCell>
            <TableCell>{badgeAcao(item.action)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.entity_name}
              {item.entity_id !== null && ` #${item.entity_id}`}
            </TableCell>
            <TableCell>
              <DetalhesCelula item={item} onVerDetalhes={onVerDetalhes} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
