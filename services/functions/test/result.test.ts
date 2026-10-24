import { describe, expect, it } from 'vitest';
import { AppError } from '@taijian/domain';
import { toFailure } from '../src/lib/result';

describe('toFailure', () => {
  it('maps AppError details into the response envelope', () => {
    const failure = toFailure(
      new AppError('CONFLICT', 'stale revision', { currentRevision: 9, lastChangedFields: ['weight'] }),
      'cmd_1',
    );
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.code).toBe('CONFLICT');
      expect(failure.currentRevision).toBe(9);
      expect(failure.lastChangedFields).toEqual(['weight']);
    }
  });

  it('never lets details override the envelope contract', () => {
    const failure = toFailure(
      new AppError('NOT_FOUND', 'missing', { ok: true, code: 'INTERNAL', message: 'spoofed' }),
      'cmd_2',
    );
    expect(failure).toMatchObject({
      ok: false,
      commandId: 'cmd_2',
      code: 'NOT_FOUND',
      message: 'missing',
    });
  });
});
