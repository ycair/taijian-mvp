import { describe, expect, it } from 'vitest';
import { completionId, requestHash } from '../src/lib/ids';

describe('ids', () => {
  it('creates a deterministic completion id', () => {
    expect(completionId('r1', '2026-10-24')).toBe(completionId('r1', '2026-10-24'));
    expect(completionId('r1', '2026-10-24')).not.toBe(completionId('r1', '2026-10-25'));
  });

  it('creates a stable request hash regardless of key order', () => {
    expect(requestHash('animal.update', { a: 1, b: 2 })).toBe(
      requestHash('animal.update', { b: 2, a: 1 }),
    );
  });

  it('scopes the request hash to the household and base revision', () => {
    const payload = { name: 'Home' };
    const base = requestHash('household.update', payload, {
      householdId: 'h1',
      baseRevision: 1,
    });

    expect(
      requestHash('household.update', payload, { householdId: 'h2', baseRevision: 1 }),
    ).not.toBe(base);
    expect(
      requestHash('household.update', payload, { householdId: 'h1', baseRevision: 2 }),
    ).not.toBe(base);
    // An unscoped hash is the same as an explicit empty scope.
    expect(requestHash('animal.update', payload)).toBe(requestHash('animal.update', payload, {}));
  });
});
