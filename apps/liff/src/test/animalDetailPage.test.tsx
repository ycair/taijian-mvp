import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimalDetailPage } from '../pages/AnimalDetailPage';
import { callCommand } from '../lib/api';

const h = vi.hoisted(() => ({
  auth: { user: { uid: 'u1', displayName: '苔' }, loading: false, error: null },
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

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
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

function emitQuery(path: string, rows: Array<Record<string, unknown> & { id: string }>) {
  const next = h.listeners.get(path);
  if (!next) throw new Error(`no query listener for ${path}`);
  act(() => {
    next({
      docs: rows.map((row) => ({ id: row.id, data: () => row })),
    });
  });
}

const reminderRow = {
  id: 'r1',
  animalId: 'a1',
  title: '晚間餵食',
  type: 'feeding',
  schedule: { kind: 'daily' as const, times: ['20:00'] },
  timezone: 'Asia/Taipei',
  enabled: true,
  revision: 2,
  deletedAt: null,
};

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
  revision: 0,
  morph: '橘化',
  sex: 'female',
  birthDate: '2025-04-01',
  notes: '愛吃蟋蟀',
  deletedAt: null,
};

let confirmMock: ReturnType<typeof vi.fn>;

function emitMember(role: 'owner' | 'caretaker') {
  emitDoc('households/h1/members/u1', { uid: 'u1', role });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listeners.clear();
  h.auth.user = { uid: 'u1', displayName: '苔' };
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
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
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
      expect.objectContaining({
        animalId: 'a1',
        note: '吃了兩隻蟋蟀',
        recordId: expect.any(String),
      }),
      { householdId: 'h1', commandId: expect.any(String) },
    );

    // Closed after success, and the form is reset for the next open.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '儲存' })).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: '＋ 新增紀錄' }));
    expect(screen.getByLabelText('備註')).toHaveValue('');
  });

  it('scopes the records query to the resident', () => {
    renderPage();
    emitDoc('animals/a1', baseAnimal);

    expect(h.where).toHaveBeenCalledWith('householdId', '==', 'h1');
    expect(h.where).toHaveBeenCalledWith('animalId', '==', 'a1');
    expect(h.orderBy).toHaveBeenCalledWith('occurredAt', 'desc');
  });

  it('lists the animal reminders with edit and delete', async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      commandId: 'c1',
      data: { reminderId: 'r1', deleted: true },
      serverTime: new Date().toISOString(),
    });

    renderPage();
    emitDoc('animals/a1', baseAnimal);
    emitQuery('reminders', [reminderRow]);

    expect(screen.getByText('晚間餵食')).toBeInTheDocument();
    expect(screen.getByText(/每日 20:00/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '編輯' }));
    expect(screen.getByText('編輯提醒')).toBeInTheDocument();
    expect(screen.getByLabelText('提醒名稱')).toHaveValue('晚間餵食');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    fireEvent.click(screen.getByRole('button', { name: '刪除' }));
    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'reminder.delete',
        { reminderId: 'r1' },
        { householdId: 'h1', baseRevision: 2, commandId: expect.any(String) },
      );
    });
  });

  it('shows the current revision when a delete conflicts', async () => {
    mockedCall.mockResolvedValue({
      ok: false,
      commandId: 'c1',
      code: 'CONFLICT',
      message: 'revision mismatch',
      currentRevision: 4,
      lastChangedFields: ['enabled'],
      serverTime: new Date().toISOString(),
    });

    renderPage();
    emitDoc('animals/a1', baseAnimal);
    emitQuery('reminders', [reminderRow]);

    fireEvent.click(screen.getByRole('button', { name: '刪除' }));

    expect(await screen.findByText('資料已更新')).toBeInTheDocument();
    expect(screen.getByText(/目前版本：4/)).toBeInTheDocument();
    expect(screen.getByText(/變更欄位：enabled/)).toBeInTheDocument();
  });

  it('edits a resident and sends the observed baseRevision', async () => {
    renderPage();
    emitDoc('animals/a1', baseAnimal);

    fireEvent.click(screen.getByRole('button', { name: '編輯居民' }));
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '阿苔二號' } });
    fireEvent.change(screen.getByLabelText('品系'), { target: { value: '白化' } });
    fireEvent.change(screen.getByLabelText('性別'), { target: { value: 'male' } });
    fireEvent.change(screen.getByLabelText('生日'), { target: { value: '2024-01-02' } });
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '換季中' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存居民' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'animal.update',
        {
          animalId: 'a1',
          name: '阿苔二號',
          species: 'leopard-gecko',
          speciesLabel: '豹紋守宮',
          morph: '白化',
          sex: 'male',
          birthDate: '2024-01-02',
          notes: '換季中',
        },
        { householdId: 'h1', baseRevision: 0, commandId: expect.any(String) },
      );
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '儲存居民' })).not.toBeInTheDocument(),
    );
  });

  it('shows the conflict banner and loads the latest values', async () => {
    mockedCall.mockResolvedValueOnce({
      ok: false,
      commandId: 'c1',
      code: 'CONFLICT',
      message: 'stale revision',
      currentRevision: 3,
      lastChangedFields: ['name', 'notes'],
      current: {
        ...baseAnimal,
        id: 'a1',
        name: '對方改的名字',
        morph: '白化',
        notes: '對方改的備註',
        revision: 3,
      },
      serverTime: new Date().toISOString(),
    });

    renderPage();
    emitDoc('animals/a1', baseAnimal);

    fireEvent.click(screen.getByRole('button', { name: '編輯居民' }));
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '我改的名字' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存居民' }));

    expect(await screen.findByText('資料已更新')).toBeInTheDocument();
    expect(screen.getByText(/目前版本：3/)).toBeInTheDocument();
    expect(screen.getByText(/變更欄位：name、notes/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看最新' }));

    expect(screen.getByLabelText('名字')).toHaveValue('對方改的名字');
    expect(screen.getByLabelText('品系')).toHaveValue('白化');
    expect(screen.getByLabelText('備註')).toHaveValue('對方改的備註');
    expect(screen.queryByText('資料已更新')).not.toBeInTheDocument();
  });

  it('keeps my edit on confirmation and resubmits with the new revision', async () => {
    mockedCall.mockResolvedValueOnce({
      ok: false,
      commandId: 'c1',
      code: 'CONFLICT',
      message: 'stale revision',
      currentRevision: 3,
      lastChangedFields: ['name'],
      current: { ...baseAnimal, id: 'a1', name: '對方改的名字', revision: 3 },
      serverTime: new Date().toISOString(),
    });

    renderPage();
    emitDoc('animals/a1', baseAnimal);

    fireEvent.click(screen.getByRole('button', { name: '編輯居民' }));
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '我改的名字' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存居民' }));
    expect(await screen.findByText('資料已更新')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '保留我的' }));

    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
    expect(confirmMock).toHaveBeenCalled();
    expect(mockedCall).toHaveBeenLastCalledWith(
      'animal.update',
      expect.objectContaining({ animalId: 'a1', name: '我改的名字' }),
      { householdId: 'h1', baseRevision: 3, commandId: expect.any(String) },
    );
  });

  it('archives a resident as the owner with baseRevision and confirmation', async () => {
    renderPage();
    emitDoc('animals/a1', baseAnimal);
    emitMember('owner');

    fireEvent.click(await screen.findByRole('button', { name: '封存居民' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'animal.archive',
        { animalId: 'a1' },
        { householdId: 'h1', baseRevision: 0 },
      );
    });
    expect(confirmMock).toHaveBeenCalled();
  });

  it('deletes a resident as the owner with baseRevision and confirmation', async () => {
    renderPage();
    emitDoc('animals/a1', baseAnimal);
    emitMember('owner');

    fireEvent.click(await screen.findByRole('button', { name: '刪除居民' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'animal.delete',
        { animalId: 'a1' },
        { householdId: 'h1', baseRevision: 0 },
      );
    });
    expect(confirmMock).toHaveBeenCalled();
  });

  it('hides lifecycle actions from a caretaker but keeps editing available', async () => {
    renderPage();
    emitDoc('animals/a1', baseAnimal);
    emitMember('caretaker');

    expect(await screen.findByRole('button', { name: '編輯居民' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '封存居民' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '刪除居民' })).not.toBeInTheDocument();
  });
});
