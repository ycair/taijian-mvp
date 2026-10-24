import net from 'node:net';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';

// The Firestore client retries an unreachable emulator for minutes, so probe it first.
const [emulatorHost, emulatorPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
await new Promise((resolve, reject) => {
  const socket = net.connect({ host: emulatorHost, port: Number(emulatorPort) }, () => {
    socket.end();
    resolve();
  });
  socket.setTimeout(2000, () => {
    socket.destroy(new Error(`emulator not reachable at ${process.env.FIRESTORE_EMULATOR_HOST}`));
  });
  socket.on('error', reject);
});

const app = initializeApp({ projectId: 'demo-taijian' });
const db = getFirestore(app);

const ref = db.collection('smoke').doc('ping');
await ref.set({ ok: true });
const snap = await ref.get();
if (!snap.exists || snap.data().ok !== true) {
  throw new Error('emulator round-trip failed');
}
console.log('emulator ok');
