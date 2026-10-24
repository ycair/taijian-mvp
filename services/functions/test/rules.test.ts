import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-taijian',
    firestore: {
      host: 'localhost',
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'households/h1'), {
      name: '家',
      ownerUid: 'alice',
      ownerCount: 1,
      memberCount: 2,
      deletedAt: null,
    });
    await setDoc(doc(db, 'households/h1/members/alice'), { uid: 'alice', role: 'owner' });
    await setDoc(doc(db, 'households/h1/members/bob'), { uid: 'bob', role: 'caretaker' });
    await setDoc(doc(db, 'households/h1/auditLogs/h1log'), { action: 'member.add', actorUid: 'alice' });
    await setDoc(doc(db, 'animals/a1'), { householdId: 'h1', name: '阿肥' });
    await setDoc(doc(db, 'records/r1'), { householdId: 'h1', animalId: 'a1' });
    await setDoc(doc(db, 'reminders/m1'), { householdId: 'h1', enabled: true });
    await setDoc(doc(db, 'taskCompletions/t1'), { householdId: 'h1', dueDate: '2026-10-24' });
    await setDoc(doc(db, 'users/alice'), { displayName: 'Alice' });
    await setDoc(doc(db, 'users/bob'), { displayName: 'Bob' });
    await setDoc(doc(db, 'users/alice/auditLogs/al1'), { action: 'line.link' });
    await setDoc(doc(db, 'users/bob/auditLogs/bl1'), { action: 'line.link' });
    await setDoc(doc(db, 'commands/c1'), { uid: 'alice' });
    await setDoc(doc(db, 'lineUsers/u1'), { uid: 'alice' });
    await setDoc(doc(db, 'invites/i1'), { householdId: 'h1', status: 'pending' });
    await setDoc(doc(db, 'rateLimits/rl1'), { counts: {} });
    await setDoc(doc(db, 'loginRateLimits/lrl1'), { counts: {} });
    await setDoc(doc(db, 'notificationLog/n1'), { uid: 'alice' });
  });
});

describe('firestore rules', () => {
  it('lets a member read an animal', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(db, 'animals/a1')));
  });

  it('blocks an outsider from reading an animal', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(db, 'animals/a1')));
  });

  it('blocks client writes to animals', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'animals/a2'), { householdId: 'h1', name: '新' }));
  });

  it('allows a user to read only their own profile', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'users/alice')));
  });

  it('blocks all client access to commands', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(getDoc(doc(db, 'commands/c1')));
  });

  it('lets a member read the household, its members, and its audit log', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(db, 'households/h1')));
    await assertSucceeds(getDoc(doc(db, 'households/h1/members/alice')));
    await assertSucceeds(getDoc(doc(db, 'households/h1/auditLogs/h1log')));
  });

  it('blocks an outsider from reading household-scoped documents', async () => {
    const db = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(db, 'households/h1')));
    await assertFails(getDoc(doc(db, 'households/h1/members/bob')));
    await assertFails(getDoc(doc(db, 'households/h1/auditLogs/h1log')));
    await assertFails(getDoc(doc(db, 'records/r1')));
    await assertFails(getDoc(doc(db, 'reminders/m1')));
    await assertFails(getDoc(doc(db, 'taskCompletions/t1')));
  });

  it('allows a member to read records, reminders, and task completions', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'records/r1')));
    await assertSucceeds(getDoc(doc(db, 'reminders/m1')));
    await assertSucceeds(getDoc(doc(db, 'taskCompletions/t1')));
  });

  it('allows a user to read only their own account audit log', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users/alice/auditLogs/al1')));
    await assertFails(getDoc(doc(alice, 'users/bob/auditLogs/bl1')));
    const eve = env.authenticatedContext('eve').firestore();
    await assertFails(getDoc(doc(eve, 'users/alice/auditLogs/al1')));
  });

  it('blocks every client write, including profiles, audit logs, and bookkeeping', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users/alice'), { displayName: 'Mallory' }));
    await assertFails(setDoc(doc(db, 'users/alice/auditLogs/new'), { action: 'forged' }));
    await assertFails(setDoc(doc(db, 'households/h1'), { name: 'x' }));
    await assertFails(setDoc(doc(db, 'households/h1/members/alice'), { role: 'owner' }));
    await assertFails(setDoc(doc(db, 'households/h1/auditLogs/new'), { action: 'forged' }));
    await assertFails(setDoc(doc(db, 'records/r2'), { householdId: 'h1' }));
    await assertFails(setDoc(doc(db, 'reminders/m2'), { householdId: 'h1' }));
    await assertFails(setDoc(doc(db, 'taskCompletions/t2'), { householdId: 'h1' }));
  });

  it('blocks all client access to internal bookkeeping collections', async () => {
    const db = env.authenticatedContext('alice').firestore();
    for (const path of [
      'commands/c1',
      'lineUsers/u1',
      'invites/i1',
      'rateLimits/rl1',
      'loginRateLimits/lrl1',
      'notificationLog/n1',
    ]) {
      await assertFails(getDoc(doc(db, path)));
      await assertFails(setDoc(doc(db, `${path}-new`), { uid: 'alice' }));
    }
  });

  it('lets a member list their household animal, but not another household', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    const mine = await getDocs(query(collection(bob, 'animals'), where('householdId', '==', 'h1')));
    expect(mine.docs.map((snapshot) => snapshot.id)).toEqual(['a1']);

    await assertFails(getDocs(query(collection(bob, 'animals'), where('householdId', '==', 'h2'))));
  });

  it('denies unauthenticated reads', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'animals/a1')));
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'households/h1')));
  });
});
