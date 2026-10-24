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
 * Bot traffic has its own, tighter budget than the command API. One bucket
 * covers every attributable bot interaction — reads, writes, and early-exit
 * replies alike — so the 30 interactions/minute/UID limit holds for the whole
 * chatbot rather than only for commands that reach the runner.
 */
export const BOT_INTERACTION_ACTION = 'bot';
export const BOT_INTERACTION_LIMIT = 30;
export const BOT_INTERACTION_WINDOW_SECONDS = 60;

export function botRateLimitRules(): RateLimitRule[] {
  return [
    {
      action: BOT_INTERACTION_ACTION,
      limit: BOT_INTERACTION_LIMIT,
      windowSeconds: BOT_INTERACTION_WINDOW_SECONDS,
    },
  ];
}

/**
 * Applies the reserved counters. Firestore transactions reject reads that
 * happen after a write, so the reserve step reads and validates every bucket
 * before any counter is written back.
 */
export type RateLimitReservation = () => void;

type Reservation = {
  rule: RateLimitRule;
  ref: DocumentReference;
  windowStart: number;
  windowMs: number;
  counts: Record<string, number>;
  current: number;
  freshWindow: boolean;
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
      // A fresh window never inherits counters from the previous window.
      const freshWindow = data?.windowStart !== windowStart;
      const counts = freshWindow
        ? {}
        : ((data?.counts as Record<string, number> | undefined) ?? {});
      const current = counts[rule.action] ?? 0;
      if (current >= rule.limit) {
        throw new AppError('RATE_LIMITED', `too many requests for ${rule.action}`);
      }
      return { rule, ref, windowStart, windowMs, counts, current, freshWindow };
    }),
  );

  return () => {
    for (const { rule, ref, windowStart, windowMs, counts, current, freshWindow } of reservations) {
      const patch = {
        windowStart,
        counts: { ...counts, [rule.action]: current + 1 },
        expiresAt: Timestamp.fromMillis(windowStart + windowMs * 2),
      };
      if (freshWindow) {
        // Replace the document so stale counters cannot survive the rollover.
        tx.set(ref, patch);
      } else {
        tx.set(ref, patch, { merge: true });
      }
    }
  };
}

/**
 * Charges a set of buckets in their own transaction, so a rejected or failed
 * request still consumes budget. Callers with a transaction that must read
 * afterwards use {@link reserveRateLimits} directly instead.
 */
export async function consumeRateLimits(uid: string, rules: RateLimitRule[]): Promise<void> {
  await db.runTransaction(async (tx) => {
    const commit = await reserveRateLimits(tx, uid, rules);
    commit();
  });
}

/**
 * Read-only budget check for work that must not start when the caller's bucket
 * is already exhausted (for example an outbound LINE token exchange). The real
 * charge still happens when the command is admitted, so a successful request is
 * charged exactly once.
 */
export async function assertRateLimitAvailable(
  uid: string,
  rules: RateLimitRule[],
  nowMs: number = Date.now(),
): Promise<void> {
  for (const rule of rules) {
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = nowMs - (nowMs % windowMs);
    const snap = await db.collection('rateLimits').doc(rateLimitDocId(uid, rule.action)).get();
    if (!snap.exists) continue;
    const data = snap.data() as
      { windowStart?: number; counts?: Record<string, number> } | undefined;
    // A stale window belongs to a previous period and never blocks. The stored
    // `windowStart` is a millisecond number (see `reserveRateLimits`).
    if (data?.windowStart !== windowStart) continue;
    const current = data?.counts?.[rule.action] ?? 0;
    if (current >= rule.limit) {
      throw new AppError('RATE_LIMITED', `too many requests for ${rule.action}`);
    }
  }
}

/**
 * Convenience wrapper that reserves and immediately writes a single bucket.
 * Prefer `reserveRateLimits` inside transactions that still need to read
 * afterwards: Firestore rejects reads that follow a write.
 *
 * Command handlers must never call this; rate limiting belongs to `runCommand`.
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
