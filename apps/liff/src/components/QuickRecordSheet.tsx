import { useState } from 'react';
import { callCommand } from '../lib/api';
import { PrimaryButton } from './PrimaryButton';

const TYPES = [
  { id: 'feeding', label: '餵食' },
  { id: 'water', label: '換水' },
  { id: 'weight', label: '體重' },
  { id: 'poop', label: '排便' },
  { id: 'shed', label: '蛻皮' },
  { id: 'note', label: '備註' },
] as const;

type RecordType = (typeof TYPES)[number]['id'];

export function QuickRecordSheet({
  householdId,
  animalId,
  onDone,
}: {
  householdId: string;
  animalId: string;
  onDone: () => void;
}) {
  const [type, setType] = useState<RecordType>('feeding');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const parsed = value.trim() ? Number(value) : null;
    if (type === 'weight' && parsed !== null && !Number.isFinite(parsed)) {
      setError('數值請填數字。');
      return;
    }
    setBusy(true);
    const payload: Record<string, unknown> = {
      animalId,
      type,
      occurredAt: new Date().toISOString(),
    };
    // The numeric field only exists for weight, so a value typed before
    // switching type must not leak into another record. Grams are the only
    // unit this sheet knows: send `'g'` for weight and omit `unit` entirely
    // (never `undefined`) for every other type.
    if (type === 'weight' && parsed !== null) {
      payload.value = parsed;
      payload.unit = 'g';
    }
    if (note.trim()) payload.note = note.trim();

    try {
      const result = await callCommand('record.create', payload, { householdId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onDone();
    } catch {
      setError('無法儲存紀錄，請檢查網路後再試。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setType(item.id)}
            aria-pressed={type === item.id}
            style={{
              minHeight: 44,
              borderRadius: 999,
              border: '1px solid var(--line)',
              background: type === item.id ? 'var(--primary)' : '#fff',
              color: type === item.id ? '#fff' : 'var(--ink)',
              padding: '0 14px',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {type === 'weight' && (
        <label>
          <span className="muted">數值</span>
          <input
            aria-label="數值"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 12,
              border: '1px solid var(--line)',
              padding: '0 12px',
              marginTop: 4,
            }}
          />
        </label>
      )}
      <label>
        <span className="muted">備註</span>
        <textarea
          aria-label="備註"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          style={{
            width: '100%',
            borderRadius: 12,
            border: '1px solid var(--line)',
            padding: 12,
            marginTop: 4,
          }}
        />
      </label>
      {error && <p style={{ color: 'var(--overdue)', margin: 0 }}>{error}</p>}
      <PrimaryButton type="button" onClick={submit} disabled={busy}>
        {busy ? '儲存中…' : '儲存'}
      </PrimaryButton>
    </div>
  );
}
