import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../App';
import { callCommand, newCommandId } from '../lib/api';
import { makeClient } from '../lib/supabase';
import { buildTodayTasks, dateKey, type TodayTask } from '../lib/today';
import type { Animal, Completion, Reminder } from '../lib/types';

export function TodayPage() {
  const { token, householdId, profile } = useApp();
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!householdId) {
      setLoading(false);
      return;
    }
    const client = makeClient(token);
    const [animalResult, reminderResult, completionResult] = await Promise.all([
      client.from('animals').select('*').eq('household_id', householdId).eq('status', 'active').is('deleted_at', null),
      client.from('reminders').select('*').eq('household_id', householdId).eq('enabled', true).is('deleted_at', null),
      client.from('task_completions').select('*').eq('household_id', householdId).eq('due_date', dateKey(new Date(), profile.timezone)),
    ]);
    if (animalResult.error) setError(animalResult.error.message);
    else setAnimals(animalResult.data ?? []);
    if (reminderResult.error) setError(reminderResult.error.message);
    else setReminders(reminderResult.data ?? []);
    if (completionResult.error) setError(completionResult.error.message);
    else setCompletions(completionResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [householdId]);

  const tasks = buildTodayTasks(reminders, completions, animals, new Date(), profile.timezone);

  async function complete(task: TodayTask) {
    if (!householdId) return;
    const result = await callCommand(token, {
      commandId: newCommandId(),
      type: 'task.complete',
      householdId,
      payload: { reminderId: task.reminderId, dueDate: task.dueDate },
    });
    if (!result.ok) setError(result.message);
    else load();
  }

  const todayLabel = new Intl.DateTimeFormat('zh-TW', {
    timeZone: profile.timezone,
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  if (!householdId) {
    return (
      <div className="app">
        <div className="kicker">Today</div>
        <h1 className="h1">還沒有家庭</h1>
        <p className="muted">先建立一個家庭，或接受家人的邀請。</p>
        <Link className="btn" to="/settings" style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>
          建立家庭
        </Link>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="kicker">{todayLabel}</div>
      <h1 className="h1">早安，今天也要好好照顧牠們。</h1>
      <p className="muted">{tasks.length} 件照護任務</p>
      {error && <p className="error">{error}</p>}
      <section className="card" style={{ marginTop: 16 }}>
        {loading ? (
          <p className="muted">載入中…</p>
        ) : tasks.length === 0 ? (
          <p className="muted">今天沒有任務。到居民頁新增提醒，或先記一筆照護。</p>
        ) : (
          tasks.map((task) => {
            const done = Boolean(task.completedByName);
            return (
              <button
                key={`${task.reminderId}:${task.dueDate}`}
                className="task"
                onClick={() => !done && complete(task)}
                disabled={done}
                style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0 }}
              >
                <span className={`dot ${done ? 'done' : ''}`}>{done ? '✓' : ''}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>
                    {task.animalName} · {task.title}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {task.dueAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    {done ? ` · 已完成 by ${task.completedByName}` : ''}
                  </span>
                </span>
                {!done && task.overdue && <span className="badge overdue">逾時</span>}
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
