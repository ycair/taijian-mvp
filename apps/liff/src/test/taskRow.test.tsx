import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskRow } from '../components/TaskRow';

describe('TaskRow', () => {
  it('shows the animal name and completion state', () => {
    render(
      <TaskRow
        task={{
          reminderId: 'r1',
          animalId: 'a1',
          animalName: '阿肥',
          title: '餵食',
          dueDate: '2026-10-24',
          dueAt: new Date('2026-10-24T00:00:00.000Z'),
          overdue: true,
        }}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/阿肥/)).toBeInTheDocument();
    expect(screen.getByText(/餵食/)).toBeInTheDocument();
    expect(screen.getByText('逾時')).toBeInTheDocument();
  });
});
