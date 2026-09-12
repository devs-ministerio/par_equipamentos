interface Campo {
  key: string;
  label: string;
}

/** Checkbox "ativa a tabela" + lista de campos selecionaveis dela --
 * extraido de ExportPdfModal (2026-09-11), usado so ali. */
export function ExportSecaoTabela({
  titulo,
  ativa,
  onToggleAtiva,
  campos,
  selecionados,
  onToggleCampo,
}: {
  titulo: string;
  ativa: boolean;
  onToggleAtiva: () => void;
  campos: Campo[];
  selecionados: Set<string>;
  onToggleCampo: (key: string) => void;
}) {
  return (
    <div className="mt-3.5 overflow-hidden rounded-[8px] border border-border">
      <label
        className={`flex items-center gap-2 cursor-pointer bg-[#fafbfd] px-3.5 py-2.5 text-[13px] font-bold text-[#16213e] ${ativa ? 'border-b border-border' : ''}`}
      >
        <input
          type="checkbox"
          checked={ativa}
          onChange={onToggleAtiva}
          className="h-[15px] w-[15px] accent-primary"
        />
        {titulo}
      </label>
      {ativa && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-3.5 py-2.5">
          {campos.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground"
            >
              <input
                type="checkbox"
                checked={selecionados.has(c.key)}
                onChange={() => onToggleCampo(c.key)}
                className="h-[13px] w-[13px] accent-primary"
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
