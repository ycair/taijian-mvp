import { AppError, parseCommandPayload, type CommandResult } from '@taijian/domain';
import type { UserRecord } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { config } from '../../config';
import { getAuthUserCached, invalidateAuthUser } from '../../lib/authUser';
import { writeAccountAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import { verifiedLineProfile } from '../../line/verify';
import { actorTypeFor, ensureUserDoc } from '../helpers';
import type { HandlerContext } from '../types';

/** Providers that can keep the account usable after LINE is unlinked. */
const FALLBACK_PROVIDERS = new Set(['apple.com', 'google.com']);

type LineMappingData = {
  uid?: string;
  status?: 'active' | 'unlinked' | 'deleted';
};

function hasFallbackProvider(user: UserRecord): boolean {
  return user.providerData.some((provider) => FALLBACK_PROVIDERS.has(provider.providerId));
}

/**
 * The command runner validates the payload before calling a handler; this
 * re-parse keeps the handler type-safe (and well-behaved when invoked directly).
 */
function parseLinkPayload(input: unknown): { idToken: string } {
  try {
    return parseCommandPayload('line.link', input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError('VALIDATION_ERROR', 'invalid payload', { issues: error.issues });
    }
    throw error;
  }
}

export async function linkLine(ctx: HandlerContext): Promise<CommandResult> {
  const payload = parseLinkPayload(ctx.envelope.payload);
  const profile = await verifiedLineProfile(payload.idToken, config.LINE_LOGIN_CHANNEL_ID);

  const ref = db.collection('lineUsers').doc(profile.sub);
  const snap = await ctx.tx.get(ref);
  const existing = snap.data() as LineMappingData | undefined;

  if (existing?.status === 'deleted') {
    throw new AppError('LINE_ALREADY_LINKED', 'this LINE account was deleted');
  }
  // An unlinked mapping may be claimed again by whoever proves control of the
  // LINE account; an active mapping belonging to someone else is off limits.
  if (existing?.status !== 'unlinked' && existing?.uid && existing.uid !== ctx.uid) {
    throw new AppError('LINE_ALREADY_LINKED', 'this LINE account is linked to another user');
  }

  // `lineUsers/{sub}.uid` is canonical, so the mapped profile must exist before
  // the mapping goes live; otherwise the next lineLogin rejects the user.
  await ensureUserDoc(ctx.tx, ctx.uid);

  ctx.tx.set(
    ref,
    {
      uid: ctx.uid,
      status: 'active',
      displayName: profile.name ?? '',
      pictureUrl: profile.picture ?? '',
      // Re-linking keeps the original linkedAt; only a new mapping gets one.
      ...(snap.exists ? {} : { linkedAt: FieldValue.serverTimestamp() }),
      unlinkedAt: FieldValue.delete(),
    },
    { merge: true },
  );
  writeAccountAudit(ctx.tx, ctx.uid, {
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'line.link',
    targetType: 'lineUser',
    targetId: profile.sub,
    before: existing ? { uid: existing.uid ?? null, status: existing.status ?? 'active' } : null,
    after: { uid: ctx.uid, status: 'active' },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { linked: true },
    serverTime: new Date().toISOString(),
  };
}

/**
 * Marks the caller's LINE mappings unlinked instead of deleting them, keeping
 * the UID for audit. The caller must still be able to sign in some other way
 * (Apple or Google), otherwise unlinking would lock them out of their account.
 */
export async function unlinkLine(ctx: HandlerContext): Promise<CommandResult> {
  let authUser = await getAuthUserCached(ctx.uid);
  if (!hasFallbackProvider(authUser)) {
    // The provider lookup is cached for transaction retries; a user who just
    // linked Apple/Google must not be rejected with stale data.
    invalidateAuthUser(ctx.uid);
    authUser = await getAuthUserCached(ctx.uid);
  }
  if (!hasFallbackProvider(authUser)) {
    throw new AppError('FORBIDDEN', 'link another sign-in method before unlinking LINE');
  }

  const mappings = await ctx.tx.get(db.collection('lineUsers').where('uid', '==', ctx.uid));
  const linked = mappings.docs.filter((doc) => {
    const status = (doc.data() as LineMappingData).status ?? 'active';
    return status === 'active';
  });
  if (linked.length === 0) {
    throw new AppError('NOT_FOUND', 'no LINE account is linked to this user');
  }

  for (const mapping of linked) {
    const data = mapping.data() as LineMappingData;
    ctx.tx.set(
      mapping.ref,
      { status: 'unlinked', unlinkedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    writeAccountAudit(ctx.tx, ctx.uid, {
      actorUid: ctx.uid,
      actorType: actorTypeFor(ctx),
      action: 'line.unlink',
      targetType: 'lineUser',
      targetId: mapping.id,
      before: { uid: data.uid ?? ctx.uid, status: data.status ?? 'active' },
      after: { status: 'unlinked' },
      commandId: ctx.envelope.commandId,
      source: ctx.source,
    });
  }

  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    data: { linked: false },
    serverTime: new Date().toISOString(),
  };
}
