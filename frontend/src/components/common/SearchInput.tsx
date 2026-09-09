import { colors } from '../../styles/tokens';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Default 240 -- so uma pagina com mais filtro ao lado (ex.
   * MonitoramentoEquipamentosPage.tsx, 6 SingleSelectFilter) precisa de um
   * valor menor pra tudo caber na mesma linha. */
  width?: number;
}

export function SearchInput({ value, onChange, placeholder, width = 240 }: Props) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 12,
        outline: 'none',
        width,
      }}
    />
  );
}
