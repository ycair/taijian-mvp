import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { functionsUrl } from '../lib/supabase';

type PublicPhoto = { path: string; caption: string; url: string | null };
type PublicEntry = {
  title: string;
  body: string;
  journalDate: string;
  authorName: string;
  authorAvatar: string | null;
  shareToken: string;
  publishedAt: string | null;
  photos: PublicPhoto[];
  coverUrl: string | null;
};

function PublicHeader() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">苔</div>
        <div>
          <div className="brand-name">苔間</div>
          <div className="brand-sub">把每一次照顧，留在同一個家</div>
        </div>
      </div>
      <span className="line-pill">公開旅程</span>
    </header>
  );
}

function PhotoGrid({ entry }: { entry: PublicEntry }) {
  return (
    <>
      {entry.photos.map((photo, index) => (
        <figure key={`${photo.path}-${index}`} style={{ margin: '0 0 14px' }}>
          {photo.url && <img src={photo.url} alt={photo.caption || entry.title} style={{ width: '100%', borderRadius: 18, display: 'block' }} />}
          {photo.caption && <figcaption className="muted" style={{ marginTop: 5 }}>{photo.caption}</figcaption>}
        </figure>
      ))}
    </>
  );
}

function EntryView({ entry, showLink = false }: { entry: PublicEntry; showLink?: boolean }) {
  return (
    <article className="card" style={{ marginTop: 16 }}>
      {entry.coverUrl && (
        <img
          src={entry.coverUrl}
          alt={entry.title}
          style={{ width: '100%', borderRadius: 18, display: 'block', marginBottom: 14 }}
        />
      )}
      <div className="muted" style={{ fontSize: 12 }}>{entry.journalDate} · {entry.authorName}</div>
      <h1 className="h1" style={{ fontSize: 24 }}>{entry.title}</h1>
      {entry.body && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{entry.body}</p>}
      <div className="stack" style={{ marginTop: 16 }}>
        <PhotoGrid entry={entry} />
      </div>
      {showLink && (
        <Link className="btn-ghost" to={`/s/${entry.shareToken}`} style={{ textDecoration: 'none' }}>
          開啟這篇旅程 →
        </Link>
      )}
    </article>
  );
}

export function PublicJournalPage() {
  const { token = '' } = useParams();
  const [entry, setEntry] = useState<PublicEntry | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setEntry(null);
    setError('');
    fetch(`${functionsUrl}/journal-public?token=${encodeURIComponent(token)}`)
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.message ?? '找不到旅程');
        setEntry(result.entry);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '找不到旅程'));
  }, [token]);

  return (
    <div className="shell">
      <PublicHeader />
      <main className="app">
        {error && <p className="error">{error}</p>}
        {!entry && !error && <p className="muted">載入旅程中…</p>}
        {entry && <EntryView entry={entry} />}
        <div style={{ marginTop: 18 }}>
          <Link to="/feed" className="btn-ghost" style={{ textDecoration: 'none' }}>看更多公開旅程 →</Link>
        </div>
      </main>
    </div>
  );
}

export function PublicJournalFeedPage() {
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${functionsUrl}/journal-public?feed=1&limit=20`)
      .then((response) => response.json())
      .then((result) => {
        if (!result.ok) throw new Error(result.message ?? '讀取失敗');
        setEntries(result.entries ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '讀取失敗'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="shell">
      <PublicHeader />
      <main className="app">
        <div className="kicker">Public journal</div>
        <h1 className="h1">公開旅程</h1>
        <p className="muted">由苔間家庭主動公開的照護片段。</p>
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">載入中…</p>}
        {!loading && entries.length === 0 && <p className="muted">目前沒有公開旅程。</p>}
        {entries.map((entry) => (
          <EntryView key={entry.shareToken} entry={entry} showLink />
        ))}
      </main>
    </div>
  );
}
