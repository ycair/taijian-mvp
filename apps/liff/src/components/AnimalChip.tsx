export function AnimalChip({
  name,
  species,
  color,
}: {
  name: string;
  species: string;
  color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: color,
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px var(--line)',
        }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{species}</div>
      </div>
    </div>
  );
}
