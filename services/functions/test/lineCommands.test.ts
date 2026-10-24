import { describe, expect, it } from 'vitest';
import { parseBotCommand } from '../src/line/commands';
import { botCommandId, truncateReplyText } from '../src/line/handler';

describe('parseBotCommand', () => {
  it('parses today and animals', () => {
    expect(parseBotCommand('今日')).toEqual({ kind: 'today' });
    expect(parseBotCommand('居民')).toEqual({ kind: 'animals' });
  });

  it('parses feeding with and without a note', () => {
    expect(parseBotCommand('餵食 阿肥')).toEqual({ kind: 'feed', animalName: '阿肥' });
    expect(parseBotCommand('餵食 阿肥 吃了兩隻蟋蟀')).toEqual({
      kind: 'feed',
      animalName: '阿肥',
      note: '吃了兩隻蟋蟀',
    });
  });

  it('parses weight in grams', () => {
    expect(parseBotCommand('體重 阿肥 68')).toEqual({
      kind: 'weight',
      animalName: '阿肥',
      grams: 68,
    });
  });

  it('returns unknown for unsupported text', () => {
    expect(parseBotCommand('今天天氣如何')).toEqual({ kind: 'unknown' });
  });

  it('parses completion without an animal', () => {
    expect(parseBotCommand('完成 換水')).toEqual({ kind: 'complete', taskName: '換水' });
    expect(parseBotCommand('完成 餵食 阿肥')).toEqual({
      kind: 'complete',
      taskName: '餵食 阿肥',
    });
  });

  it('parses invite and help aliases', () => {
    expect(parseBotCommand('邀請')).toEqual({ kind: 'invite' });
    expect(parseBotCommand('invite')).toEqual({ kind: 'invite' });
    expect(parseBotCommand('說明')).toEqual({ kind: 'help' });
    expect(parseBotCommand('?')).toEqual({ kind: 'help' });
    expect(parseBotCommand('？')).toEqual({ kind: 'help' });
  });

  it('trims, collapses whitespace, and folds full-width input', () => {
    expect(parseBotCommand('  今日  ')).toEqual({ kind: 'today' });
    expect(parseBotCommand('餵食\t阿肥   吃了兩隻')).toEqual({
      kind: 'feed',
      animalName: '阿肥',
      note: '吃了兩隻',
    });
    expect(parseBotCommand('體重\u3000阿肥\u3000６８')).toEqual({
      kind: 'weight',
      animalName: '阿肥',
      grams: 68,
    });
  });

  it('accepts the common 喂食 spelling', () => {
    expect(parseBotCommand('喂食 阿肥')).toEqual({ kind: 'feed', animalName: '阿肥' });
  });

  it('rejects incomplete or impossible arguments', () => {
    expect(parseBotCommand('餵食')).toEqual({ kind: 'unknown' });
    expect(parseBotCommand('餵食 ')).toEqual({ kind: 'unknown' });
    expect(parseBotCommand('體重 阿肥')).toEqual({ kind: 'unknown' });
    expect(parseBotCommand('體重 阿肥 很重')).toEqual({ kind: 'unknown' });
    expect(parseBotCommand('體重 阿肥 0')).toEqual({ kind: 'unknown' });
    expect(parseBotCommand('完成')).toEqual({ kind: 'unknown' });
    expect(parseBotCommand('')).toEqual({ kind: 'unknown' });
  });
});

describe('truncateReplyText', () => {
  it('leaves short replies untouched', () => {
    expect(truncateReplyText('今日任務（1/1）：\n✓ 餵食')).toBe('今日任務（1/1）：\n✓ 餵食');
  });

  it('clamps a long summary to the LINE text limit', () => {
    const text = '○ 餵食\n'.repeat(1_001);
    const clamped = truncateReplyText(text);

    expect(text.length).toBeGreaterThan(5_000);
    expect(clamped.length).toBe(5_000);
    expect(clamped.endsWith('…')).toBe(true);
  });

  it('never splits a surrogate pair at the boundary', () => {
    // 4,999 BMP characters, then an emoji that would straddle the cut.
    const text = `${'a'.repeat(4_999)}🐢${'b'.repeat(100)}`;
    const clamped = truncateReplyText(text);

    expect(clamped.length).toBeLessThanOrEqual(5_000);
    expect(clamped.endsWith('…')).toBe(true);
    expect(clamped).not.toContain('🐢');
    expect(clamped.slice(4_998)).toBe('a…');
  });
});

describe('botCommandId', () => {
  it('derives a stable UUID from a LINE webhook event id', () => {
    const eventId = '01H8101Z8S1638J0GZ5H0V0V0V';
    const id = botCommandId(eventId);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(botCommandId(eventId)).toBe(id);
    expect(botCommandId('01H8101Z8S1638J0GZ5H0V0V1')).not.toBe(id);
  });
});
