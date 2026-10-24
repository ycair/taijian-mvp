import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';
import { shareInvite } from '../lib/liff';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';

export function SettingsPage() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createInvite() {
    if (!household || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await callCommand(
        'member.invite',
        { role: 'caretaker', expiresInDays: 7 },
        { householdId: household.id },
      );
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const { token } = result.data as { token: string };
      setInviteUrl(
        `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/invite?token=${encodeURIComponent(token)}`,
      );
    } catch {
      setError('無法產生邀請連結，請檢查網路後再試。');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    try {
      await shareInvite(inviteUrl);
    } catch {
      setError('無法分享，請長按上方連結複製。');
    }
  }

  async function removeAccount() {
    if (!confirm('確定要刪除帳號？此操作無法復原。')) return;
    setError('');
    try {
      await httpsCallable(functions, 'deleteAccount')({});
      await signOut(auth);
    } catch {
      setError('無法刪除帳號，請稍後再試。');
    }
  }

  return (
    <AppShell>
      <div className="kicker">Settings</div>
      <h1 className="h1">設定</h1>
      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>家庭</h2>
        <p className="muted">{household?.name ?? '尚未加入家庭'}</p>
        {household && (
          <>
            <PrimaryButton type="button" onClick={createInvite} disabled={busy}>
              {busy ? '產生中…' : '產生邀請連結'}
            </PrimaryButton>
            {inviteUrl && (
              <div style={{ marginTop: 10 }}>
                <p style={{ wordBreak: 'break-all', fontSize: 12 }}>{inviteUrl}</p>
                <button
                  type="button"
                  onClick={share}
                  style={{ minHeight: 44, borderRadius: 12, border: '1px solid var(--line)', background: '#fff', padding: '0 16px' }}
                >
                  分享邀請
                </button>
              </div>
            )}
          </>
        )}
        {error && (
          <p role="alert" style={{ color: 'var(--overdue)' }}>
            {error}
          </p>
        )}
      </section>
      <section className="card" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>帳號</h2>
        <p className="muted" style={{ margin: 0 }}>
          {user?.displayName ?? user?.uid}
        </p>
        <button
          type="button"
          onClick={() => signOut(auth)}
          style={{ minHeight: 44, borderRadius: 12, border: '1px solid var(--line)', background: '#fff' }}
        >
          登出
        </button>
        <button
          type="button"
          onClick={removeAccount}
          style={{
            minHeight: 44,
            borderRadius: 12,
            border: '1px solid var(--line)',
            background: '#fff',
            color: 'var(--overdue)',
          }}
        >
          刪除帳號
        </button>
      </section>
    </AppShell>
  );
}
