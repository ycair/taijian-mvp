/**
 * The timezones offered by the LIFF forms. The backend accepts any valid IANA
 * zone (`TimezoneSchema`); this short list keeps the picker usable on a phone.
 */
export const COMMON_TIMEZONES = [
  'Asia/Taipei',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
] as const;

export const DEFAULT_HOUSEHOLD_TIMEZONE = 'Asia/Taipei';

export function timezoneOptions(current?: string): string[] {
  const zones: string[] = [...COMMON_TIMEZONES];
  if (current && !zones.includes(current)) zones.unshift(current);
  return zones;
}

/** Mirrors the server `TimezoneSchema` so the form rejects bad input early. */
export function isValidTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
