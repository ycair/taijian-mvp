import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
import { shareInvite } from '../lib/liff';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';

type Role = 'owner' | 'caretaker';

export function SettingsPage() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const householdId = household?.id ?? null;
  const uid = user?.uid ?? null;

  // `member.invite` is owner-only on the server; mirror that in the UI so a
  // caretaker never taps a button that is guaranteed to fail.
  useEffect(() => {
    if (!householdId || !uid) {
      setRole(null);
      setRoleLoaded(false);
      return;
    }
    return onSnapshot(
      doc(db, 'households', householdId, 'members', uid),
      (snap) => {
        const next = snap.exists() ? (snap.data().role as Role | undefined) : undefined;
        setRole(next ?? null);
        setRoleLoaded(true);
      },
      () => {
        // Unknown role fails closed: hide the invite UI and rely on the
        // server-side FORBIDDEN mapping for anything else.
        setRole(null);
        setRoleLoaded(true);
      },
    );
  }, [householdId, uid]);

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
        setError(commandErrorMessage(result.code, '無法產生邀請連結，請稍後再試。'));
        return;
      }
      const { token } = result.data as { token: string };
      setInviteUrl(
        `https://liff.line.me/${import.meta.env.VITE_LIFF_ID}/invite?token=${encodeURIComponent(token)}`,
      );
    } catch (error_) {
      setError(callErrorMessage(error_, '無法產生邀請連結，請檢查網路後再試。'));
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
    } catch (error_) {
      setError(callErrorMessage(error_, '無法刪除帳號，請稍後再試。'));
    }
  }

  const isOwner = role === 'owner';

  return (
    <AppShell>
      <div className="kicker">Settings</div>
      <h1 className="h1">設定</h1>
      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>家庭</h2>
        <p className="muted">{household?.name ?? '尚未加入家庭'}</p>
        {!household && (
          <Link
            to="/household/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              color: 'var(--primary-strong)',
              fontWeight: 800,
            }}
          >
            建立家庭
          </Link>
        )}
        {household && !roleLoaded && (
          <p className="muted" role="status">
            讀取家庭角色…
          </p>
        )}
        {household && roleLoaded && !isOwner && (
          <p className="muted">只有屋主可以產生邀請連結。</p>
        )}
        {household && isOwner && (
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
                  style={{
                    minHeight: 44,
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    background: '#fff',
                    padding: '0 16px',
                  }}
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
          style={{
            minHeight: 44,
            borderRadius: 12,
            border: '1px solid var(--line)',
            background: '#fff',
          }}
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
