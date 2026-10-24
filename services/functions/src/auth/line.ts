import { AppError } from '@taijian/domain';
import { getAuth } from 'firebase-admin/auth';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { config } from '../config';
import { toHttpsError } from '../lib/errors';
import { verifiedLineProfile } from '../line/verify';
import { checkLoginRateLimit } from './loginRateLimit';
import { ensureLineUser } from './users';

const InputSchema = z.object({ idToken: z.string().min(1) });

export type LineLoginResult = {
  token: string;
  uid: string;
  isNew: boolean;
  displayName: string;
  pictureUrl: string;
};

/**
 * Resolves a LINE ID token to a Firebase custom token. The UID comes from the
 * `lineUsers/{sub}` mapping, so an account linked through `line.link` keeps its
 * original UID on the next LINE login.
 */
export async function loginWithLine(idToken: string): Promise<LineLoginResult> {
  const profile = await verifiedLineProfile(idToken, config.LINE_LOGIN_CHANNEL_ID);
  const { uid, isNew, displayName, avatarUrl } = await ensureLineUser(profile);
  const token = await getAuth().createCustomToken(uid);

  return { token, uid, isNew, displayName, pictureUrl: avatarUrl };
}

/**
 * Public callable. App Check is opt-in through `ENFORCE_APP_CHECK`, and each
 * client IP gets a fixed-window budget so the endpoint cannot be used to hammer
 * LINE's verification API.
 */
export const lineLogin = onCall(
  { region: 'asia-east1', enforceAppCheck: config.ENFORCE_APP_CHECK },
  async (request) => {
    try {
      const parsed = InputSchema.safeParse(request.data);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'invalid payload', { issues: parsed.error.issues });
      }

      const ip = request.rawRequest.ip;
      if (ip) await checkLoginRateLimit(ip);

      return await loginWithLine(parsed.data.idToken);
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);
