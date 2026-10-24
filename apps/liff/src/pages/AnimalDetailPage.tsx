import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { recordSummary, recordTimeLabel, recordTypeLabel } from '../lib/recordLabels';
import { AppShell } from '../components/AppShell';
import { AnimalChip } from '../components/AnimalChip';
import { EmptyState } from '../components/EmptyState';
import { QuickRecordSheet } from '../components/QuickRecordSheet';

type Animal = {
  id: string;
  name: string;
  species: string;
  speciesLabel?: string;
  householdId?: string;
  avatarColor?: string;
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

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const { household } = useHousehold();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The quick sheet is mounted only on demand: leaving it open after a save
  // invites an accidental second tap that writes a duplicate record.
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoaded(true);
      return;
    }
    return onSnapshot(
      doc(db, 'animals', id),
      (snap) => {
        const data = snap.exists() ? ({ id: snap.id, ...snap.data() } as Animal) : null;
        // A soft-deleted or archived animal reads as "not found", so a stale
        // link never exposes a resident the household has retired.
        const visible =
          data !== null && data.status === 'active' && data.deletedAt == null ? data : null;
        setAnimal(visible);
        setLoaded(true);
        setError(null);
      },
      () => {
        setError('讀取居民資料失敗，請檢查網路後重新整理。');
        setLoaded(true);
      },
    );
  }, [id]);

  const householdId = household?.id ?? null;

  useEffect(() => {
    if (!householdId || !id) return;
    return onSnapshot(
      query(
        collection(db, 'records'),
        where('householdId', '==', householdId),
        orderBy('occurredAt', 'desc'),
      ),
      (snap) => {
        setRecords(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as RecordRow)
            .filter((record) => record.animalId === id && record.deletedAt == null),
        );
      },
      () => setError('讀取紀錄失敗，請檢查網路後重新整理。'),
    );
  }, [householdId, id]);

  if (!loaded) {
    return (
      <AppShell>
        <p className="muted" role="status">
          載入中…
        </p>
      </AppShell>
    );
  }

  if (!animal) {
    return (
      <AppShell>
        {error && (
          <p role="alert" style={{ color: 'var(--overdue)' }}>
            {error}
          </p>
        )}
        <EmptyState title="找不到這位居民" body="牠可能已被封存或刪除，請回到居民列表。" />
        <Link
          to="/animals"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            color: 'var(--primary-strong)',
            fontWeight: 800,
          }}
        >
          回到居民列表
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="shell-header">
        <div>
          <div className="kicker">Resident</div>
          <AnimalChip
            name={animal.name}
            species={animal.speciesLabel ?? animal.species}
            color={animal.avatarColor ?? '#7C9A76'}
          />
        </div>
      </header>
      {error && (
        <p role="alert" style={{ color: 'var(--overdue)' }}>
          {error}
        </p>
      )}
      <section className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>快速紀錄</h2>
        {!householdId ? (
          <p className="muted">載入家庭資料中…</p>
        ) : showSheet ? (
          <QuickRecordSheet
            householdId={householdId}
            animalId={id}
            onDone={() => setShowSheet(false)}
          />
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              餵食、換水、體重，一鍵記下來。
            </p>
            <button
              type="button"
              onClick={() => setShowSheet(true)}
              style={{
                minHeight: 44,
                width: '100%',
                borderRadius: 12,
                border: 0,
                background: 'var(--primary)',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              ＋ 新增紀錄
            </button>
          </>
        )}
      </section>
      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>最近紀錄</h2>
        {records.length === 0 && <p className="muted">還沒有紀錄。</p>}
        {records.map((record) => (
          <div key={record.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{recordTypeLabel(record.type)}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {recordSummary(record)}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {recordTimeLabel(record.occurredAt)}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
