import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../lib/auth';

const h = vi.hoisted(() => ({
  auth: { currentUser: null as { uid: string } | null },
  onUser: null as ((user: { uid: string } | null) => void) | null,
  initLiff: vi.fn<() => Promise<{ redirecting: boolean }>>(),
  getLineIdToken: vi.fn<() => Promise<string>>(),
  callLogin: vi.fn<(idToken: string) => Promise<{ token: string; uid: string }>>(),
  signInWithCustomToken: vi.fn<() => Promise<void>>(),
}));

vi.mock('../lib/firebase', () => ({ auth: h.auth }));
vi.mock('../lib/liff', () => ({ initLiff: h.initLiff, getLineIdToken: h.getLineIdToken }));
vi.mock('../lib/api', () => ({ callLogin: h.callLogin }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, callback: (user: unknown) => void) => {
    h.onUser = callback as (user: { uid: string } | null) => void;
    return () => undefined;
  },
  signInWithCustomToken: h.signInWithCustomToken,
}));

function Probe() {
  const { user, loading, error } = useAuth();
  return (
    <div data-testid="state">
      {`loading=${String(loading)} user=${user?.uid ?? 'none'} error=${error ?? 'none'}`}
    </div>
  );
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  h.auth.currentUser = null;
  h.onUser = null;
  h.initLiff.mockResolvedValue({ redirecting: false });
  h.getLineIdToken.mockResolvedValue('line-id-token');
  h.callLogin.mockResolvedValue({ token: 'custom-token', uid: 'u1' });
  h.signInWithCustomToken.mockResolvedValue(undefined);
});

describe('AuthProvider', () => {
  it('stays loading and skips the token exchange while LIFF redirects', async () => {
    h.initLiff.mockResolvedValue({ redirecting: true });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    expect(h.initLiff).toHaveBeenCalledTimes(1);
    expect(h.getLineIdToken).not.toHaveBeenCalled();
    expect(h.callLogin).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('loading=true');
    expect(screen.getByTestId('state')).toHaveTextContent('error=none');
  });

  it('skips the LINE exchange when a Firebase session already exists', async () => {
    h.auth.currentUser = { uid: 'u1' };

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    expect(h.getLineIdToken).not.toHaveBeenCalled();
    expect(h.callLogin).not.toHaveBeenCalled();
    expect(h.signInWithCustomToken).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('loading=false user=u1');
  });

  it('exchanges the LINE ID token for a custom token and settles on the user', async () => {
    h.signInWithCustomToken.mockImplementation(async () => {
      h.auth.currentUser = { uid: 'u1' };
      h.onUser?.({ uid: 'u1' });
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    expect(h.getLineIdToken).toHaveBeenCalledTimes(1);
    expect(h.callLogin).toHaveBeenCalledWith('line-id-token');
    expect(h.signInWithCustomToken).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('loading=false user=u1');
  });

  it('surfaces a LINE token failure instead of hanging on loading', async () => {
    h.getLineIdToken.mockRejectedValue(new Error('LINE ID token unavailable'));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();

    expect(screen.getByTestId('state')).toHaveTextContent(
      'loading=false user=none error=LINE ID token unavailable',
    );
  });
});
