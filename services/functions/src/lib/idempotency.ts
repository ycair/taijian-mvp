import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CommandResult } from '@taijian/domain';
import { AppError } from '@taijian/domain';
import { db, type Tx } from './firestore';

export async function getReplay(
  tx: Tx,
  commandId: string,
  hash: string,
): Promise<CommandResult | null> {
  const snap = await tx.get(db.collection('commands').doc(commandId));
  if (!snap.exists) return null;
  const data = snap.data();
  if (data?.requestHash !== hash) {
    throw new AppError('IDEMPOTENCY_MISMATCH', 'commandId reused with different payload');
  }
  return data.response as CommandResult;
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
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
  });
}
