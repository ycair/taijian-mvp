import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useHousehold } from '../lib/household';
import { callCommand } from '../lib/api';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
import { shareInvite } from '../lib/liff';
import { isValidTimezone, timezoneOptions } from '../lib/timezones';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';

type Role = 'owner' | 'caretaker';

type MemberRow = {
  id: string;
  uid?: string;
  displayName?: string;
  role?: Role;
};

type InviteRow = {
  id: string;
  role?: Role;
  status?: string;
  createdAt?: unknown;
  expiresAt?: unknown;
};

const ROLE_LABEL: Record<Role, string> = { owner: '屋主', caretaker: '照顧者' };
const INVITE_STATUS_LABEL: Record<string, string> = {
  active: '有效',
  used: '已使用',
  revoked: '已撤銷',
};

const FIELD_STYLE = {
  width: '100%',
  minHeight: 48,
  borderRadius: 12,
  border: '1px solid var(--line)',
  padding: '0 12px',
  marginTop: 4,
} as const;

const SMALL_BUTTON_STYLE = {
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: '#fff',
  padding: '0 14px',
} as const;

function memberName(member: MemberRow): string {
  return member.displayName?.trim() || member.uid || member.id;
}

/** Firestore Timestamps, Dates, ISO strings, and `{seconds}` all render the same. */
function dateLabel(value: unknown): string {
  if (!value) return '—';
  const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
  const date =
    typeof maybeTimestamp.toDate === 'function'
      ? maybeTimestamp.toDate()
      : value instanceof Date
        ? value
        : typeof value === 'string'
          ? new Date(value)
          : typeof maybeTimestamp.seconds === 'number'
            ? new Date(maybeTimestamp.seconds * 1000)
            : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('zh-TW');
}

export function SettingsPage() {
  const { user } = useAuth();
  const {
    household,
    householdIds,
    error: householdError,
    select,
  } = useHousehold();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [householdNames, setHouseholdNames] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [switchBusy, setSwitchBusy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Never let a late profile snapshot clobber a name the user is typing.
  const profileInitialized = useRef(false);

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

  useEffect(() => {
    if (!householdId) {
      setMembers([]);
      return;
    }
    return onSnapshot(
      collection(db, 'households', householdId, 'members'),
      (snap) => {
        setMembers(
          snap.docs.map((row) => ({ id: row.id, ...row.data() }) as MemberRow),
        );
      },
      () => setError('讀取家庭成員失敗，請檢查網路後重新整理。'),
    );
  }, [householdId]);

  useEffect(() => {
    if (!uid) {
      setProfileLoaded(false);
      return;
    }
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const data = snap.data() as { displayName?: string; timezone?: string } | undefined;
        if (!profileInitialized.current) {
          setDisplayName(data?.displayName ?? user?.displayName ?? '');
          setTimezone(data?.timezone ?? 'Asia/Taipei');
          profileInitialized.current = true;
        }
        setProfileLoaded(true);
      },
      () => setProfileLoaded(true),
    );
  }, [uid, user?.displayName]);

  // Names for the household switcher. There is no collection read that spans
  // households, and a member may only read their own, so subscribe per id.
  useEffect(() => {
    if (householdIds.length === 0) return;
    const unsubscribes = householdIds.map((id) =>
      onSnapshot(
        doc(db, 'households', id),
        (snap) => {
          if (!snap.exists()) return;
          setHouseholdNames((current) => ({
            ...current,
            [id]: (snap.data().name as string | undefined) ?? '我的家庭',
          }));
        },
        () => undefined,
      ),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [householdIds]);

  const isOwner = role === 'owner';

  // The invite read rule is owner-only; never issue the query while the role is
  // unknown or caretaker, or the whole Settings page would surface an error.
  useEffect(() => {
    if (!householdId || !isOwner) {
      setInvites([]);
      return;
    }
    return onSnapshot(
      query(
        collection(db, 'invites'),
        where('householdId', '==', householdId),
        where('status', '==', 'active'),
      ),
      (snap) => {
        setInvites(snap.docs.map((row) => ({ id: row.id, ...row.data() }) as InviteRow));
      },
      () => setError('讀取邀請失敗，請檢查網路後重新整理。'),
    );
  }, [householdId, isOwner]);

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

  async function revokeInvite(invite: InviteRow) {
    if (!household || memberBusy) return;
    if (!confirm('確定要撤銷這個邀請連結？撤銷後對方將無法加入。')) return;
    setMemberBusy(`invite:${invite.id}`);
    setError('');
    try {
      const result = await callCommand(
        'member.revokeInvite',
        { inviteId: invite.id },
        { householdId: household.id },
      );
      if (!result.ok) {
        setError(commandErrorMessage(result.code, '無法撤銷邀請，請稍後再試。'));
      }
    } catch (error_) {
      setError(callErrorMessage(error_, '無法撤銷邀請，請檢查網路後再試。'));
    } finally {
      setMemberBusy(null);
    }
  }

  async function changeRole(member: MemberRow) {
    if (!household || memberBusy || !member.role) return;
    const nextRole: Role = member.role === 'owner' ? 'caretaker' : 'owner';
    const action = nextRole === 'owner' ? '設為屋主' : '設為照顧者';
    if (!confirm(`確定要將 ${memberName(member)} ${action}？`)) return;
    setMemberBusy(`role:${member.id}`);
    setError('');
    try {
      const result = await callCommand(
        'member.updateRole',
        { uid: member.id, role: nextRole },
        { householdId: household.id },
      );
      if (!result.ok) {
        setError(commandErrorMessage(result.code, '無法變更角色，請稍後再試。'));
      }
    } catch (error_) {
      setError(callErrorMessage(error_, '無法變更角色，請檢查網路後再試。'));
    } finally {
      setMemberBusy(null);
    }
  }

  async function removeMember(member: MemberRow) {
    if (!household || memberBusy) return;
    if (!confirm(`確定要將 ${memberName(member)} 從家庭移除？`)) return;
    setMemberBusy(`remove:${member.id}`);
    setError('');
    try {
      const result = await callCommand(
        'member.remove',
        { uid: member.id },
        { householdId: household.id },
      );
      if (!result.ok) {
        setError(commandErrorMessage(result.code, '無法移除成員，請稍後再試。'));
      }
    } catch (error_) {
      setError(callErrorMessage(error_, '無法移除成員，請檢查網路後再試。'));
    } finally {
      setMemberBusy(null);
    }
  }

  async function leaveHousehold() {
    if (!household || memberBusy) return;
    if (!confirm(`確定要離開「${household.name}」？離開後將看不到這個家庭的資料。`)) return;
    setMemberBusy('leave');
    setError('');
    try {
      const result = await callCommand('member.leave', {}, { householdId: household.id });
      if (!result.ok) {
        setError(commandErrorMessage(result.code, '無法離開家庭，請稍後再試。'));
        return;
      }
      navigate('/', { replace: true });
    } catch (error_) {
      setError(callErrorMessage(error_, '無法離開家庭，請檢查網路後再試。'));
    } finally {
      setMemberBusy(null);
    }
  }

  async function switchHousehold(id: string) {
    if (switchBusy || id === householdId) return;
    setSwitchBusy(id);
    setError('');
    try {
      await select(id);
    } finally {
      setSwitchBusy(null);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileBusy) return;
    setProfileError('');
    setProfileSaved('');

    const trimmed = displayName.trim();
    if (!trimmed) {
      setProfileError('請填寫顯示名稱。');
      return;
    }
    if (!isValidTimezone(timezone)) {
      setProfileError('請選擇有效的時區。');
      return;
    }

    setProfileBusy(true);
    try {
      const result = await callCommand('user.updateProfile', {
        displayName: trimmed,
        timezone,
      });
      if (!result.ok) {
        setProfileError(commandErrorMessage(result.code, '無法儲存個人資料，請稍後再試。'));
        return;
      }
      setDisplayName(trimmed);
      setProfileSaved('已儲存個人資料。');
    } catch (error_) {
      setProfileError(callErrorMessage(error_, '無法儲存個人資料，請檢查網路後再試。'));
    } finally {
      setProfileBusy(false);
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
        {household && roleLoaded && role && (
          <p className="muted" style={{ marginTop: 0 }}>
            你的角色：{ROLE_LABEL[role]}
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
                <button type="button" onClick={share} style={SMALL_BUTTON_STYLE}>
                  分享邀請
                </button>
              </div>
            )}
          </>
        )}
        {(error || householdError) && (
          <p role="alert" style={{ color: 'var(--overdue)' }}>
            {error || householdError}
          </p>
        )}
      </section>

      <section className="card" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>成員</h2>
        {!household && <p className="muted">加入家庭後即可看到成員。</p>}
        {household && members.length === 0 && <p className="muted">讀取成員中…</p>}
        {members.map((member) => {
          const self = member.id === uid;
          return (
            <div
              key={member.id}
              style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {memberName(member)}
                {self ? '（你）' : ''}
                <span className="muted" style={{ marginLeft: 8, fontWeight: 600 }}>
                  {member.role ? ROLE_LABEL[member.role] : '角色未設定'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {isOwner && !self && member.role && (
                  <button
                    type="button"
                    onClick={() => void changeRole(member)}
                    disabled={memberBusy !== null}
                    style={SMALL_BUTTON_STYLE}
                  >
                    {member.role === 'owner' ? '設為照顧者' : '設為屋主'}
                  </button>
                )}
                {isOwner && !self && (
                  <button
                    type="button"
                    onClick={() => void removeMember(member)}
                    disabled={memberBusy !== null}
                    style={{ ...SMALL_BUTTON_STYLE, color: 'var(--overdue)' }}
                  >
                    移除
                  </button>
                )}
                {self && (
                  <button
                    type="button"
                    onClick={() => void leaveHousehold()}
                    disabled={memberBusy !== null}
                    style={{ ...SMALL_BUTTON_STYLE, color: 'var(--overdue)' }}
                  >
                    離開家庭
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {household && isOwner && (
        <section className="card" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>有效邀請</h2>
          {invites.length === 0 && <p className="muted">目前沒有有效的邀請連結。</p>}
          {invites.map((invite) => (
            <div
              key={invite.id}
              style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {invite.role ? ROLE_LABEL[invite.role] : '照顧者'}
                <span className="muted" style={{ marginLeft: 8, fontWeight: 600 }}>
                  {INVITE_STATUS_LABEL[invite.status ?? 'active'] ?? invite.status}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 11 }}>
                建立 {dateLabel(invite.createdAt)} · 到期 {dateLabel(invite.expiresAt)}
              </div>
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => void revokeInvite(invite)}
                  disabled={memberBusy !== null}
                  style={{ ...SMALL_BUTTON_STYLE, color: 'var(--overdue)' }}
                >
                  撤銷邀請
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {householdIds.length > 0 && (
        <section className="card" style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>切換家庭</h2>
          {householdIds.map((id) => (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '6px 0',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                {householdNames[id] ?? id}
                {id === householdId && (
                  <span className="muted" style={{ marginLeft: 8, fontWeight: 600 }}>
                    使用中
                  </span>
                )}
              </span>
              {id !== householdId && (
                <button
                  type="button"
                  onClick={() => void switchHousehold(id)}
                  disabled={switchBusy !== null}
                  style={SMALL_BUTTON_STYLE}
                >
                  {switchBusy === id ? '切換中…' : '切換'}
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>個人資料</h2>
        {!profileLoaded ? (
          <p className="muted" role="status">
            讀取個人資料…
          </p>
        ) : (
          <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
            <label>
              <span className="muted">顯示名稱</span>
              <input
                aria-label="顯示名稱"
                value={displayName}
                maxLength={40}
                onChange={(event) => setDisplayName(event.target.value)}
                style={FIELD_STYLE}
              />
            </label>
            <label>
              <span className="muted">時區</span>
              <select
                aria-label="個人時區"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                style={FIELD_STYLE}
              >
                {timezoneOptions(timezone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            {profileError && (
              <p role="alert" style={{ color: 'var(--overdue)', margin: 0 }}>
                {profileError}
              </p>
            )}
            {profileSaved && (
              <p role="status" style={{ color: 'var(--primary-strong)', margin: 0 }}>
                {profileSaved}
              </p>
            )}
            <PrimaryButton type="submit" disabled={profileBusy}>
              {profileBusy ? '儲存中…' : '儲存個人資料'}
            </PrimaryButton>
          </form>
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
