import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickRecordSheet } from '../components/QuickRecordSheet';
import { callCommand } from '../lib/api';

vi.mock('../lib/api', () => ({
  callCommand: vi.fn(),
}));

const mockedCall = vi.mocked(callCommand);

/** Payload of the nth `callCommand` invocation, with the call count checked. */
function payloadOf(index: number): Record<string, unknown> {
  const call = mockedCall.mock.calls[index];
  if (!call) throw new Error(`missing call ${index}`);
  return call[1] as Record<string, unknown>;
}

beforeEach(() => {
  mockedCall.mockReset();
  mockedCall.mockResolvedValue({
    ok: true,
    commandId: 'c1',
    data: { recordId: 'r1' },
    serverTime: new Date().toISOString(),
  });
});

describe('QuickRecordSheet', () => {
  it('submits a weight record with grams', async () => {
    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '體重' }));
    fireEvent.change(screen.getByLabelText('數值'), { target: { value: '68' } });
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '飯後' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => {
      expect(mockedCall).toHaveBeenCalledWith(
        'record.create',
        expect.objectContaining({
          animalId: 'a1',
          type: 'weight',
          value: 68,
          unit: 'g',
          note: '飯後',
          recordId: expect.any(String),
          occurredAt: expect.any(String),
        }),
        { householdId: 'h1', commandId: expect.any(String) },
      );
    });
  });

  it('omits unit entirely for non-weight records', async () => {
    const onDone = vi.fn();
    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '吃了兩隻蟋蟀' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const payload = payloadOf(0);
    expect(payload).toMatchObject({ animalId: 'a1', type: 'feeding', note: '吃了兩隻蟋蟀' });
    expect(payload).not.toHaveProperty('unit');
    expect(payload).not.toHaveProperty('value');
  });

  it('clears the form after a successful save', async () => {
    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '體重' }));
    fireEvent.change(screen.getByLabelText('數值'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '第一次' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByLabelText('數值')).toHaveValue('');
      expect(screen.getByLabelText('備註')).toHaveValue('');
    });

    // A second tap cannot resend the saved values.
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
    const second = payloadOf(1);
    expect(second).not.toHaveProperty('value');
    expect(second).not.toHaveProperty('unit');
    expect(second).not.toHaveProperty('note');
  });

  it('retries a timed-out save with the same record and command ids', async () => {
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
        data: { recordId: (payload as { recordId: string }).recordId },
        serverTime: new Date().toISOString(),
      };
    });

    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '吃了兩隻蟋蟀' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await screen.findByText('網路不穩，請稍後再試。');
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(mockedCall).toHaveBeenCalledTimes(2));
    const first = payloadOf(0);
    const second = payloadOf(1);
    expect(second.recordId).toBe(first.recordId);
    expect(second.occurredAt).toBe(first.occurredAt);
    const firstOptions = mockedCall.mock.calls[0]?.[2];
    const secondOptions = mockedCall.mock.calls[1]?.[2];
    expect(secondOptions?.commandId).toBe(firstOptions?.commandId);
    // One command id means the server only ever committed one record.
    expect(commits.size).toBe(1);
    expect(commits.has(String(firstOptions?.commandId))).toBe(true);
  });

  it('renders Chinese copy instead of the raw server message', async () => {
    mockedCall.mockResolvedValue({
      ok: false,
      commandId: 'c1',
      code: 'FORBIDDEN',
      message: 'caretaker cannot write here',
      serverTime: new Date().toISOString(),
    });

    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    expect(
      await screen.findByText('沒有權限執行這個操作，請確認家庭角色。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('caretaker cannot write here')).not.toBeInTheDocument();
  });
});
