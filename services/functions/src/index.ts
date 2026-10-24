// Entry point for the Functions bundle.
// Task 9 replaces the core-library re-exports below with the deployed function
// exports (`executeCommand`, `lineLogin`, `deleteAccount`).
export { config } from './config';
export { toHttpsError } from './lib/errors';
export { completionId, requestHash } from './lib/ids';
export { db } from './lib/firestore';
export { writeAudit } from './lib/audit';
export { getReplay, peekReplay, saveCommand } from './lib/idempotency';
export { checkRateLimit, rateLimitDocId, reserveRateLimits } from './lib/rateLimit';
export type { RateLimitReservation, RateLimitRule } from './lib/rateLimit';
export { toFailure } from './lib/result';
export { runCommand, rateLimitRules } from './commands/runCommand';
export type { Handler, HandlerContext, HandlerMap, Source } from './commands/types';
