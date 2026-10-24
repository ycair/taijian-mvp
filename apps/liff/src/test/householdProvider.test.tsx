import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdProvider, useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';

const h = vi.hoisted(() => ({
  auth: { user: { uid: 'u1' }, loading: false, error: null },
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

function emitDoc(path: string, data: Record<string, unknown> | undefined) {
  h.docs[path] = data;
  act(() => {
    for (const listener of h.listeners.get(path) ?? []) {
      listener(docSnapshot(path));
    }
  });
}

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ kind: 'doc', path: path.join('/') }),
  onSnapshot: (target: { path: string }, next: (snap: unknown) => void) => {
    const set = h.listeners.get(target.path) ?? new Set();
    set.add(next);
    h.listeners.set(target.path, set);
    next(docSnapshot(target.path));
    return () => set.delete(next);
  },
  getDoc: async (ref: { path: string }) => docSnapshot(ref.path),
}));

const mockedCall = vi.mocked(callCommand);

function Probe() {
  const { household, householdIds, loading, error, select } = useHousehold();
  return (
    <div>
      <div data-testid="selected">{household?.id ?? 'none'}</div>
      <div data-testid="ids">{householdIds.join(',')}</div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="error">{error ?? ''}</div>
      <button type="button" onClick={() => void select('h1')}>
        選 h1
      </button>
      <button type="button" onClick={() => void select('h2')}>
        選 h2
      </button>
      <button type="button" onClick={() => void select('h9')}>
        選 h9
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <HouseholdProvider>
      <Probe />
    </HouseholdProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.docs = {};
  h.listeners.clear();
  h.auth.user = { uid: 'u1' };
  mockedCall.mockReset();
  mockedCall.mockResolvedValue({
    ok: true,
    commandId: 'c1',
    data: { updated: true },
    serverTime: new Date().toISOString(),
  });
});

describe('HouseholdProvider default household', () => {
  it('opens the profile defaultHouseholdId instead of the first household', async () => {
    h.docs['users/u1'] = { householdIds: ['h1', 'h2'], defaultHouseholdId: 'h2' };
    h.docs['households/h1'] = { name: '第一個家', timezone: 'Asia/Taipei' };
    h.docs['households/h2'] = { name: '第二個家', timezone: 'Asia/Tokyo' };

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('h2'));
    expect(screen.getByTestId('loading')).toHaveTextContent('ready');
  });

  it('falls back to the first household when the default is not a membership', async () => {
    h.docs['users/u1'] = { householdIds: ['h1', 'h2'], defaultHouseholdId: 'h9' };
    h.docs['households/h1'] = { name: '第一個家', timezone: 'Asia/Taipei' };
    h.docs['households/h2'] = { name: '第二個家', timezone: 'Asia/Tokyo' };

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('h1'));
  });

  it('persists the selected household with user.updateProfile', async () => {
    h.docs['users/u1'] = { householdIds: ['h1', 'h2'], defaultHouseholdId: 'h2' };
    h.docs['households/h1'] = { name: '第一個家', timezone: 'Asia/Taipei' };
    h.docs['households/h2'] = { name: '第二個家', timezone: 'Asia/Tokyo' };

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('h2'));

    fireEvent.click(screen.getByRole('button', { name: '選 h1' }));

    await waitFor(() =>
      expect(mockedCall).toHaveBeenCalledWith('user.updateProfile', {
        defaultHouseholdId: 'h1',
      }),
    );
    expect(screen.getByTestId('selected')).toHaveTextContent('h1');

    // A late profile snapshot still carrying the old default must not pull the
    // view back: the current selection is valid and wins.
    emitDoc('users/u1', { householdIds: ['h1', 'h2'], defaultHouseholdId: 'h2' });
    expect(screen.getByTestId('selected')).toHaveTextContent('h1');
  });

  it('ignores an id the profile does not list and surfaces persistence errors', async () => {
    h.docs['users/u1'] = { householdIds: ['h1'], defaultHouseholdId: 'h1' };
    h.docs['households/h1'] = { name: '第一個家', timezone: 'Asia/Taipei' };

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('h1'));

    // Not a member: no local switch and no write attempt.
    fireEvent.click(screen.getByRole('button', { name: '選 h9' }));
    expect(screen.getByTestId('selected')).toHaveTextContent('h1');
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('reports a failed preference write while keeping the local switch', async () => {
    h.docs['users/u1'] = { householdIds: ['h1', 'h2'], defaultHouseholdId: 'h2' };
    h.docs['households/h1'] = { name: '第一個家', timezone: 'Asia/Taipei' };
    h.docs['households/h2'] = { name: '第二個家', timezone: 'Asia/Tokyo' };
    mockedCall.mockResolvedValue({
      ok: false,
      commandId: 'c1',
      code: 'FORBIDDEN',
      message: 'not a household member',
      serverTime: new Date().toISOString(),
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('h2'));

    fireEvent.click(screen.getByRole('button', { name: '選 h1' }));

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        '切換家庭失敗，請確認你仍是該家庭成員。',
      ),
    );
    expect(screen.getByTestId('selected')).toHaveTextContent('h1');
  });
});
