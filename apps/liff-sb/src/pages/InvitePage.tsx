import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../App';
import { callCommand, newCommandId } from '../lib/api';

export function InvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { token: authToken, refresh } = useApp();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('error');
      setMessage('邀請連結不完整。');
      return;
    }
    callCommand(authToken, {
      commandId: newCommandId(),
      type: 'member.accept',
      payload: { token },
    }).then(async (result) => {
      if (result.ok) {
        setState('ok');
        setMessage('已加入家庭，歡迎一起照顧居民。');
        await refresh();
        window.history.replaceState(null, '', '/invite');
      } else {
        setState('error');
        setMessage(result.message);
      }
    });
  }, [token, authToken, refresh]);

  return (
    <div className="app">
      <div className="card" style={{ marginTop: 40, textAlign: 'center' }}>
        <h1 className="h1">
          {state === 'ok' ? '邀請已接受' : state === 'error' ? '無法接受邀請' : '正在加入…'}
        </h1>
        <p className="muted">{message}</p>
        {state !== 'loading' && <Link to="/" className="btn" style={{ display: 'inline-grid', placeItems: 'center', textDecoration: 'none' }}>回到今日</Link>}
      </div>
    </div>
  );
}
