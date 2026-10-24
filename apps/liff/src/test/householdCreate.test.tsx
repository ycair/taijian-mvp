import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HouseholdCreatePage } from '../pages/HouseholdCreatePage';
import { callCommand } from '../lib/api';

const h = vi.hoisted(() => ({
  auth: { user: { uid: 'u1', displayName: '小苔' }, loading: false, error: null },
  household: {
    household: null,
    householdIds: [] as string[],
    loading: false,
    error: null,
    select: vi.fn<(id: string) => void>(),
    refresh: vi.fn<() => Promise<void>>(async () => undefined),
  },
}));

vi.mock('../lib/auth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/household', () => ({ useHousehold: () => h.household }));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

const mockedCall = vi.mocked(callCommand);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/household/new']}>
      <Routes>
        <Route path="/household/new" element={<HouseholdCreatePage />} />
        <Route path="/" element={<div>今日頁</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.household.select.mockReset();
  h.household.refresh.mockReset();
  h.household.refresh.mockResolvedValue(undefined);
  mockedCall.mockReset();
});

describe('HouseholdCreatePage', () => {
  it('creates a household, selects it, refreshes the profile, and goes to Today', async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      commandId: 'c1',
      data: { householdId: 'h-new' },
      serverTime: new Date().toISOString(),
    });

    renderPage();
    fireEvent.change(screen.getByLabelText('家庭名稱'), { target: { value: '苔間' } });
    fireEvent.click(screen.getByRole('button', { name: '建立家庭' }));

    await screen.findByText('今日頁');
    expect(mockedCall).toHaveBeenCalledWith(
      'household.create',
      { name: '苔間', timezone: 'Asia/Taipei' },
      { commandId: expect.any(String) },
    );
    expect(h.household.select).toHaveBeenCalledWith('h-new');
    expect(h.household.refresh).toHaveBeenCalledTimes(1);
  });

  it('retries a timed-out create with the same command id', async () => {
    const commits = new Map<string, Record<string, unknown>>();
    const timeout = Object.assign(new Error('deadline exceeded'), {
      code: 'functions/deadline-exceeded',
    });
    let responded = false;
    mockedCall.mockImplementation(async (_type, payload, options) => {
      const commandId = options?.commandId ?? '';
      if (!commits.has(commandId)) commits.set(commandId, payload as Record<string, unknown>);
      if (!responded) {
        responded = true;
        throw timeout;
      }
      return {
        ok: true,
        commandId,
        data: { householdId: 'h-new' },
        serverTime: new Date().toISOString(),
      };
    });

    renderPage();
    fireEvent.change(screen.getByLabelText('家庭名稱'), { target: { value: '苔間' } });
    fireEvent.click(screen.getByRole('button', { name: '建立家庭' }));

    await screen.findByText('網路不穩，請稍後再試。');
    fireEvent.click(screen.getByRole('button', { name: '建立家庭' }));

    await screen.findByText('今日頁');
    expect(mockedCall).toHaveBeenCalledTimes(2);
    const first = mockedCall.mock.calls[0]?.[2];
    const second = mockedCall.mock.calls[1]?.[2];
    expect(second?.commandId).toBe(first?.commandId);
    expect(commits.size).toBe(1);
    await waitFor(() => expect(h.household.select).toHaveBeenCalledWith('h-new'));
  });
});
