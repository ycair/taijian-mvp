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

export type AccountAuditInput = Omit<AuditInput, 'householdId'>;

function auditEntry(input: Record<string, unknown>): Record<string, unknown> {
  return {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Household-scoped audit trail: `households/{id}/auditLogs`. */
export function writeAudit(tx: Tx, input: AuditInput): void {
  const ref = db.collection('households').doc(input.householdId).collection('auditLogs').doc();
  tx.set(ref, auditEntry(input));
}

/**
 * Account-scoped audit trail: `users/{uid}/auditLogs`. Used by commands that
 * act on the account rather than on a household (LINE linking, unlinking).
 */
export function writeAccountAudit(tx: Tx, uid: string, input: AccountAuditInput): void {
  const ref = db.collection('users').doc(uid).collection('auditLogs').doc();
  tx.set(ref, auditEntry({ ...input, uid }));
}
