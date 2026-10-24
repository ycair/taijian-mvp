import type { HandlerMap } from './types';
import { archiveAnimal, createAnimal, deleteAnimal, updateAnimal } from './handlers/animals';
import { createHousehold, deleteHousehold, updateHousehold } from './handlers/household';
import { acceptInvite, inviteMember, revokeInvite } from './handlers/invites';
import { leaveHousehold, removeMember, updateMemberRole } from './handlers/members';
import { linkLine, unlinkLine } from './handlers/line';
import { createRecord, deleteRecord, updateRecord } from './handlers/records';
import { createReminder, deleteReminder, updateReminder } from './handlers/reminders';
import { completeTask, uncompleteTask } from './handlers/tasks';

export const commandHandlers: HandlerMap = {
  'household.create': createHousehold,
  'household.update': updateHousehold,
  'household.delete': deleteHousehold,
  'member.invite': inviteMember,
  'member.accept': acceptInvite,
  'member.revokeInvite': revokeInvite,
  'member.remove': removeMember,
  'member.updateRole': updateMemberRole,
  'member.leave': leaveHousehold,
  'animal.create': createAnimal,
  'animal.update': updateAnimal,
  'animal.archive': archiveAnimal,
  'animal.delete': deleteAnimal,
  'record.create': createRecord,
  'record.update': updateRecord,
  'record.delete': deleteRecord,
  'reminder.create': createReminder,
  'reminder.update': updateReminder,
  'reminder.delete': deleteReminder,
  'task.complete': completeTask,
  'task.uncomplete': uncompleteTask,
  'line.link': linkLine,
  'line.unlink': unlinkLine,
};
