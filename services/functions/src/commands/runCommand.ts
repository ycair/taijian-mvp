import { AppError, CommandEnvelopeSchema, commandSchemas, type CommandResult, type CommandType } from '@taijian/domain';
import { db } from '../lib/firestore';
import { getReplay, saveCommand } from '../lib/idempotency';
import { requestHash } from '../lib/ids';
import { reserveRateLimits, type RateLimitRule } from '../lib/rateLimit';
import type { HandlerMap, Source } from './types';

export type RunCommandInput = {
  uid: string;
  envelope: unknown;
  source: Source;
  handlers: HandlerMap;
};

function rateLimitRules(type: string): RateLimitRule[] {
  const rules: RateLimitRule[] = [{ action: type, limit: 100, windowSeconds: 60 }];
  if (type === 'record.create') {
    rules.push({ action: 'record.create:burst', limit: 20, windowSeconds: 60 });
  }
  if (type === 'member.invite') {
    rules.push({ action: 'member.invite:daily', limit: 10, windowSeconds: 86400 });
  }
  return rules;
}

export async function runCommand(input: RunCommandInput): Promise<CommandResult> {
  const envelope = CommandEnvelopeSchema.parse(input.envelope);
  const schema = commandSchemas[envelope.type as CommandType];
  if (!schema) throw new AppError('VALIDATION_ERROR', `Unknown command: ${envelope.type}`);

  const payload = schema.parse(envelope.payload);
  const normalizedEnvelope = { ...envelope, payload };
  const hash = requestHash(envelope.type, payload);

  return db.runTransaction(async (tx) => {
    const replay = await getReplay(tx, envelope.commandId, hash);
    if (replay) return replay;

    // Reads for the rate-limit buckets must happen before any write in the
    // transaction, and handler reads must happen before the counters are
    // written, so the increment is deferred until the handler returns.
    const commitRateLimits = await reserveRateLimits(tx, input.uid, rateLimitRules(envelope.type));

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
    commitRateLimits();
    saveCommand(tx, envelope.commandId, input.uid, envelope.type, hash, result);
    return result;
  });
}
