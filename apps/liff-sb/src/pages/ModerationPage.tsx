import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { callCommand, newCommandId } from '../lib/api';

type Report = {
  id: string;
  entryId: string | null;
  commentId: string | null;
  reason: string;
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: string;
  reporterName: string;
  entryTitle: string | null;
  shareToken: string | null;
  commentBody: string | null;
  targetAuthorName: string | null;
};

const statusLabels: Record<Report['status'], string> = {
  open: '待處理',
  reviewed: '已處理',
  dismissed: '已忽略',
};

export function ModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<Report['status']>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextStatus: Report['status']) => {
    const token = localStorage.getItem('sb_access');
    if (!token) {
      setLoading(false);
      setError('請先在 LINE 內登入苔間，再開啟管理後台。');
      return;
    }
    setLoading(true);
    setError('');
    const result = await callCommand<{ reports: Report[] }>(token, {
      commandId: newCommandId(),
      type: 'journal.report.list',
      payload: { status: nextStatus },
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.code === 'FORBIDDEN' ? '這個帳號沒有管理權限。' : (result.message ?? '讀取失敗'));
      setReports([]);
      return;
    }
    setReports(result.data.reports ?? []);
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function resolve(report: Report, nextStatus: 'reviewed' | 'dismissed') {
    const token = localStorage.getItem('sb_access');
    if (!token || busyId) return;
    setBusyId(report.id);
    setError('');
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'journal.report.resolve',
      payload: { reportId: report.id, status: nextStatus },
    });
    setBusyId(null);
    if (!result.ok) {
      setError(result.message ?? '更新失敗');
      return;
    }
    setReports((items) => items.filter((item) => item.id !== report.id));
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">苔</div>
          <div>
            <div className="brand-name">苔間</div>
            <div className="brand-sub">檢舉管理後台</div>
          </div>
        </div>
        <span className="line-pill">Moderation</span>
      </header>
      <main className="app">
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          {(['open', 'reviewed', 'dismissed'] as const).map((item) => (
            <button
              key={item}
              className={status === item ? 'btn' : 'btn-ghost'}
              style={{ minHeight: 38, padding: '0 14px' }}
              onClick={() => setStatus(item)}
            >
              {statusLabels[item]}
            </button>
          ))}
        </div>

        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">載入檢舉中…</p>}
        {!loading && !error && reports.length === 0 && <p className="muted">目前沒有{statusLabels[status]}的檢舉。</p>}

        {reports.map((report) => (
          <article key={report.id} className="card" style={{ marginTop: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <strong>{report.entryTitle ?? (report.commentId ? '留言檢舉' : '已刪除的旅程')}</strong>
              <span className="badge">{statusLabels[report.status]}</span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
              {new Date(report.createdAt).toLocaleString('zh-TW')} · 檢舉人 {report.reporterName}
              {report.targetAuthorName ? ` · 作者 ${report.targetAuthorName}` : ''}
            </p>
            {report.commentBody && (
              <p style={{ background: 'var(--wash, #f4f1e8)', padding: 10, borderRadius: 12, whiteSpace: 'pre-wrap' }}>
                留言：{report.commentBody}
              </p>
            )}
            <p style={{ whiteSpace: 'pre-wrap' }}>{report.reason}</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {report.shareToken && (
                <Link className="btn-ghost" to={`/s/${report.shareToken}`} style={{ textDecoration: 'none' }}>
                  查看旅程
                </Link>
              )}
              {report.status === 'open' && (
                <>
                  <button
                    className="btn"
                    disabled={busyId === report.id}
                    onClick={() => void resolve(report, 'reviewed')}
                  >
                    標記已處理
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busyId === report.id}
                    onClick={() => void resolve(report, 'dismissed')}
                  >
                    忽略
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
        <p style={{ marginTop: 20 }}>
          <Link to="/feed" className="btn-ghost" style={{ textDecoration: 'none' }}>回到公開旅程 →</Link>
        </p>
      </main>
    </div>
  );
}
