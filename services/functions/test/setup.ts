import { getApps, initializeApp } from 'firebase-admin/app';

process.env.GCLOUD_PROJECT ??= 'demo-taijian';
if (!getApps().length) initializeApp({ projectId: 'demo-taijian' });
