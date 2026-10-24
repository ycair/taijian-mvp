import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Gate } from '../App';

const h = vi.hoisted(() => ({
  auth: { user: null as { uid: string } | null, loading: false, error: null as string | null },
}));

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../lib/household', () => ({
  HouseholdProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useHousehold: () => ({
    household: null,
    householdIds: [],
    loading: false,
    error: null,
    select: () => undefined,
    refresh: async () => undefined,
  }),
}));

function renderGate() {
  return render(
    <MemoryRouter>
      <Gate />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.auth.user = null;
  h.auth.loading = false;
  h.auth.error = null;
});

describe('Gate', () => {
  it('asks for a fresh LINE login when Firebase has no user', () => {
    renderGate();

    expect(screen.getByRole('alert')).toHaveTextContent('請重新登入 LINE');
    expect(screen.getByRole('button', { name: '重新登入' })).toBeInTheDocument();
    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();
  });

  it('renders the app once a user exists', () => {
    h.auth.user = { uid: 'u1' };

    renderGate();

    expect(screen.queryByText('請重新登入 LINE')).not.toBeInTheDocument();
    expect(screen.getByText('還沒有家庭')).toBeInTheDocument();
  });
});
