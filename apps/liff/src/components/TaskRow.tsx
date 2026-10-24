import type { TodayTask } from '../lib/today';

export function TaskRow({
  task,
  onComplete,
}: {
  task: TodayTask;
  onComplete: (task: TodayTask) => void;
}) {
  const done = Boolean(task.completedBy);
  return (
    <button
      type="button"
      disabled={done}
      aria-disabled={done}
      onClick={() => {
        if (!done) onComplete(task);
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        border: 0,
        borderBottom: '1px dashed var(--line)',
        background: 'transparent',
        padding: '12px 2px',
        cursor: done ? 'default' : 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: done ? 'var(--primary)' : 'var(--success-bg)',
          color: done ? '#fff' : 'var(--primary)',
          fontWeight: 800,
          flex: '0 0 auto',
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
          {task.animalName} · {task.title}
        </span>
        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
          {task.dueAt.toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: task.timezone,
          })}
          {done ? ` · 已完成 by ${task.completedBy}` : ''}
        </span>
      </span>
      {!done && task.overdue && (
        <span
          style={{
            background: 'var(--overdue)',
            color: '#fff',
            borderRadius: 999,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          逾時
        </span>
      )}
    </button>
  );
}
