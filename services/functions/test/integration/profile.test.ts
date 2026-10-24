import { beforeEach, describe, expect, it } from 'vitest';
import { commandHandlers } from '../../src/commands/registry';
import { runCommand } from '../../src/commands/runCommand';
import { adminAuth, adminDb, clearAuth, clearFirestore, envelope, seedUser } from './helpers';

const UID = 'u_profile';

async function createHousehold(uid = UID): Promise<string> {
  const result = await runCommand({
    uid,
    envelope: envelope('household.create', { name: '我們家', timezone: 'Asia/Taipei' }),
    source: 'test',
    handlers: commandHandlers,
  });
  if (!result.ok) throw new Error('household.create failed');
  return (result.data as { householdId: string }).householdId;
}

beforeEach(async () => {
  await Promise.all([clearFirestore(), clearAuth()]);
});

describe('user.updateProfile', () => {
  it('updates the profile and writes an account-level audit entry', async () => {
    await seedUser(UID);

    const result = await runCommand({
      uid: UID,
      envelope: envelope('user.updateProfile', {
        displayName: '小明',
        avatarUrl: 'https://example.com/avatar.png',
        locale: 'en',
        timezone: 'Europe/London',
      }),
      source: 'test',
      handlers: commandHandlers,
    });

    expect(result.ok).toBe(true);
    const user = (await adminDb.collection('users').doc(UID).get()).data();
    expect(user).toMatchObject({
      displayName: '小明',
      avatarUrl: 'https://example.com/avatar.png',
      locale: 'en',
      timezone: 'Europe/London',
    });
    // Fields the command does not own stay untouched.
    expect(user?.householdIds).toEqual([]);
    expect(user?.schemaVersion).toBe(1);

    const audits = await adminDb.collection(`users/${UID}/auditLogs`).get();
    const entries = audits.docs.map((doc) => doc.data());
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'user.updateProfile',
      targetType: 'user',
      targetId: UID,
      actorUid: UID,
      actorType: 'user',
    });
    expect(entries[0]?.householdId).toBeUndefined();
  });

  it('updates only the fields that were sent', async () => {
    await seedUser(UID);

    await runCommand({
      uid: UID,
      envelope: envelope('user.updateProfile', { displayName: '只改名字' }),
      source: 'test',
      handlers: commandHandlers,
    });

    const user = (await adminDb.collection('users').doc(UID).get()).data();
    expect(user).toMatchObject({
      displayName: '只改名字',
      locale: 'zh-TW',
      timezone: 'Asia/Taipei',
    });
  });

  it('creates the profile for an Auth-only account', async () => {
    await adminAuth.createUser({ uid: 'u_auth_only_profile' });

    const result = await runCommand({
      uid: 'u_auth_only_profile',
      envelope: envelope('user.updateProfile', { displayName: '新朋友' }),
      source: 'test',
      handlers: commandHandlers,
    });

    expect(result.ok).toBe(true);
    expect(
      (await adminDb.collection('users').doc('u_auth_only_profile').get()).data(),
    ).toMatchObject({ displayName: '新朋友', locale: 'zh-TW', timezone: 'Asia/Taipei' });
  });

  it('rejects an invalid avatar URL or timezone', async () => {
    await seedUser(UID);

    await expect(
      runCommand({
        uid: UID,
        envelope: envelope('user.updateProfile', { avatarUrl: 'not-a-url' }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      runCommand({
        uid: UID,
        envelope: envelope('user.updateProfile', { timezone: 'Mars/Phobos' }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('sets defaultHouseholdId to a household the user belongs to', async () => {
    await seedUser(UID);
    const householdId = await createHousehold();
    // Creating the household already defaults to it; start from another value
    // so the assertion proves this command wrote the field.
    await adminDb.collection('users').doc(UID).set({ defaultHouseholdId: 'hh_other' }, { merge: true });

    const result = await runCommand({
      uid: UID,
      envelope: envelope('user.updateProfile', { defaultHouseholdId: householdId }),
      source: 'test',
      handlers: commandHandlers,
    });

    expect(result.ok).toBe(true);
    const user = (await adminDb.collection('users').doc(UID).get()).data();
    expect(user?.defaultHouseholdId).toBe(householdId);
    expect(user?.householdIds).toContain(householdId);

    const audits = await adminDb.collection(`users/${UID}/auditLogs`).get();
    expect(audits.docs.map((doc) => doc.data())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'user.updateProfile',
          after: { defaultHouseholdId: householdId },
        }),
      ]),
    );
  });

  it('refuses a defaultHouseholdId the user is not a member of', async () => {
    await seedUser(UID);
    await adminDb
      .collection('users')
      .doc(UID)
      .set({ defaultHouseholdId: 'hh_keep' }, { merge: true });

    await expect(
      runCommand({
        uid: UID,
        envelope: envelope('user.updateProfile', { defaultHouseholdId: 'hh_not_a_member' }),
        source: 'test',
        handlers: commandHandlers,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const user = (await adminDb.collection('users').doc(UID).get()).data();
    expect(user?.defaultHouseholdId).toBe('hh_keep');
    const audits = await adminDb.collection(`users/${UID}/auditLogs`).get();
    expect(audits.docs).toHaveLength(0);
  });
});
