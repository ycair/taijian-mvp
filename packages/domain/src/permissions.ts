export const ROLES = ['owner', 'caretaker'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  'household.update',
  'household.delete',
  'member.invite',
  'member.remove',
  'member.updateRole',
  'animal.create',
  'animal.update',
  'animal.archive',
  'animal.delete',
  'record.create',
  'record.update',
  'record.delete',
  'reminder.manage',
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, readonly Action[]> = {
  owner: [...ACTIONS],
  caretaker: [
    'animal.create',
    'animal.update',
    'record.create',
    'record.update',
    'record.delete',
    'reminder.manage',
  ],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].includes(action);
}
