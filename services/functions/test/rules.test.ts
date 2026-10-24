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
    // A second household so cross-household negatives are tested against a real
    // member, not only against an account with no membership at all.
    await setDoc(doc(db, 'households/h2'), {
      name: '另一個家',
      ownerUid: 'carol',
      ownerCount: 1,
      memberCount: 1,
      deletedAt: null,
    });
    await setDoc(doc(db, 'households/h2/members/carol'), { uid: 'carol', role: 'owner' });
    await setDoc(doc(db, 'households/h2/auditLogs/h2log'), { action: 'member.add', actorUid: 'carol' });
    await setDoc(doc(db, 'animals/a2'), { householdId: 'h2', name: '小白' });
    await setDoc(doc(db, 'records/r2'), { householdId: 'h2', animalId: 'a2' });
    await setDoc(doc(db, 'users/carol'), { displayName: 'Carol' });
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
    await assertFails(setDoc(doc(db, 'animals/a3'), { householdId: 'h1', name: '新' }));
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
    await assertFails(setDoc(doc(db, 'records/r3'), { householdId: 'h1' }));
    await assertFails(setDoc(doc(db, 'reminders/m3'), { householdId: 'h1' }));
    await assertFails(setDoc(doc(db, 'taskCompletions/t3'), { householdId: 'h1' }));
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

  it('keeps a member of one household out of another household', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'animals/a2')));
    await assertFails(getDoc(doc(bob, 'households/h2')));
    await assertFails(getDoc(doc(bob, 'households/h2/members/carol')));
    await assertFails(getDoc(doc(bob, 'households/h2/auditLogs/h2log')));
    await assertFails(getDoc(doc(bob, 'records/r2')));

    // The boundary is symmetric: carol owns h2 and still cannot read h1.
    const carol = env.authenticatedContext('carol').firestore();
    await assertSucceeds(getDoc(doc(carol, 'animals/a2')));
    await assertFails(getDoc(doc(carol, 'animals/a1')));
    await assertFails(getDoc(doc(carol, 'households/h1')));
    await assertFails(getDoc(doc(carol, 'households/h1/auditLogs/h1log')));
  });

  it('scopes animal list queries to the member household', async () => {
    const bob = env.authenticatedContext('bob').firestore();

    const mine = await getDocs(query(collection(bob, 'animals'), where('householdId', '==', 'h1')));
    expect(mine.docs.map((snapshot) => snapshot.id)).toEqual(['a1']);

    // h2 has a real animal (a2) and a real member (carol); bob must see neither.
    await assertFails(getDocs(query(collection(bob, 'animals'), where('householdId', '==', 'h2'))));

    const carol = env.authenticatedContext('carol').firestore();
    const theirs = await getDocs(
      query(collection(carol, 'animals'), where('householdId', '==', 'h2')),
    );
    expect(theirs.docs.map((snapshot) => snapshot.id)).toEqual(['a2']);
  });

  it('denies unlisted nested paths through the catch-all', async () => {
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'households/h1/settings/x')));
    await assertFails(setDoc(doc(bob, 'households/h1/settings/x'), { theme: 'dark' }));
    await assertFails(getDoc(doc(bob, 'animals/a1/notes/x')));
    await assertFails(setDoc(doc(bob, 'animals/a1/notes/x'), { text: 'hi' }));
  });

  it('denies unauthenticated reads', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'animals/a1')));
    await assertFails(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'households/h1')));
  });
});
