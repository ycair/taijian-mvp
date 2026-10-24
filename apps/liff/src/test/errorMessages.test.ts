import { describe, expect, it } from 'vitest';
import { callErrorMessage, commandErrorMessage, GENERIC_ERROR } from '../lib/errorMessages';

describe('commandErrorMessage', () => {
  it('maps invite failures to actionable Chinese copy', () => {
    expect(commandErrorMessage('INVITE_EXPIRED')).toBe('邀請已失效，請屋主重新產生。');
    expect(commandErrorMessage('INVITE_USED')).toBe('這個邀請已經被使用過了。');
  });

  it('maps the remaining domain codes', () => {
    expect(commandErrorMessage('NOT_FOUND')).toBe('找不到資料，請重新整理。');
    expect(commandErrorMessage('FORBIDDEN')).toContain('沒有權限');
    expect(commandErrorMessage('RATE_LIMITED')).toContain('太頻繁');
    expect(commandErrorMessage('VALIDATION_ERROR')).toContain('資料格式');
    expect(commandErrorMessage('CONFLICT')).toContain('資料已更新');
    expect(commandErrorMessage('UNAUTHENTICATED')).toContain('登入已過期');
    expect(commandErrorMessage('INTERNAL')).toContain('系統');
  });

  it('falls back for unknown codes and never echoes the code', () => {
    expect(commandErrorMessage('SOMETHING_NEW')).toBe(GENERIC_ERROR);
    expect(commandErrorMessage(undefined)).toBe(GENERIC_ERROR);
    expect(commandErrorMessage('SOMETHING_NEW', '自訂訊息')).toBe('自訂訊息');
  });
});

describe('callErrorMessage', () => {
  it('maps transport codes to the same Chinese copy', () => {
    expect(callErrorMessage({ code: 'functions/permission-denied' })).toContain('沒有權限');
    expect(callErrorMessage({ code: 'functions/unauthenticated' })).toContain('登入已過期');
    expect(callErrorMessage({ code: 'functions/unavailable' })).toContain('網路不穩');
  });

  it('falls back for unknown or missing errors', () => {
    expect(callErrorMessage(new Error('boom'))).toBe(GENERIC_ERROR);
    expect(callErrorMessage(null)).toBe(GENERIC_ERROR);
    expect(callErrorMessage({ code: 'functions/internal' })).toContain('系統');
  });
});
