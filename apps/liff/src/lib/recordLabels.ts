const RECORD_TYPE_LABELS: Record<string, string> = {
  feeding: '餵食',
  water: '換水',
  weight: '體重',
  poop: '排便',
  shed: '蛻皮',
  activity: '活動',
  medical: '醫療',
  note: '備註',
  custom: '自訂',
};

export function recordTypeLabel(type: unknown): string {
  const key = typeof type === 'string' ? type : '';
  return RECORD_TYPE_LABELS[key] ?? (key || '紀錄');
}

/** Records store `occurredAt` as an ISO string; be tolerant of a Timestamp. */
export function recordTimeLabel(value: unknown): string {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-TW', { hour12: false });
  }
  const maybeTimestamp = value as { toDate?: () => Date } | null;
  if (maybeTimestamp && typeof maybeTimestamp.toDate === 'function') {
    return maybeTimestamp.toDate().toLocaleString('zh-TW', { hour12: false });
  }
  return '';
}

export function recordSummary(record: { note?: unknown; value?: unknown; unit?: unknown }): string {
  if (typeof record.note === 'string' && record.note.trim()) return record.note;
  const value = record.value === undefined || record.value === null ? '' : String(record.value);
  const unit = typeof record.unit === 'string' ? record.unit : '';
  return `${value} ${unit}`.trim();
}
