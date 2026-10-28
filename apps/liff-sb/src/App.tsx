import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { makeClient } from './lib/supabase';
import { loginWithLine, logoutSession, refreshSessionToken, tokenExpiryMs } from './lib/api';
import { getLineIdToken } from './lib/liff';
import type { Household, Profile } from './lib/types';
import { TodayPage } from './pages/TodayPage';
import { AnimalsPage } from './pages/AnimalsPage';
import { AnimalDetailPage } from './pages/AnimalDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { InvitePage } from './pages/InvitePage';
import { PublicJournalFeedPage, PublicJournalPage } from './pages/PublicJournalPage';
import { PrivacyPage, TermsPage } from './pages/LegalPage';
import { PublicResidentPage } from './pages/PublicResidentPage';
import { ModerationPage } from './pages/ModerationPage';

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

const ACCESS_KEY = 'sb_access';
const REFRESH_KEY = 'sb_refresh';
const USER_KEY = 'sb_user';

function BrandBar() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">苔</div>
        <div>
          <div className="brand-name">苔間</div>
          <div className="brand-sub">把每一次照顧，留在同一個家</div>
        </div>
      </div>
      <span className="line-pill">LINE 版</span>
    </header>
  );
}

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppContext missing');
  return value;
}

function saveSession(accessToken: string, refreshToken: string, userId: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, userId);
  localStorage.removeItem('sb_token');
}

function storedAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem('sb_token');
}

function clearStoredSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem('sb_token');
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

async function loadWithRefresh(accessToken: string, refreshToken: string | null, userId: string) {
  try {
    return { accessToken, ...(await loadProfileAndHouseholds(accessToken, userId)) };
  } catch (error) {
    if (!refreshToken) throw error;
    const refreshed = await refreshSessionToken(refreshToken);
    if (!refreshed.ok || !refreshed.accessToken || !refreshed.refreshToken) {
      throw new Error(refreshed.message ?? '登入已過期');
    }
    const nextUserId = refreshed.userId ?? userId;
    saveSession(refreshed.accessToken, refreshed.refreshToken, nextUserId);
    return {
      accessToken: refreshed.accessToken,
      ...(await loadProfileAndHouseholds(refreshed.accessToken, nextUserId)),
    };
  }
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
      const accessToken = result.accessToken ?? result.token;
      if (!result.ok || !accessToken || !result.refreshToken || !result.userId) {
        setError(result.message ?? '登入失敗');
        return;
      }
      saveSession(accessToken, result.refreshToken, result.userId);
      window.location.href = window.location.pathname + window.location.search;
    } catch (e) {
      const message = e instanceof Error ? e.message : '登入失敗';
      if (message !== 'redirecting') setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app login-app">
      <BrandBar />
      <div className="card login-card">
        <div className="kicker">苔間 · Supabase Demo</div>
        <h1 className="h1">把每一次照顧，留在同一個家。</h1>
        <p className="muted">使用 LINE 或測試帳號登入。</p>
        {error && <p className="error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} onClick={login} disabled={busy}>
          {busy ? '登入中…' : '以 LINE 登入'}
        </button>
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <Link to="/privacy" style={{ color: 'var(--muted)' }}>隱私權</Link>
          <span style={{ color: 'var(--muted)' }}> · </span>
          <Link to="/terms" style={{ color: 'var(--muted)' }}>服務條款</Link>
        </div>
      </div>
    </div>
  );
}

function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accessToken = storedAccessToken();
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const userId = localStorage.getItem(USER_KEY);
    if (!accessToken || !userId) {
      setLoading(false);
      return;
    }
    loadWithRefresh(accessToken, refreshToken, userId)
      .then(({ accessToken: nextToken, profile, households, householdId }) => {
        const currentUserId = localStorage.getItem(USER_KEY) ?? userId;
        setState({
          token: nextToken,
          userId: currentUserId,
          profile,
          households,
          householdId,
          refresh: () => refresh(nextToken, currentUserId),
          logout: () => logout(nextToken),
        });
      })
      .catch(() => {
        clearStoredSession();
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!state) return;
    const expiry = tokenExpiryMs(state.token);
    if (!expiry) return;
    const delay = Math.max(0, expiry - Date.now() - 4 * 60 * 1000);
    const timer = window.setTimeout(async () => {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) {
        logout(state.token);
        return;
      }
      const refreshed = await refreshSessionToken(refreshToken);
      if (!refreshed.ok || !refreshed.accessToken || !refreshed.refreshToken) {
        logout(state.token);
        return;
      }
      saveSession(refreshed.accessToken, refreshed.refreshToken, refreshed.userId ?? state.userId);
      window.location.reload();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state?.token]);

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
            logout: () => logout(token),
          },
    );
  }

  function logout(token: string) {
    void logoutSession(token).catch(() => undefined);
    clearStoredSession();
    window.location.href = '/';
  }

  if (loading) return <div className="app">載入中…</div>;
  if (!state) return <LoginPage />;
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

function BottomNav() {
  return (
    <nav className="nav">
      <NavLink to="/" end aria-label="今日">
        <span className="nav-icon" aria-hidden="true">☀</span>
        <span>今日</span>
      </NavLink>
      <NavLink to="/animals" aria-label="居民">
        <span className="nav-icon" aria-hidden="true">❋</span>
        <span>居民</span>
      </NavLink>
      <NavLink to="/settings" aria-label="設定">
        <span className="nav-icon" aria-hidden="true">⚙</span>
        <span>設定</span>
      </NavLink>
    </nav>
  );
}

function Shell() {
  return (
    <div className="shell">
      <BrandBar />
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/animals" element={<AnimalsPage />} />
        <Route path="/animals/:id" element={<AnimalDetailPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/s/:token" element={<PublicJournalPage />} />
        <Route path="/feed" element={<PublicJournalFeedPage />} />
        <Route path="/r/:token" element={<PublicResidentPage />} />
        <Route path="/moderation" element={<ModerationPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="*"
          element={
            <AppProvider>
              <Shell />
            </AppProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
