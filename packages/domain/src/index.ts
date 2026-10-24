import { v7 as uuidv7 } from 'uuid';

export * from './errors';
export * from './permissions';
export * from './species';
export * from './time';
export * from './schemas/common';
export * from './schemas/household';
export * from './schemas/animal';
export * from './schemas/record';
export * from './schemas/reminder';
export * from './schemas/invite';
export * from './commands';

export function newCommandId(): string {
  return uuidv7();
}
