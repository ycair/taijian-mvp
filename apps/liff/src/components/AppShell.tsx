import type { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      {children}
      <BottomNav />
    </div>
  );
}
