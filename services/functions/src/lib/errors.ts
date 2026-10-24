import { HttpsError } from 'firebase-functions/v2/https';
import { AppError, type ErrorCode } from '@taijian/domain';

const HTTP_CODES: Record<ErrorCode, 'invalid-argument' | 'unauthenticated' | 'permission-denied' | 'not-found' | 'failed-precondition' | 'resource-exhausted' | 'already-exists' | 'internal'> = {
  VALIDATION_ERROR: 'invalid-argument',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'permission-denied',
  NOT_FOUND: 'not-found',
  CONFLICT: 'failed-precondition',
  RATE_LIMITED: 'resource-exhausted',
  DUPLICATE_ID: 'already-exists',
  IDEMPOTENCY_MISMATCH: 'failed-precondition',
  LINE_ALREADY_LINKED: 'already-exists',
  LAST_OWNER: 'failed-precondition',
  INVITE_EXPIRED: 'failed-precondition',
  INVITE_USED: 'failed-precondition',
  INTERNAL: 'internal',
};

export function toHttpsError(error: unknown): HttpsError {
  if (error instanceof AppError) {
    return new HttpsError(HTTP_CODES[error.code], error.message, error.details);
  }
  return new HttpsError('internal', 'Unexpected error');
}
