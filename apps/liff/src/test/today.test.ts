import { describe, expect, it } from 'vitest';
import { buildTodayTasks } from '../lib/today';

describe('buildTodayTasks', () => {
  it('marks an overdue reminder and attaches completion', () => {
    const now = new Date('2026-10-24T02:00:00.000Z'); // 10:00 Taipei
    const tasks = buildTodayTasks(
      [
        {
          id: 'r1',
          animalId: 'a1',
          title: '餵食',
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T00:00:00.000Z'), // 08:00
          enabled: true,
        },
        {
          id: 'r2',
          animalId: 'a1',
          title: '換水',
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T04:00:00.000Z'), // 12:00
          enabled: true,
        },
      ],
      [{ reminderId: 'r2', dueDate: '2026-10-24', completedBy: 'bob' }],
      [{ id: 'a1', name: '阿肥', avatarColor: '#7C9A76', species: '豹紋守宮' }],
      now,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.reminderId).toBe('r1');
    expect(tasks[0]?.overdue).toBe(true);
    expect(tasks[1]?.completedBy).toBe('bob');
  });
});
