import { AppError } from '@taijian/domain';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type DocumentReference, type Timestamp } from 'firebase-admin/firestore';
import { db } from '../lib/firestore';
import type { LineProfile } from '../line/verify';

/** Deterministic UID for a LINE account that has never been linked before. */
export function lineUid(sub: string): string {
  return `line_${sub}`;
}

export type LineMappingStatus = 'active' | 'unlinked' | 'deleted';

type LineMappingData = {
  uid?: string;
  /** Mappings created before this field existed are treated as active. */
  status?: LineMappingStatus;
  displayName?: string;
  pictureUrl?: string;
  linkedAt?: Timestamp;
  lastSeenAt?: Timestamp;
  unlinkedAt?: Timestamp;
};

type UserData = {
  displayName?: string;
  avatarUrl?: string;
  deletedAt?: Timestamp | null;
};

export type EnsureLineUserResult = {
  uid: string;
  isNew: boolean;
  displayName: string;
  avatarUrl: string;
};

function displayNameOf(profile: LineProfile): string {
  const name = profile.name?.trim();
  return name ? name : '新朋友';
}

function nameOf(user: UserData | undefined, profile: LineProfile): string {
  const stored = user?.displayName?.trim();
  return stored ? stored : displayNameOf(profile);
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

async function ensureAuthUser(uid: string, profile: LineProfile): Promise<void> {
  const auth = getAuth();
  try {
    await auth.getUser(uid);
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }

  try {
    await auth.createUser({
      uid,
      ...(profile.name !== undefined ? { displayName: profile.name } : {}),
      ...(profile.picture !== undefined ? { photoURL: profile.picture } : {}),
    });
  } catch (error) {
    // A concurrent first login may have created the same user in between.
    if ((error as { code?: string }).code !== 'auth/uid-already-exists') throw error;
  }
}

/**
 * Resolves the canonical Firebase user for a LINE profile.
 *
 * `lineUsers/{sub}.uid` is the source of truth: once a LINE account has been
 * linked (by login or by `line.link`), later logins must keep returning that
 * UID instead of deriving `line_<sub>` again. Unlinked or deleted mappings are
 * refused so a deleted account is never resurrected.
 */
export async function ensureLineUser(profile: LineProfile): Promise<EnsureLineUserResult> {
  const mappingRef = db.collection('lineUsers').doc(profile.sub);
  const mappingSnap = await mappingRef.get();
  const mapping = mappingSnap.data() as LineMappingData | undefined;

  if (mappingSnap.exists) return loginExistingMapping(profile, mappingRef, mapping);
  return createLineUser(profile, mappingRef);
}

async function loginExistingMapping(
  profile: LineProfile,
  mappingRef: DocumentReference,
  mapping: LineMappingData | undefined,
): Promise<EnsureLineUserResult> {
  const status = mapping?.status ?? 'active';
  if (status !== 'active') {
    throw new AppError('UNAUTHENTICATED', 'this LINE account is no longer linked');
  }

  const uid = mapping?.uid;
  if (!uid) {
    throw new AppError('UNAUTHENTICATED', 'this LINE account mapping is incomplete');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data() as UserData | undefined;
  if (!userSnap.exists || user?.deletedAt != null) {
    throw new AppError('UNAUTHENTICATED', 'this account is no longer available');
  }

  // Profile fields belong to the user: a login only records presence.
  await Promise.all([
    mappingRef.set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true }),
    userRef.set(
      { lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    ),
  ]);

  return {
    uid,
    isNew: false,
    displayName: nameOf(user, profile),
    avatarUrl: user?.avatarUrl ?? profile.picture ?? '',
  };
}

async function createLineUser(
  profile: LineProfile,
  mappingRef: DocumentReference,
): Promise<EnsureLineUserResult> {
  const uid = lineUid(profile.sub);
  await ensureAuthUser(uid, profile);

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const user = userSnap.data() as UserData | undefined;

  if (userSnap.exists && user?.deletedAt != null) {
    throw new AppError('UNAUTHENTICATED', 'this account is no longer available');
  }

  const isNew = !userSnap.exists;
  const displayName = isNew ? displayNameOf(profile) : nameOf(user, profile);
  const avatarUrl = isNew ? (profile.picture ?? '') : (user?.avatarUrl ?? '');

  if (isNew) {
    await userRef.set({
      displayName,
      avatarUrl,
      householdIds: [],
      locale: 'zh-TW',
      timezone: 'Asia/Taipei',
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  } else {
    await userRef.set(
      { lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }

  try {
    // `create` (not `set`) so a concurrent LINE login or `line.link` cannot be
    // overwritten; the mapping is the canonical identity and is never replaced.
    await mappingRef.create({
      uid,
      status: 'active',
      displayName: profile.name ?? '',
      pictureUrl: profile.picture ?? '',
      linkedAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    const snap = await mappingRef.get();
    return loginExistingMapping(profile, mappingRef, snap.data() as LineMappingData | undefined);
  }

  return { uid, isNew, displayName, avatarUrl };
}
