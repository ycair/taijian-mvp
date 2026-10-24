import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { createTtlCache } from './memo';

const AUTH_USER_TTL_MS = 60_000;
const authUsers = createTtlCache<UserRecord>(AUTH_USER_TTL_MS);

/**
 * Provider data is read from Firebase Auth at most once per UID per minute.
 * `unlinkLine` runs inside a retried transaction, and provider lookups are the
 * expensive part of the check. Callers that need a fresh read after a negative
 * result can `invalidateAuthUser` first.
 */
export function getAuthUserCached(uid: string): Promise<UserRecord> {
  return authUsers.get(uid, () => getAuth().getUser(uid));
}

export function invalidateAuthUser(uid: string): void {
  authUsers.invalidate(uid);
}

/** Test hook: forget every cached provider record. */
export function clearAuthUserCache(): void {
  authUsers.clear();
}
