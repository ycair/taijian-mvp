import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: '今日' },
  { to: '/animals', label: '居民' },
  { to: '/records', label: '紀錄' },
  { to: '/settings', label: '設定' },
];

export function BottomNav() {
  return (
    <nav
      aria-label="主要導覽"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 12,
        transform: 'translateX(-50%)',
        width: 'min(480px, calc(100% - 24px))',
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 8px 24px rgba(120,96,70,.14)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '9px 6px',
        fontSize: 11,
      }}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => ({
            color: isActive ? 'var(--primary-strong)' : 'var(--muted)',
            textDecoration: 'none',
            fontWeight: isActive ? 800 : 600,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 44,
            minHeight: 44,
            padding: '0 8px',
          })}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
