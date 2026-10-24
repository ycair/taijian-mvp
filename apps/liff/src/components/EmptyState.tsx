export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 12px' }}>
      <div style={{ fontSize: 34 }} aria-hidden>
        🌿
      </div>
      <h3 style={{ margin: '8px 0 4px' }}>{title}</h3>
      <p className="muted" style={{ margin: 0 }}>{body}</p>
    </div>
  );
}
