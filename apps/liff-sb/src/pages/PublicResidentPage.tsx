import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { functionsUrl } from '../lib/supabase';

type PublicRecord = {
  type: string;
  occurredAt: string;
  value: number | null;
  unit: string | null;
  note: string | null;
};

type Relative = {
  relation: 'parent' | 'child';
  public: boolean;
  name: string | null;
  speciesLabel: string | null;
  avatarColor: string | null;
  token: string | null;
};

type Resident = {
  name: string;
  speciesLabel: string | null;
  morph: string | null;
  sex: string;
  avatarColor: string;
  status: string;
};

const labels: Record<string, string> = {
  feeding: '餵食', water: '換水', weight: '體重', length: '身長', poop: '排便',
  shed: '蛻皮', activity: '活動', medical: '醫療', note: '備註', custom: '自訂',
};

export function PublicResidentPage() {
  const { token = '' } = useParams();
  const [resident, setResident] = useState<Resident | null>(null);
  const [records, setRecords] = useState<PublicRecord[]>([]);
  const [parents, setParents] = useState<Relative[]>([]);
  const [children, setChildren] = useState<Relative[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${functionsUrl}/resident-public?token=${encodeURIComponent(token)}`)
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.message ?? '找不到居民');
        setResident(result.resident);
        setRecords(result.records ?? []);
        setParents(result.relatives?.parents ?? []);
        setChildren(result.relatives?.children ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '找不到居民'));
  }, [token]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">苔</div>
          <div>
            <div className="brand-name">苔間</div>
            <div className="brand-sub">公開照護紀錄</div>
          </div>
        </div>
        <span className="line-pill">唯讀</span>
      </header>
      <main className="app">
        {error && <p className="error">{error}</p>}
        {!resident && !error && <p className="muted">載入居民中…</p>}
        {resident && (
          <>
            <div className="card row" style={{ marginTop: 14 }}>
              <div className="avatar" style={{ background: resident.avatarColor }} />
              <div>
                <h1 className="h1" style={{ margin: 0 }}>{resident.name}</h1>
                <div className="muted">
                  {resident.speciesLabel ?? '居民'} {resident.morph ? `· ${resident.morph}` : ''}
                </div>
              </div>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              這是屋主主動公開的照護紀錄，任何人都可以透過連結唯讀查看。
            </p>
            <section className="card" style={{ marginTop: 14 }}>
              <h2 style={{ fontSize: 16, marginTop: 0 }}>父母</h2>
              {parents.length === 0 ? <p className="muted">沒有公開的父母。</p> : (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {parents.map((relative, index) => relative.public && relative.token ? (
                    <Link key={index} className="badge" to={`/r/${relative.token}`}>{relative.name} · {relative.speciesLabel}</Link>
                  ) : (
                    <span key={index} className="badge">已隱藏</span>
                  ))}
                </div>
              )}
              <h2 style={{ fontSize: 16 }}>子代</h2>
              {children.length === 0 ? <p className="muted">沒有公開的子代。</p> : (
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  {children.map((relative, index) => relative.public && relative.token ? (
                    <Link key={index} className="badge" to={`/r/${relative.token}`}>{relative.name} · {relative.speciesLabel}</Link>
                  ) : (
                    <span key={index} className="badge">已隱藏</span>
                  ))}
                </div>
              )}
            </section>
            <h2 className="section-title">照護紀錄</h2>
            {records.length === 0 ? <p className="muted">還沒有公開紀錄。</p> : records.map((record, index) => (
              <div className="card" key={index} style={{ marginBottom: 8 }}>
                <div className="between">
                  <strong>{labels[record.type] ?? record.type}</strong>
                  <span className="muted">{new Date(record.occurredAt).toLocaleDateString('zh-TW')}</span>
                </div>
                {(record.value != null || record.note) && (
                  <p className="muted" style={{ marginBottom: 0 }}>
                    {record.value != null ? `${record.value} ${record.unit ?? ''}` : ''}
                    {record.note ? ` ${record.note}` : ''}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
