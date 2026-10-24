// The entrypoint reads the user profile from Firestore, so these cases run
// against the emulator rather than a stubbed reader.
import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminDb, clearFirestore, envelope, readLimitCount, seedUser } from './helpers';
import { handleCommandRequest } from '../../src/commands/execute';
import { rateLimitDocId } from '../../src/lib/rateLimit';

const DELETED_UID = 'u_deleted';
const LIVE_UID = 'u_live';
const NEW_UID = 'u_new';

beforeEach(async () => {
  await clearFirestore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Pins the global command bucket at the limit for the current window. */
async function exhaustCommandBudget(uid: string): Promise<void> {
  const now = Date.now();
  const windowMs = 60_000;
  await adminDb
    .collection('rateLimits')
    .doc(rateLimitDocId(uid, 'command'))
    .set({
      windowStart: now - (now % windowMs),
      counts: { command: 100 },
      expiresAt: Timestamp.fromMillis(now + windowMs * 2),
    });
}

describe('handleCommandRequest tombstone check', () => {
  it('rejects a valid command from a tombstoned account before charging or running it', async () => {
    await seedUser(DELETED_UID);
    await adminDb
      .collection('users')
      .doc(DELETED_UID)
      .set({ deletedAt: Timestamp.now() }, { merge: true });

    const result = await handleCommandRequest(
      DELETED_UID,
      envelope('household.create', { name: '家' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHENTICATED');

    // The command layer was never reached: no replay record, no rate-limit charge.
    expect((await adminDb.collection('commands').get()).empty).toBe(true);
    expect((await adminDb.collection('rateLimits').get()).empty).toBe(true);
  });

  it('runs a command for a live profile', async () => {
    await seedUser(LIVE_UID);

    const result = await handleCommandRequest(
      LIVE_UID,
      envelope('household.create', { name: '家' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const householdId = (result.data as { householdId: string }).householdId;
      expect((await adminDb.collection('households').doc(householdId).get()).exists).toBe(true);
    }
  });

  it('charges the global bucket before returning VALIDATION_ERROR', async () => {
    await seedUser(LIVE_UID);

    const result = await handleCommandRequest(LIVE_UID, { type: 'animal.create' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(await readLimitCount(LIVE_UID, 'command')).toBe(1);
  });

  it('does not call LINE when the line.link budget is exhausted', async () => {
    await seedUser(LIVE_UID);
    await exhaustCommandBudget(LIVE_UID);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await handleCommandRequest(
      LIVE_UID,
      envelope('line.link', { idToken: 'id-token' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('RATE_LIMITED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('lets an unprovisioned profile through to the command layer', async () => {
    // No `users/{uid}` document at all (Apple/Google sign-in before provisioning).
    const result = await handleCommandRequest(NEW_UID, envelope('unknown.command', {}));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });
});
