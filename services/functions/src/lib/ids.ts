import { createHash } from 'node:crypto';

export function completionId(reminderId: string, dueDate: string): string {
  return createHash('sha256').update(`${reminderId}:${dueDate}`).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

export type RequestScope = { householdId?: string; baseRevision?: number };

/**
 * Hash of everything that makes a command distinct. The household and base
 * revision are part of it: reusing a `commandId` for the same payload against a
 * different household (or a different edit point) must replay as a mismatch
 * instead of silently returning another entity's result.
 */
export function requestHash(type: string, payload: unknown, scope: RequestScope = {}): string {
  const body = {
    type,
    payload,
    householdId: scope.householdId ?? null,
    baseRevision: scope.baseRevision ?? null,
  };
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}
