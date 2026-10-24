import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdProvider } from '../lib/household';
import { HouseholdCreatePage } from '../pages/HouseholdCreatePage';
import { TodayPage } from '../pages/TodayPage';
import { AnimalsPage } from '../pages/AnimalsPage';
import { callCommand } from '../lib/api';

const h = vi.hoisted(() => ({
  auth: { user: { uid: 'u1', displayName: '小苔' }, loading: false, error: null },
  docs: {} as Record<string, Record<string, unknown> | undefined>,
  listeners: new Map<string, Set<(snap: unknown) => void>>(),
}));

function docSnapshot(path: string) {
  const data = h.docs[path];
  return {
    id: path.split('/').pop(),
    exists: () => data !== undefined,
    data: () => data,
  };
}

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ kind: 'doc', path: path.join('/') }),
  collection: (_db: unknown, name: string) => ({ kind: 'collection', path: name }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ field }),
  query: (...parts: Array<{ path: string }>) => ({
    kind: 'query',
    path: parts[0]?.path ?? '',
  }),
  onSnapshot: (
    target: { kind: string; path: string },
    next: (snap: unknown) => void,
  ) => {
    if (target.kind !== 'doc') {
      next({ docs: [] });
      return () => undefined;
    }
    const set = h.listeners.get(target.path) ?? new Set();
    set.add(next);
    h.listeners.set(target.path, set);
    next(docSnapshot(target.path));
    return () => set.delete(next);
  },
  getDoc: async (ref: { path: string }) => docSnapshot(ref.path),
}));

const mockedCall = vi.mocked(callCommand);

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/household/new']}>
      <HouseholdProvider>
        <Routes>
          <Route path="/household/new" element={<HouseholdCreatePage />} />
          <Route
            path="/"
            element={
              <>
                <TodayPage />
                <Link to="/animals">去居民</Link>
              </>
            }
          />
          <Route path="/animals" element={<AnimalsPage />} />
        </Routes>
      </HouseholdProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.docs = {};
  h.listeners.clear();
  h.docs['users/u1'] = { householdIds: [] };
  mockedCall.mockReset();
});

describe('onboarding', () => {
  it('moves an empty user from the create form to a non-empty Today and Animals view', async () => {
    mockedCall.mockImplementation(async () => {
      // Simulate the server commit that the household.create command performs.
      h.docs['users/u1'] = { householdIds: ['h-new'] };
      h.docs['households/h-new'] = { name: '苔間', timezone: 'Asia/Taipei' };
      return {
        ok: true,
        commandId: 'c1',
        data: { householdId: 'h-new' },
        serverTime: new Date().toISOString(),
      };
    });

    renderApp();
    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('家庭名稱'), { target: { value: '苔間' } });
    fireEvent.click(screen.getByRole('button', { name: '建立家庭' }));

    await waitFor(() => expect(screen.getByText('0 件照護任務')).toBeInTheDocument());
    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '去居民' }));
    await waitFor(() => expect(screen.getByText('還沒有居民')).toBeInTheDocument());
    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();
  });
});
