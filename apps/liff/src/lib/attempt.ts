import { newCommandId } from '@taijian/domain';

/**
 * Idempotency state for one form intent.
 *
 * A submit that times out may have committed on the server. The retry must send
 * the *same* command id so the server can replay the stored result instead of
 * running the handler again. Editing the form starts a new intent, so the ids
 * are regenerated to avoid an `IDEMPOTENCY_MISMATCH` for a different payload.
 */
export type CommandAttempt = {
  commandId: string;
  signature: string;
};

export type RecordAttempt = CommandAttempt & {
  recordId: string;
  /** Frozen per intent: a retry must not create a second record with a new time. */
  occurredAt: string;
};

export function commandAttempt(
  previous: CommandAttempt | null,
  signature: string,
): CommandAttempt {
  if (previous && previous.signature === signature) return previous;
  return { commandId: newCommandId(), signature };
}

export function recordAttempt(
  previous: RecordAttempt | null,
  signature: string,
  now: Date = new Date(),
): RecordAttempt {
  if (previous && previous.signature === signature) return previous;
  return {
    commandId: newCommandId(),
    recordId: newCommandId(),
    occurredAt: now.toISOString(),
    signature,
  };
}
