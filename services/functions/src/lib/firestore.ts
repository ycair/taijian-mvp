import { getApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * The deployed runtime and the emulator both expose `FIREBASE_CONFIG`, but
 * neither creates the *default* admin app (the Functions SDK only creates a
 * named one). Every service below is resolved at module load, so the default
 * app must exist before cold start reaches `getFirestore()`.
 */
function ensureDefaultApp(): void {
  try {
    getApp();
  } catch {
    initializeApp();
  }
}

ensureDefaultApp();

export const db = getFirestore();
export type Tx = FirebaseFirestore.Transaction;
