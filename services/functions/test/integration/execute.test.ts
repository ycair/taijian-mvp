// The entrypoint reads the user profile from Firestore, so these cases run
// against the emulator rather than a stubbed reader.
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { adminDb, clearFirestore, envelope, seedUser } from './helpers';
import { handleCommandRequest } from '../../src/commands/execute';

const DELETED_UID = 'u_deleted';
const LIVE_UID = 'u_live';
const NEW_UID = 'u_new';

beforeEach(async () => {
  await clearFirestore();
});

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

  it('lets an unprovisioned profile through to the command layer', async () => {
    // No `users/{uid}` document at all (Apple/Google sign-in before provisioning).
    const result = await handleCommandRequest(NEW_UID, envelope('unknown.command', {}));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });
});
