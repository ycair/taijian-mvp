import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../App';
import { callCommand, newCommandId } from '../lib/api';
import { makeClient } from '../lib/supabase';
import type { Animal, RecordRow, Reminder } from '../lib/types';

const RECORD_TYPES = [
  ['feeding', '餵食'],
  ['water', '換水'],
  ['weight', '體重'],
  ['poop', '排便'],
  ['shed', '蛻皮'],
  ['note', '備註'],
];

export function AnimalDetailPage() {
  const { id = '' } = useParams();
  const { token, householdId, profile } = useApp();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [type, setType] = useState('feeding');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [reminderTitle, setReminderTitle] = useState('餵食');
  const [reminderTime, setReminderTime] = useState('08:30');
  const [error, setError] = useState('');

  async function load() {
    if (!id) return;
    const client = makeClient(token);
    const [{ data: animalRow, error: animalError }, { data: recordRows }, { data: reminderRows }] =
      await Promise.all([
        client.from('animals').select('*').eq('id', id).single(),
        client.from('records').select('*').eq('animal_id', id).is('deleted_at', null).order('occurred_at', { ascending: false }).limit(30),
        client.from('reminders').select('*').eq('animal_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      ]);
    if (animalError) setError(animalError.message);
    else setAnimal(animalRow as Animal);
    setRecords((recordRows ?? []) as RecordRow[]);
    setReminders((reminderRows ?? []) as Reminder[]);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function addRecord() {
    if (!householdId || !id) return;
    const payload: Record<string, unknown> = {
      recordId: crypto.randomUUID(),
      animalId: id,
      type,
      occurredAt: new Date().toISOString(),
    };
    if (value.trim()) {
      payload.value = Number(value);
      if (type === 'weight') payload.unit = 'g';
    }
    if (note.trim()) payload.note = note.trim();
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'record.create',
      householdId,
      payload,
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setValue('');
    setNote('');
    load();
  }

  async function addReminder() {
    if (!householdId || !id || !reminderTitle.trim()) return;
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'reminder.create',
      householdId,
      payload: {
        animalId: id,
        title: reminderTitle.trim(),
        type: 'feeding',
        schedule: { kind: 'daily', times: [reminderTime] },
        timezone: profile.timezone,
        enabled: true,
      },
    });
    if (!result.ok) setError(result.message);
    else load();
  }

  if (!animal) return <div className="app">載入中…</div>;
  const isActive = animal.status === 'active';

  return (
    <div className="app">
      <Link to="/animals" className="btn-ghost" style={{ textDecoration: 'none' }}>← 居民</Link>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="avatar" style={{ background: animal.avatar_color }} />
        <div>
          <h1 className="h1" style={{ margin: 0 }}>{animal.name}</h1>
          <div className="muted">{animal.species_label ?? animal.species}</div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {animal.status === 'memorial' && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700 }}>已成為了苔間的回憶</div>
          {animal.memorial_at && <div className="muted">{new Date(animal.memorial_at).toLocaleDateString('zh-TW')}</div>}
          {animal.memorial_note && <div>{animal.memorial_note}</div>}
          <div className="muted">提醒與新增照護已停止，紀錄仍可閱讀。</div>
        </section>
      )}

      {isActive && <section className="card stack" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700 }}>快速紀錄</div>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {RECORD_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {(type === 'weight' || type === 'custom') && (
          <input className="input" inputMode="decimal" placeholder="數值" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <textarea className="input" placeholder="備註" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn" onClick={addRecord}>儲存</button>
      </section>}

      <section className="card stack" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>提醒</div>
        {reminders.map((reminder) => (
          <div key={reminder.id} className="between">
            <span>{reminder.title}</span>
            <span className="muted">{reminder.schedule.times?.[0]} · {reminder.enabled ? '開啟' : '關閉'}</span>
          </div>
        ))}
        {isActive && <>
          <input className="input" placeholder="提醒名稱" value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} />
          <input className="input" type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
          <button className="btn" onClick={addReminder}>新增提醒</button>
        </>}
      </section>

      <section className="card stack" style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 700 }}>最近紀錄</div>
        {records.length === 0 && <span className="muted">還沒有紀錄。</span>}
        {records.map((record) => (
          <div key={record.id} className="between">
            <span>{RECORD_TYPES.find(([id]) => id === record.type)?.[1] ?? record.type}</span>
            <span className="muted">
              {record.value != null ? `${record.value} ${record.unit ?? ''}` : record.note ?? ''}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
