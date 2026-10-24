import { getFirestore } from 'firebase-admin/firestore';

export const db = getFirestore();
export type Tx = FirebaseFirestore.Transaction;
