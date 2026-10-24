import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { PrimaryButton } from '../components/PrimaryButton';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { callCommand } from '../lib/api';
import { commandAttempt, type CommandAttempt } from '../lib/attempt';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
import { DEFAULT_HOUSEHOLD_TIMEZONE, timezoneOptions } from '../lib/timezones';

const CREATE_ERROR = '無法建立家庭，請稍後再試。';

export function HouseholdCreatePage() {
  const { user } = useAuth();
  const { select, refresh } = useHousehold();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState<string>(DEFAULT_HOUSEHOLD_TIMEZONE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A retry after a timeout must resend the same command id, otherwise the
  // server creates a second household. Editing the fields starts a new intent.
  const attemptRef = useRef<CommandAttempt | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    const payload = { name: trimmed, timezone };
    const attempt = commandAttempt(attemptRef.current, JSON.stringify(payload));
    attemptRef.current = attempt;

    try {
      const result = await callCommand('household.create', payload, {
        commandId: attempt.commandId,
      });
      if (!result.ok) {
        setError(commandErrorMessage(result.code, CREATE_ERROR));
        return;
      }
      attemptRef.current = null;
      const { householdId } = result.data as { householdId: string };
      // Re-read the profile, then select the new household. Today waits on the
      // household document, so navigation cannot flash "還沒有家庭".
      await refresh();
      void select(householdId);
      navigate('/', { replace: true });
    } catch (error_) {
      setError(callErrorMessage(error_, '無法建立家庭，請檢查網路後再試。'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="kicker">New household</div>
      <h1 className="h1">建立家庭</h1>
      <p className="muted">
        {user?.displayName ? `${user.displayName}，` : ''}
        建立一個家庭，邀請家人一起照顧居民。
      </p>
      <form className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }} onSubmit={submit}>
        <label>
          <span className="muted">家庭名稱</span>
          <input
            aria-label="家庭名稱"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 12,
              border: '1px solid var(--line)',
              padding: '0 12px',
              marginTop: 4,
            }}
          />
        </label>
        <label>
          <span className="muted">時區</span>
          <select
            aria-label="時區"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 12,
              border: '1px solid var(--line)',
              padding: '0 12px',
              marginTop: 4,
            }}
          >
            {timezoneOptions(timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" style={{ color: 'var(--overdue)', margin: 0 }}>
            {error}
          </p>
        )}
        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? '建立中…' : '建立家庭'}
        </PrimaryButton>
      </form>
      <Link
        to="/settings"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginTop: 12,
          minHeight: 44,
          color: 'var(--primary-strong)',
          fontWeight: 800,
        }}
      >
        回到設定
      </Link>
    </AppShell>
  );
}
