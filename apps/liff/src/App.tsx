import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { HouseholdProvider } from './lib/household';
import { TodayPage } from './pages/TodayPage';

function Gate() {
  const { loading, error } = useAuth();
  if (loading) return <div className="shell">載入中…</div>;
  if (error) return <div className="shell">登入失敗：{error}</div>;
  return (
    <HouseholdProvider>
      <Routes>
        <Route path="/" element={<TodayPage />} />
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
