/**
 * Single source of truth for turning command/transport failures into short
 * Traditional Chinese copy. Server `message` fields are English implementation
 * details and must never be rendered straight into the UI.
 */
export const GENERIC_ERROR = '操作失敗，請稍後再試。';

const COMMAND_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: '資料格式不正確，請確認後再試。',
  UNAUTHENTICATED: '登入已過期，請重新開啟頁面。',
  FORBIDDEN: '沒有權限執行這個操作，請確認家庭角色。',
  NOT_FOUND: '找不到資料，請重新整理。',
  CONFLICT: '資料已更新，請重新整理後再試。',
  RATE_LIMITED: '操作太頻繁，請稍後再試。',
  DUPLICATE_ID: '這筆資料已經存在。',
  IDEMPOTENCY_MISMATCH: '重複提交的內容不一致，請重新整理。',
  LINE_ALREADY_LINKED: '這個 LINE 帳號已連結其他帳號。',
  LAST_OWNER: '家庭至少要有一位屋主，請先指派新屋主。',
  INVITE_EXPIRED: '邀請已失效，請屋主重新產生。',
  INVITE_USED: '這個邀請已經被使用過了。',
  INTERNAL: '系統發生錯誤，請稍後再試。',
};

/** `callCommand` failures (`ok: false`) carry a domain error code. */
export function commandErrorMessage(code: unknown, fallback: string = GENERIC_ERROR): string {
  if (typeof code !== 'string' || code === '') return fallback;
  return COMMAND_MESSAGES[code] ?? fallback;
}

/** Firebase callable (transport) failures throw instead of returning a result. */
const TRANSPORT_MESSAGES: Record<string, string> = {
  'functions/unauthenticated': '登入已過期，請重新開啟頁面。',
  'functions/permission-denied': '沒有權限執行這個操作，請確認家庭角色。',
  'functions/not-found': '找不到資料，請重新整理。',
  'functions/invalid-argument': '資料格式不正確，請確認後再試。',
  'functions/failed-precondition': '資料已更新，請重新整理後再試。',
  'functions/already-exists': '這筆資料已經存在。',
  'functions/resource-exhausted': '操作太頻繁，請稍後再試。',
  'functions/internal': '系統發生錯誤，請稍後再試。',
  'functions/unavailable': '網路不穩，請稍後再試。',
  'functions/deadline-exceeded': '網路不穩，請稍後再試。',
};

export function callErrorMessage(error: unknown, fallback: string = GENERIC_ERROR): string {
  const code =
    typeof (error as { code?: unknown } | null)?.code === 'string'
      ? ((error as { code: string }).code as string)
      : '';
  return TRANSPORT_MESSAGES[code] ?? fallback;
}
