import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { runCommand } from '../../src/commands/runCommand';
import { commandHandlers } from '../../src/commands/registry';
import { hashInviteSecret } from '../../src/commands/handlers/invites';
import { adminAuth, adminDb, clearAuth, clearFirestore, envelope, seedUser } from './helpers';

const OWNER = 'u_owner';
const HELPER = 'u_helper';
const SECOND_HELPER = 'u_helper_2';

async function createHousehold(uid = OWNER): Promise<string> {
  const result = await runCommand({
    uid,
    envelope: envelope('household.create', { name: '我們家', timezone: 'Asia/Taipei' }),
    source: 'test',
    handlers: commandHandlers,
  });
  if (!result.ok) throw new Error('household.create failed');
  return (result.data as { householdId: string }).householdId;
}

async function inviteCaretaker(householdId: string, uid = OWNER): Promise<string> {
  const result = await runCommand({
    uid,
    envelope: envelope('member.invite', { role: 'caretaker', expiresInDays: 7 }, { householdId }),
    source: 'test',
    handlers: commandHandlers,
  });
  if (!result.ok) throw new Error('member.invite failed');
  return (result.data as { token: string }).token;
}

async function acceptInvite(token: string, uid = HELPER) {
  return runCommand({
    uid,
    envelope: envelope('member.accept', { token }),
    source: 'test',
    handlers: commandHandlers,
  });
}

/** Owner + one accepted caretaker; returns the household id. */
async function householdWithCaretaker(): Promise<string> {
  const householdId = await createHousehold();
  const token = await inviteCaretaker(householdId);
  const accepted = await acceptInvite(token);
  if (!accepted.ok) throw new Error('member.accept failed');
  return householdId;
}

async function householdDoc(householdId: string) {
  return (await adminDb.collection('households').doc(householdId).get()).data();
}

async function memberDoc(householdId: string, uid: string) {
  return (await adminDb.doc(`households/${householdId}/members/${uid}`).get()).data();
}

async function auditActions(householdId: string): Promise<string[]> {
  const snap = await adminDb.collection(`households/${householdId}/auditLogs`).get();
  return snap.docs.map((doc) => doc.data().action as string);
}

beforeEach(async () => {
  await Promise.all([clearFirestore(), clearAuth()]);
  await seedUser(OWNER);
  await seedUser(HELPER);
  await seedUser(SECOND_HELPER);
});

describe('household commands', () => {
  it('creates a household with an owner membership', async () => {
    const householdId = await createHousehold();

    expect(await householdDoc(householdId)).toMatchObject({
      name: '我們家',
      ownerUid: OWNER,
      ownerCount: 1,
      memberCount: 1,
      timezone: 'Asia/Taipei',
      revision: 0,
      schemaVersion: 1,
      deletedAt: null,
    });
    expect(await memberDoc(householdId, OWNER)).toMatchObject({ uid: OWNER, role: 'owner' });

    const user = (await adminDb.collection('users').doc(OWNER).get()).data();
    expect(user?.householdIds).toContain(householdId);
    expect(user?.defaultHouseholdId).toBe(householdId);

    expect(await auditActions(householdId)).toEqual(['household.create']);
  });

  it('creates the profile document for a user that only exists in Auth', async () => {
    const uid = 'u_auth_only';
    await adminAuth.createUser({ uid });

    const result = await runCommand({
      uid,
      envelope: envelope('household.create', { name: '新家', timezone: 'Asia/Taipei' }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = (await adminDb.collection('users').doc(uid).get()).data();
    expect(user).toMatchObject({
      displayName: uid,
      householdIds: [(result.data as { householdId: string }).householdId],
      locale: 'zh-TW',
      timezone: 'Asia/Taipei',
      schemaVersion: 1,
    });
  });

  it('updates a household only with a matching revision', async () => {
    const householdId = await createHousehold();

    const updated = await runCommand({
      uid: OWNER,
      envelope: envelope('household.update', { name: '改名後' }, { householdId, baseRevision: 0 }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.revision).toBe(1);

    expect(await householdDoc(householdId)).toMatchObject({
      name: '改名後',
      revision: 1,
      lastChangedFields: ['name'],
      updatedBy: OWNER,
      updatedFrom: 'test',
    });

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope('household.update', { name: '又改' }, { householdId, baseRevision: 0 }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires baseRevision for household updates', async () => {
    const householdId = await createHousehold();

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope('household.update', { name: '改名' }, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not let a caretaker update the household', async () => {
    const householdId = await householdWithCaretaker();

    await expect(
      runCommand({
        uid: HELPER,
        envelope: envelope('household.update', { name: '改名' }, { householdId, baseRevision: 0 }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('deletes a household only after its other members have left', async () => {
    const householdId = await householdWithCaretaker();

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope('household.delete', {}, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await runCommand({
      uid: OWNER,
      envelope: envelope('member.remove', { uid: HELPER }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });

    const deleted = await runCommand({
      uid: OWNER,
      envelope: envelope('household.delete', {}, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(deleted.ok).toBe(true);

    expect((await householdDoc(householdId))?.deletedAt).toBeDefined();
    expect(await memberDoc(householdId, OWNER)).toBeUndefined();
    const user = (await adminDb.collection('users').doc(OWNER).get()).data();
    expect(user?.householdIds).not.toContain(householdId);
    expect(await auditActions(householdId)).toContain('household.delete');
  });
});

describe('invites', () => {
  it('invites and accepts a caretaker exactly once', async () => {
    const householdId = await createHousehold();
    const token = await inviteCaretaker(householdId);
    const [inviteId, secret] = token.split('.') as [string, string];

    const accepted = await acceptInvite(token);
    expect(accepted.ok).toBe(true);

    const invite = (await adminDb.collection('invites').doc(inviteId).get()).data();
    expect(invite).toMatchObject({
      householdId,
      role: 'caretaker',
      createdBy: OWNER,
      status: 'used',
      maxUses: 1,
      usedCount: 1,
    });
    expect(invite?.secretHash).toBe(hashInviteSecret(secret));
    expect(invite?.secretHash).not.toBe(secret);

    expect(await memberDoc(householdId, HELPER)).toMatchObject({
      uid: HELPER,
      role: 'caretaker',
      invitedBy: OWNER,
      status: 'active',
    });
    expect(await householdDoc(householdId)).toMatchObject({ memberCount: 2, ownerCount: 1 });

    // Replaying the invite link is harmless: the caller is already a member.
    const second = await acceptInvite(token);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data).toMatchObject({ householdId, alreadyMember: true });

    const members = await adminDb.collection(`households/${householdId}/members`).get();
    expect(members.size).toBe(2);
    expect(await householdDoc(householdId)).toMatchObject({ memberCount: 2 });
  });

  it('lets only one person use a single-use invite', async () => {
    const householdId = await createHousehold();
    const token = await inviteCaretaker(householdId);
    await acceptInvite(token);

    await expect(acceptInvite(token, SECOND_HELPER)).rejects.toMatchObject({ code: 'INVITE_USED' });

    const members = await adminDb.collection(`households/${householdId}/members`).get();
    expect(members.size).toBe(2);
    expect(await householdDoc(householdId)).toMatchObject({ memberCount: 2 });
  });

  it('rejects an expired invite', async () => {
    const householdId = await createHousehold();
    const token = await inviteCaretaker(householdId);
    const [inviteId] = token.split('.') as [string];

    await adminDb
      .collection('invites')
      .doc(inviteId)
      .set({ expiresAt: Timestamp.fromMillis(Date.now() - 1_000) }, { merge: true });

    await expect(acceptInvite(token)).rejects.toMatchObject({ code: 'INVITE_EXPIRED' });
  });

  it('rejects a tampered secret without revealing the household', async () => {
    const householdId = await createHousehold();
    const token = await inviteCaretaker(householdId);
    const [inviteId] = token.split('.') as [string];
    const tampered = `${inviteId}.${'A'.repeat(43)}`;

    await expect(acceptInvite(tampered)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a malformed token', async () => {
    await expect(acceptInvite('no-dot-in-this-token-value')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('does not let a caretaker invite someone', async () => {
    const householdId = await householdWithCaretaker();

    await expect(inviteCaretaker(householdId, HELPER)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('member roles', () => {
  it('lets an owner promote a caretaker and ignores a no-op change', async () => {
    const householdId = await householdWithCaretaker();

    const promoted = await runCommand({
      uid: OWNER,
      envelope: envelope('member.updateRole', { uid: HELPER, role: 'owner' }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(promoted.ok).toBe(true);
    expect(await memberDoc(householdId, HELPER)).toMatchObject({ role: 'owner' });
    expect(await householdDoc(householdId)).toMatchObject({ ownerCount: 2 });

    const again = await runCommand({
      uid: OWNER,
      envelope: envelope('member.updateRole', { uid: HELPER, role: 'owner' }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(again.ok).toBe(true);
    expect(await householdDoc(householdId)).toMatchObject({ ownerCount: 2 });

    await runCommand({
      uid: OWNER,
      envelope: envelope('member.updateRole', { uid: HELPER, role: 'caretaker' }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(await householdDoc(householdId)).toMatchObject({ ownerCount: 1 });

    // A second demotion is a no-op and must not drive ownerCount below 1.
    const noopDemote = await runCommand({
      uid: OWNER,
      envelope: envelope('member.updateRole', { uid: HELPER, role: 'caretaker' }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(noopDemote.ok).toBe(true);
    expect(await householdDoc(householdId)).toMatchObject({ ownerCount: 1 });
  });

  it('does not let a caretaker promote themselves', async () => {
    const householdId = await householdWithCaretaker();

    await expect(
      runCommand({
        uid: HELPER,
        envelope: envelope('member.updateRole', { uid: HELPER, role: 'owner' }, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not let an owner change their own role', async () => {
    const householdId = await createHousehold();

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope('member.updateRole', { uid: OWNER, role: 'caretaker' }, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects changes to a member that does not exist', async () => {
    const householdId = await createHousehold();

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope(
          'member.updateRole',
          { uid: 'u_ghost', role: 'caretaker' },
          { householdId },
        ),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('leaving and removal', () => {
  it('cannot remove the last owner', async () => {
    const householdId = await createHousehold();

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope('member.leave', {}, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });

    await expect(
      runCommand({
        uid: OWNER,
        envelope: envelope('member.remove', { uid: OWNER }, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER' });
  });

  it('removes a caretaker and detaches the household from their profile', async () => {
    const householdId = await householdWithCaretaker();
    await adminDb
      .collection('users')
      .doc(HELPER)
      .set({ defaultHouseholdId: householdId }, { merge: true });

    const removed = await runCommand({
      uid: OWNER,
      envelope: envelope('member.remove', { uid: HELPER }, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(removed.ok).toBe(true);

    expect(await memberDoc(householdId, HELPER)).toBeUndefined();
    expect(await householdDoc(householdId)).toMatchObject({ memberCount: 1, ownerCount: 1 });

    const user = (await adminDb.collection('users').doc(HELPER).get()).data();
    expect(user?.householdIds).not.toContain(householdId);
    expect(user?.defaultHouseholdId).toBeUndefined();
    expect(await auditActions(householdId)).toContain('member.remove');
  });

  it('lets a caretaker leave on their own', async () => {
    const householdId = await householdWithCaretaker();

    const left = await runCommand({
      uid: HELPER,
      envelope: envelope('member.leave', {}, { householdId }),
      source: 'test',
      handlers: commandHandlers,
    });
    expect(left.ok).toBe(true);

    expect(await memberDoc(householdId, HELPER)).toBeUndefined();
    expect(await householdDoc(householdId)).toMatchObject({ memberCount: 1 });
  });

  it('rejects commands from a non-member', async () => {
    const householdId = await createHousehold();

    await expect(
      runCommand({
        uid: SECOND_HELPER,
        envelope: envelope('member.leave', {}, { householdId }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
