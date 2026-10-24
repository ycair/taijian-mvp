import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvitePage } from '../pages/InvitePage';
import { callCommand } from '../lib/api';

vi.mock('../lib/api', () => ({ callCommand: vi.fn() }));

const mockedCall = vi.mocked(callCommand);

function renderPage(token = 'invite-1.secret-abcdefghijklmnop') {
  return render(
    <MemoryRouter initialEntries={[`/invite?token=${token}`]}>
      <InvitePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockedCall.mockReset();
  // Start with the token actually in the browser URL so the scrub is provable.
  window.history.replaceState(null, '', '/invite?token=invite-1.secret-abcdefghijklmnop');
});

describe('InvitePage', () => {
  it('scrubs the single-use token from the URL after accepting', async () => {
    mockedCall.mockResolvedValue({
      ok: true,
      commandId: 'c1',
      data: { householdId: 'h1' },
      serverTime: new Date().toISOString(),
    });

    renderPage();

    expect(await screen.findByText('邀請已接受')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/invite');
      expect(window.location.search).toBe('');
    });
  });

  it('shows Chinese copy for an expired invite instead of the server message', async () => {
    mockedCall.mockResolvedValue({
      ok: false,
      commandId: 'c1',
      code: 'INVITE_EXPIRED',
      message: 'invite is no longer valid',
      serverTime: new Date().toISOString(),
    });

    renderPage();

    expect(await screen.findByText('邀請已失效，請屋主重新產生。')).toBeInTheDocument();
    expect(screen.queryByText('invite is no longer valid')).not.toBeInTheDocument();
  });

  it('shows Chinese copy for an already-used invite', async () => {
    mockedCall.mockResolvedValue({
      ok: false,
      commandId: 'c1',
      code: 'INVITE_USED',
      message: 'invite has already been used',
      serverTime: new Date().toISOString(),
    });

    renderPage();

    expect(await screen.findByText('這個邀請已經被使用過了。')).toBeInTheDocument();
  });
});
