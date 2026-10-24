import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import type { CommandResult } from '@taijian/domain';
import { AppError } from '@taijian/domain';
import { db, type Tx } from './firestore';

export const COMMAND_TTL_MS = 24 * 60 * 60 * 1000;

type StoredCommand = {
  uid?: string;
  requestHash?: string;
  response?: CommandResult;
  expiresAt?: Timestamp;
};

function replayFrom(
  data: DocumentData | undefined,
  uid: string,
  hash: string,
  nowMs: number,
): CommandResult | null {
  if (!data) return null;
  const stored = data as StoredCommand;
  if (stored.expiresAt && stored.expiresAt.toMillis() < nowMs) return null;
  if (stored.uid !== uid || stored.requestHash !== hash) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'commandId reused with different payload or user');
  }
  return stored.response as CommandResult;
}

export async function getReplay(
  tx: Tx,
  uid: string,
  commandId: string,
  hash: string,
  nowMs: number = Date.now(),
): Promise<CommandResult | null> {
  const snap = await tx.get(db.collection('commands').doc(commandId));
  return replayFrom(snap.exists ? snap.data() : undefined, uid, hash, nowMs);
}

/**
 * Replay lookup outside a transaction, used to skip rate limiting for retries.
 * The command transaction still calls `getReplay` to stay race-free.
 */
export async function peekReplay(
  uid: string,
  commandId: string,
  hash: string,
  nowMs: number = Date.now(),
): Promise<CommandResult | null> {
  const snap = await db.collection('commands').doc(commandId).get();
  return replayFrom(snap.exists ? snap.data() : undefined, uid, hash, nowMs);
}

export function saveCommand(
  tx: Tx,
  commandId: string,
  uid: string,
  type: string,
  hash: string,
  response: CommandResult,
): void {
  tx.set(db.collection('commands').doc(commandId), {
    uid,
    type,
    requestHash: hash,
    response,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + COMMAND_TTL_MS),
  });
}
