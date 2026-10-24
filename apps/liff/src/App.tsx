import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { HouseholdProvider } from './lib/household';
import { TodayPage } from './pages/TodayPage';
import { AnimalsPage } from './pages/AnimalsPage';
import { AnimalNewPage } from './pages/AnimalNewPage';
import { AnimalDetailPage } from './pages/AnimalDetailPage';
import { RecordsPage } from './pages/RecordsPage';
import { RecordPage } from './pages/RecordPage';
import { InvitePage } from './pages/InvitePage';
import { SettingsPage } from './pages/SettingsPage';
import { HouseholdCreatePage } from './pages/HouseholdCreatePage';
import { PrimaryButton } from './components/PrimaryButton';

/** A reload re-runs `initLiff`, which logs in again when the LIFF session is gone. */
function relogin(): void {
  window.location.reload();
}

export function Gate() {
  const { user, loading, error } = useAuth();
  if (loading) return <div className="shell">載入中…</div>;
  if (error) return <div className="shell">登入失敗：{error}</div>;
  if (!user) {
    return (
      <div className="shell" role="alert">
        <div className="kicker">LINE</div>
        <h1 className="h1">請重新登入 LINE</h1>
        <p className="muted">登入狀態已失效，請重新開啟頁面或再登入一次。</p>
        <PrimaryButton type="button" onClick={relogin} style={{ marginTop: 12 }}>
          重新登入
        </PrimaryButton>
      </div>
    );
  }
  return (
    // A different LINE account must not inherit the previous UID's household
    // subscription or selected id, so remount the provider on identity change.
    <HouseholdProvider key={user.uid}>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/animals" element={<AnimalsPage />} />
        <Route path="/animals/new" element={<AnimalNewPage />} />
        <Route path="/animals/:id" element={<AnimalDetailPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/record/new" element={<RecordPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/household/new" element={<HouseholdCreatePage />} />
      </Routes>
    </HouseholdProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
