import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useHousehold } from '../lib/household';
import { buildTodayTasks, type TodayTask } from '../lib/today';
import { callCommand } from '../lib/api';
import { TaskRow } from '../components/TaskRow';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';

export function TodayPage() {
  const { household } = useHousehold();
  const [reminders, setReminders] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [animals, setAnimals] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!household) return;
    const unsubReminders = onSnapshot(
      query(collection(db, 'reminders'), where('householdId', '==', household.id)),
      (snap) => setReminders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    );
    const unsubCompletions = onSnapshot(
      query(collection(db, 'taskCompletions'), where('householdId', '==', household.id)),
      (snap) => setCompletions(snap.docs.map((doc) => doc.data())),
    );
    const unsubAnimals = onSnapshot(
      query(collection(db, 'animals'), where('householdId', '==', household.id)),
      (snap) =>
        setAnimals(
          snap.docs
            .map((doc): Record<string, unknown> & { id: string } => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((animal) => animal.status === 'active'),
        ),
    );
    return () => {
      unsubReminders();
      unsubCompletions();
      unsubAnimals();
    };
  }, [household]);

  const tasks = useMemo(
    () => buildTodayTasks(reminders, completions, animals, new Date()),
    [reminders, completions, animals],
  );

  async function complete(task: TodayTask) {
    if (!household) return;
    const result = await callCommand(
      'task.complete',
      { reminderId: task.reminderId, dueDate: task.dueDate },
      { householdId: household.id },
    );
    if (!result.ok) setError(result.message);
  }

  if (!household) {
    return (
      <AppShell>
        <EmptyState title="還沒有家庭" body="先在設定裡建立一個家庭，或接受家人的邀請。" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="shell-header">
        <div>
          <div className="kicker">Today</div>
          <h1 className="h1">早安，今天也要好好照顧牠們。</h1>
          <div className="muted">{tasks.length} 件照護任務</div>
        </div>
      </header>
      {error && <p style={{ color: 'var(--overdue)' }}>{error}</p>}
      <section className="card" style={{ marginTop: 16 }}>
        {tasks.length === 0 ? (
          <EmptyState title="今天沒有任務" body="可以到居民頁新增提醒，或先記一筆照護。" />
        ) : (
          tasks.map((task) => (
            <TaskRow key={`${task.reminderId}:${task.dueDate}`} task={task} onComplete={complete} />
          ))
        )}
      </section>
    </AppShell>
  );
}
