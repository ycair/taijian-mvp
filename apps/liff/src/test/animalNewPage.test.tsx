import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimalNewPage } from '../pages/AnimalNewPage';
import { callCommand } from '../lib/api';

const h = vi.hoisted(() => ({
  household: {
    household: null as null | { id: string; name: string; timezone: string },
    householdIds: [] as string[],
    loading: false,
    error: null as string | null,
    select: () => undefined,
    refresh: async () => undefined,
  },
}));

vi.mock('../lib/household', () => ({ useHousehold: () => h.household }));
vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

const mockedCall = vi.mocked(callCommand);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/animals/new']}>
      <Routes>
        <Route path="/animals/new" element={<AnimalNewPage />} />
        <Route path="/animals/:id" element={<div>居民詳情</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.household.household = { id: 'h1', name: '苔間', timezone: 'Asia/Taipei' };
  mockedCall.mockReset();
});

describe('AnimalNewPage', () => {
  it('retries a timed-out create with the same command id', async () => {
    const commits = new Map<string, Record<string, unknown>>();
    const timeout = Object.assign(new Error('deadline exceeded'), {
      code: 'functions/deadline-exceeded',
    });
    let responded = false;
    mockedCall.mockImplementation(async (_type, payload, options) => {
      const commandId = options?.commandId ?? '';
      // The first request committed on the server but the response was lost.
      if (!commits.has(commandId)) commits.set(commandId, payload as Record<string, unknown>);
      if (!responded) {
        responded = true;
        throw timeout;
      }
      return {
        ok: true,
        commandId,
        data: { animalId: 'a-new' },
        serverTime: new Date().toISOString(),
      };
    });

    renderPage();
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '阿苔' } });
    fireEvent.click(screen.getByRole('button', { name: '建立居民' }));

    await screen.findByText('網路不穩，請稍後再試。');
    fireEvent.click(screen.getByRole('button', { name: '建立居民' }));

    await screen.findByText('居民詳情');
    expect(mockedCall).toHaveBeenCalledTimes(2);
    const first = mockedCall.mock.calls[0]?.[2];
    const second = mockedCall.mock.calls[1]?.[2];
    expect(second?.commandId).toBe(first?.commandId);
    expect(commits.size).toBe(1);
  });

  it('starts a new command id when the form changes', async () => {
    mockedCall.mockRejectedValue(
      Object.assign(new Error('offline'), { code: 'functions/unavailable' }),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '阿苔' } });
    fireEvent.click(screen.getByRole('button', { name: '建立居民' }));
    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('名字'), { target: { value: '阿肥' } });
    fireEvent.click(screen.getByRole('button', { name: '建立居民' }));
    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));

    const first = mockedCall.mock.calls[0]?.[2];
    const second = mockedCall.mock.calls[1]?.[2];
    expect(second?.commandId).not.toBe(first?.commandId);
  });
});
