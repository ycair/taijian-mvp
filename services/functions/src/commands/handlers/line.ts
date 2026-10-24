import { AppError, type CommandResult } from '@taijian/domain';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../../config';
import { db } from '../../lib/firestore';
import { verifyLineIdToken } from '../../line/verify';
import type { HandlerContext } from '../types';

/** Providers that can keep the account usable after LINE is unlinked. */
const FALLBACK_PROVIDERS = new Set(['apple.com', 'google.com']);

export async function linkLine(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as { idToken?: string };
  if (!payload.idToken) throw new AppError('VALIDATION_ERROR', 'idToken is required');

  const profile = await verifyLineIdToken(payload.idToken, config.LINE_LOGIN_CHANNEL_ID);

  const ref = db.collection('lineUsers').doc(profile.sub);
  const snap = await ctx.tx.get(ref);
  const existing = snap.data() as { uid?: string } | undefined;
  if (existing?.uid && existing.uid !== ctx.uid) {
    throw new AppError('LINE_ALREADY_LINKED', 'this LINE account is linked to another user');
  }

  ctx.tx.set(
    ref,
    {
      uid: ctx.uid,
      displayName: profile.name ?? '',
      pictureUrl: profile.picture ?? '',
      linkedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { linked: true },
    serverTime: new Date().toISOString(),
  };
}

/**
 * Removes the caller's LINE mapping. The caller must still be able to sign in
 * some other way (Apple or Google), otherwise unlinking would lock them out of
 * their own account.
 */
export async function unlinkLine(ctx: HandlerContext): Promise<CommandResult> {
  const authUser = await getAuth().getUser(ctx.uid);
  const hasFallback = authUser.providerData.some((provider) =>
    FALLBACK_PROVIDERS.has(provider.providerId),
  );
  if (!hasFallback) {
    throw new AppError('FORBIDDEN', 'link another sign-in method before unlinking LINE');
  }

  // Read inside the transaction so a concurrent link cannot slip past the
  // delete and leave an orphaned mapping behind.
  const mappings = await ctx.tx.get(db.collection('lineUsers').where('uid', '==', ctx.uid));
  if (mappings.empty) {
    throw new AppError('NOT_FOUND', 'no LINE account is linked to this user');
  }
  for (const mapping of mappings.docs) {
    ctx.tx.delete(mapping.ref);
  }

  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { linked: false },
    serverTime: new Date().toISOString(),
  };
}
