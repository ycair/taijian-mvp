import { FieldValue } from 'firebase-admin/firestore';
import type { CommandResult } from '@taijian/domain';
import { writeAccountAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import { actorTypeFor, ensureUserDoc, success } from '../helpers';
import type { HandlerContext } from '../types';

type ProfilePatch = {
  displayName?: string;
  avatarUrl?: string;
  locale?: string;
  timezone?: string;
};

/**
 * Updates the caller's own profile. The command writes only the account
 * document: membership display names are snapshots and are not rewritten, so a
 * rename cannot fan out to an unbounded number of member documents.
 *
 * The profile is read first (`ensureUserDoc`) so this works for an account that
 * exists only in Firebase Auth, and so the transaction never writes before it
 * reads.
 */
export async function updateProfile(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as ProfilePatch;
  await ensureUserDoc(ctx.tx, ctx.uid);

  const patch: Record<string, unknown> = {
    ...payload,
    updatedAt: FieldValue.serverTimestamp(),
  };
  ctx.tx.set(db.collection('users').doc(ctx.uid), patch, { merge: true });

  writeAccountAudit(ctx.tx, ctx.uid, {
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'user.updateProfile',
    targetType: 'user',
    targetId: ctx.uid,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { updated: true });
}
