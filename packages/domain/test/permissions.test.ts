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

  it('does not let caretakers archive animals', () => {
    expect(can('caretaker', 'animal.archive')).toBe(false);
    expect(can('owner', 'animal.archive')).toBe(true);
  });

  it('does not let caretakers remove members', () => {
    expect(can('caretaker', 'member.remove')).toBe(false);
    expect(can('owner', 'member.remove')).toBe(true);
  });

  it('does not let caretakers change member roles', () => {
    expect(can('caretaker', 'member.updateRole')).toBe(false);
    expect(can('owner', 'member.updateRole')).toBe(true);
  });

  it('lets only owners revoke invites', () => {
    expect(can('owner', 'member.revokeInvite')).toBe(true);
    expect(can('caretaker', 'member.revokeInvite')).toBe(false);
  });
});
