import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { recordSummary, recordTimeLabel, recordTypeLabel } from '../lib/recordLabels';
import { scheduleSummary, type ReminderRecord } from '../lib/reminders';
import { callCommand } from '../lib/api';
import { commandAttempt, type CommandAttempt } from '../lib/attempt';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
import { AppShell } from '../components/AppShell';
import { AnimalChip } from '../components/AnimalChip';
import { ConflictBanner } from '../components/ConflictBanner';
import { EmptyState } from '../components/EmptyState';
import { PrimaryButton } from '../components/PrimaryButton';
import { QuickRecordSheet } from '../components/QuickRecordSheet';
import { ReminderForm } from '../components/ReminderForm';

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

type ReminderRow = ReminderRecord;

type DeleteConflict = {
  reminder: ReminderRow;
  message: string;
  currentRevision?: number;
  lastChangedFields?: string[];
};

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const { household } = useHousehold();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReminderRow | 'new' | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<DeleteConflict | null>(null);
  const deleteAttemptRef = useRef<CommandAttempt | null>(null);
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
    // Scoped to this resident: reading the whole household timeline just to
    // filter it in the client grows with the household's history.
    return onSnapshot(
      query(
        collection(db, 'records'),
        where('householdId', '==', householdId),
        where('animalId', '==', id),
        orderBy('occurredAt', 'desc'),
      ),
      (snap) => {
        setRecords(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as RecordRow)
            .filter((record) => record.deletedAt == null),
        );
      },
      () => setError('讀取紀錄失敗，請檢查網路後重新整理。'),
    );
  }, [householdId, id]);

  useEffect(() => {
    if (!householdId || !id) return;
    return onSnapshot(
      query(
        collection(db, 'reminders'),
        where('householdId', '==', householdId),
        where('animalId', '==', id),
      ),
      (snap) => {
        setReminders(
          snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as ReminderRow)
            .filter((reminder) => reminder.deletedAt == null),
        );
      },
      () => setError('讀取提醒失敗，請檢查網路後重新整理。'),
    );
  }, [householdId, id]);

  async function removeReminder(reminder: ReminderRow, baseRevision = reminder.revision) {
    if (!householdId) return;
    setActionError(null);
    const attempt = commandAttempt(
      deleteAttemptRef.current,
      `delete:${reminder.id}:${baseRevision}`,
    );
    deleteAttemptRef.current = attempt;
    try {
      const result = await callCommand(
        'reminder.delete',
        { reminderId: reminder.id },
        { householdId, baseRevision, commandId: attempt.commandId },
      );
      if (!result.ok) {
        if (result.code === 'CONFLICT') {
          setDeleteConflict({
            reminder,
            message: '這筆提醒在你刪除前被其他人更新了。',
            ...(result.currentRevision !== undefined
              ? { currentRevision: result.currentRevision }
              : {}),
            ...(result.lastChangedFields !== undefined
              ? { lastChangedFields: result.lastChangedFields }
              : {}),
          });
          return;
        }
        setActionError(commandErrorMessage(result.code, '無法刪除提醒，請稍後再試。'));
        return;
      }
      deleteAttemptRef.current = null;
      setDeleteConflict(null);
      setEditing((current) =>
        current && current !== 'new' && current.id === reminder.id ? null : current,
      );
    } catch (error_) {
      setActionError(callErrorMessage(error_, '無法刪除提醒，請檢查網路後再試。'));
    }
  }

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
      {(actionError ?? error) && (
        <p role="alert" style={{ color: 'var(--overdue)' }}>
          {actionError ?? error}
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
        <h2 style={{ fontSize: 16, marginTop: 0 }}>提醒</h2>
        {deleteConflict && (
          <ConflictBanner
            message={deleteConflict.message}
            {...(deleteConflict.currentRevision !== undefined
              ? { currentRevision: deleteConflict.currentRevision }
              : {})}
            {...(deleteConflict.lastChangedFields !== undefined
              ? { lastChangedFields: deleteConflict.lastChangedFields }
              : {})}
            onUseLatest={() => setDeleteConflict(null)}
            onKeepMine={() => {
              const revision =
                deleteConflict.currentRevision ?? deleteConflict.reminder.revision;
              setDeleteConflict(null);
              void removeReminder(deleteConflict.reminder, revision);
            }}
          />
        )}
        {reminders.length === 0 && <p className="muted">還沒有提醒。</p>}
        {reminders.map((reminder) => (
          <div
            key={reminder.id}
            style={{ padding: '8px 0', borderBottom: '1px dashed var(--line)' }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {reminder.title}
              <span className="muted" style={{ marginLeft: 8, fontWeight: 600 }}>
                {recordTypeLabel(reminder.type)} · {reminder.enabled ? '已開啟' : '已暫停'}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {scheduleSummary(reminder.schedule)} · {reminder.timezone}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => setEditing(reminder)}
                style={{
                  minHeight: 44,
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  background: '#fff',
                  padding: '0 14px',
                }}
              >
                編輯
              </button>
              <button
                type="button"
                onClick={() => void removeReminder(reminder)}
                style={{
                  minHeight: 44,
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  background: '#fff',
                  color: 'var(--overdue)',
                  padding: '0 14px',
                }}
              >
                刪除
              </button>
            </div>
          </div>
        ))}
        {!editing && (
          <PrimaryButton
            type="button"
            onClick={() => setEditing('new')}
            style={{ marginTop: 12 }}
            disabled={!householdId}
          >
            ＋ 新增提醒
          </PrimaryButton>
        )}
        {editing && householdId && (
          <ReminderForm
            key={editing === 'new' ? 'new' : editing.id}
            householdId={householdId}
            animalId={id}
            mode={editing === 'new' ? 'create' : 'edit'}
            {...(editing !== 'new' ? { reminder: editing } : {})}
            defaultTimezone={household?.timezone ?? 'Asia/Taipei'}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
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
