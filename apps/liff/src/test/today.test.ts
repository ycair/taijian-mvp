import { describe, expect, it } from 'vitest';
import { buildTodayTasks, shiftDateKey, taskCompletionWindow } from '../lib/today';

const animal = { id: 'a1', name: '阿肥', avatarColor: '#7C9A76', species: '豹紋守宮' };

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
      [animal],
      now,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.reminderId).toBe('r1');
    expect(tasks[0]?.overdue).toBe(true);
    expect(tasks[0]?.timezone).toBe('Asia/Taipei');
    expect(tasks[1]?.completedBy).toBe('bob');
  });

  it('groups by the reminder timezone even when the UTC day differs', () => {
    // 22:00 UTC on 10-24 is 06:00 on 10-25 in Taipei; the reminder at 20:00 UTC
    // is 04:00 on 10-25, so both belong to the Taipei day 2026-10-25.
    const now = new Date('2026-10-24T22:00:00.000Z');
    const tasks = buildTodayTasks(
      [
        {
          id: 'late',
          animalId: 'a1',
          title: '夜間補水',
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T20:00:00.000Z'),
          enabled: true,
        },
      ],
      [{ reminderId: 'late', dueDate: '2026-10-25', completedBy: 'carol' }],
      [animal],
      now,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.dueDate).toBe('2026-10-25');
    expect(tasks[0]?.completedBy).toBe('carol');
    expect(tasks[0]?.overdue).toBe(true);
  });

  it('drops disabled and soft-deleted reminders', () => {
    const now = new Date('2026-10-24T02:00:00.000Z');
    const due = new Date('2026-10-24T04:00:00.000Z');
    const tasks = buildTodayTasks(
      [
        {
          id: 'off',
          animalId: 'a1',
          title: '停用',
          timezone: 'Asia/Taipei',
          nextDueAt: due,
          enabled: false,
        },
        {
          id: 'deleted',
          animalId: 'a1',
          title: '已刪除',
          timezone: 'Asia/Taipei',
          nextDueAt: due,
          enabled: true,
          deletedAt: new Date('2026-10-23T00:00:00.000Z'),
        },
        {
          id: 'live',
          animalId: 'a1',
          title: '餵食',
          timezone: 'Asia/Taipei',
          nextDueAt: due,
          enabled: true,
          deletedAt: null,
        },
      ],
      [],
      [animal],
      now,
    );

    expect(tasks.map((task) => task.reminderId)).toEqual(['live']);
  });
});

describe('shiftDateKey', () => {
  it('moves across month and year boundaries', () => {
    expect(shiftDateKey('2026-10-24', -1)).toBe('2026-10-23');
    expect(shiftDateKey('2026-10-24', 1)).toBe('2026-10-25');
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('taskCompletionWindow', () => {
  it('brackets today in the household timezone', () => {
    const window = taskCompletionWindow(new Date('2026-10-24T22:00:00.000Z'), 'Asia/Taipei');
    expect(window).toEqual({ today: '2026-10-25', from: '2026-10-24', to: '2026-10-26' });
  });
});
