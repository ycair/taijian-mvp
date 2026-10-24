import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimalDetailPage } from '../pages/AnimalDetailPage';
import { callCommand } from '../lib/api';

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
  doc: vi.fn<(db: unknown, ...path: string[]) => { path: string }>(),
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
  doc: h.doc,
  where: h.where,
  orderBy: h.orderBy,
  query: h.query,
  onSnapshot: h.onSnapshot,
}));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

const mockedCall = vi.mocked(callCommand);

function emitDoc(path: string, data: Record<string, unknown>) {
  const next = h.listeners.get(path);
  if (!next) throw new Error(`no snapshot listener for ${path}`);
  act(() => {
    next({ id: path.split('/').pop(), exists: () => true, data: () => data });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/animals/a1']}>
      <Routes>
        <Route path="/animals/:id" element={<AnimalDetailPage />} />
        <Route path="/animals" element={<div>居民列表</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseAnimal = {
  name: '阿苔',
  species: 'leopard-gecko',
  speciesLabel: '豹紋守宮',
  householdId: 'h1',
  status: 'active',
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.listeners.clear();
  h.household.household = { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' };
  h.household.loading = false;
  h.household.error = null;
  h.collection.mockImplementation((_db, name) => ({ path: name }));
  h.doc.mockImplementation((_db, ...path) => ({ path: path.join('/') }));
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
  mockedCall.mockReset();
  mockedCall.mockResolvedValue({
    ok: true,
    commandId: 'c1',
    data: { recordId: 'r1' },
    serverTime: new Date().toISOString(),
  });
});

describe('AnimalDetailPage', () => {
  it('treats an archived animal as not found', () => {
    renderPage();

    emitDoc('animals/a1', { ...baseAnimal, status: 'archived' });

    expect(screen.getByText('找不到這位居民')).toBeInTheDocument();
    expect(screen.queryByText('阿苔')).not.toBeInTheDocument();
  });

  it('treats a soft-deleted animal as not found', () => {
    renderPage();

    emitDoc('animals/a1', { ...baseAnimal, deletedAt: new Date() });

    expect(screen.getByText('找不到這位居民')).toBeInTheDocument();
    expect(screen.queryByText('阿苔')).not.toBeInTheDocument();
  });

  it('shows the localised species label for an active animal', () => {
    renderPage();

    emitDoc('animals/a1', baseAnimal);

    expect(screen.getByText('阿苔')).toBeInTheDocument();
    expect(screen.getByText('豹紋守宮')).toBeInTheDocument();
    expect(screen.queryByText('leopard-gecko')).not.toBeInTheDocument();
  });

  it('closes the quick sheet after a save so a second tap cannot duplicate the record', async () => {
    renderPage();
    emitDoc('animals/a1', baseAnimal);

    // The sheet is closed by default: no submit button until the user asks.
    expect(screen.queryByRole('button', { name: '儲存' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '＋ 新增紀錄' }));
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '吃了兩隻蟋蟀' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(1));
    expect(mockedCall).toHaveBeenCalledWith(
      'record.create',
      expect.objectContaining({ animalId: 'a1', note: '吃了兩隻蟋蟀' }),
      { householdId: 'h1' },
    );

    // Closed after success, and the form is reset for the next open.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '儲存' })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '＋ 新增紀錄' }));
    expect(screen.getByLabelText('備註')).toHaveValue('');
  });
});
