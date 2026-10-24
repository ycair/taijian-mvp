export type BotCommand =
  | { kind: 'today' }
  | { kind: 'animals' }
  | { kind: 'feed'; animalName: string; note?: string }
  | { kind: 'weight'; animalName: string; grams: number }
  | { kind: 'complete'; taskName: string }
  | { kind: 'invite' }
  | { kind: 'help' }
  | { kind: 'unknown' };

/** Grams above this are a typo, not a measurement. */
const MAX_WEIGHT_GRAMS = 100_000;

/**
 * Parses one LINE text message into a bot command. Matching is anchored, so
 * ordinary chat ("今天天氣如何") never triggers a write. NFKC folding turns the
 * full-width digits and spaces produced by Chinese IMEs into their ASCII forms.
 */
export function parseBotCommand(input: string): BotCommand {
  const text = input.normalize('NFKC').trim().replace(/\s+/g, ' ');

  if (/^(今日|今天|today)$/i.test(text)) return { kind: 'today' };
  if (/^(居民|動物|animals)$/i.test(text)) return { kind: 'animals' };
  if (/^(邀請|invite)$/i.test(text)) return { kind: 'invite' };
  if (/^(說明|help|\?)$/i.test(text)) return { kind: 'help' };

  // 完成 must be checked before the animal commands: it takes a task name and
  // never resolves an animal.
  const complete = text.match(/^完成\s+(.+)$/);
  if (complete?.[1]) return { kind: 'complete', taskName: complete[1].trim() };

  const weight = text.match(/^體重\s+(\S+)\s+(\d+(?:\.\d+)?)$/);
  if (weight?.[1] && weight[2]) {
    const grams = Number(weight[2]);
    if (grams > 0 && grams <= MAX_WEIGHT_GRAMS) {
      return { kind: 'weight', animalName: weight[1], grams };
    }
    return { kind: 'unknown' };
  }

  const feed = text.match(/^(?:餵食|喂食)\s+(\S+)(?:\s+(.+))?$/);
  if (feed?.[1]) {
    return { kind: 'feed', animalName: feed[1], ...(feed[2] ? { note: feed[2].trim() } : {}) };
  }

  return { kind: 'unknown' };
}
