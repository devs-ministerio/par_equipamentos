import { useState, type ReactNode } from "react";
import {
  CalendarRange,
  ChevronDown,
  ClipboardList,
  MapPin,
  Search,
  Settings2,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { FiltrosMonitoramentoInterno } from "@/hooks/use-monitoramento-interno-filtros";
import { cn } from "@/lib/utils";
import { CLASSES_FILTRO_EQUIPAMENTO } from "@/lib/monitoramento-filtro-equipamentos";
import {
  CampoSelect,
  Opcoes,
  PeriodoFiltros,
} from "./painel-gestao-filtros-campos";

type Controle = {
  rotulo: string;
  icone: typeof Search;
  ativo: boolean;
  conteudo: (fechar: () => void) => ReactNode;
};

function ControleDesktop({ controle }: { controle: Controle }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 px-2 text-xs text-muted-foreground",
            controle.ativo &&
              "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          <controle.icone className="size-3.5" aria-hidden="true" />
          {controle.rotulo}
          {controle.ativo && (
            <span
              className="size-1.5 rounded-full bg-current"
              aria-hidden="true"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={controle.rotulo}
        className="z-[2000] max-h-[var(--radix-popover-content-available-height)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto p-3"
      >
        <p className="px-0.5 text-sm font-semibold">{controle.rotulo}</p>
        {controle.conteudo(() => setAberto(false))}
      </PopoverContent>
    </Popover>
  );
}

export function PainelGestaoFiltros({
  filtros,
}: {
  filtros: FiltrosMonitoramentoInterno;
}) {
  const controles: Controle[] = [
    {
      rotulo: "Busca",
      icone: Search,
      ativo: !!filtros.busca.trim(),
      conteudo: (fechar) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fechar();
          }}
        >
          <Input
            type="search"
            aria-label="Buscar instrumento"
            placeholder="Número ou nome do convenente"
            value={filtros.busca}
            onChange={(e) => filtros.setBusca(e.target.value)}
          />
        </form>
      ),
    },
    {
      rotulo: "Período",
      icone: CalendarRange,
      ativo: !!(
        filtros.anoInicio ||
        filtros.anoFim ||
        filtros.referencia !== "ano_instrumento"
      ),
      conteudo: () => <PeriodoFiltros filtros={filtros} />,
    },
    {
      rotulo: "Contratação",
      icone: ClipboardList,
      ativo: !!filtros.tipoContratacao,
      conteudo: (fechar) => (
        <Opcoes
          rotulo="Contratação"
          opcoes={filtros.tipoContratacaoOptions}
          valor={filtros.tipoContratacao}
          todos="Todas as contratações"
          selecionar={(valor) => {
            filtros.setTipoContratacao(valor);
            fechar();
          }}
        />
      ),
    },
    {
      rotulo: "UF / Município",
      icone: MapPin,
      ativo: !!(filtros.uf || filtros.municipio),
      conteudo: (fechar) => (
        <>
          <CampoSelect
            rotulo="UF"
            value={filtros.uf ?? ""}
            onChange={(e) => filtros.setUfComMunicipio(e.target.value || null)}
          >
            <option value="">Todas as UFs</option>
            {filtros.uf &&
              !filtros.ufOptions.some(({ value }) => value === filtros.uf) && (
                <option value={filtros.uf}>{filtros.uf}</option>
              )}
            {filtros.ufOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
          <Opcoes
            key={filtros.uf}
            rotulo="Município"
            opcoes={filtros.municipioOptionsPorUf}
            valor={filtros.municipio}
            todos="Todos os municípios"
            selecionar={(valor) => {
              filtros.setMunicipio(valor);
              fechar();
            }}
            pesquisar
          />
        </>
      ),
    },
    {
      rotulo: "Equipamento",
      icone: Stethoscope,
      ativo: !!(filtros.equipamento || filtros.classeEquipamento !== "todos"),
      conteudo: (fechar) => (
        <>
          <CampoSelect
            rotulo="Mostrar na lista"
            value={filtros.classeEquipamento}
            onChange={(e) => {
              const classe = CLASSES_FILTRO_EQUIPAMENTO.find(
                ({ value }) => value === e.target.value,
              );
              if (classe) filtros.setClasseEquipamento(classe.value);
            }}
          >
            {CLASSES_FILTRO_EQUIPAMENTO.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </CampoSelect>
          <Opcoes
            key={filtros.classeEquipamento}
            rotulo="Equipamento"
            opcoes={filtros.equipamentoOptions}
            valor={filtros.equipamento}
            todos="Todos os equipamentos"
            selecionar={(valor) => {
              filtros.setEquipamento(valor);
              fechar();
            }}
            pesquisar
          />
        </>
      ),
    },
    {
      rotulo: "Responsável",
      icone: UserRound,
      ativo: !!filtros.responsavel,
      conteudo: (fechar) => (
        <Opcoes
          rotulo="Responsável"
          opcoes={filtros.responsavelOptions}
          valor={filtros.responsavel}
          todos="Todos os responsáveis"
          selecionar={(valor) => {
            filtros.setResponsavel(valor);
            fechar();
          }}
          pesquisar
        />
      ),
    },
  ];
  const ativos = controles.filter(({ ativo }) => ativo).length;

  return (
    <>
      <div
        role="group"
        aria-label="Filtros do painel"
        className="hidden shrink-0 items-center gap-0.5 border-l border-border pl-2 @min-[1080px]:flex"
      >
        {controles.map((controle) => (
          <ControleDesktop key={controle.rotulo} controle={controle} />
        ))}
      </div>
      <div className="shrink-0 @min-[1080px]:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Settings2 aria-hidden="true" />
              Filtros
              {ativos > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                  {ativos}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            className="max-h-[85dvh] overflow-y-auto rounded-t-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <SheetTitle>Filtros do painel</SheetTitle>
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Fechar filtros"
                >
                  <X aria-hidden="true" />
                </Button>
              </SheetClose>
            </div>
            <div className="space-y-2 px-4 pb-4">
              {controles.map(({ rotulo, icone: Icone, ativo, conteudo }) => (
                <details
                  key={rotulo}
                  name="filtros-painel"
                  className="group rounded-lg border border-border"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-medium [&::-webkit-details-marker]:hidden">
                    <Icone className="size-4 text-primary" aria-hidden="true" />
                    {rotulo}
                    {ativo && (
                      <span
                        className="size-1.5 rounded-full bg-primary"
                        aria-label="Filtro ativo"
                      />
                    )}
                    <ChevronDown
                      className="ml-auto size-4 text-muted-foreground group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="space-y-3 border-t border-border p-3">
                    {conteudo(() => {})}
                  </div>
                </details>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
