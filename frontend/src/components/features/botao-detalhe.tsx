import { Button } from "@/components/ui/button";

/** Botão de "mais informações" (3 barrinhas) -- abre o modal de detalhe do
 * município (ver MunicipioDetalheModal). Usado tanto nas linhas de
 * município das sub-camadas (SubNivelRows) quanto na tabela de nível
 * Município em si (NivelCoberturaTable). */
export function BotaoDetalhe({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon-xs"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Mais informações"
      aria-label="Mais informações"
      className="h-[22px] w-[26px] flex-col gap-[3px] p-0"
    >
      <span className="block h-0.5 w-3.5 rounded-[1px] bg-muted-foreground" />
      <span className="block h-0.5 w-3.5 rounded-[1px] bg-muted-foreground" />
      <span className="block h-0.5 w-3.5 rounded-[1px] bg-muted-foreground" />
    </Button>
  );
}
