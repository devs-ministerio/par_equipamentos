/** Seletor de CNES -- achado 2026-09-16, pedido do usuário: "vamos deixar
 * o campo cnes editável no sistema... só poderá editar por outro cnes
 * válido na base de dados". Nunca campo de texto livre: busca contra
 * GET /monitoramento/cnes-referencia (nome ou código) e só permite
 * escolher um resultado real -- a validação de verdade ainda é no backend
 * (PATCH rejeita CNES que não exista), isso aqui só evita erro de
 * digitação chegar até lá. */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buscarCnesReferencia } from '@/services/cnes-referencia';
import { cn } from '@/lib/utils';

export function CnesPicker({
  valorAtual,
  onEscolher,
  onCancelar,
}: {
  valorAtual: string | null;
  onEscolher: (cnes: string | null) => void;
  onCancelar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['cnes-referencia', busca],
    queryFn: () => buscarCnesReferencia(busca),
    enabled: busca.trim().length >= 2,
  });

  return (
    <div className="absolute z-50 mt-1 w-80 rounded-lg border border-border bg-card p-2 shadow-lg">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou código CNES..."
          className="box-border w-full rounded-md border border-border px-2 py-1.5 text-xs outline-none"
        />
        <button type="button" onClick={onCancelar} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
          Cancelar
        </button>
      </div>
      {valorAtual && (
        <button
          type="button"
          onClick={() => onEscolher(null)}
          className="mt-1.5 w-full rounded-md border border-dashed border-border px-2 py-1 text-left text-[11px] italic text-muted-foreground hover:bg-secondary"
        >
          Limpar CNES atual ({valorAtual})
        </button>
      )}
      <div className="mt-1.5 max-h-56 overflow-y-auto">
        {isFetching && <div className="px-1 py-2 text-xs text-muted-foreground">Buscando...</div>}
        {!isFetching && busca.trim().length >= 2 && resultados.length === 0 && (
          <div className="px-1 py-2 text-xs italic text-muted-foreground">Nenhum estabelecimento encontrado.</div>
        )}
        {resultados.map((r) => (
          <div
            key={r.cnes}
            onClick={() => onEscolher(r.cnes)}
            className={cn(
              'cursor-pointer rounded-md px-2 py-1.5 text-[12px] hover:bg-secondary',
              r.cnes === valorAtual && 'bg-secondary font-semibold',
            )}
          >
            <div className="font-mono text-[10.5px] text-muted-foreground">{r.cnes}</div>
            <div className="text-foreground">{r.nome_estabelecimento}</div>
            <div className="text-[10.5px] text-muted-foreground">{r.municipio}/{r.uf}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
