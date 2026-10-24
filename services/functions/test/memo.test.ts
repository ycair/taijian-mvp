import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '../src/lib/memo';

afterEach(() => {
  vi.useRealTimers();
});

describe('createTtlCache', () => {
  it('loads once per key within the TTL', async () => {
    const cache = createTtlCache<number>(60_000);
    const load = vi.fn().mockResolvedValue(7);

    expect(await cache.get('a', load)).toBe(7);
    expect(await cache.get('a', load)).toBe(7);
    expect(await cache.get('b', load)).toBe(7);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reloads after the TTL expires', async () => {
    vi.useFakeTimers();
    const cache = createTtlCache<number>(1_000);
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.get('a', load)).toBe(1);
    vi.advanceTimersByTime(1_001);
    expect(await cache.get('a', load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never caches a rejection', async () => {
    const cache = createTtlCache<number>();
    const failing = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(9);

    await expect(cache.get('a', failing)).rejects.toThrow('boom');
    expect(await cache.get('a', failing)).toBe(9);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('invalidate and clear force a reload', async () => {
    const cache = createTtlCache<number>();
    const load = vi.fn().mockResolvedValue(1);

    await cache.get('a', load);
    cache.invalidate('a');
    await cache.get('a', load);
    await cache.get('b', load);
    cache.clear();
    await cache.get('a', load);
    await cache.get('b', load);

    expect(load).toHaveBeenCalledTimes(5);
  });
});
