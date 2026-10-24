import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firestore';
import type { LineProfile } from '../line/verify';

/** Deterministic UID so a LINE account always maps to the same Firebase user. */
export function lineUid(sub: string): string {
  return `line_${sub}`;
}

/**
 * Creates (or refreshes) the Firebase user and Firestore mapping for a LINE
 * profile. A LINE login is idempotent: signing in again only refreshes the
 * `lineUsers` mapping and the user document's `updatedAt`.
 */
export async function ensureLineUser(
  profile: LineProfile,
): Promise<{ uid: string; isNew: boolean }> {
  const uid = lineUid(profile.sub);
  const auth = getAuth();
  let isNew = false;

  try {
    await auth.getUser(uid);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/user-not-found') throw error;
    try {
      await auth.createUser({
        uid,
        ...(profile.name !== undefined ? { displayName: profile.name } : {}),
        ...(profile.picture !== undefined ? { photoURL: profile.picture } : {}),
      });
      isNew = true;
    } catch (createError) {
      // A concurrent login may have created the user between the two calls.
      if ((createError as { code?: string }).code !== 'auth/uid-already-exists') throw createError;
    }
  }

  await db
    .collection('lineUsers')
    .doc(profile.sub)
    .set(
      {
        uid,
        displayName: profile.name ?? '',
        pictureUrl: profile.picture ?? '',
        linkedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  // `householdIds` is only initialized for a brand-new user so an existing
  // membership list is never replaced by an empty array.
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        displayName: profile.name ?? '新朋友',
        avatarUrl: profile.picture ?? '',
        ...(isNew ? { householdIds: [] } : {}),
        locale: 'zh-TW',
        timezone: 'Asia/Taipei',
        schemaVersion: 1,
        updatedAt: FieldValue.serverTimestamp(),
        ...(isNew ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );

  return { uid, isNew };
}
