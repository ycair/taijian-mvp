import { onCall } from 'firebase-functions/v2/https';
import {
  AppError,
  CommandEnvelopeSchema,
  LINE_ID_TOKEN_MAX_LENGTH,
  type CommandResult,
} from '@taijian/domain';
import { config } from '../config';
import { db } from '../lib/firestore';
import { toFailure } from '../lib/result';
import { verifiedLineProfile, type LineProfile } from '../line/verify';
import { commandHandlers } from './registry';
import { assertCommandBudget, chargeInvalidCommand, runCommand } from './runCommand';

/** Only the fields the entrypoint needs; the profile has many more. */
export type UserProfile = { deletedAt?: unknown };

export type ProfileReader = (uid: string) => Promise<UserProfile | undefined>;
export type LineVerifier = (idToken: string, channelId: string) => Promise<LineProfile>;

export type CommandRequestDeps = {
  /** Reads `users/{uid}`. Missing profiles are allowed (Apple/Google pre-provisioning). */
  readProfile?: ProfileReader;
  /** Test seam; production always runs the real command runner. */
  runCommand?: typeof runCommand;
  /** Test seam for the invalid-envelope charge; production uses the real bucket. */
  chargeInvalidCommand?: (uid: string) => Promise<void>;
  /** Test seam for the LINE token exchange done before the transaction. */
  verifyLineProfile?: LineVerifier;
  /** Test seam for the pre-verify budget check. */
  assertCommandBudget?: (uid: string) => Promise<void>;
};

/** Only the server sets `bot`: it is how bot traffic is attributed and audited. */
const SERVER_ONLY_PLATFORMS = new Set(['bot']);

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
  code: 'UNAUTHENTICATED' | 'VALIDATION_ERROR' | 'RATE_LIMITED',
  message: string,
  serverTime: string,
): CommandResult {
  return { ok: false, commandId, code, message, serverTime };
}

/**
 * Every request that reaches the command layer costs budget, including ones
 * rejected before the runner (malformed envelope, server-only platform). The
 * charge happens first so a caller cannot probe validation for free.
 */
async function chargeOrRateLimit(
  uid: string,
  commandId: string,
  charge: (uid: string) => Promise<void>,
  serverTime: string,
): Promise<CommandResult | null> {
  try {
    await charge(uid);
    return null;
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') {
      return failure(commandId, 'RATE_LIMITED', error.message, serverTime);
    }
    throw error;
  }
}

/**
 * `line.link` exchanges an ID token with LINE. That HTTP call belongs before the
 * Firestore transaction, never inside it: a retried transaction must not repeat
 * the exchange (or worse, hold a transaction open on a network call). The
 * payload schema still validates the shape; a missing/short token falls through
 * to the runner so the caller gets the normal VALIDATION_ERROR.
 */
async function preflightLineProfile(
  type: string,
  payload: unknown,
  verify: LineVerifier,
): Promise<LineProfile | undefined> {
  if (type !== 'line.link') return undefined;
  const idToken = (payload as { idToken?: unknown } | null)?.idToken;
  if (
    typeof idToken !== 'string' ||
    idToken.length === 0 ||
    idToken.length > LINE_ID_TOKEN_MAX_LENGTH
  ) {
    return undefined;
  }
  return verify(idToken, config.LINE_LOGIN_CHANNEL_ID);
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

  const charge = deps.chargeInvalidCommand ?? chargeInvalidCommand;
  const parsed = CommandEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    const limited = await chargeOrRateLimit(authUid, 'unknown', charge, serverTime);
    if (limited) return limited;
    return failure('unknown', 'VALIDATION_ERROR', parsed.error.message, serverTime);
  }

  const { commandId } = parsed.data;
  if (SERVER_ONLY_PLATFORMS.has(parsed.data.client.platform)) {
    const limited = await chargeOrRateLimit(authUid, commandId, charge, serverTime);
    if (limited) return limited;
    return failure(
      commandId,
      'VALIDATION_ERROR',
      'client.platform is set by the server',
      serverTime,
    );
  }

  try {
    const readProfile = deps.readProfile ?? readUserProfile;
    const profile = await readProfile(authUid);
    if (profile?.deletedAt != null) {
      return failure(commandId, 'UNAUTHENTICATED', 'Account deleted', serverTime);
    }

    let lineProfile: LineProfile | undefined;
    // Budget first: an exhausted caller must not reach LINE's verify endpoint at
    // all. The normal charge happens in `runCommand` once admitted.
    if (parsed.data.type === 'line.link') {
      await (deps.assertCommandBudget ?? assertCommandBudget)(authUid);
    }
    try {
      lineProfile = await preflightLineProfile(
        parsed.data.type,
        parsed.data.payload,
        deps.verifyLineProfile ?? verifiedLineProfile,
      );
    } catch (error) {
      // A rejected token is invalid input too; charge before surfacing it so
      // `line.link` cannot be used to hammer LINE's verification endpoint for
      // free (the command runner is never reached on this path).
      const limited = await chargeOrRateLimit(authUid, commandId, charge, serverTime);
      if (limited) return limited;
      throw error;
    }

    const run = deps.runCommand ?? runCommand;
    return await run({
      uid: authUid,
      envelope: parsed.data,
      source: parsed.data.client.platform,
      handlers: commandHandlers,
      ...(lineProfile !== undefined ? { lineProfile } : {}),
    });
  } catch (error) {
    return toFailure(error, commandId);
  }
}

export const executeCommand = onCall(
  { region: 'asia-east1', enforceAppCheck: config.ENFORCE_APP_CHECK },
  (request) => handleCommandRequest(request.auth?.uid, request.data),
);
