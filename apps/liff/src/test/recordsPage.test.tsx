import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecordsPage } from '../pages/RecordsPage';

const h = vi.hoisted(() => ({
  household: {
    household: null as null | { id: string; name: string; timezone: string },
    householdIds: [] as string[],
    loading: false,
    error: null as string | null,
    select: () => undefined,
  },
  listeners: new Map<string, (snap: unknown) => void>(),
  collection: vi.fn<(db: unknown, name: string) => { path: string }>(),
  where: vi.fn<(field: string, op: string, value: unknown) => { field: string }>(),
  orderBy: vi.fn<(field: string, dir: string) => { field: string }>(),
  query: vi.fn<(...args: unknown[]) => unknown[]>(),
  onSnapshot: vi.fn<(target: unknown, next: (snap: unknown) => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
}));

vi.mock('../lib/household', () => ({ useHousehold: () => h.household }));
vi.mock('../lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: h.collection,
  where: h.where,
  orderBy: h.orderBy,
  query: h.query,
  onSnapshot: h.onSnapshot,
}));

type Doc = { id: string; data: Record<string, unknown> };

function emit(name: string, docs: Doc[]) {
  const next = h.listeners.get(name);
  if (!next) throw new Error(`no snapshot listener for ${name}`);
  act(() => {
    next({ docs: docs.map((doc) => ({ id: doc.id, data: () => doc.data })) });
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <RecordsPage />
    </MemoryRouter>,
  );
}

const animal = (id: string, name: string, data: Record<string, unknown> = {}): Doc => ({
  id,
  data: { name, species: 'leopard-gecko', speciesLabel: '豹紋守宮', status: 'active', ...data },
});

const record = (id: string, animalId: string, note: string, data: Record<string, unknown> = {}): Doc => ({
  id,
  data: {
    householdId: 'h1',
    animalId,
    type: 'feeding',
    note,
    occurredAt: '2026-10-24T02:00:00.000Z',
    ...data,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  h.listeners.clear();
  h.household.household = { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' };
  h.household.loading = false;
  h.household.error = null;
  h.collection.mockImplementation((_db, name) => ({ path: name }));
  h.where.mockImplementation((field) => ({ field }));
  h.orderBy.mockImplementation((field) => ({ field }));
  h.query.mockImplementation((...args) => args);
  h.onSnapshot.mockImplementation((target, next) => {
    const key = Array.isArray(target)
      ? ((target[0] as { path: string }).path ?? '')
      : ((target as { path: string }).path ?? '');
    h.listeners.set(key, next);
    return h.unsubscribe;
  });
});

describe('RecordsPage', () => {
  it('hides records whose animal is missing, archived, or soft-deleted', () => {
    renderPage();

    emit('animals', [
      animal('a1', '阿苔'),
      animal('a3', '小綠', { status: 'archived' }),
      animal('a4', '老木', { status: 'active', deletedAt: new Date() }),
    ]);
    emit('records', [
      record('r1', 'a1', '有效紀錄'),
      record('r2', 'a2', '缺少居民'),
      record('r3', 'a3', '已封存居民'),
      record('r4', 'a4', '已刪除居民'),
      record('r5', 'a1', '已刪除紀錄', { deletedAt: new Date() }),
    ]);

    expect(screen.getByText('有效紀錄')).toBeInTheDocument();
    expect(screen.getByText('阿苔')).toBeInTheDocument();
    expect(screen.queryByText('缺少居民')).not.toBeInTheDocument();
    expect(screen.queryByText('已封存居民')).not.toBeInTheDocument();
    expect(screen.queryByText('已刪除居民')).not.toBeInTheDocument();
    expect(screen.queryByText('已刪除紀錄')).not.toBeInTheDocument();
  });

  it('keeps the read join correct when records arrive before animals', () => {
    renderPage();

    emit('records', [record('r1', 'a1', '有效紀錄'), record('r2', 'a2', '缺少居民')]);
    expect(screen.queryByText('有效紀錄')).not.toBeInTheDocument();

    emit('animals', [animal('a1', '阿苔')]);

    expect(screen.getByText('有效紀錄')).toBeInTheDocument();
    expect(screen.queryByText('缺少居民')).not.toBeInTheDocument();
  });

  it('does not flash the empty state while the animal snapshot is loading', () => {
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('載入中…');
    expect(screen.queryByText('還沒有紀錄。')).not.toBeInTheDocument();

    // Only the record snapshot has arrived: the animal join is still unknown.
    emit('records', []);
    expect(screen.getByRole('status')).toHaveTextContent('載入中…');
    expect(screen.queryByText('還沒有紀錄。')).not.toBeInTheDocument();

    emit('animals', []);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('還沒有紀錄。')).toBeInTheDocument();
  });
});
