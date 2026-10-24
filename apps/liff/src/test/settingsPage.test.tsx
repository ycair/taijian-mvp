import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../pages/SettingsPage';
import { callCommand } from '../lib/api';

const h = vi.hoisted(() => ({
  auth: {
    user: { uid: 'u1', displayName: '苔' } as { uid: string; displayName?: string } | null,
  },
  household: {
    household: null as null | { id: string; name: string; timezone: string },
    householdIds: [] as string[],
    loading: false,
    error: null as string | null,
    select: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  },
  listeners: new Map<string, (snap: unknown) => void>(),
  doc: vi.fn<(db: unknown, ...path: string[]) => { kind: string; path: string }>(),
  collection: vi.fn<(db: unknown, ...path: string[]) => { kind: string; path: string }>(),
  where: vi.fn<(field: string, op: string, value: unknown) => { field: string }>(),
  query: vi.fn<(...parts: Array<{ kind: string; path: string }>) => { kind: string; path: string }>(),
  onSnapshot: vi.fn<(target: unknown, next: (snap: unknown) => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
}));

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/household', () => ({ useHousehold: () => h.household }));
vi.mock('../lib/firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('firebase/firestore', () => ({
  doc: h.doc,
  collection: h.collection,
  where: h.where,
  query: h.query,
  onSnapshot: h.onSnapshot,
}));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../lib/liff', () => ({ shareInvite: vi.fn() }));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

const mockedCall = vi.mocked(callCommand);
let confirmMock: ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function listener(key: string): (snap: unknown) => void {
  const next = h.listeners.get(key);
  if (!next) throw new Error(`no listener for ${key}`);
  return next;
}

function emitDoc(path: string, data: Record<string, unknown>) {
  act(() => {
    listener(`doc:${path}`)({ id: path.split('/').pop(), exists: () => true, data: () => data });
  });
}

function emitCollection(path: string, rows: Array<Record<string, unknown> & { id: string }>) {
  act(() => {
    listener(`collection:${path}`)({
      docs: rows.map((row) => ({ id: row.id, data: () => row })),
    });
  });
}

function emitQuery(path: string, rows: Array<Record<string, unknown> & { id: string }>) {
  act(() => {
    listener(`query:${path}`)({
      docs: rows.map((row) => ({ id: row.id, data: () => row })),
    });
  });
}

function expectNoOwnerControls() {
  expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '移除' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '設為屋主' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '設為照顧者' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '撤銷邀請' })).not.toBeInTheDocument();
  expect(screen.queryByText('有效邀請')).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listeners.clear();
  h.auth.user = { uid: 'u1', displayName: '苔' };
  h.household.household = { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' };
  h.household.householdIds = ['h1'];
  h.household.loading = false;
  h.household.error = null;
  h.household.select.mockReset();
  h.household.select.mockResolvedValue(undefined);
  h.doc.mockImplementation((_db, ...path) => ({ kind: 'doc', path: path.join('/') }));
  h.collection.mockImplementation((_db, ...path) => ({
    kind: 'collection',
    path: path.join('/'),
  }));
  h.where.mockImplementation((field) => ({ field }));
  h.query.mockImplementation((...parts) => ({ kind: 'query', path: parts[0]?.path ?? '' }));
  h.onSnapshot.mockImplementation((target, next) => {
    const typed = target as { kind: string; path: string };
    h.listeners.set(`${typed.kind}:${typed.path}`, next);
    return h.unsubscribe;
  });
  confirmMock = vi.fn(() => true);
  vi.stubGlobal('confirm', confirmMock);
  mockedCall.mockReset();
  mockedCall.mockResolvedValue({
    ok: true,
    commandId: 'c1',
    data: {},
    serverTime: new Date().toISOString(),
  });
});

describe('SettingsPage invite visibility', () => {
  it('shows the invite action to an owner', () => {
    renderPage();

    emitDoc('households/h1/members/u1', { role: 'owner', householdId: 'h1' });

    expect(screen.getByRole('button', { name: '產生邀請連結' })).toBeInTheDocument();
    expect(screen.queryByText('只有屋主可以產生邀請連結。')).not.toBeInTheDocument();
    expect(screen.getByText('你的角色：屋主')).toBeInTheDocument();
  });

  it('hides the invite action from a caretaker', () => {
    renderPage();

    emitDoc('households/h1/members/u1', { role: 'caretaker', householdId: 'h1' });

    expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument();
    expect(screen.getByText('只有屋主可以產生邀請連結。')).toBeInTheDocument();
    expect(screen.getByText('你的角色：照顧者')).toBeInTheDocument();
  });

  it('fails closed while the role is unknown', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument();
    expect(screen.getByText('讀取家庭角色…')).toBeInTheDocument();
    expect(screen.queryByText(/你的角色/)).not.toBeInTheDocument();
  });
});

describe('SettingsPage members', () => {
  it('lists members and lets the owner change a role and remove a caretaker', async () => {
    renderPage();
    emitDoc('households/h1/members/u1', { role: 'owner' });
    emitCollection('households/h1/members', [
      { id: 'u1', displayName: '苔', role: 'owner' },
      { id: 'u2', displayName: '阿明', role: 'caretaker' },
    ]);

    expect(screen.getByText('阿明')).toBeInTheDocument();
    expect(screen.getByText(/苔（你）/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '設為屋主' }));
    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'member.updateRole',
        { uid: 'u2', role: 'owner' },
        { householdId: 'h1' },
      );
    });
    expect(confirmMock).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'member.remove',
        { uid: 'u2' },
        { householdId: 'h1' },
      );
    });
  });

  it('lets a caretaker leave but shows no owner-only controls', async () => {
    renderPage();
    emitDoc('households/h1/members/u1', { role: 'caretaker' });
    emitCollection('households/h1/members', [
      { id: 'u1', displayName: '苔', role: 'caretaker' },
      { id: 'u2', displayName: '屋主', role: 'owner' },
    ]);

    expectNoOwnerControls();
    expect(screen.getByText('你的角色：照顧者')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '離開家庭' }));
    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith('member.leave', {}, { householdId: 'h1' });
    });
    expect(confirmMock).toHaveBeenCalled();
  });

  it('does nothing when the confirmation is cancelled', () => {
    confirmMock.mockReturnValue(false);
    renderPage();
    emitDoc('households/h1/members/u1', { role: 'owner' });
    emitCollection('households/h1/members', [
      { id: 'u1', displayName: '苔', role: 'owner' },
      { id: 'u2', displayName: '阿明', role: 'caretaker' },
    ]);

    fireEvent.click(screen.getByRole('button', { name: '移除' }));
    fireEvent.click(screen.getByRole('button', { name: '設為屋主' }));
    expect(mockedCall).not.toHaveBeenCalled();
  });
});

describe('SettingsPage invites', () => {
  it('lists active invites with created/expiry dates and revokes on confirmation', async () => {
    renderPage();
    emitDoc('households/h1/members/u1', { role: 'owner' });
    emitQuery('invites', [
      {
        id: 'i1',
        role: 'caretaker',
        status: 'active',
        createdAt: new Date('2026-10-20T00:00:00Z'),
        expiresAt: new Date('2026-10-27T00:00:00Z'),
      },
    ]);

    expect(screen.getByText('有效邀請')).toBeInTheDocument();
    expect(screen.getByText('有效')).toBeInTheDocument();
    expect(screen.getByText(/建立 2026\/10\/20/)).toBeInTheDocument();
    expect(screen.getByText(/到期 2026\/10\/27/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '撤銷邀請' }));
    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'member.revokeInvite',
        { inviteId: 'i1' },
        { householdId: 'h1' },
      );
    });
    expect(confirmMock).toHaveBeenCalled();
  });

  it('does not query invites for a caretaker', () => {
    renderPage();
    emitDoc('households/h1/members/u1', { role: 'caretaker' });

    expect(mockedCall).not.toHaveBeenCalled();
    expect(screen.queryByText('有效邀請')).not.toBeInTheDocument();
  });
});

describe('SettingsPage household switching', () => {
  it('switches to another household through the provider', async () => {
    h.household.householdIds = ['h1', 'h2'];
    renderPage();
    emitDoc('households/h2', { name: '第二個家' });

    expect(screen.getByText('第二個家')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '切換' }));

    await waitFor(() => expect(h.household.select).toHaveBeenCalledWith('h2'));
  });
});

describe('SettingsPage profile', () => {
  it('saves displayName and timezone with user.updateProfile', async () => {
    renderPage();
    emitDoc('users/u1', { displayName: '苔', timezone: 'Asia/Taipei' });

    fireEvent.change(await screen.findByLabelText('顯示名稱'), {
      target: { value: '苔苔' },
    });
    fireEvent.change(screen.getByLabelText('個人時區'), { target: { value: 'Asia/Tokyo' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存個人資料' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith('user.updateProfile', {
        displayName: '苔苔',
        timezone: 'Asia/Tokyo',
      });
    });
    expect(await screen.findByText('已儲存個人資料。')).toBeInTheDocument();
  });

  it('shows a Chinese error for an empty name', async () => {
    renderPage();
    emitDoc('users/u1', { displayName: '苔', timezone: 'Asia/Taipei' });

    fireEvent.change(await screen.findByLabelText('顯示名稱'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存個人資料' }));
    expect(await screen.findByText('請填寫顯示名稱。')).toBeInTheDocument();
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('shows a Chinese error for an invalid timezone', async () => {
    renderPage();
    // A stored zone the browser no longer knows must be rejected client-side.
    emitDoc('users/u1', { displayName: '苔', timezone: 'Mars/Phobos' });

    expect(await screen.findByLabelText('個人時區')).toHaveValue('Mars/Phobos');
    fireEvent.click(screen.getByRole('button', { name: '儲存個人資料' }));
    expect(await screen.findByText('請選擇有效的時區。')).toBeInTheDocument();
    expect(mockedCall).not.toHaveBeenCalled();
  });
});
