// Retention purge runs against real Firestore semantics (batches, range
// filters, subcollections), so it is verified on the emulator.
import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { RETENTION_MS, runPurgeDeleted } from '../../src/maintenance/purge';
import { adminDb, clearFirestore } from './helpers';

const NOW = new Date('2026-10-24T03:30:00.000Z');
const OLD = new Date(NOW.getTime() - RETENTION_MS - 86_400_000);
const RECENT = new Date(NOW.getTime() - 1_000);

function at(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}

beforeEach(async () => {
  await clearFirestore();
});

describe('runPurgeDeleted cleanupPending tails', () => {
  it('finishes a tail larger than the 200-record cascade bound and clears the flag', async () => {
    await adminDb
      .collection('animals')
      .doc('a_big')
      .set({
        householdId: 'h1',
        name: '阿肥',
        status: 'archived',
        deletedAt: at(RECENT),
        cleanupPending: true,
      });

    // 250 live records: more than `cascadeAnimalChildren` could ever reach.
    const seed = adminDb.batch();
    for (let index = 0; index < 250; index += 1) {
      seed.set(adminDb.collection('records').doc(`r${index}`), {
        householdId: 'h1',
        animalId: 'a_big',
        type: 'feeding',
        deletedAt: null,
      });
    }
    await seed.commit();

    const summary = await runPurgeDeleted({ now: NOW });

    expect(summary.tailsFinished).toBe(1);
    expect(summary.tailsPending).toBe(0);

    const records = await adminDb.collection('records').where('animalId', '==', 'a_big').get();
    expect(records.size).toBe(250);
    for (const record of records.docs) {
      expect(record.data().deletedAt).toBeInstanceOf(Timestamp);
      expect(record.data().deletedWithAnimal).toBe('a_big');
    }

    const animal = (await adminDb.collection('animals').doc('a_big').get()).data();
    expect(animal?.cleanupPending).toBe(false);
    // The animal is not past retention yet, so it stays for the 30-day sweep.
    expect(animal).toBeDefined();
  });

  it('leaves a live animal flagged inside the window alone', async () => {
    await adminDb
      .collection('animals')
      .doc('a_live')
      .set({ householdId: 'h1', status: 'active', deletedAt: null, cleanupPending: true });
    await adminDb
      .collection('records')
      .doc('r_live')
      .set({ householdId: 'h1', animalId: 'a_live', deletedAt: null });

    await runPurgeDeleted({ now: NOW });

    expect((await adminDb.collection('records').doc('r_live').get()).data()?.deletedAt).toBeNull();
    expect((await adminDb.collection('animals').doc('a_live').get()).data()?.cleanupPending).toBe(
      true,
    );
  });
});

describe('runPurgeDeleted retention sweep', () => {
  it('hard-deletes soft-deleted documents past retention and keeps live ones', async () => {
    await adminDb
      .collection('records')
      .doc('old')
      .set({ householdId: 'h1', animalId: 'a1', deletedAt: at(OLD) });
    await adminDb
      .collection('records')
      .doc('live')
      .set({ householdId: 'h1', animalId: 'a1', deletedAt: null });
    await adminDb
      .collection('reminders')
      .doc('old')
      .set({ householdId: 'h1', animalId: 'a1', deletedAt: at(OLD) });
    await adminDb
      .collection('taskCompletions')
      .doc('old')
      .set({ householdId: 'h1', reminderId: 'r1', deletedAt: at(OLD) });
    await adminDb
      .collection('animals')
      .doc('old')
      .set({ householdId: 'h1', status: 'archived', deletedAt: at(OLD), cleanupPending: false });

    const summary = await runPurgeDeleted({ now: NOW });

    expect(summary.records).toBe(1);
    expect(summary.reminders).toBe(1);
    expect(summary.completions).toBe(1);
    expect(summary.animals).toBe(1);

    expect((await adminDb.collection('records').doc('old').get()).exists).toBe(false);
    expect((await adminDb.collection('records').doc('live').get()).exists).toBe(true);
    expect((await adminDb.collection('reminders').doc('old').get()).exists).toBe(false);
    expect((await adminDb.collection('taskCompletions').doc('old').get()).exists).toBe(false);
    expect((await adminDb.collection('animals').doc('old').get()).exists).toBe(false);
  });

  it('purges a deleted household, its children, and its audit log', async () => {
    const household = adminDb.collection('households').doc('h_old');
    await household.set({
      name: '舊家',
      ownerUid: 'u_old',
      memberCount: 0,
      ownerCount: 0,
      deletedAt: at(OLD),
    });
    await adminDb
      .collection('records')
      .doc('r_old')
      .set({ householdId: 'h_old', animalId: 'a_old', deletedAt: at(OLD) });
    await adminDb
      .collection('reminders')
      .doc('m_old')
      .set({ householdId: 'h_old', animalId: 'a_old', deletedAt: at(OLD) });
    await adminDb
      .collection('taskCompletions')
      .doc('t_old')
      .set({ householdId: 'h_old', reminderId: 'm_old', deletedAt: at(OLD) });
    await adminDb
      .collection('animals')
      .doc('a_old')
      .set({ householdId: 'h_old', status: 'archived', deletedAt: at(OLD), cleanupPending: false });
    await adminDb
      .collection('invites')
      .doc('i_old')
      .set({ householdId: 'h_old', status: 'revoked', expiresAt: at(OLD) });
    await household.collection('auditLogs').doc('log').set({ action: 'household.delete' });

    const summary = await runPurgeDeleted({ now: NOW });

    expect(summary.households).toBe(1);
    expect(summary.householdsSkipped).toBe(0);
    expect((await household.get()).exists).toBe(false);
    expect((await adminDb.collection('records').doc('r_old').get()).exists).toBe(false);
    expect((await adminDb.collection('reminders').doc('m_old').get()).exists).toBe(false);
    expect((await adminDb.collection('taskCompletions').doc('t_old').get()).exists).toBe(false);
    expect((await adminDb.collection('animals').doc('a_old').get()).exists).toBe(false);
    expect((await adminDb.collection('invites').doc('i_old').get()).exists).toBe(false);
    expect((await household.collection('auditLogs').get()).empty).toBe(true);
  });

  it('keeps a household that still has a member document', async () => {
    const household = adminDb.collection('households').doc('h_member');
    await household.set({ name: '留下的家', memberCount: 1, deletedAt: at(OLD) });
    await household
      .collection('members')
      .doc('u_leftover')
      .set({ uid: 'u_leftover', role: 'owner' });

    const summary = await runPurgeDeleted({ now: NOW });

    expect(summary.households).toBe(0);
    expect(summary.householdsSkipped).toBe(1);
    expect((await household.get()).exists).toBe(true);
    expect((await household.collection('members').doc('u_leftover').get()).exists).toBe(true);
  });

  it('does not purge a household inside the retention window', async () => {
    const household = adminDb.collection('households').doc('h_recent');
    await household.set({ name: '最近刪除', deletedAt: at(RECENT) });

    const summary = await runPurgeDeleted({ now: NOW });

    expect(summary.households).toBe(0);
    expect((await household.get()).exists).toBe(true);
  });
});
