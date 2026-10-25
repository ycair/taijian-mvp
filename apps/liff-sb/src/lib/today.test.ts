import { describe, expect, it } from 'vitest';
import { buildTodayTasks } from './today';
import type { Animal, Reminder } from './types';

const animal: Animal = {
  id: 'a1',
  household_id: 'h1',
  name: '阿肥',
  species: 'leopard-gecko',
  species_label: '豹紋守宮',
  avatar_color: '#7C9A76',
  sex: 'unknown',
  notes: null,
  status: 'active',
};

const reminder: Reminder = {
  id: 'r1',
  household_id: 'h1',
  animal_id: 'a1',
  title: '餵食',
  type: 'feeding',
  schedule: { kind: 'daily', times: ['08:30'] },
  timezone: 'Asia/Taipei',
  enabled: true,
  next_due_at: null,
};

describe('buildTodayTasks', () => {
  it('builds a daily task and attaches the completer name', () => {
    const now = new Date('2026-10-25T00:00:00.000Z'); // 08:00 Taipei
    const tasks = buildTodayTasks(
      [reminder],
      [{ reminder_id: 'r1', due_date: '2026-10-25', completed_by: 'u1', completed_by_name: 'Test A' }],
      [animal],
      now,
      'Asia/Taipei',
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.animalName).toBe('阿肥');
    expect(tasks[0]?.completedByName).toBe('Test A');
  });

  it('drops tasks for archived animals', () => {
    const tasks = buildTodayTasks([reminder], [], [{ ...animal, status: 'archived' }], new Date(), 'Asia/Taipei');
    expect(tasks).toHaveLength(0);
  });
});
