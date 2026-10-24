import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickRecordSheet } from '../components/QuickRecordSheet';
import { callCommand } from '../lib/api';

vi.mock('../lib/api', () => ({
  callCommand: vi.fn(),
}));

const mockedCall = vi.mocked(callCommand);

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
        }),
        { householdId: 'h1' },
      );
    });
  });

  it('omits unit entirely for non-weight records', async () => {
    const onDone = vi.fn();
    render(<QuickRecordSheet householdId="h1" animalId="a1" onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '吃了兩隻蟋蟀' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const payload = mockedCall.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toMatchObject({ animalId: 'a1', type: 'feeding', note: '吃了兩隻蟋蟀' });
    expect(payload).not.toHaveProperty('unit');
    expect(payload).not.toHaveProperty('value');
  });
});
