import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderForm } from '../components/ReminderForm';
import { callCommand } from '../lib/api';

vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

const mockedCall = vi.mocked(callCommand);

const reminder = {
  id: 'r1',
  animalId: 'a1',
  title: '餵食',
  type: 'feeding',
  schedule: { kind: 'daily' as const, times: ['08:30'] },
  timezone: 'Asia/Taipei',
  enabled: true,
  revision: 2,
};

function renderForm(mode: 'create' | 'edit' = 'create', initial = reminder) {
  return render(
    <ReminderForm
      householdId="h1"
      animalId="a1"
      mode={mode}
      {...(mode === 'edit' ? { reminder: initial } : {})}
      defaultTimezone="Asia/Taipei"
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

beforeEach(() => {
  mockedCall.mockReset();
  mockedCall.mockResolvedValue({
    ok: true,
    commandId: 'c1',
    data: { reminderId: 'r1' },
    serverTime: new Date().toISOString(),
  });
});

describe('ReminderForm', () => {
  it('creates a daily reminder with one clock time', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('提醒名稱'), { target: { value: '餵食' } });
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '09:15' } });
    fireEvent.click(screen.getByRole('button', { name: '建立提醒' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'reminder.create',
        {
          animalId: 'a1',
          title: '餵食',
          type: 'feeding',
          schedule: { kind: 'daily', times: ['09:15'] },
          timezone: 'Asia/Taipei',
          enabled: true,
        },
        { householdId: 'h1', commandId: expect.any(String) },
      );
    });
  });

  it('sends weekday and interval schedules in the shape the server validates', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('提醒名稱'), { target: { value: '換水' } });
    fireEvent.change(screen.getByLabelText('排程'), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: '星期三' }));
    fireEvent.click(screen.getByRole('button', { name: '建立提醒' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'reminder.create',
        expect.objectContaining({
          schedule: { kind: 'weekly', times: ['08:30'], weekdays: [1, 3] },
        }),
        expect.anything(),
      );
    });

    mockedCall.mockClear();
    fireEvent.change(screen.getByLabelText('提醒名稱'), { target: { value: '換水' } });
    fireEvent.change(screen.getByLabelText('排程'), { target: { value: 'interval' } });
    fireEvent.change(screen.getByLabelText('間隔天數'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('開始日期'), { target: { value: '2026-10-24' } });
    fireEvent.click(screen.getByRole('button', { name: '建立提醒' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'reminder.create',
        expect.objectContaining({
          schedule: { kind: 'interval', times: ['08:30'], everyNDays: 3, startDate: '2026-10-24' },
        }),
        expect.anything(),
      );
    });
  });

  it('shows a conflict banner with the current revision and changed fields', async () => {
    mockedCall.mockResolvedValue({
      ok: false,
      commandId: 'c1',
      code: 'CONFLICT',
      message: 'revision mismatch',
      currentRevision: 5,
      lastChangedFields: ['title', 'schedule'],
      current: { ...reminder, title: '別人的版本', revision: 5 },
      serverTime: new Date().toISOString(),
    });

    renderForm('edit');
    fireEvent.change(screen.getByLabelText('提醒名稱'), { target: { value: '我的版本' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存提醒' }));

    expect(await screen.findByText('資料已更新')).toBeInTheDocument();
    expect(screen.getByText(/目前版本：5/)).toBeInTheDocument();
    expect(screen.getByText(/變更欄位：title、schedule/)).toBeInTheDocument();
    expect(mockedCall).toHaveBeenCalledWith(
      'reminder.update',
      expect.objectContaining({ reminderId: 'r1', title: '我的版本' }),
      { householdId: 'h1', baseRevision: 2, commandId: expect.any(String) },
    );

    fireEvent.click(screen.getByRole('button', { name: '查看最新' }));
    expect(screen.getByLabelText('提醒名稱')).toHaveValue('別人的版本');
  });

  it('retries an update with the same command id after a timeout', async () => {
    const timeout = Object.assign(new Error('deadline exceeded'), {
      code: 'functions/deadline-exceeded',
    });
    let responded = false;
    mockedCall.mockImplementation(async () => {
      if (!responded) {
        responded = true;
        throw timeout;
      }
      return {
        ok: true,
        commandId: 'c1',
        data: { reminderId: 'r1' },
        serverTime: new Date().toISOString(),
      };
    });

    renderForm('edit');
    fireEvent.click(screen.getByRole('button', { name: '儲存提醒' }));
    await screen.findByText('網路不穩，請稍後再試。');
    fireEvent.click(screen.getByRole('button', { name: '儲存提醒' }));

    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
    const first = mockedCall.mock.calls[0]?.[2];
    const second = mockedCall.mock.calls[1]?.[2];
    expect(second?.commandId).toBe(first?.commandId);
    expect(second?.baseRevision).toBe(2);
  });
});
