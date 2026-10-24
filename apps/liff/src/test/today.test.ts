import { describe, expect, it } from 'vitest';
import { buildTodayTasks, shiftDateKey, taskCompletionWindow } from '../lib/today';

const animal = {
  id: 'a1',
  name: '阿肥',
  avatarColor: '#7C9A76',
  species: '豹紋守宮',
  status: 'active',
  deletedAt: null,
};

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

  it('drops tasks whose animal is archived or soft-deleted', () => {
    const now = new Date('2026-10-24T02:00:00.000Z');
    const due = new Date('2026-10-24T04:00:00.000Z');
    const reminders = [
      {
        id: 'archived',
        animalId: 'a-archived',
        title: '餵食',
        timezone: 'Asia/Taipei',
        nextDueAt: due,
        enabled: true,
      },
      {
        id: 'deleted',
        animalId: 'a-deleted',
        title: '換水',
        timezone: 'Asia/Taipei',
        nextDueAt: due,
        enabled: true,
      },
      {
        id: 'orphan',
        animalId: 'a-missing',
        title: '體重',
        timezone: 'Asia/Taipei',
        nextDueAt: due,
        enabled: true,
      },
      {
        id: 'live',
        animalId: 'a1',
        title: '餵食',
        timezone: 'Asia/Taipei',
        nextDueAt: due,
        enabled: true,
      },
    ];

    const tasks = buildTodayTasks(
      reminders,
      [],
      [
        animal,
        { ...animal, id: 'a-archived', name: '已封存', status: 'archived' },
        { ...animal, id: 'a-deleted', name: '已刪除', deletedAt: new Date() },
      ],
      now,
    );

    expect(tasks.map((task) => task.reminderId)).toEqual(['live']);
    expect(tasks[0]?.animalName).toBe('阿肥');
  });

  it('projects a reminder created by the LiFF editor onto its due day', () => {
    const now = new Date('2026-10-24T02:00:00.000Z'); // 10:00 Taipei
    const tasks = buildTodayTasks(
      [
        {
          id: 'created',
          animalId: 'a1',
          title: '每週換水',
          // Extra schedule/type fields from the reminder document are ignored
          // by the projection; only the due instant and timezone matter.
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T12:00:00.000Z'), // 20:00
          enabled: true,
          deletedAt: null,
        },
      ],
      [],
      [animal],
      now,
    );

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      reminderId: 'created',
      animalName: '阿肥',
      title: '每週換水',
      dueDate: '2026-10-24',
      overdue: false,
    });
  });

  it('carries the completion display-name snapshot', () => {
    const now = new Date('2026-10-24T02:00:00.000Z');
    const tasks = buildTodayTasks(
      [
        {
          id: 'r1',
          animalId: 'a1',
          title: '餵食',
          timezone: 'Asia/Taipei',
          nextDueAt: new Date('2026-10-24T04:00:00.000Z'),
          enabled: true,
        },
      ],
      [
        {
          reminderId: 'r1',
          dueDate: '2026-10-24',
          completedBy: 'uid_01HZX8R4K7Y9Q2M3N5P6R7S8T9',
          completedByName: '小苔',
        },
      ],
      [animal],
      now,
    );

    expect(tasks[0]?.completedByName).toBe('小苔');
    expect(tasks[0]?.completedBy).toBe('uid_01HZX8R4K7Y9Q2M3N5P6R7S8T9');
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
