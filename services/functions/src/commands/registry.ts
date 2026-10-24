import type { HandlerMap } from './types';
import { createHousehold, deleteHousehold, updateHousehold } from './handlers/household';
import { acceptInvite, inviteMember, revokeInvite } from './handlers/invites';
import { leaveHousehold, removeMember, updateMemberRole } from './handlers/members';
import { linkLine, unlinkLine } from './handlers/line';

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
  'line.link': linkLine,
  'line.unlink': unlinkLine,
};
