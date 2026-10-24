import type { CommandEnvelope, CommandResult, CommandType } from '@taijian/domain';
import type { Tx } from '../lib/firestore';
import type { LineProfile } from '../line/verify';

export type Source = 'liff' | 'ios' | 'android' | 'bot' | 'test';

export type HandlerContext = {
  tx: Tx;
  uid: string;
  envelope: CommandEnvelope;
  source: Source;
  now: Date;
  /**
   * Pre-verified LINE profile for `line.link`. The entrypoint exchanges the ID
   * token before the transaction starts, so a retried transaction never repeats
   * the HTTP call. Absent for every other command.
   */
  lineProfile?: LineProfile;
};

/**
 * Handlers run inside a Firestore transaction that is retried on contention.
 * They must only touch data through `ctx.tx` and must not perform
 * non-transactional side effects (LINE push messages, token exchange, HTTP
 * calls, timers), because a retry or a failed commit would repeat them.
 */
export type Handler = (ctx: HandlerContext) => Promise<CommandResult>;

/** Registered handlers; every key is compile-time checked against `CommandType`. */
export type HandlerMap = Partial<Record<CommandType, Handler>>;
