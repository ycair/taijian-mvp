import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { QuickRecordSheet } from '../components/QuickRecordSheet';
import { useHousehold } from '../lib/household';

export function RecordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { household, loading } = useHousehold();
  const animalId = params.get('animalId') ?? '';

  if (loading) {
    return (
      <AppShell>
        <p className="muted" role="status">
          載入中…
        </p>
      </AppShell>
    );
  }

  if (!household) {
    return (
      <AppShell>
        <p className="muted">請先加入家庭，才能記錄照護。</p>
      </AppShell>
    );
  }

  // A shared/bookmarked link without `animalId` used to stop here. Send the
  // user to the resident list so they can pick one instead of hitting a dead end.
  if (!animalId) return <Navigate to="/animals" replace />;

  return (
    <AppShell>
      <div className="kicker">Quick record</div>
      <h1 className="h1">記一筆</h1>
      <div className="card" style={{ marginTop: 16 }}>
        <QuickRecordSheet
          householdId={household.id}
          animalId={animalId}
          onDone={() => navigate(-1)}
        />
      </div>
    </AppShell>
  );
}
