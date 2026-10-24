import { createHash } from 'node:crypto';

export function completionId(reminderId: string, dueDate: string): string {
  return createHash('sha256').update(`${reminderId}:${dueDate}`).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

export function requestHash(type: string, payload: unknown): string {
  return createHash('sha256').update(stableStringify({ type, payload })).digest('hex');
}
