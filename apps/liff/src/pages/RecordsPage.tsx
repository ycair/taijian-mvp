import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { recordSummary, recordTimeLabel, recordTypeLabel } from '../lib/recordLabels';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';

type AnimalRow = {
  id: string;
  name: string;
  status?: string;
  deletedAt?: unknown;
};

type RecordRow = {
  id: string;
  animalId?: string;
  type?: string;
  note?: unknown;
  value?: unknown;
  unit?: unknown;
  occurredAt?: unknown;
  deletedAt?: unknown;
};

export function RecordsPage() {
  const { household, loading: householdLoading } = useHousehold();
  const [animals, setAnimals] = useState<AnimalRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [animalsLoaded, setAnimalsLoaded] = useState(false);
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const householdId = household?.id ?? null;

  useEffect(() => {
    if (!householdId) return;
    return onSnapshot(
      query(collection(db, 'animals'), where('householdId', '==', householdId)),
      (snap) => {
        setAnimals(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as AnimalRow));
        setAnimalsLoaded(true);
        setError(null);
      },
      () => {
        // Stop the spinner on failure too: the error copy is the message.
        setAnimalsLoaded(true);
        setError('讀取居民失敗，請檢查網路後重新整理。');
      },
    );
  }, [householdId]);

  useEffect(() => {
    if (!householdId) return;
    return onSnapshot(
      query(
        collection(db, 'records'),
        where('householdId', '==', householdId),
        orderBy('occurredAt', 'desc'),
      ),
      (snap) => {
        setRecords(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as RecordRow));
        setRecordsLoaded(true);
      },
      () => {
        setRecordsLoaded(true);
        setError('讀取紀錄失敗，請檢查網路後重新整理。');
      },
    );
  }, [householdId]);

  // LAUNCH PREREQUISITE (Task 7 cascade): `animal.delete` is bounded, so a
  // soft-deleted animal's records can outlive the cascade with `deletedAt: null`.
  // The read path therefore joins against the animal's own lifecycle instead of
  // trusting the record flag, and hides the tail of any deleted resident.
  const visible = useMemo(() => {
    const living = new Map<string, string>();
    for (const animal of animals) {
      if (animal.status === 'active' && animal.deletedAt == null) {
        living.set(animal.id, animal.name);
      }
    }
    return records
      .filter((record) => record.deletedAt == null)
      .flatMap((record) => {
        const animalName = record.animalId ? living.get(record.animalId) : undefined;
        if (!animalName) return [];
        return [{ record, animalName }];
      });
  }, [animals, records]);

  return (
    <AppShell>
      <div className="kicker">Timeline</div>
      <h1 className="h1">照護紀錄</h1>
      {error && (
        <p role="alert" style={{ color: 'var(--overdue)' }}>
          {error}
        </p>
      )}
      {!household ? (
        householdLoading ? (
          <p className="muted" role="status">
            載入中…
          </p>
        ) : (
          <EmptyState title="還沒有家庭" body="先在設定裡建立一個家庭，或接受家人的邀請。" />
        )
      ) : !animalsLoaded || !recordsLoaded ? (
        <p className="muted" role="status">
          載入中…
        </p>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          {visible.length === 0 && <p className="muted">還沒有紀錄。</p>}
          {visible.map(({ record, animalName }) => (
            <div
              key={record.id}
              style={{ padding: '10px 0', borderBottom: '1px dashed var(--line)' }}
            >
              <div style={{ fontWeight: 700 }}>
                {recordTypeLabel(record.type)}
                <span className="muted" style={{ fontWeight: 600, marginLeft: 8, fontSize: 12 }}>
                  {animalName}
                </span>
              </div>
              <div className="muted">{recordSummary(record)}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {recordTimeLabel(record.occurredAt)}
              </div>
            </div>
          ))}
        </div>
      )}
      {household && (
        <Link
          to="/animals"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: 12,
            minHeight: 44,
            color: 'var(--primary-strong)',
            fontWeight: 800,
          }}
        >
          選擇居民記一筆
        </Link>
      )}
    </AppShell>
  );
}
