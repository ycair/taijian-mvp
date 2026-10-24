import { useNavigate, useSearchParams } from 'react-router-dom';
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

  if (!household || !animalId) {
    return (
      <AppShell>
        <p className="muted">請先選擇居民。</p>
      </AppShell>
    );
  }

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
