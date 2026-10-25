import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { callCommand, newCommandId } from '../lib/api';
import { makeClient } from '../lib/supabase';

type MemberRow = {
  user_id: string;
  role: string;
  profiles?: { display_name: string } | Array<{ display_name: string }> | null;
};

function memberName(member: MemberRow): string {
  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
  return profile?.display_name ?? `${member.user_id.slice(0, 8)}…`;
}

export function SettingsPage() {
  const { token, householdId, households, profile, refresh, logout } = useApp();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [householdName, setHouseholdName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!householdId) return;
    makeClient(token)
      .from('household_members')
      .select('user_id, role, profiles(display_name)')
      .eq('household_id', householdId)
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        else setMembers((data ?? []) as MemberRow[]);
      });
  }, [token, householdId]);

  async function createHousehold() {
    if (!householdName.trim()) return;
    setBusy(true);
    setError('');
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'household.create',
      payload: { name: householdName.trim(), timezone: profile.timezone },
    });
    setBusy(false);
    if (!result.ok) setError(result.message);
    else {
      setHouseholdName('');
      await refresh();
    }
  }

  async function createInvite() {
    if (!householdId) return;
    setBusy(true);
    setError('');
    const result = await callCommand<{ token: string }>(token, {
      commandId: newCommandId(),
      type: 'member.invite',
      householdId,
      payload: { role: 'caretaker', expiresInDays: 7 },
    });
    setBusy(false);
    if (!result.ok) setError(result.message);
    else setInviteToken(result.data.token);
  }

  const current = households.find((household) => household.id === householdId);
  const inviteLink = inviteToken ? `${window.location.origin}/invite?token=${encodeURIComponent(inviteToken)}` : '';

  return (
    <div className="app">
      <div className="kicker">Settings</div>
      <h1 className="h1">設定</h1>
      {error && <p className="error">{error}</p>}
      <section className="card stack" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700 }}>家庭</div>
        {current ? (
          <>
            <div>{current.name}</div>
            <div className="muted">你的角色：{current.role === 'owner' ? '屋主' : '代管人'}</div>
            {members.map((member) => (
              <div key={member.user_id} className="between">
                <span className="muted">{memberName(member)}</span>
                <span className="badge">{member.role === 'owner' ? '屋主' : '代管'}</span>
              </div>
            ))}
            {current.role === 'owner' && (
              <>
                <button className="btn" onClick={createInvite} disabled={busy}>產生邀請連結</button>
                {inviteLink && (
                  <div className="stack">
                    <div className="muted" style={{ wordBreak: 'break-all', fontSize: 12 }}>{inviteLink}</div>
                    <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(inviteLink)}>複製連結</button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="muted">還沒有家庭，先建立一個。</div>
            <input className="input" placeholder="家庭名稱" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
            <button className="btn" onClick={createHousehold} disabled={busy || !householdName.trim()}>建立家庭</button>
          </>
        )}
      </section>
      <section className="card stack" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>帳號</div>
        <div className="muted">{profile.display_name}</div>
        <button className="btn-ghost" onClick={logout}>登出</button>
      </section>
    </div>
  );
}
