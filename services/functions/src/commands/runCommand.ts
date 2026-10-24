import {
  AppError,
  CommandEnvelopeSchema,
  commandSchemas,
  type CommandResult,
  type CommandType,
} from '@taijian/domain';
import { db } from '../lib/firestore';
import { getReplay, peekReplay, saveCommand } from '../lib/idempotency';
import { requestHash } from '../lib/ids';
import { reserveRateLimits, type RateLimitRule } from '../lib/rateLimit';
import type { HandlerMap, Source } from './types';

export type RunCommandInput = {
  uid: string;
  envelope: unknown;
  source: Source;
  handlers: HandlerMap;
};

/** Per-UID budget shared by every command type. */
export const COMMAND_LIMIT = 100;
export const COMMAND_LIMIT_WINDOW_SECONDS = 60;
export const RECORD_CREATE_LIMIT = 20;
export const MEMBER_INVITE_DAILY_LIMIT = 10;

export function rateLimitRules(type: string): RateLimitRule[] {
  const rules: RateLimitRule[] = [
    { action: 'command', limit: COMMAND_LIMIT, windowSeconds: COMMAND_LIMIT_WINDOW_SECONDS },
  ];
  if (type === 'record.create') {
    rules.push({
      action: 'record.create',
      limit: RECORD_CREATE_LIMIT,
      windowSeconds: COMMAND_LIMIT_WINDOW_SECONDS,
    });
  }
  if (type === 'member.invite') {
    rules.push({
      action: 'member.invite',
      limit: MEMBER_INVITE_DAILY_LIMIT,
      windowSeconds: 86400,
    });
  }
  return rules;
}

/**
 * Consumes the caller's budget in its own transaction so that rejected or
 * failed commands are charged too. The command transaction itself never writes
 * rate-limit counters, which keeps its read/write ordering simple.
 */
async function chargeRateLimits(uid: string, type: string): Promise<void> {
  const rules = rateLimitRules(type);
  await db.runTransaction(async (tx) => {
    const commit = await reserveRateLimits(tx, uid, rules);
    commit();
  });
}

export async function runCommand(input: RunCommandInput): Promise<CommandResult> {
  // Rate limiting happens before validation would otherwise bail out, so invalid
  // requests still consume the global budget.
  const envelopeResult = CommandEnvelopeSchema.safeParse(input.envelope);
  if (!envelopeResult.success) {
    await chargeRateLimits(input.uid, 'invalid');
    throw new AppError('VALIDATION_ERROR', 'invalid envelope', {
      issues: envelopeResult.error.issues,
    });
  }

  const envelope = envelopeResult.data;
  const schema = commandSchemas[envelope.type as CommandType];
  if (!schema) {
    await chargeRateLimits(input.uid, envelope.type);
    throw new AppError('VALIDATION_ERROR', 'invalid payload', {
      issues: [
        { code: 'custom', path: ['type'], message: `unknown command: ${envelope.type}` },
      ],
    });
  }

  const payloadResult = schema.safeParse(envelope.payload);
  if (!payloadResult.success) {
    await chargeRateLimits(input.uid, envelope.type);
    throw new AppError('VALIDATION_ERROR', 'invalid payload', {
      issues: payloadResult.error.issues,
    });
  }

  const payload = payloadResult.data;
  const normalizedEnvelope = { ...envelope, payload };
  const hash = requestHash(envelope.type, payload);

  // Retries are free: an existing command replays before any budget is spent.
  const replay = await peekReplay(input.uid, envelope.commandId, hash);
  if (replay) return replay;

  await chargeRateLimits(input.uid, envelope.type);

  return db.runTransaction(async (tx) => {
    // Re-check inside the transaction so concurrent duplicates stay race-free.
    const committed = await getReplay(tx, input.uid, envelope.commandId, hash);
    if (committed) return committed;

    const handler = input.handlers[envelope.type];
    if (!handler) {
      throw new AppError('VALIDATION_ERROR', `Unknown command: ${envelope.type}`);
    }

    const result = await handler({
      tx,
      uid: input.uid,
      envelope: normalizedEnvelope,
      source: input.source,
      now: new Date(),
    });
    saveCommand(tx, envelope.commandId, input.uid, envelope.type, hash, result);
    return result;
  });
}
