import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRow } from '../components/TaskRow';

const baseTask = {
  reminderId: 'r1',
  animalId: 'a1',
  animalName: '阿肥',
  title: '餵食',
  timezone: 'Asia/Taipei',
  dueDate: '2026-10-24',
  dueAt: new Date('2026-10-24T00:00:00.000Z'),
  overdue: true,
};

describe('TaskRow', () => {
  it('shows the animal name and completion state', () => {
    render(<TaskRow task={baseTask} onComplete={vi.fn()} />);
    expect(screen.getByText(/阿肥/)).toBeInTheDocument();
    expect(screen.getByText(/餵食/)).toBeInTheDocument();
    expect(screen.getByText('逾時')).toBeInTheDocument();
  });

  it('formats the due time in the reminder timezone, not the device zone', () => {
    render(<TaskRow task={baseTask} onComplete={vi.fn()} />);
    // 2026-10-24T00:00Z is 08:00 in Taipei.
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
  });

  it('disables a completed row and shows the completer name, not the UID', () => {
    const onComplete = vi.fn();
    const uid = 'uid_01HZX8R4K7Y9Q2M3N5P6R7S8T9';
    render(
      <TaskRow
        task={{ ...baseTask, completedBy: uid, completedByName: '小苔' }}
        onComplete={onComplete}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toBeDisabled();
    expect(row).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/已完成 by 小苔/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(uid))).not.toBeInTheDocument();
    expect(screen.queryByText('逾時')).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('falls back to a deleted-member label when the snapshot name is missing', () => {
    render(
      <TaskRow
        task={{ ...baseTask, completedBy: 'uid_01HZX8R4K7Y9Q2M3N5P6R7S8T9' }}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByText(/已完成 by 已刪除成員/)).toBeInTheDocument();
  });
});
