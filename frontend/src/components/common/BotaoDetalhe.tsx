/** Botão de "mais informações" (3 barrinhas) -- abre o modal de detalhe do
 * município (ver MunicipioDetalheModal). Usado tanto nas linhas de
 * município das sub-camadas (SubNivelRows) quanto na tabela de nível
 * Município em si (NivelCoberturaTable). */
export function BotaoDetalhe({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title="Mais informações"
      aria-label="Mais informações"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 3,
        width: 26,
        height: 22,
        border: '1px solid #dde2ea',
        borderRadius: 5,
        background: '#fff',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <span style={{ display: 'block', width: 14, height: 2, borderRadius: 1, background: '#667085', margin: '0 auto' }} />
      <span style={{ display: 'block', width: 14, height: 2, borderRadius: 1, background: '#667085', margin: '0 auto' }} />
      <span style={{ display: 'block', width: 14, height: 2, borderRadius: 1, background: '#667085', margin: '0 auto' }} />
    </button>
  );
}
