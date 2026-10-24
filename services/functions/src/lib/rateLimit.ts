import { createHash } from 'node:crypto';
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { AppError } from '@taijian/domain';
import { db, type Tx } from './firestore';

export type RateLimitRule = {
  action: string;
  limit: number;
  windowSeconds: number;
};

/**
 * Applies the reserved counters. Firestore transactions reject reads that
 * happen after a write, so `runCommand` reserves every bucket up front (read and
 * validate) and only calls this once the handler has finished reading.
 */
export type RateLimitReservation = () => void;

type Reservation = {
  rule: RateLimitRule;
  ref: DocumentReference;
  windowStart: number;
  windowMs: number;
  counts: Record<string, number>;
  current: number;
};

export function rateLimitDocId(uid: string, action: string): string {
  const digest = createHash('sha256').update(action).digest('hex').slice(0, 12);
  return `${uid}_${digest}`;
}

export async function reserveRateLimits(
  tx: Tx,
  uid: string,
  rules: RateLimitRule[],
  nowMs: number = Date.now(),
): Promise<RateLimitReservation> {
  const reservations: Reservation[] = await Promise.all(
    rules.map(async (rule) => {
      const windowMs = rule.windowSeconds * 1000;
      const windowStart = nowMs - (nowMs % windowMs);
      const ref = db.collection('rateLimits').doc(rateLimitDocId(uid, rule.action));
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : undefined;
      const counts: Record<string, number> =
        data?.windowStart === windowStart
          ? ((data.counts as Record<string, number> | undefined) ?? {})
          : {};
      const current = counts[rule.action] ?? 0;
      if (current >= rule.limit) {
        throw new AppError('RATE_LIMITED', `too many requests for ${rule.action}`);
      }
      return { rule, ref, windowStart, windowMs, counts, current };
    }),
  );

  return () => {
    for (const { rule, ref, windowStart, windowMs, counts, current } of reservations) {
      tx.set(
        ref,
        {
          windowStart,
          counts: { ...counts, [rule.action]: current + 1 },
          expiresAt: Timestamp.fromMillis(windowStart + windowMs * 2),
        },
        { merge: true },
      );
    }
  };
}

/**
 * Convenience wrapper that reserves and immediately writes a single bucket.
 * Prefer `reserveRateLimits` inside transactions that still need to read
 * afterwards: Firestore rejects reads that follow a write.
 */
export async function checkRateLimit(
  tx: Tx,
  uid: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const commit = await reserveRateLimits(tx, uid, [{ action, limit, windowSeconds }]);
  commit();
}
