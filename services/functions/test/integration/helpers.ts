// Emulator-backed helpers. Import this module before anything that constructs a
// Firestore client so the emulator host is in place first.
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-taijian';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { newCommandId, type CommandEnvelope } from '@taijian/domain';
import { rateLimitDocId } from '../../src/lib/rateLimit';

if (!getApps().length) initializeApp({ projectId: 'demo-taijian' });

export const adminDb = getFirestore();

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT ?? 'demo-taijian';

export async function clearFirestore(): Promise<void> {
  const response = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    throw new Error(`failed to clear firestore: ${response.status}`);
  }
}

export function envelope(
  type: string,
  payload: unknown,
  options: { commandId?: string; householdId?: string } = {},
): CommandEnvelope {
  return {
    commandId: options.commandId ?? newCommandId(),
    type,
    ...(options.householdId ? { householdId: options.householdId } : {}),
    payload,
    client: { platform: 'test', appVersion: '1.0.0' },
  };
}

export async function readLimitCount(uid: string, action: string): Promise<number | undefined> {
  const snap = await adminDb.collection('rateLimits').doc(rateLimitDocId(uid, action)).get();
  const counts = snap.data()?.counts as Record<string, number> | undefined;
  return counts?.[action];
}
