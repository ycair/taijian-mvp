import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from '../pages/TodayPage';

const h = vi.hoisted(() => ({
  auth: { user: null as { uid: string } | null, loading: false, error: null as string | null },
  household: {
    household: null as null | { id: string; name: string; timezone: string },
    householdIds: [] as string[],
    loading: false,
    error: null as string | null,
    select: () => undefined,
  },
  collection: vi.fn<(db: unknown, name: string) => { path: string }>(),
  where: vi.fn<(field: string, op: string, value: unknown) => { field: string }>(),
  query: vi.fn<(...args: unknown[]) => unknown[]>(),
  onSnapshot: vi.fn<(...args: unknown[]) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/household', () => ({ useHousehold: () => h.household }));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: h.collection,
  where: h.where,
  query: h.query,
  onSnapshot: h.onSnapshot,
}));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T02:00:00.000Z')); // 10:00 Taipei
  h.auth.loading = false;
  h.auth.user = { uid: 'u1' };
  h.household.household = null;
  h.household.loading = false;
  h.household.error = null;
  h.collection.mockImplementation((_db, name) => ({ path: name }));
  h.where.mockImplementation((field) => ({ field }));
  h.query.mockImplementation((...args) => args);
  h.onSnapshot.mockReturnValue(h.unsubscribe);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TodayPage', () => {
  it('shows the loading state while auth is still resolving', () => {
    h.auth.loading = true;

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('載入中…');
    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();
  });

  it('shows the loading state while the household is still resolving', () => {
    h.household.loading = true;

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('載入中…');
    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();
  });

  it('shows the no-household empty state only after loading settles', () => {
    renderPage();

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('還沒有家庭')).toBeInTheDocument();
    expect(h.onSnapshot).not.toHaveBeenCalled();
  });

  it('reads completions for a three-day window in the household timezone', () => {
    h.household.household = { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' };

    renderPage();

    expect(screen.queryByText('還沒有家庭')).not.toBeInTheDocument();
    expect(screen.getByText('0 件照護任務')).toBeInTheDocument();
    expect(screen.getByText('今天沒有任務')).toBeInTheDocument();
    expect(h.onSnapshot).toHaveBeenCalledTimes(3);
    expect(h.collection).toHaveBeenCalledWith(expect.anything(), 'taskCompletions');
    expect(h.where).toHaveBeenCalledWith('householdId', '==', 'h1');
    expect(h.where).toHaveBeenCalledWith('dueDate', '>=', '2026-10-23');
    expect(h.where).toHaveBeenCalledWith('dueDate', '<=', '2026-10-25');
  });
});
