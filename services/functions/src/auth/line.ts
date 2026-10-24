import { AppError, LINE_ID_TOKEN_MAX_LENGTH } from '@taijian/domain';
import { getAuth } from 'firebase-admin/auth';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { config } from '../config';
import { toHttpsError } from '../lib/errors';
import { verifiedLineProfile } from '../line/verify';
import { checkLoginRateLimit } from './loginRateLimit';
import { ensureLineUser } from './users';

const InputSchema = z.object({ idToken: z.string().min(1).max(LINE_ID_TOKEN_MAX_LENGTH) });

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

  // A disabled Firebase user keeps its profile and mapping; minting a custom
  // token for it would hand out a working session to a suspended account.
  const user = await getAuth().getUser(uid);
  if (user.disabled) {
    throw new AppError('UNAUTHENTICATED', 'this account is disabled');
  }

  const token = await getAuth().createCustomToken(uid);

  return { token, uid, isNew, displayName, pictureUrl: avatarUrl };
}

/**
 * Public callable. App Check is opt-in through `ENFORCE_APP_CHECK`, and each
 * client IP gets a fixed-window budget so the endpoint cannot be used to hammer
 * LINE's verification API. The charge happens before payload validation: an
 * invalid body is still work the endpoint has to absorb.
 */
export const lineLogin = onCall(
  { region: 'asia-east1', enforceAppCheck: config.ENFORCE_APP_CHECK },
  async (request) => {
    try {
      const ip = request.rawRequest.ip;
      if (ip) await checkLoginRateLimit(ip);

      const parsed = InputSchema.safeParse(request.data);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'invalid payload', { issues: parsed.error.issues });
      }

      return await loginWithLine(parsed.data.idToken);
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);
