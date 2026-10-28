import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { callCommand, newCommandId } from '../lib/api';
import { functionsUrl } from '../lib/supabase';

type PublicPhoto = { path: string; caption: string; url: string | null };
type PublicEntry = {
  id: string;
  title: string;
  body: string;
  journalDate: string;
  authorName: string;
  authorAvatar: string | null;
  shareToken: string;
  publishedAt: string | null;
  photos: PublicPhoto[];
  coverUrl: string | null;
  residents: Array<{ name: string; speciesLabel: string | null; avatarColor: string; token: string }>;
  likeCount: number;
  liked: boolean;
  commentCount: number;
  comments: Array<{ id: string; body: string; createdAt: string; authorName: string }>;
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

function EntryView({
  entry,
  showLink = false,
  onLike,
}: {
  entry: PublicEntry;
  showLink?: boolean;
  onLike?: (entry: PublicEntry) => void;
}) {
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
      {entry.residents.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
          {entry.residents.map((resident) => (
            <Link
              key={resident.token}
              to={`/r/${resident.token}`}
              className="badge"
              style={{ textDecoration: 'none' }}
            >
              {resident.name} · {resident.speciesLabel ?? '居民'}
            </Link>
          ))}
        </div>
      )}
      <div className="stack" style={{ marginTop: 16 }}>
        <PhotoGrid entry={entry} />
      </div>
      <Comments entry={entry} />
      <div className="row" style={{ marginTop: 14 }}>
        <button
          className={entry.liked ? 'btn' : 'btn-ghost'}
          style={{ padding: '0 14px', minHeight: 40 }}
          onClick={() => onLike?.(entry)}
          disabled={!onLike}
        >
          {entry.liked ? '♥' : '♡'} {entry.likeCount}
        </button>
        <span className="muted" style={{ fontSize: 11 }}>登入苔間後可以按讚</span>
        <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => report(entry)}>檢舉</button>
      </div>
      {showLink && (
        <Link className="btn-ghost" to={`/s/${entry.shareToken}`} style={{ textDecoration: 'none' }}>
          開啟這篇旅程 →
        </Link>
      )}
    </article>
  );
}

async function toggleLike(entry: PublicEntry): Promise<PublicEntry | null> {
  const token = localStorage.getItem('sb_access');
  if (!token) {
    window.location.href = '/';
    return null;
  }
  const result = await callCommand(token, {
    commandId: newCommandId(),
    type: 'journal.like',
    payload: { entryId: entry.id },
  });
  if (!result.ok) return null;
  const data = result.data as { liked?: boolean; likeCount?: number } | undefined;
  return {
    ...entry,
    liked: Boolean(data?.liked),
    likeCount: Number(data?.likeCount ?? entry.likeCount),
  };
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
        {entry && (
          <EntryView
            entry={entry}
            onLike={(current) => {
              void toggleLike(current).then((next) => {
                if (next) setEntry(next);
              });
            }}
          />
        )}
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
          <EntryView
            key={entry.shareToken}
            entry={entry}
            showLink
            onLike={(current) => {
              void toggleLike(current).then((next) => {
                if (next) {
                  setEntries((items) => items.map((item) => item.shareToken === next.shareToken ? next : item));
                }
              });
            }}
          />
        ))}
      </main>
    </div>
  );
}


function Comments({ entry }: { entry: PublicEntry }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const token = localStorage.getItem('sb_access');
    if (!token) {
      setError('請先在 LINE 內登入苔間。');
      return;
    }
    if (!body.trim() || busy) return;
    setBusy(true);
    setError('');
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'journal.comment.create',
      payload: { entryId: entry.id, body: body.trim() },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBody('');
    window.location.reload();
  }

  return (
    <section className="card" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>留言 · {entry.commentCount}</h2>
      {entry.comments.length === 0 && <p className="muted">還沒有留言。</p>}
      {entry.comments.map((comment) => (
        <div key={comment.id} style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
          <strong style={{ fontSize: 13 }}>{comment.authorName}</strong>
          <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
            {new Date(comment.createdAt).toLocaleDateString('zh-TW')}
          </span>
          <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{comment.body}</p>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: 10 }}>
        <input
          className="input"
          placeholder="登入後留言…"
          value={body}
          maxLength={1000}
          onChange={(event) => setBody(event.target.value)}
        />
        <button className="btn" disabled={busy || !body.trim()} onClick={submit}>
          {busy ? '送出…' : '留言'}
        </button>
      </div>
    </section>
  );
}


async function report(entry: PublicEntry) {
  const token = localStorage.getItem('sb_access');
  if (!token) {
    window.alert('請先在 LINE 內登入苔間。');
    return;
  }
  const reason = window.prompt('請簡短說明檢舉原因（500 字內）');
  if (!reason?.trim()) return;
  const result = await callCommand(token, {
    commandId: newCommandId(),
    type: 'journal.report.create',
    payload: { entryId: entry.id, reason: reason.trim() },
  });
  window.alert(result.ok ? '已送出檢舉，謝謝你。' : (result.message ?? '送出失敗'));
}
