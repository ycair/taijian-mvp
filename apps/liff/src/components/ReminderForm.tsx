import { useRef, useState } from 'react';
import { callCommand } from '../lib/api';
import { commandAttempt, type CommandAttempt } from '../lib/attempt';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
import type { ReminderRecord, ReminderSchedule } from '../lib/reminders';
import { recordTypeLabel } from '../lib/recordLabels';
import { timezoneOptions } from '../lib/timezones';
import { ConflictBanner } from './ConflictBanner';
import { PrimaryButton } from './PrimaryButton';

const REMINDER_TYPES = ['feeding', 'water', 'weight', 'poop', 'shed', 'medical', 'note'];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
const SAVE_ERROR = '無法儲存提醒，請稍後再試。';

const inputStyle = {
  width: '100%',
  minHeight: 48,
  borderRadius: 12,
  border: '1px solid var(--line)',
  padding: '0 12px',
  marginTop: 4,
} as const;

function todayKey(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

type ConflictState = {
  message: string;
  currentRevision?: number;
  lastChangedFields?: string[];
  current?: unknown;
};

function scheduleOf(reminder: ReminderRecord): ReminderSchedule {
  return reminder.schedule;
}

export function ReminderForm({
  householdId,
  animalId,
  mode,
  reminder,
  defaultTimezone,
  onSaved,
  onCancel,
}: {
  householdId: string;
  animalId: string;
  mode: 'create' | 'edit';
  reminder?: ReminderRecord;
  defaultTimezone: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const initial = reminder;
  const initialSchedule = initial ? scheduleOf(initial) : undefined;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState(initial?.type ?? 'feeding');
  const [kind, setKind] = useState<ReminderSchedule['kind']>(initialSchedule?.kind ?? 'daily');
  const [time, setTime] = useState(initialSchedule?.times[0] ?? '08:30');
  const [weekdays, setWeekdays] = useState<number[]>(
    initialSchedule?.kind === 'weekly' ? initialSchedule.weekdays : [1],
  );
  const [everyNDays, setEveryNDays] = useState(
    initialSchedule?.kind === 'interval' ? String(initialSchedule.everyNDays) : '2',
  );
  const [startDate, setStartDate] = useState(
    initialSchedule?.kind === 'interval' ? initialSchedule.startDate : todayKey(),
  );
  const [timezone, setTimezone] = useState(initial?.timezone ?? defaultTimezone);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [baseRevision, setBaseRevision] = useState(initial?.revision ?? 0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const attemptRef = useRef<CommandAttempt | null>(null);

  function buildSchedule(): ReminderSchedule | null {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
    if (kind === 'daily') return { kind: 'daily', times: [time] };
    if (kind === 'weekly') {
      if (weekdays.length === 0) return null;
      return { kind: 'weekly', times: [time], weekdays: [...weekdays].sort((a, b) => a - b) };
    }
    const interval = Number(everyNDays);
    if (!Number.isInteger(interval) || interval < 1 || interval > 365) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
    return { kind: 'interval', times: [time], everyNDays: interval, startDate };
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  async function submit() {
    if (busy) return;
    setError('');
    setConflict(null);

    const schedule = buildSchedule();
    if (!title.trim()) {
      setError('請填寫提醒名稱。');
      return;
    }
    if (!schedule) {
      setError(
        kind === 'weekly'
          ? '請至少選一天，並確認時間格式。'
          : kind === 'interval'
            ? '間隔天數需為 1–365，並填寫開始日期。'
            : '請確認時間格式。',
      );
      return;
    }

    const payload: Record<string, unknown> = {
      animalId,
      title: title.trim(),
      type,
      schedule,
      timezone,
      enabled,
    };
    if (mode === 'edit' && initial) payload.reminderId = initial.id;

    const attempt = commandAttempt(
      attemptRef.current,
      JSON.stringify({ mode, reminderId: initial?.id, baseRevision, payload }),
    );
    attemptRef.current = attempt;

    setBusy(true);
    try {
      const options: { householdId: string; commandId: string; baseRevision?: number } = {
        householdId,
        commandId: attempt.commandId,
      };
      if (mode === 'edit') options.baseRevision = baseRevision;

      const result = await callCommand(
        mode === 'edit' ? 'reminder.update' : 'reminder.create',
        payload,
        options,
      );
      if (!result.ok) {
        if (result.code === 'CONFLICT') {
          setConflict({
            message:
              mode === 'edit'
                ? '這筆提醒在你編輯時被其他人更新了。'
                : '提醒清單已更新，請重新整理後再試。',
            ...(result.currentRevision !== undefined
              ? { currentRevision: result.currentRevision }
              : {}),
            ...(result.lastChangedFields !== undefined
              ? { lastChangedFields: result.lastChangedFields }
              : {}),
            ...(result.current !== undefined ? { current: result.current } : {}),
          });
          return;
        }
        setError(commandErrorMessage(result.code, SAVE_ERROR));
        return;
      }
      attemptRef.current = null;
      setTitle('');
      onSaved();
    } catch (error_) {
      setError(callErrorMessage(error_, '無法儲存提醒，請檢查網路後再試。'));
    } finally {
      setBusy(false);
    }
  }

  function applyLatest() {
    const current = conflict?.current as Partial<ReminderRecord> | undefined;
    if (current) {
      if (typeof current.title === 'string') setTitle(current.title);
      if (typeof current.type === 'string') setType(current.type);
      if (typeof current.timezone === 'string') setTimezone(current.timezone);
      if (typeof current.enabled === 'boolean') setEnabled(current.enabled);
      const schedule = current.schedule;
      if (schedule) {
        setKind(schedule.kind);
        setTime(schedule.times[0] ?? time);
        if (schedule.kind === 'weekly') setWeekdays(schedule.weekdays);
        if (schedule.kind === 'interval') {
          setEveryNDays(String(schedule.everyNDays));
          setStartDate(schedule.startDate);
        }
      }
      if (typeof current.revision === 'number') setBaseRevision(current.revision);
    } else if (conflict?.currentRevision !== undefined) {
      setBaseRevision(conflict.currentRevision);
    }
    attemptRef.current = null;
    setConflict(null);
  }

  function keepMine() {
    if (conflict?.currentRevision !== undefined) setBaseRevision(conflict.currentRevision);
    attemptRef.current = null;
    setConflict(null);
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>{mode === 'edit' ? '編輯提醒' : '新增提醒'}</h3>
      {conflict && (
        <ConflictBanner
          message={conflict.message}
          {...(conflict.currentRevision !== undefined
            ? { currentRevision: conflict.currentRevision }
            : {})}
          {...(conflict.lastChangedFields !== undefined
            ? { lastChangedFields: conflict.lastChangedFields }
            : {})}
          onUseLatest={applyLatest}
          onKeepMine={keepMine}
        />
      )}
      <label>
        <span className="muted">提醒名稱</span>
        <input
          aria-label="提醒名稱"
          value={title}
          maxLength={60}
          onChange={(event) => setTitle(event.target.value)}
          style={inputStyle}
        />
      </label>
      <label>
        <span className="muted">類型</span>
        <select
          aria-label="提醒類型"
          value={type}
          onChange={(event) => setType(event.target.value)}
          style={inputStyle}
        >
          {REMINDER_TYPES.map((item) => (
            <option key={item} value={item}>
              {recordTypeLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="muted">排程</span>
        <select
          aria-label="排程"
          value={kind}
          onChange={(event) => setKind(event.target.value as ReminderSchedule['kind'])}
          style={inputStyle}
        >
          <option value="daily">每日</option>
          <option value="weekly">每週</option>
          <option value="interval">每 N 天</option>
        </select>
      </label>
      {kind === 'weekly' && (
        <div>
          <span className="muted">星期</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {WEEKDAYS.map((day, index) => (
              <button
                key={day}
                type="button"
                aria-label={`星期${WEEKDAY_NAMES[index]}`}
                aria-pressed={weekdays.includes(day)}
                onClick={() => toggleWeekday(day)}
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  borderRadius: 999,
                  border: '1px solid var(--line)',
                  background: weekdays.includes(day) ? 'var(--primary)' : '#fff',
                  color: weekdays.includes(day) ? '#fff' : 'var(--ink)',
                }}
              >
                {WEEKDAY_NAMES[index]}
              </button>
            ))}
          </div>
        </div>
      )}
      {kind === 'interval' && (
        <>
          <label>
            <span className="muted">間隔天數</span>
            <input
              aria-label="間隔天數"
              inputMode="numeric"
              value={everyNDays}
              onChange={(event) => setEveryNDays(event.target.value)}
              style={inputStyle}
            />
          </label>
          <label>
            <span className="muted">開始日期</span>
            <input
              aria-label="開始日期"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              style={inputStyle}
            />
          </label>
        </>
      )}
      <label>
        <span className="muted">時間</span>
        <input
          aria-label="時間"
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          style={inputStyle}
        />
      </label>
      <label>
        <span className="muted">時區</span>
        <select
          aria-label="提醒時區"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          style={inputStyle}
        >
          {timezoneOptions(timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <input
          aria-label="啟用提醒"
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>啟用提醒</span>
      </label>
      {error && (
        <p role="alert" style={{ color: 'var(--overdue)', margin: 0 }}>
          {error}
        </p>
      )}
      <PrimaryButton type="button" onClick={submit} disabled={busy}>
        {busy ? '儲存中…' : mode === 'edit' ? '儲存提醒' : '建立提醒'}
      </PrimaryButton>
      <button
        type="button"
        onClick={onCancel}
        style={{
          minHeight: 44,
          borderRadius: 12,
          border: '1px solid var(--line)',
          background: '#fff',
        }}
      >
        取消
      </button>
    </div>
  );
}
