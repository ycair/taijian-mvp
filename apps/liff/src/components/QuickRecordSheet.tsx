import { useRef, useState } from 'react';
import { callCommand } from '../lib/api';
import { recordAttempt, type RecordAttempt } from '../lib/attempt';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
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
  // One intent owns one command id, one record id, and one `occurredAt`. A
  // timeout after the server commit can then be retried without a duplicate.
  const attemptRef = useRef<RecordAttempt | null>(null);

  async function submit() {
    setError(null);
    const parsed = value.trim() ? Number(value) : null;
    if (type === 'weight' && parsed !== null && !Number.isFinite(parsed)) {
      setError('數值請填數字。');
      return;
    }
    setBusy(true);
    const base: Record<string, unknown> = { animalId, type };
    // The numeric field only exists for weight, so a value typed before
    // switching type must not leak into another record. Grams are the only
    // unit this sheet knows: send `'g'` for weight and omit `unit` entirely
    // (never `undefined`) for every other type.
    if (type === 'weight' && parsed !== null) {
      base.value = parsed;
      base.unit = 'g';
    }
    if (note.trim()) base.note = note.trim();

    const attempt = recordAttempt(attemptRef.current, JSON.stringify(base));
    attemptRef.current = attempt;
    const payload = {
      ...base,
      recordId: attempt.recordId,
      occurredAt: attempt.occurredAt,
    };

    try {
      const result = await callCommand('record.create', payload, {
        householdId,
        commandId: attempt.commandId,
      });
      if (!result.ok) {
        setError(commandErrorMessage(result.code, '無法儲存紀錄，請稍後再試。'));
        return;
      }
      // Clear the form before handing control back, so a sheet that stays
      // mounted (or is reopened) can never resubmit the previous values.
      attemptRef.current = null;
      setValue('');
      setNote('');
      onDone();
    } catch (error) {
      setError(callErrorMessage(error, '無法儲存紀錄，請檢查網路後再試。'));
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
