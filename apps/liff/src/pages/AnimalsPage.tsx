import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { AppShell } from '../components/AppShell';
import { AnimalChip } from '../components/AnimalChip';
import { EmptyState } from '../components/EmptyState';

type AnimalRow = {
  id: string;
  name: string;
  species: string;
  avatarColor?: string;
  status?: string;
  deletedAt?: unknown;
};

export function AnimalsPage() {
  const { household } = useHousehold();
  const [animals, setAnimals] = useState<AnimalRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    return onSnapshot(
      query(
        collection(db, 'animals'),
        where('householdId', '==', household.id),
        where('status', '==', 'active'),
      ),
      (snap) => {
        setAnimals(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as AnimalRow)
            // A soft-deleted animal keeps `status: 'active'` until the delete
            // command commits; the deleted flag is the source of truth.
            .filter((animal) => animal.status === 'active' && animal.deletedAt == null),
        );
        setError(null);
      },
      () => setError('讀取居民失敗，請檢查網路後重新整理。'),
    );
  }, [household]);

  return (
    <AppShell>
      <header className="shell-header">
        <div>
          <div className="kicker">Residents</div>
          <h1 className="h1">我的居民</h1>
        </div>
        <Link
          to="/animals/new"
          style={{
            textDecoration: 'none',
            color: 'var(--primary-strong)',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
          }}
        >
          ＋ 新增
        </Link>
      </header>
      {error && (
        <p role="alert" style={{ color: 'var(--overdue)' }}>
          {error}
        </p>
      )}
      {!household ? (
        <EmptyState title="還沒有家庭" body="先在設定裡建立一個家庭，或接受家人的邀請。" />
      ) : animals.length === 0 ? (
        <EmptyState title="還沒有居民" body="新增第一隻爬寵，開始記錄牠的日常生活。" />
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {animals.map((animal) => (
            <Link
              key={animal.id}
              to={`/animals/${animal.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card">
                <AnimalChip
                  name={animal.name}
                  species={animal.species}
                  color={animal.avatarColor ?? '#7C9A76'}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
