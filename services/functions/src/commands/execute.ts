import { onCall } from 'firebase-functions/v2/https';
import { CommandEnvelopeSchema, type CommandResult } from '@taijian/domain';
import { config } from '../config';
import { db } from '../lib/firestore';
import { toFailure } from '../lib/result';
import { commandHandlers } from './registry';
import { runCommand } from './runCommand';

/** Only the fields the entrypoint needs; the profile has many more. */
export type UserProfile = { deletedAt?: unknown };

export type ProfileReader = (uid: string) => Promise<UserProfile | undefined>;

export type CommandRequestDeps = {
  /** Reads `users/{uid}`. Missing profiles are allowed (Apple/Google pre-provisioning). */
  readProfile?: ProfileReader;
  /** Test seam; production always runs the real command runner. */
  runCommand?: typeof runCommand;
};

/**
 * The profile is the account tombstone: `deleteAccount` keeps the document but
 * stamps `deletedAt`, so a still-valid ID token cannot keep writing data after
 * the account was deleted. A missing document is not an error: users who signed
 * in with Apple/Google have not necessarily provisioned a profile yet.
 */
async function readUserProfile(uid: string): Promise<UserProfile | undefined> {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? (snap.data() as UserProfile) : undefined;
}

function failure(
  commandId: string,
  code: 'UNAUTHENTICATED' | 'VALIDATION_ERROR',
  message: string,
  serverTime: string,
): CommandResult {
  return { ok: false, commandId, code, message, serverTime };
}

/**
 * Shared entrypoint for every callable/bot command. Validation, authentication,
 * and the account tombstone are checked here; everything else (idempotency,
 * rate limits, transactions) lives in `runCommand`.
 */
export async function handleCommandRequest(
  authUid: string | undefined,
  data: unknown,
  deps: CommandRequestDeps = {},
): Promise<CommandResult> {
  const serverTime = new Date().toISOString();
  if (!authUid) {
    return failure('unknown', 'UNAUTHENTICATED', 'Sign in required', serverTime);
  }

  const parsed = CommandEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    return failure('unknown', 'VALIDATION_ERROR', parsed.error.message, serverTime);
  }

  const { commandId } = parsed.data;
  try {
    const readProfile = deps.readProfile ?? readUserProfile;
    const profile = await readProfile(authUid);
    if (profile?.deletedAt != null) {
      return failure(commandId, 'UNAUTHENTICATED', 'Account deleted', serverTime);
    }

    const run = deps.runCommand ?? runCommand;
    return await run({
      uid: authUid,
      envelope: parsed.data,
      source: parsed.data.client.platform,
      handlers: commandHandlers,
    });
  } catch (error) {
    return toFailure(error, commandId);
  }
}

export const executeCommand = onCall(
  { region: 'asia-east1', enforceAppCheck: config.ENFORCE_APP_CHECK },
  (request) => handleCommandRequest(request.auth?.uid, request.data),
);
