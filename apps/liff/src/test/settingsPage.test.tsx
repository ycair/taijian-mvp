import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../pages/SettingsPage';

const h = vi.hoisted(() => ({
  auth: { user: { uid: 'u1', displayName: '苔' } as { uid: string; displayName?: string } | null },
  household: {
    household: null as null | { id: string; name: string; timezone: string },
    householdIds: [] as string[],
    loading: false,
    error: null as string | null,
    select: () => undefined,
  },
  listeners: new Map<string, (snap: unknown) => void>(),
  doc: vi.fn<(db: unknown, ...path: string[]) => { path: string }>(),
  onSnapshot: vi.fn<(target: unknown, next: (snap: unknown) => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/household', () => ({ useHousehold: () => h.household }));
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({ doc: h.doc, onSnapshot: h.onSnapshot }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../lib/liff', () => ({ shareInvite: vi.fn() }));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function emitMember(data: Record<string, unknown>) {
  const next = h.listeners.get('households/h1/members/u1');
  if (!next) throw new Error('no member listener');
  act(() => {
    next({ exists: () => true, data: () => data });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listeners.clear();
  h.household.household = { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' };
  h.household.loading = false;
  h.household.error = null;
  h.doc.mockImplementation((_db, ...path) => ({ path: path.join('/') }));
  h.onSnapshot.mockImplementation((target, next) => {
    h.listeners.set((target as { path: string }).path, next);
    return h.unsubscribe;
  });
});

describe('SettingsPage invite visibility', () => {
  it('shows the invite action to an owner', () => {
    renderPage();

    emitMember({ role: 'owner', householdId: 'h1' });

    expect(screen.getByRole('button', { name: '產生邀請連結' })).toBeInTheDocument();
    expect(screen.queryByText('只有屋主可以產生邀請連結。')).not.toBeInTheDocument();
  });

  it('hides the invite action from a caretaker', () => {
    renderPage();

    emitMember({ role: 'caretaker', householdId: 'h1' });

    expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument();
    expect(screen.getByText('只有屋主可以產生邀請連結。')).toBeInTheDocument();
  });

  it('fails closed while the role is unknown', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('讀取家庭角色…');
  });
});
