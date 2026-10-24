import { describe, expect, it } from 'vitest';
import { commandSchemas, type CommandType } from '@taijian/domain';
import { commandHandlers } from '../src/commands/registry';

/**
 * Commands that are intentionally schema-only. Keep this list empty unless a
 * command type is defined for a future client with no server handler yet; an
 * unused type is a contract bug, because `runCommand` would reject it at runtime
 * with a generic VALIDATION_ERROR.
 */
const UNHANDLED_COMMANDS: CommandType[] = [];

describe('command registry', () => {
  it('registers a handler for every command type', () => {
    const missing = (Object.keys(commandSchemas) as CommandType[]).filter(
      (type) => commandHandlers[type] === undefined && !UNHANDLED_COMMANDS.includes(type),
    );
    expect(missing).toEqual([]);
  });

  it('does not register handlers for unknown command types', () => {
    const known = new Set(Object.keys(commandSchemas));
    const unknown = Object.keys(commandHandlers).filter((type) => !known.has(type));
    expect(unknown).toEqual([]);
  });

  it('has no stale allowlist entries', () => {
    const known = new Set(Object.keys(commandSchemas));
    const stale = UNHANDLED_COMMANDS.filter((type) => !known.has(type));
    expect(stale).toEqual([]);
  });
});
