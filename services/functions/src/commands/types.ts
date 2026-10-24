import type { CommandEnvelope, CommandResult } from '@taijian/domain';
import type { Tx } from '../lib/firestore';

export type Source = 'liff' | 'ios' | 'android' | 'bot' | 'test';

export type HandlerContext = {
  tx: Tx;
  uid: string;
  envelope: CommandEnvelope;
  source: Source;
  now: Date;
};

export type Handler = (ctx: HandlerContext) => Promise<CommandResult>;

export type HandlerMap = Record<string, Handler>;
