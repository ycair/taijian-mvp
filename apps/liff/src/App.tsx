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

function Gate() {
  const { loading, error } = useAuth();
  if (loading) return <div className="shell">載入中…</div>;
  if (error) return <div className="shell">登入失敗：{error}</div>;
  return (
    <HouseholdProvider>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/animals" element={<AnimalsPage />} />
        <Route path="/animals/new" element={<AnimalNewPage />} />
        <Route path="/animals/:id" element={<AnimalDetailPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/record/new" element={<RecordPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/settings" element={<SettingsPage />} />
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
