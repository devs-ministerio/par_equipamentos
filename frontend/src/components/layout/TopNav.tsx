import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { colors } from '../../styles/tokens';

const ITEMS = [
  { path: '/dashboard', label: 'Planilhas' },
  { path: '/mapa', label: 'Mapa' },
  { path: '/metodologia', label: 'Metodologia' },
];

export function TopNav() {
  const [open, setOpen] = useState(false);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isActiveSection = ITEMS.some((i) => location.pathname.startsWith(i.path));

  const triggerHighlighted = isActiveSection || triggerHovered;

  return (
    <div
      style={{
        background: colors.topbarBg,
        borderBottom: `1px solid ${colors.topbarBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: 48,
      }}
    >
      <div style={{ display: 'flex', gap: 4, height: '100%', alignItems: 'center' }}>
        <div
          ref={wrapRef}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}
        >
          <button
            onClick={() => setOpen((v) => !v)}
            onMouseEnter={() => setTriggerHovered(true)}
            onMouseLeave={() => setTriggerHovered(false)}
            style={{
              height: '100%',
              border: 'none',
              background: triggerHighlighted ? colors.primaryLight : 'transparent',
              color: triggerHighlighted ? colors.primary : '#475066',
              fontWeight: isActiveSection ? 700 : 500,
              fontSize: 13,
              padding: '0 16px',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            Tomógrafos ▾
          </button>
          {open && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                background: '#fff',
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
                minWidth: 160,
                zIndex: 20,
                padding: '4px 0',
              }}
            >
              {ITEMS.map((item) => {
                const active = location.pathname.startsWith(item.path);
                const highlighted = active || hoveredItem === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setOpen(false);
                    }}
                    onMouseEnter={() => setHoveredItem(item.path)}
                    onMouseLeave={() => setHoveredItem((v) => (v === item.path ? null : v))}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: highlighted ? colors.primaryLight : 'transparent',
                      border: 'none',
                      color: highlighted ? colors.primary : '#475066',
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      padding: '9px 16px',
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
