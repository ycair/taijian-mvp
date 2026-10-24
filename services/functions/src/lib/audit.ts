import { FieldValue } from 'firebase-admin/firestore';
import { db, type Tx } from './firestore';

export type AuditInput = {
  householdId: string;
  actorUid: string;
  actorType: 'user' | 'bot' | 'system';
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  commandId: string;
  source: string;
};

export function writeAudit(tx: Tx, input: AuditInput): void {
  const ref = db.collection('households').doc(input.householdId).collection('auditLogs').doc();
  tx.set(ref, {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  });
}
