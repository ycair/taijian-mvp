import { createHash } from 'node:crypto';
import { AppError } from '@taijian/domain';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firestore';

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_IP_WINDOW_MS = 60_000;

/** Raw IPs are never stored; the document id is a SHA-256 digest. */
export function loginIpKey(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

/**
 * Fixed-window per-IP limit for the public `lineLogin` callable. The counter
 * lives in its own transaction so a rejected attempt still aborts before the
 * LINE verification call, and concurrent attempts cannot overshoot the window.
 */
export async function checkLoginRateLimit(ip: string, now = new Date()): Promise<void> {
  const ref = db.collection('loginRateLimits').doc(loginIpKey(ip));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { count?: number; windowStart?: Timestamp } | undefined;
    const startMs = data?.windowStart?.toMillis() ?? 0;
    const windowExpired = now.getTime() - startMs >= LOGIN_IP_WINDOW_MS;
    const count = windowExpired ? 0 : (data?.count ?? 0);

    if (count >= LOGIN_IP_LIMIT) {
      throw new AppError('RATE_LIMITED', 'too many login attempts');
    }

    const windowStartMs = windowExpired ? now.getTime() : startMs;
    tx.set(ref, {
      count: count + 1,
      windowStart: Timestamp.fromMillis(windowStartMs),
      expiresAt: Timestamp.fromMillis(windowStartMs + LOGIN_IP_WINDOW_MS),
    });
  });
}
