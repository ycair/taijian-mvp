import { describe, expect, it } from 'vitest';
import { can } from '../src/permissions';

describe('permissions', () => {
  it('lets owners delete animals', () => {
    expect(can('owner', 'animal.delete')).toBe(true);
  });

  it('does not let caretakers delete animals', () => {
    expect(can('caretaker', 'animal.delete')).toBe(false);
  });

  it('lets caretakers create records', () => {
    expect(can('caretaker', 'record.create')).toBe(true);
  });

  it('lets only owners manage members', () => {
    expect(can('owner', 'member.invite')).toBe(true);
    expect(can('caretaker', 'member.invite')).toBe(false);
  });
});
