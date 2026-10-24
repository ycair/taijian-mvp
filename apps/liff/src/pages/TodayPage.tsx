import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useHousehold } from '../lib/household';
import { buildTodayTasks, taskCompletionWindow, type TodayTask } from '../lib/today';
import { callCommand } from '../lib/api';
import { callErrorMessage, commandErrorMessage } from '../lib/errorMessages';
import { TaskRow } from '../components/TaskRow';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/EmptyState';

const DEFAULT_TIMEZONE = 'Asia/Taipei';
const READ_ERROR = '讀取資料失敗，請檢查網路後重新整理。';
const TASK_FALLBACK = '無法完成任務，請稍後再試。';

type ReadSource = 'reminders' | 'completions' | 'animals';


export function TodayPage() {
  const { loading: authLoading } = useAuth();
  const {
    household,
    loading: householdLoading,
    error: householdError,
  } = useHousehold();
  const [reminders, setReminders] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [animals, setAnimals] = useState<any[]>([]);
  const [readErrors, setReadErrors] = useState<Partial<Record<ReadSource, string>>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Keep "today" and the overdue flags honest while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const markRead = useCallback((source: ReadSource, message: string | null) => {
    setReadErrors((prev) => {
      if (message === null) {
        if (!(source in prev)) return prev;
        const next = { ...prev };
        delete next[source];
        return next;
      }
      if (prev[source] === message) return prev;
      return { ...prev, [source]: message };
    });
  }, []);

  const timezone = household?.timezone ?? DEFAULT_TIMEZONE;
  const { from: completionFrom, to: completionTo } = useMemo(
    () => taskCompletionWindow(now, timezone),
    [now, timezone],
  );

  const householdId = household?.id ?? null;

  useEffect(() => {
    if (!householdId) return;
    const unsubReminders = onSnapshot(
      query(collection(db, 'reminders'), where('householdId', '==', householdId)),
      (snap) => {
        setReminders(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        markRead('reminders', null);
      },
      () => markRead('reminders', READ_ERROR),
    );
    const unsubCompletions = onSnapshot(
      query(
        collection(db, 'taskCompletions'),
        where('householdId', '==', householdId),
        where('dueDate', '>=', completionFrom),
        where('dueDate', '<=', completionTo),
      ),
      (snap) => {
        setCompletions(snap.docs.map((doc) => doc.data()));
        markRead('completions', null);
      },
      () => markRead('completions', READ_ERROR),
    );
    const unsubAnimals = onSnapshot(
      query(collection(db, 'animals'), where('householdId', '==', householdId)),
      (snap) => {
        setAnimals(
          snap.docs
            .map((doc): Record<string, unknown> & { id: string } => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter((animal) => animal.status === 'active'),
        );
        markRead('animals', null);
      },
      () => markRead('animals', READ_ERROR),
    );
    return () => {
      unsubReminders();
      unsubCompletions();
      unsubAnimals();
    };
  }, [householdId, completionFrom, completionTo, markRead]);

  const tasks = useMemo(
    () => buildTodayTasks(reminders, completions, animals, now),
    [reminders, completions, animals, now],
  );

  async function complete(task: TodayTask) {
    if (!household || completing) return;
    setActionError(null);
    setCompleting(task.reminderId);
    try {
      const result = await callCommand(
        'task.complete',
        { reminderId: task.reminderId, dueDate: task.dueDate },
        { householdId: household.id },
      );
      if (!result.ok) setActionError(commandErrorMessage(result.code, TASK_FALLBACK));
    } catch (error) {
      setActionError(callErrorMessage(error, TASK_FALLBACK));
    } finally {
      setCompleting(null);
    }
  }

  // Auth settles before the household provider mounts, but both flags are
  // checked so the page never guesses while either read is in flight.
  if (authLoading || householdLoading) {
    return (
      <AppShell>
        <p className="muted" role="status">
          載入中…
        </p>
      </AppShell>
    );
  }

  const error = actionError ?? Object.values(readErrors)[0] ?? householdError ?? null;

  if (!household) {
    return (
      <AppShell>
        {error && (
          <p role="alert" style={{ color: 'var(--overdue)' }}>
            {error}
          </p>
        )}
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
      {error && (
        <p role="alert" style={{ color: 'var(--overdue)' }}>
          {error}
        </p>
      )}
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
