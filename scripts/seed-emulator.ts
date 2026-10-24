/**
 * Seeds the Auth + Firestore emulators with a deterministic demo household so
 * the Playwright acceptance flow (and manual QA) has something to log in to.
 *
 *   pnpm emulators   # terminal 1
 *   pnpm seed        # terminal 2
 *
 * The mock LINE server maps `test-token-A` → sub `UtestA` and
 * `test-token-B` → sub `UtestB`, so the seeded UIDs are `line_UtestA` and
 * `line_UtestB`. Only emulator projects: nothing here touches production.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= 'localhost:9099';
process.env.GCLOUD_PROJECT ??= 'demo-taijian';

const app = initializeApp({ projectId: 'demo-taijian' });
const db = getFirestore(app);
const auth = getAuth(app);

async function ensureUser(uid: string, displayName: string) {
  await auth.createUser({ uid, displayName }).catch((error) => {
    if (error.code !== 'auth/uid-already-exists') throw error;
  });
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        displayName,
        householdIds: ['hh_demo'],
        defaultHouseholdId: 'hh_demo',
        locale: 'zh-TW',
        timezone: 'Asia/Taipei',
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function main() {
  await db.doc('households/hh_demo').set({
    name: '苔間測試家庭',
    ownerUid: 'line_UtestA',
    ownerCount: 1,
    memberCount: 2,
    timezone: 'Asia/Taipei',
    settings: { notificationsEnabled: true },
    revision: 0,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  await db.doc('households/hh_demo/members/line_UtestA').set({
    uid: 'line_UtestA',
    role: 'owner',
    displayName: 'Test A',
    avatarUrl: '',
    status: 'active',
  });
  await db.doc('households/hh_demo/members/line_UtestB').set({
    uid: 'line_UtestB',
    role: 'caretaker',
    displayName: 'Test B',
    avatarUrl: '',
    status: 'active',
  });
  await ensureUser('line_UtestA', 'Test A');
  await ensureUser('line_UtestB', 'Test B');
  await db.doc('lineUsers/UtestA').set({
    uid: 'line_UtestA',
    status: 'active',
    displayName: 'Test A',
    linkedAt: FieldValue.serverTimestamp(),
  });
  await db.doc('lineUsers/UtestB').set({
    uid: 'line_UtestB',
    status: 'active',
    displayName: 'Test B',
    linkedAt: FieldValue.serverTimestamp(),
  });
  await db.doc('animals/animal_demo').set({
    householdId: 'hh_demo',
    name: '阿肥',
    species: '豹紋守宮',
    sex: 'unknown',
    avatarColor: '#7C9A76',
    status: 'active',
    revision: 0,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc('reminders/reminder_demo').set({
    householdId: 'hh_demo',
    animalId: 'animal_demo',
    title: '餵食',
    type: 'feeding',
    schedule: { kind: 'daily', times: ['08:00'] },
    timezone: 'Asia/Taipei',
    enabled: true,
    nextDueAt: Timestamp.fromDate(new Date()),
    revision: 0,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('seeded demo household hh_demo');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
