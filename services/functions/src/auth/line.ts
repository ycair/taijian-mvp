import { AppError } from '@taijian/domain';
import { getAuth } from 'firebase-admin/auth';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { config } from '../config';
import { toHttpsError } from '../lib/errors';
import { verifyLineIdToken } from '../line/verify';
import { ensureLineUser } from './users';

const InputSchema = z.object({ idToken: z.string().min(1) });

/**
 * Public callable: exchanges a LIFF/LINE Login ID token for a Firebase custom
 * token. The custom token is keyed by the deterministic `line_<sub>` UID, so
 * the client can sign in with `signInWithCustomToken` without ever creating a
 * Firebase account of its own.
 */
export const lineLogin = onCall({ region: 'asia-east1' }, async (request) => {
  try {
    const parsed = InputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'invalid payload', { issues: parsed.error.issues });
    }

    const profile = await verifyLineIdToken(parsed.data.idToken, config.LINE_LOGIN_CHANNEL_ID);
    const { uid, isNew } = await ensureLineUser(profile);
    const token = await getAuth().createCustomToken(uid);

    return {
      token,
      uid,
      isNew,
      displayName: profile.name ?? '',
      pictureUrl: profile.picture ?? '',
    };
  } catch (error) {
    throw toHttpsError(error);
  }
});
