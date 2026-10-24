import type { ReactNode } from 'react';

export function MossCard({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="card">
      {title && <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>{title}</h2>}
      {children}
    </section>
  );
}
