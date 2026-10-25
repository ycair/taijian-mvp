import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { makeClient } from './lib/supabase';
import { loginWithLine } from './lib/api';
import { getLineIdToken } from './lib/liff';
import type { Household, Profile } from './lib/types';
import { TodayPage } from './pages/TodayPage';
import { AnimalsPage } from './pages/AnimalsPage';
import { AnimalDetailPage } from './pages/AnimalDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { InvitePage } from './pages/InvitePage';

type AppState = {
  token: string;
  userId: string;
  profile: Profile;
  households: Household[];
  householdId: string | null;
  refresh: () => Promise<void>;
  logout: () => void;
};

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppContext missing');
  return value;
}

async function loadProfileAndHouseholds(token: string, userId: string) {
  const client = makeClient(token);
  const [{ data: profile, error: profileError }, { data: memberships, error: memberError }] =
    await Promise.all([
      client.from('profiles').select('*').eq('id', userId).single(),
      client
        .from('household_members')
        .select('role, household_id, households(id,name,timezone)')
        .eq('user_id', userId),
    ]);
  if (profileError) throw profileError;
  if (memberError) throw memberError;
  const households: Household[] = (memberships ?? []).map((row: any) => ({
    id: row.households.id,
    name: row.households.name,
    timezone: row.households.timezone,
    role: row.role,
  }));
  const preferred = profile.default_household_id;
  const householdId =
    households.find((household) => household.id === preferred)?.id ?? households[0]?.id ?? null;
  return { profile: profile as Profile, households, householdId };
}

function LoginPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    setError('');
    try {
      const idToken = await getLineIdToken();
      const result = await loginWithLine(idToken);
      if (!result.ok || !result.token || !result.userId) {
        setError(result.message ?? '登入失敗');
        return;
      }
      localStorage.setItem('sb_token', result.token);
      localStorage.setItem('sb_user', result.userId);
      window.location.href = '/';
    } catch (e) {
      const message = e instanceof Error ? e.message : '登入失敗';
      if (message !== 'redirecting') setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app" style={{ display: 'grid', placeItems: 'center' }}>
      <div className="card" style={{ width: '100%', textAlign: 'center' }}>
        <div className="kicker">苔間 · Supabase Demo</div>
        <h1 className="h1">把每一次照顧，留在同一個家。</h1>
        <p className="muted">使用 LINE 或測試帳號登入。</p>
        {error && <p className="error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} onClick={login} disabled={busy}>
          {busy ? '登入中…' : '以 LINE 登入'}
        </button>
      </div>
    </div>
  );
}

function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sb_token');
    const userId = localStorage.getItem('sb_user');
    if (!token || !userId) {
      setLoading(false);
      return;
    }
    loadProfileAndHouseholds(token, userId)
      .then(({ profile, households, householdId }) => {
        setState({
          token,
          userId,
          profile,
          households,
          householdId,
          refresh: () => refresh(token, userId),
          logout: () => {
            localStorage.removeItem('sb_token');
            localStorage.removeItem('sb_user');
            window.location.href = '/';
          },
        });
      })
      .catch(() => {
        localStorage.removeItem('sb_token');
        localStorage.removeItem('sb_user');
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh(token: string, userId: string) {
    const { profile, households, householdId } = await loadProfileAndHouseholds(token, userId);
    setState((current) =>
      current
        ? { ...current, profile, households, householdId }
        : {
            token,
            userId,
            profile,
            households,
            householdId,
            refresh: () => refresh(token, userId),
            logout: () => {
              localStorage.removeItem('sb_token');
              localStorage.removeItem('sb_user');
              window.location.href = '/';
            },
          },
    );
  }

  if (loading) return <div className="app">載入中…</div>;
  if (!state) return <LoginPage />;
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

function BottomNav() {
  return (
    <nav className="nav">
      <NavLink to="/" end>今日</NavLink>
      <NavLink to="/animals">居民</NavLink>
      <NavLink to="/settings">設定</NavLink>
    </nav>
  );
}

function Shell() {
  return (
    <>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/animals" element={<AnimalsPage />} />
        <Route path="/animals/:id" element={<AnimalDetailPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Shell />
      </AppProvider>
    </BrowserRouter>
  );
}
