import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { callCommand } from '../lib/api';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';

export function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('邀請連結不完整。');
      return;
    }
    let cancelled = false;
    callCommand('member.accept', { token })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setState('ok');
          setMessage('已加入家庭，歡迎一起照顧居民。');
          // The token is a single-use secret: drop it from the address bar and
          // history so a revisit or a shared screenshot cannot replay it.
          window.history.replaceState(null, '', '/invite');
        } else {
          setState('error');
          setMessage(commandErrorMessage(result.code, '無法接受邀請，請稍後再試。'));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState('error');
        setMessage(callErrorMessage(error, '無法接受邀請，請確認連結是否過期，或稍後再試。'));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AppShell>
      <div className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h1 className="h1">
          {state === 'ok' ? '邀請已接受' : state === 'error' ? '無法接受邀請' : '正在加入…'}
        </h1>
        <p className="muted">{message}</p>
        {state !== 'loading' && (
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              color: 'var(--primary-strong)',
              fontWeight: 800,
            }}
          >
            回到今日
          </Link>
        )}
      </div>
    </AppShell>
  );
}
