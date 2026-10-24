import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminAuth, adminDb, clearAuth, clearFirestore, envelope } from './helpers';
import { config } from '../../src/config';
import { loginWithLine } from '../../src/auth/line';
import { LOGIN_IP_LIMIT, checkLoginRateLimit, loginIpKey } from '../../src/auth/loginRateLimit';
import { runCommand } from '../../src/commands/runCommand';
import { linkLine } from '../../src/commands/handlers/line';
import { clearLineVerifyCache } from '../../src/line/verify';
import { clearAuthUserCache } from '../../src/lib/authUser';
import type { HandlerMap } from '../../src/commands/types';

const LINE_CHANNEL = config.LINE_LOGIN_CHANNEL_ID;
const LINE_ISSUER = 'https://access.line.me';

function stubLineVerify(sub: string, name = 'Test A'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: LINE_CHANNEL,
        sub,
        name,
        picture: 'https://example.com/picture.png',
        iss: LINE_ISSUER,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    }),
  );
}

async function userDoc(uid: string) {
  return (await adminDb.collection('users').doc(uid).get()).data();
}

async function mappingDoc(sub: string) {
  return (await adminDb.collection('lineUsers').doc(sub).get()).data();
}

beforeEach(async () => {
  await Promise.all([clearFirestore(), clearAuth()]);
  clearLineVerifyCache();
  clearAuthUserCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loginWithLine identity model', () => {
  it('creates the deterministic user and mapping on first login', async () => {
    stubLineVerify('UtestA');

    const result = await loginWithLine('token-first');

    expect(result).toMatchObject({
      uid: 'line_UtestA',
      isNew: true,
      displayName: 'Test A',
      pictureUrl: 'https://example.com/picture.png',
    });
    expect(result.token).toEqual(expect.any(String));

    expect(await userDoc('line_UtestA')).toMatchObject({
      displayName: 'Test A',
      avatarUrl: 'https://example.com/picture.png',
      householdIds: [],
      locale: 'zh-TW',
      timezone: 'Asia/Taipei',
      schemaVersion: 1,
    });
    expect((await userDoc('line_UtestA'))?.createdAt).toBeDefined();
    expect((await userDoc('line_UtestA'))?.lastSeenAt).toBeDefined();

    expect(await mappingDoc('UtestA')).toMatchObject({
      uid: 'line_UtestA',
      status: 'active',
      displayName: 'Test A',
    });
    expect((await mappingDoc('UtestA'))?.linkedAt).toBeDefined();
    expect((await mappingDoc('UtestA'))?.lastSeenAt).toBeDefined();

    expect((await adminAuth.getUser('line_UtestA')).uid).toBe('line_UtestA');
  });

  it('preserves user-edited profile fields on the next login', async () => {
    stubLineVerify('UtestA');
    await loginWithLine('token-first');

    const linkedAt = (await mappingDoc('UtestA'))?.linkedAt as Timestamp;
    const createdAt = (await userDoc('line_UtestA'))?.createdAt as Timestamp;

    await adminDb
      .collection('users')
      .doc('line_UtestA')
      .set(
        {
          displayName: 'Renamed by user',
          householdIds: ['h_alpha'],
          timezone: 'Europe/London',
          locale: 'en',
        },
        { merge: true },
      );

    stubLineVerify('UtestA');
    const second = await loginWithLine('token-second');

    expect(second).toMatchObject({ uid: 'line_UtestA', isNew: false });
    expect(second.displayName).toBe('Renamed by user');

    const user = await userDoc('line_UtestA');
    expect(user).toMatchObject({
      displayName: 'Renamed by user',
      householdIds: ['h_alpha'],
      timezone: 'Europe/London',
      locale: 'en',
    });
    expect((user?.createdAt as Timestamp).toMillis()).toBe(createdAt.toMillis());
    expect(user?.lastSeenAt).toBeDefined();

    const mapping = await mappingDoc('UtestA');
    expect((mapping?.linkedAt as Timestamp).toMillis()).toBe(linkedAt.toMillis());
    expect(mapping?.lastSeenAt).toBeDefined();
  });

  it('returns the mapped UID instead of deriving line_<sub>', async () => {
    await adminAuth.createUser({ uid: 'google-abc' });
    await adminDb
      .collection('users')
      .doc('google-abc')
      .set({
        displayName: 'Google user',
        householdIds: ['h_google'],
        locale: 'en',
        timezone: 'UTC',
        schemaVersion: 1,
      });
    const linkedAt = Timestamp.fromMillis(Date.now() - 60_000);
    await adminDb.collection('lineUsers').doc('UtestA').set({
      uid: 'google-abc',
      status: 'active',
      linkedAt,
      displayName: 'Test A',
    });
    stubLineVerify('UtestA');

    const result = await loginWithLine('token-mapped');

    expect(result).toMatchObject({ uid: 'google-abc', isNew: false, displayName: 'Google user' });

    const mapping = await mappingDoc('UtestA');
    expect(mapping?.uid).toBe('google-abc');
    expect((mapping?.linkedAt as Timestamp).toMillis()).toBe(linkedAt.toMillis());
    expect(mapping?.lastSeenAt).toBeDefined();
    expect(await userDoc('line_UtestA')).toBeUndefined();
  });

  it('refuses an unlinked mapping', async () => {
    await adminDb.collection('users').doc('line_UtestA').set({ displayName: 'Test A' });
    await adminDb.collection('lineUsers').doc('UtestA').set({
      uid: 'line_UtestA',
      status: 'unlinked',
      unlinkedAt: Timestamp.now(),
    });
    stubLineVerify('UtestA');

    await expect(loginWithLine('token-unlinked')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuses a user document marked deleted', async () => {
    await adminDb.collection('users').doc('line_UtestA').set({
      displayName: 'Test A',
      deletedAt: Timestamp.now(),
    });
    await adminDb.collection('lineUsers').doc('UtestA').set({
      uid: 'line_UtestA',
      status: 'active',
    });
    stubLineVerify('UtestA');

    await expect(loginWithLine('token-deleted')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuses an active mapping whose user document is missing', async () => {
    await adminDb.collection('lineUsers').doc('UtestA').set({
      uid: 'line_UtestA',
      status: 'active',
    });
    stubLineVerify('UtestA');

    await expect(loginWithLine('token-orphan')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});

describe('linkLine with the unified identity model', () => {
  it('re-activates an unlinked mapping and keeps its linkedAt', async () => {
    const linkedAt = Timestamp.fromMillis(Date.now() - 60_000);
    await adminDb.collection('lineUsers').doc('UtestA').set({
      uid: 'line_UtestA',
      status: 'unlinked',
      unlinkedAt: Timestamp.now(),
      linkedAt,
    });
    stubLineVerify('UtestA');

    const handlers: HandlerMap = { 'line.link': linkLine };
    const result = await runCommand({
      uid: 'google-abc',
      envelope: envelope('line.link', { idToken: 'token-relink' }),
      source: 'test',
      handlers,
    });

    expect(result.ok).toBe(true);
    const mapping = await mappingDoc('UtestA');
    expect(mapping).toMatchObject({ uid: 'google-abc', status: 'active' });
    expect(mapping?.unlinkedAt).toBeUndefined();
    expect((mapping?.linkedAt as Timestamp).toMillis()).toBe(linkedAt.toMillis());
  });
});

describe('lineLogin IP rate limit', () => {
  it('allows 20 attempts per window and stores only a hashed IP', async () => {
    for (let attempt = 0; attempt < LOGIN_IP_LIMIT; attempt += 1) {
      await checkLoginRateLimit('203.0.113.7');
    }

    await expect(checkLoginRateLimit('203.0.113.7')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(checkLoginRateLimit('203.0.113.8')).resolves.toBeUndefined();

    const snapshot = await adminDb
      .collection('loginRateLimits')
      .doc(loginIpKey('203.0.113.7'))
      .get();
    expect(snapshot.exists).toBe(true);
    expect(snapshot.data()?.count).toBe(LOGIN_IP_LIMIT);

    const ids = (await adminDb.collection('loginRateLimits').get()).docs.map((doc) => doc.id);
    expect(ids).not.toContain('203.0.113.7');
  }, 60_000);
});
