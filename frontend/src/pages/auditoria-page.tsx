/** Auditoria (Módulo de Auditoria, 2026-09-28) -- só composição de rota
 * (atrás de AdminRoute, mesmo gate de usuarios-page.tsx), sem lógica de
 * negócio própria. Filtro por usuário pré-preenchido via querystring
 * (?usuario_id=) quando chega do link "Ver histórico" da tela de
 * usuários. */
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { ErrorAlert } from "@/components/common/error-alert";
import { Pagination } from "@/components/common/pagination";
import { AuditoriaDialogDetalhes } from "@/components/features/auditoria-dialog-detalhes";
import { AuditoriaTabela } from "@/components/features/auditoria-tabela";
import { useAuditoria } from "@/hooks/useAuditoria";
import { mensagemSeguraDoErro } from "@/lib/api-error";
import type { AuditoriaItem } from "@/services/auditoria";

const PAGE_SIZE = 50;

const CATEGORIAS = [
  { valor: "", rotulo: "Todas as categorias" },
  { valor: "auth", rotulo: "Segurança / sessão" },
  { valor: "user", rotulo: "Usuários" },
  { valor: "instrumento_equipamento", rotulo: "Monitoramento — cadastro" },
  { valor: "evento_marco", rotulo: "Monitoramento — eventos" },
  { valor: "acao_monitoramento", rotulo: "Monitoramento — ações" },
];

export function AuditoriaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const usuarioIdInicial = searchParams.get("usuario_id");
  const [entityName, setEntityName] = useState("");
  const [page, setPage] = useState(1);
  const [detalheAberto, setDetalheAberto] = useState<AuditoriaItem | null>(
    null,
  );

  const { itens, total, carregando, erro } = useAuditoria({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    entity_name: entityName || undefined,
    user_id: usuarioIdInicial ? Number(usuarioIdInicial) : undefined,
  });

  return (
    <main className="mx-auto max-w-[1100px] py-2">
      <PageHeader
        eyebrow="Administração"
        title="Auditoria"
        description="Histórico de login, sessão e ações administrativas no SIGEO."
        actions={
          usuarioIdInicial ? (
            <Button
              variant="outline"
              onClick={() => navigate("/admin/usuarios")}
            >
              <ArrowLeft aria-hidden="true" /> Voltar para usuários
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2.5">
        <select
          value={entityName}
          onChange={(e) => {
            setEntityName(e.target.value);
            setPage(1);
          }}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-primary sm:w-auto"
        >
          {CATEGORIAS.map((categoria) => (
            <option key={categoria.valor} value={categoria.valor}>
              {categoria.rotulo}
            </option>
          ))}
        </select>
        {usuarioIdInicial && (
          <Input
            disabled
            value={`Filtrado por usuário #${usuarioIdInicial}`}
            className="w-full sm:max-w-[280px]"
          />
        )}
      </div>

      {erro ? (
        <ErrorAlert mensagem={mensagemSeguraDoErro(erro)} />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <AuditoriaTabela
            itens={itens}
            carregando={carregando}
            onVerDetalhes={setDetalheAberto}
          />
          <Pagination
            page={page}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      )}
      <AuditoriaDialogDetalhes
        item={detalheAberto}
        onOpenChange={(open) => !open && setDetalheAberto(null)}
      />
    </main>
  );
}
