export function ConflictBanner({
  message,
  currentRevision,
  lastChangedFields,
  onUseLatest,
  onKeepMine,
}: {
  message: string;
  currentRevision?: number;
  lastChangedFields?: string[];
  onUseLatest: () => void;
  onKeepMine: () => void;
}) {
  const details = [
    currentRevision !== undefined ? `目前版本：${currentRevision}` : '',
    lastChangedFields && lastChangedFields.length > 0
      ? `變更欄位：${lastChangedFields.join('、')}`
      : '',
  ].filter(Boolean);

  return (
    <div
      role="alert"
      style={{
        background: 'var(--butter)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <strong style={{ display: 'block', marginBottom: 6 }}>資料已更新</strong>
      <p style={{ margin: '0 0 6px', fontSize: 13 }}>{message}</p>
      {details.length > 0 && (
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
          {details.join(' · ')}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onUseLatest}
          style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 0, background: '#fff' }}
        >
          查看最新
        </button>
        <button
          type="button"
          onClick={onKeepMine}
          style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 0, background: 'var(--accent)' }}
        >
          保留我的
        </button>
      </div>
    </div>
  );
}
