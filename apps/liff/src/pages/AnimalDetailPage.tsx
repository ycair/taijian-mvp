import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { SPECIES } from '@taijian/domain';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
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

type Role = 'owner' | 'caretaker';

type Animal = {
  id: string;
  name: string;
  species: string;
  speciesLabel?: string;
  householdId?: string;
  avatarColor?: string;
  morph?: string;
  sex?: string;
  birthDate?: string;
  notes?: string;
  status?: string;
  revision?: number;
  lastChangedFields?: string[];
  deletedAt?: unknown;
};

type AnimalForm = {
  name: string;
  species: string;
  morph: string;
  sex: string;
  birthDate: string;
  notes: string;
};

type AnimalConflict = {
  message: string;
  current?: Partial<Animal>;
  currentRevision?: number;
  lastChangedFields?: string[];
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
  const { user } = useAuth();
  const { household } = useHousehold();
  const navigate = useNavigate();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ReminderRow | 'new' | null>(null);
  const [deleteConflict, setDeleteConflict] = useState<DeleteConflict | null>(null);
  const deleteAttemptRef = useRef<CommandAttempt | null>(null);
  const [editingAnimal, setEditingAnimal] = useState(false);
  const [animalForm, setAnimalForm] = useState<AnimalForm>({
    name: '',
    species: 'other',
    morph: '',
    sex: 'unknown',
    birthDate: '',
    notes: '',
  });
  const [animalBaseRevision, setAnimalBaseRevision] = useState(0);
  const [animalConflict, setAnimalConflict] = useState<AnimalConflict | null>(null);
  const [animalBusy, setAnimalBusy] = useState(false);
  const animalAttemptRef = useRef<CommandAttempt | null>(null);
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
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!householdId || !uid) {
      setRole(null);
      setRoleLoaded(false);
      return;
    }
    return onSnapshot(
      doc(db, 'households', householdId, 'members', uid),
      (snap) => {
        setRole(snap.exists() ? ((snap.data().role as Role | undefined) ?? null) : null);
        setRoleLoaded(true);
      },
      () => {
        // Fail closed: lifecycle actions stay hidden if the role cannot be read.
        setRole(null);
        setRoleLoaded(true);
      },
    );
  }, [householdId, uid]);

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

  function fillAnimalForm(source: Partial<Animal>) {
    setAnimalForm({
      name: source.name ?? '',
      species: source.species ?? 'other',
      morph: source.morph ?? '',
      sex: source.sex ?? 'unknown',
      birthDate: source.birthDate ?? '',
      notes: source.notes ?? '',
    });
    setAnimalBaseRevision(typeof source.revision === 'number' ? source.revision : 0);
  }

  function beginAnimalEdit() {
    if (!animal) return;
    fillAnimalForm(animal);
    setAnimalConflict(null);
    setActionError(null);
    setEditingAnimal(true);
  }

  function cancelAnimalEdit() {
    setEditingAnimal(false);
    setAnimalConflict(null);
    animalAttemptRef.current = null;
  }

  async function saveAnimal(baseRevision = animalBaseRevision) {
    if (!animal || !householdId || animalBusy) return;
    setActionError(null);

    const name = animalForm.name.trim();
    if (!name) {
      setActionError('請填寫居民名字。');
      return;
    }

    const selected = SPECIES.find((item) => item.id === animalForm.species);
    const speciesLabel =
      selected?.name ??
      (animalForm.species === animal.species ? animal.speciesLabel : undefined);
    const payload: Record<string, unknown> = {
      animalId: animal.id,
      name,
      species: animalForm.species,
      morph: animalForm.morph.trim(),
      sex: animalForm.sex,
      notes: animalForm.notes,
    };
    if (speciesLabel) payload.speciesLabel = speciesLabel;
    // The date input yields `''` when cleared, which is not a valid date. Omit
    // it rather than failing validation; clearing an existing date needs a
    // schema-level null and is out of this wave.
    if (animalForm.birthDate) payload.birthDate = animalForm.birthDate;

    const attempt = commandAttempt(
      animalAttemptRef.current,
      JSON.stringify({ animalId: animal.id, baseRevision, payload }),
    );
    animalAttemptRef.current = attempt;

    setAnimalBusy(true);
    try {
      const result = await callCommand('animal.update', payload, {
        householdId,
        baseRevision,
        commandId: attempt.commandId,
      });
      if (!result.ok) {
        if (result.code === 'CONFLICT') {
          setAnimalConflict({
            message: '這位居民在你編輯時被其他人更新了。',
            ...(result.current !== undefined
              ? { current: result.current as Partial<Animal> }
              : {}),
            ...(result.currentRevision !== undefined
              ? { currentRevision: result.currentRevision }
              : {}),
            ...(result.lastChangedFields !== undefined
              ? { lastChangedFields: result.lastChangedFields }
              : {}),
          });
          return;
        }
        setActionError(commandErrorMessage(result.code, '無法儲存居民，請稍後再試。'));
        return;
      }
      animalAttemptRef.current = null;
      setAnimalConflict(null);
      setEditingAnimal(false);
    } catch (error_) {
      setActionError(callErrorMessage(error_, '無法儲存居民，請檢查網路後再試。'));
    } finally {
      setAnimalBusy(false);
    }
  }

  function applyLatestAnimal() {
    const current = animalConflict?.current;
    if (current) {
      fillAnimalForm(current);
    } else if (animal) {
      fillAnimalForm(animal);
    }
    if (animalConflict?.currentRevision !== undefined) {
      setAnimalBaseRevision(animalConflict.currentRevision);
    }
    animalAttemptRef.current = null;
    setAnimalConflict(null);
  }

  function keepMyAnimalEdit() {
    if (!animalConflict) return;
    const revision = animalConflict.currentRevision ?? animalBaseRevision;
    if (!confirm('最新版本已更新。仍要保留你的修改並覆蓋對方內容嗎？')) return;
    setAnimalConflict(null);
    void saveAnimal(revision);
  }

  async function archiveCurrentAnimal() {
    if (!animal || !householdId || animalBusy) return;
    if (!confirm(`確定要封存「${animal.name}」？封存後會從居民列表移除。`)) return;
    setAnimalBusy(true);
    setActionError(null);
    try {
      const result = await callCommand(
        'animal.archive',
        { animalId: animal.id },
        { householdId, baseRevision: animal.revision ?? 0 },
      );
      if (!result.ok) {
        setActionError(commandErrorMessage(result.code, '無法封存居民，請稍後再試。'));
        return;
      }
      navigate('/animals', { replace: true });
    } catch (error_) {
      setActionError(callErrorMessage(error_, '無法封存居民，請檢查網路後再試。'));
    } finally {
      setAnimalBusy(false);
    }
  }

  async function deleteCurrentAnimal() {
    if (!animal || !householdId || animalBusy) return;
    if (!confirm(`確定要刪除「${animal.name}」？紀錄與提醒也會一併刪除，且無法復原。`)) {
      return;
    }
    setAnimalBusy(true);
    setActionError(null);
    try {
      const result = await callCommand(
        'animal.delete',
        { animalId: animal.id },
        { householdId, baseRevision: animal.revision ?? 0 },
      );
      if (!result.ok) {
        setActionError(commandErrorMessage(result.code, '無法刪除居民，請稍後再試。'));
        return;
      }
      navigate('/animals', { replace: true });
    } catch (error_) {
      setActionError(callErrorMessage(error_, '無法刪除居民，請檢查網路後再試。'));
    } finally {
      setAnimalBusy(false);
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

  const knownSpecies = SPECIES.find((item) => item.id === animalForm.species);
  const speciesChoices = knownSpecies
    ? SPECIES
    : [
        { id: animalForm.species, name: animal.speciesLabel ?? animalForm.species },
        ...SPECIES,
      ];

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
        {!editingAnimal && (
          <button
            type="button"
            onClick={beginAnimalEdit}
            style={{
              minHeight: 44,
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: '#fff',
              padding: '0 14px',
            }}
          >
            編輯居民
          </button>
        )}
      </header>
      {(actionError ?? error) && (
        <p role="alert" style={{ color: 'var(--overdue)' }}>
          {actionError ?? error}
        </p>
      )}
      {editingAnimal && (
        <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>編輯居民</h2>
          {animalConflict && (
            <ConflictBanner
              message={animalConflict.message}
              {...(animalConflict.currentRevision !== undefined
                ? { currentRevision: animalConflict.currentRevision }
                : {})}
              {...(animalConflict.lastChangedFields !== undefined
                ? { lastChangedFields: animalConflict.lastChangedFields }
                : {})}
              onUseLatest={applyLatestAnimal}
              onKeepMine={keepMyAnimalEdit}
            />
          )}
          <label>
            <span className="muted">名字</span>
            <input
              aria-label="名字"
              value={animalForm.name}
              maxLength={40}
              onChange={(event) =>
                setAnimalForm((current) => ({ ...current, name: event.target.value }))
              }
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
          <label>
            <span className="muted">物種</span>
            <select
              aria-label="物種"
              value={animalForm.species}
              onChange={(event) =>
                setAnimalForm((current) => ({ ...current, species: event.target.value }))
              }
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 12,
                border: '1px solid var(--line)',
                padding: '0 12px',
                marginTop: 4,
              }}
            >
              {speciesChoices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">品系</span>
            <input
              aria-label="品系"
              value={animalForm.morph}
              maxLength={60}
              onChange={(event) =>
                setAnimalForm((current) => ({ ...current, morph: event.target.value }))
              }
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
          <label>
            <span className="muted">性別</span>
            <select
              aria-label="性別"
              value={animalForm.sex}
              onChange={(event) =>
                setAnimalForm((current) => ({ ...current, sex: event.target.value }))
              }
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 12,
                border: '1px solid var(--line)',
                padding: '0 12px',
                marginTop: 4,
              }}
            >
              <option value="unknown">未知</option>
              <option value="male">公</option>
              <option value="female">母</option>
            </select>
          </label>
          <label>
            <span className="muted">生日</span>
            <input
              aria-label="生日"
              type="date"
              value={animalForm.birthDate}
              onChange={(event) =>
                setAnimalForm((current) => ({ ...current, birthDate: event.target.value }))
              }
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
          <label>
            <span className="muted">備註</span>
            <textarea
              aria-label="備註"
              value={animalForm.notes}
              maxLength={2000}
              rows={3}
              onChange={(event) =>
                setAnimalForm((current) => ({ ...current, notes: event.target.value }))
              }
              style={{
                width: '100%',
                borderRadius: 12,
                border: '1px solid var(--line)',
                padding: '10px 12px',
                marginTop: 4,
              }}
            />
          </label>
          <PrimaryButton
            type="button"
            onClick={() => void saveAnimal()}
            disabled={animalBusy || !animalForm.name.trim()}
          >
            {animalBusy ? '儲存中…' : '儲存居民'}
          </PrimaryButton>
          <button
            type="button"
            onClick={cancelAnimalEdit}
            style={{
              minHeight: 44,
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: '#fff',
            }}
          >
            取消編輯
          </button>
        </section>
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
      {roleLoaded && role === 'owner' && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>居民管理</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            封存後會從居民列表移除；刪除會一併移除紀錄與提醒。
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void archiveCurrentAnimal()}
              disabled={animalBusy}
              style={{
                minHeight: 44,
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: '#fff',
                padding: '0 14px',
              }}
            >
              封存居民
            </button>
            <button
              type="button"
              onClick={() => void deleteCurrentAnimal()}
              disabled={animalBusy}
              style={{
                minHeight: 44,
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: '#fff',
                color: 'var(--overdue)',
                padding: '0 14px',
              }}
            >
              刪除居民
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
}
