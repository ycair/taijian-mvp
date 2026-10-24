import { describe, expect, it } from 'vitest';
import { appCheckSettings } from '../lib/appCheck';

describe('app check settings', () => {
  it('skips initialization without a site key', () => {
    expect(appCheckSettings({ dev: false })).toEqual({ enabled: false });
    expect(appCheckSettings({ dev: true, debugToken: 'dbg' })).toEqual({ enabled: false });
  });

  it('enables App Check with a site key and only uses the debug token in dev', () => {
    expect(appCheckSettings({ siteKey: ' key ', dev: false, debugToken: 'dbg' })).toEqual({
      enabled: true,
      siteKey: 'key',
    });
    expect(appCheckSettings({ siteKey: 'key', dev: true, debugToken: ' dbg ' })).toEqual({
      enabled: true,
      siteKey: 'key',
      debugToken: 'dbg',
    });
  });
});
