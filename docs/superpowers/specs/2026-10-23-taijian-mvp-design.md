# 苔間 — v1 設計規格

**Status:** Draft for review  
**Date:** 2026-10-23  
**Working name:** 苔間（商標／網域尚未檢索，上線前需確認）  
**Product type:** 公開上架的爬寵照護產品  
**Primary test surface:** LINE LIFF + LINE Bot  
**Native client:** Flutter for iOS（第二階段）  
**Backend:** Firebase（新專案；開發期先用 Emulator Suite）

---

## 1. Summary

苔間是一個給爬蟲與特殊寵物飼主使用的照護紀錄產品。核心價值是「同一個家庭、同一份照護資料」：屋主與代管人可以在 Flutter App、LINE LIFF、LINE Bot 三個入口看到同一批居民、紀錄與提醒，並且不會因為同時操作而產生重複、遺失或互相覆蓋的資料。

v1 的差異化不是功能數量，而是：

1. **LINE-first**：不用安裝 App，就能在 LINE 內完成今日任務、快速紀錄、邀請家人。
2. **Conflict-safe**：所有關鍵寫入都經過伺服器端 command，具備 revision、idempotency、audit log。
3. **原創且耐看的 UI**：Direction B「苔間 · 溫暖手繪」，不是像素風，也不沿用任何既有產品的角色、素材或文案。

## 2. Goals and non-goals

### Goals

- 讓一個家庭在 3 分鐘內建立第一個居民，並在 LINE 內完成第一次照護紀錄。
- 讓兩個以上的家庭成員同時操作時，不出現 lost update、重複紀錄、重複完成任務。
- 讓 LIFF、Bot、Flutter 共用同一份資料與同一套權限。
- 讓 v1 可以通過 App Store 審核，並具備可運作的隱私政策、帳號刪除、備份與監控。
- 讓後續的日記、繁殖、商城／訂閱可以在不重寫核心資料模型的前提下擴充。

### Non-goals（v1 不做）

- 公開社群、追蹤、公開提案牆。
- 繁殖／血統圖、配對、孵化。
- 商城、購物車、訂單、點數、訂閱。
- 日記照片、貼紙、拼貼、內容審核。
- Android 原生 App（v1 先 iOS；LIFF 在 Android LINE 內仍可用）。
- 多語系（v1 繁體中文；文案與程式分離，預留 i18n）。
- 即時協作編輯（同一段文字多人同時打字）；v1 用 revision 衝突提示，不做 CRDT。
- 物種後台管理；v1 用內建物種清單。

## 3. Users and jobs

### Personas

1. **屋主（Owner）**：主要飼主，建立家庭、邀請代管人、管理居民與成員。
2. **代管人（Caretaker）**：家人、朋友、寵物保母；需要快速查看今日任務、新增紀錄、完成任務。
3. **多居民飼主**：養多隻爬寵，需要一個今日頁與跨居民時間軸。
4. **LINE 重度使用者**：不想安裝新 App，希望透過 LINE 完成 80% 的日常操作。

### Jobs to be done

- 當我要出門時，我可以把居民交給家人代管，對方能看到今天要做什麼。
- 當我餵食／換水／量體重時，我可以在 10 秒內完成紀錄。
- 當兩個人同時照顧時，我不會看到重複的紀錄或不知道誰完成了任務。
- 當我換手機或重裝時，我的資料與家庭成員不會消失。

## 4. Scope and phases

### v1 — 照護核心 + 家庭共享 + LINE

- LINE Login、Apple/Google 登入與帳號綁定。
- 家庭建立、邀請、成員角色、撤銷。
- 居民管理：新增、編輯、封存、刪除、頭像顏色／initials。
- 照護紀錄：餵食、換水、體重、排便、蛻皮、活動、醫療、備註、自訂測量。
- 時間軸、體重趨勢、今日任務、逾期提示。
- 提醒：每日／每週／每 N 天、時區、開關、下一次到期。
- LINE LIFF：今日、居民、居民詳情、快速紀錄、邀請、設定。
- LINE Bot：今日摘要、居民列表、餵食、體重、完成任務、邀請、說明。
- Flutter iOS：同一 API、離線 outbox、FCM 推播、完整編輯與圖表。
- 安全：Firestore rules、command 權限、rate limit、audit log、帳號刪除、備份。

### v1.1 — 日記與照片

- 動物照片／家庭封面。
- 旅程日記、照片上傳、裁切、簡單貼紙。
- 媒體儲存（優先 Firebase Storage；量大時抽換為 Cloudflare R2）。
- 上傳額度與伺服器端驗證。

### v1.2 — 繁殖與血統

- 親代／子代關聯、配對、孵化、族譜。
- 循環檢測、資料驗證、匯入既有居民。

### v1.3 — 商城／點數／訂閱

- 商品、購物車、訂單、7-11 取貨、貨到付款（依實際合作方式調整）。
- 點數帳本、簽到、兌換。
- 支持者訂閱（StoreKit 2 + 伺服器端交易驗證）。

每個階段都有自己的 spec、plan、測試與上線門檻；本文件只承諾 v1，並確保架構可容納後續階段。

## 5. Architecture

### 5.1 Monorepo

```text
apps/
  liff/                 React + Vite + TypeScript + CSS Modules
  mobile/               Flutter（第二階段）
services/
  functions/            Node 22 + TypeScript + Firebase Functions v2
packages/
  domain/               Zod schemas、command types、error codes、permissions
  design-tokens/        顏色、字級、間距、圓角（JSON + CSS variables）
firestore.rules
firestore.indexes.json
firebase.json
.env.example
docs/
```

套件管理：pnpm workspaces。  
LIFF 建置：Vite；部署：Firebase Hosting。  
Functions：Node 22（部署 runtime 固定 22，不用主機的 Node 26 直接部署）。  
測試：Vitest（domain/functions）、Firebase Emulator、Playwright（LIFF）。

### 5.2 Runtime components

```text
┌──────────────────────┐      ┌──────────────────────┐
│ LINE LIFF (React)    │      │ Flutter iOS (v1 第二) │
│ liff.init / ID token │      │ Firebase Auth / FCM  │
└──────────┬───────────┘      └──────────┬───────────┘
           │  Firebase ID token           │
           ▼                              ▼
┌──────────────────────────────────────────────────────┐
│ Cloud Functions v2 (asia-east1)                      │
│  lineLogin / lineWebhook / executeCommand            │
│  reminderScheduler / deleteAccount / invite          │
└──────────┬───────────────────────┬───────────────────┘
           │ Admin SDK             │ LINE Messaging API
           ▼                       ▼
┌──────────────────────┐      ┌──────────────────────┐
│ Firestore            │      │ LINE Platform        │
│ Auth / FCM           │      │ LIFF / Bot / Push    │
└──────────────────────┘      └──────────────────────┘
```

### 5.3 Read/write split

- **Reads**：LIFF 與 Flutter 直接讀 Firestore，rules 限制在 household 成員。今日頁與列表使用複合索引查詢。
- **Writes**：所有關鍵寫入都呼叫 `executeCommand`。Firestore rules 對 client 寫入一律拒絕。
- **Why**：conflict 檢查、validation、rate limit、LINE 冪等、未來的點數／訂單都集中在伺服器。

### 5.4 Environments

| 環境 | 用途 | Firebase | LINE |
|---|---|---|---|
| dev | 本機開發 | Emulator Suite | 測試 provider + 測試 LIFF |
| staging | 驗收 | 獨立 Firebase project | staging channel |
| prod | 正式 | 獨立 Firebase project | 正式 provider |

Firestore region：`asia-east1`（台灣）。Functions region：`asia-east1`。  
正式專案 ID、LIFF ID、channel ID 由環境變數注入，不寫死在程式碼。

## 6. Identity and account linking

### 6.1 LINE login flow

```text
LIFF open
  → liff.init({ liffId })
  → if (!liff.isLoggedIn()) liff.login()
  → idToken = liff.getIDToken()
  → POST /lineLogin { idToken }
  → server verifies signature/claims with LINE channel ID
  → lineUsers/{lineUserId} → Firebase UID
  → admin.auth().createCustomToken(uid)
  → signInWithCustomToken(firebase)
```

Server checks:

- ID token `aud` equals the LINE Login channel ID.
- `exp` not expired; `iss` is LINE.
- `sub` is the LINE user ID.
- The user is not disabled.

### 6.2 One person, one UID

- Firebase UID is the canonical identity.
- `lineUsers/{lineUserId}` maps LINE → UID.
- Apple/Google sign-in uses Firebase native providers and the same UID.
- A user may have multiple providers; a provider may map to only one UID.

### 6.3 Linking

- **Apple/Google linking** uses Firebase native `linkWithCredential` on the client while the user is signed in. The server validates the resulting provider and audit-logs the change.
- **LINE linking** uses the server-side mapping `lineUsers/{lineUserId}.uid` after verifying both the Firebase ID token and the LINE ID token.
- **LINE first, Apple later**: user signs in with LINE, then adds Apple in Settings via `linkWithCredential`.
- **Apple/Google first, LINE later**: user signs in with Apple/Google, then taps「連結 LINE」in Settings; the server writes the LINE mapping.
- **Conflict**: if the LINE user ID is already linked to another UID, return `LINE_ALREADY_LINKED`. Do not auto-merge. Support handles account merge manually in v1.
- **Unlink**: allowed only if the user has another sign-in method; otherwise the account would become unreachable.

### 6.4 Session and revocation

- Firebase custom token is short-lived.
- Disabling or deleting an account calls `revokeRefreshTokens(uid)`.
- Client listens for auth state changes and signs out on `user-disabled` / token revoked.

## 7. Data model

All timestamps use Firestore `Timestamp`; server writes `createdAt` / `updatedAt` with `FieldValue.serverTimestamp()`.

### 7.1 Collections

```text
users/{uid}
  displayName, avatarUrl, locale, timezone
  householdIds: string[]
  defaultHouseholdId
  schemaVersion, createdAt, updatedAt

lineUsers/{lineUserId}
  uid, displayName, pictureUrl, linkedAt

households/{householdId}
  name, ownerUid, ownerCount, memberCount
  timezone ("Asia/Taipei")
  settings { quietHours, notificationsEnabled }
  revision, schemaVersion, createdAt, updatedAt, deletedAt

households/{householdId}/members/{uid}
  uid, role: "owner" | "caretaker"
  displayName, avatarUrl
  joinedAt, invitedBy, status: "active"

animals/{animalId}
  householdId, name, species, morph, sex
  birthDate, adoptionDate
  avatarColor, photoUrl   # photoUrl reserved for v1.1; v1 uses avatarColor + initials
  notes, status: "active" | "memorial" | "archived"
  revision, schemaVersion
  createdBy, createdAt, updatedBy, updatedAt, deletedAt
  lastChangedFields: string[]

records/{recordId}
  householdId, animalId
  type: feeding | water | weight | poop | shed | activity | medical | note | custom
  occurredAt, value, unit, note
  metadata: { food?, refused?, measurementName?, ... }
  source: "liff" | "ios" | "android" | "bot"
  sourceEventId
  createdBy, createdAt, updatedBy, updatedAt
  revision, deletedAt, lastChangedFields

reminders/{reminderId}
  householdId, animalId, title, type
  schedule {
    kind: "daily" | "weekly" | "interval",
    times: ["08:30"],
    weekdays: [1,3,5],
    everyNDays: 7,
    startDate: "2026-10-23"
  }
  timezone, enabled, nextDueAt, lastCompletedAt
  revision, schemaVersion, createdBy, createdAt, updatedBy, updatedAt, deletedAt

taskCompletions/{completionId}
  householdId, animalId, reminderId, dueDate ("2026-10-23")
  completedAt, completedBy, source
  # completionId = sha256(reminderId + ":" + dueDate)

invites/{inviteId}
  householdId, role, createdBy
  secretHash, expiresAt, maxUses, usedCount
  status: "active" | "used" | "revoked" | "expired"
  acceptedBy: [uid]
  createdAt

households/{householdId}/auditLogs/{logId}
  actorUid, actorType, action, targetType, targetId
  before, after, commandId, source
  createdAt

commands/{commandId}
  uid, type, requestHash, status, response
  createdAt, expiresAt   # TTL 24h

notificationLog/{logId}
  householdId, reminderId, dueDate, channel, status
  createdAt, expiresAt   # TTL 30 days
```

### 7.2 Why top-level records/reminders

Records and reminders are top-level with `householdId` and `animalId`, not nested under animals. This enables:

- One query for today's tasks across all animals in a household.
- One query for the cross-animal timeline.
- A simpler reminder scheduler.
- Firestore rules based on a denormalized `householdId`.

`users/{uid}.householdIds` is maintained transactionally by membership commands. It powers the household switcher without a collection-group query; `defaultHouseholdId` remembers the last selection.

Animal detail filters by `animalId` + `occurredAt` descending.

### 7.3 Species

v1 uses a static species list in `packages/domain`:

- 豹紋守宮、肥尾守宮、玉米蛇、球蟒、綠角蛙、鬃獅蜥、鬆獅蜥、烏龜、陸龜、變色龍、藍舌蜥、蜜袋鼯、刺蝟、其他。
- Each entry: `id`, `name`, `scientificName`, `category`, `defaultUnit` (g / cm), `careTips?`.
- Custom species is v1.1; v1's "其他" allows a free-text `speciesLabel`.

### 7.4 Time and dates

- `occurredAt` is user-selectable; allowed range: 1 year in the past to 5 minutes in the future.
- `dueDate` is a local date string computed in the reminder's stored `timezone` at generation time; changing the household timezone does not rewrite historical completions.
- Reminder `nextDueAt` is a UTC timestamp computed from local time + timezone.
- Clients never write server timestamps.

## 8. Conflict protocol

This is the core of the product. Every critical mutation goes through a command.

### 8.1 Command envelope

```json
{
  "commandId": "018f4f7e-...",
  "type": "animal.update",
  "householdId": "hh_...",
  "baseRevision": 7,
  "payload": { "name": "阿肥", "weight": 68 },
  "client": {
    "platform": "liff",
    "appVersion": "1.0.0"
  }
}
```

- `commandId` is a client-generated UUIDv7. It is the idempotency key. The idempotency window is 24 hours; clients must not reuse a `commandId` after that window.
- `baseRevision` is required for update/delete; omitted for create.
- `payload` is validated with a Zod schema per command type.
- `client.platform` is used for audit and conflict UX, never for authorization.

### 8.2 Server transaction

For each command, in one Firestore transaction:

1. Read `commands/{commandId}`. If it exists:
   - If `requestHash` matches, return the cached response (idempotent replay).
   - If `requestHash` differs, return `IDEMPOTENCY_MISMATCH`.
2. Read the target document(s) and membership.
3. Check role and household scope.
4. If `baseRevision` is present and differs from the current `revision`, return `CONFLICT` with the current document and `lastChangedFields`.
5. Validate payload, limits, and rate limit counters.
6. Apply the mutation.
7. Increment `revision`; set `lastChangedFields`; set server timestamps and actor.
8. Write `commands/{commandId}` with `requestHash`, response, and `expiresAt` (24h).
9. Write audit log.
10. Commit.
11. After commit, send notifications (LINE/FCM) if needed; notification failure does not fail the command.

### 8.3 Per-operation strategy

| Operation | Strategy | Concurrent result |
|---|---|---|
| `record.create` | Append-only; client-generated `recordId` (UUIDv7) | Both records survive; replay of same `commandId` returns one |
| `task.complete` | Deterministic completion ID `sha256(reminderId + ":" + dueDate)` | Second caller gets success + `completedBy` |
| `animal.update` / `reminder.update` | `revision` optimistic lock | One succeeds; the other gets 409 + current doc |
| `animal.delete` | Soft delete + revision | 409 if changed; records get `deletedAt` |
| `member.accept` | Transaction + single-use token | Only one membership; repeat returns current state |
| `member.updateRole` | Transaction + owner check + `ownerCount` | Cannot remove last owner |
| `LINE webhook` | `webhookEventId` as `commandId` | Retries are ignored |
| Flutter offline replay | Outbox + same `commandId` | Idempotent; conflicts surface to UI |

`ownerCount` and `memberCount` are updated in the same transaction as membership changes; a weekly integrity job recomputes both from `members`.

### 8.4 Record creation

- Client generates `recordId` (UUIDv7) and `commandId`.
- Server checks `records/{recordId}`; if it exists:
  - Same `createdBy` and same payload hash → return existing (idempotent).
  - Different payload → `DUPLICATE_ID`.
- Records are append-only at creation (both concurrent creates survive), but not immutable: edits and soft deletes are separate commands with revision checks and audit logs.

### 8.5 Task completion

- `completionId = sha256(reminderId + ":" + dueDate)`.
- Creating an existing completion is a success, not a conflict.
- Response includes `completedBy` and `completedAt` so the client can show "已完成 by 小明".
- `task.uncomplete` is allowed only by the person who completed it or the owner; it deletes the completion with an audit log.

### 8.6 Offline outbox（Flutter）

Local table `outbox`:

```text
commandId (PK), type, householdId, targetId, baseRevision,
payloadJson, status (pending|sending|conflict|failed|done),
attempts, lastError, createdAt
```

- Send sequentially per target; global concurrency 2.
- 409 → mark `conflict`; fetch current doc; show merge UI.
- Network error → exponential backoff with jitter; retry on reconnect.
- Success → remove from outbox after the server confirms.
- Reads use Firestore offline cache plus a local mirror for the dashboard.

LIFF is online-first. It retries failed commands and shows a clear error; it does not promise offline editing.

### 8.7 Conflict UX

- **Animal/reminder edit**: "這筆資料剛被小明更新" + "查看最新" / "保留我的".
  - "查看最新": discard local edit, show current.
  - "保留我的": re-read current, merge local fields on top, resubmit with the new `baseRevision`, confirm before overwriting.
- **Record create**: no conflict.
- **Task completion**: idempotent; show who completed it.
- **Invite accept**: show used/expired state; never create a second membership.

### 8.8 Audit log

Every command writes one audit entry under `households/{householdId}/auditLogs`:

```json
{
  "actorUid": "...",
  "actorType": "user|bot|system",
  "action": "animal.update",
  "targetType": "animal",
  "targetId": "...",
  "before": { "name": "阿肥" },
  "after": { "name": "阿肥", "weight": 68 },
  "commandId": "...",
  "source": "liff",
  "createdAt": "<server timestamp>"
}
```

Audit logs are append-only, readable by household members, retained 90 days.

### 8.9 Rate limits

- 100 commands/minute/UID.
- 20 record creates/minute/UID.
- 10 invite creates/day/UID.
- 30 Bot interactions/minute/UID.
- Rate limit state lives in `rateLimits/{uid}` with window counters; TTL cleans up.

## 9. Command API

### 9.1 Transport

- Primary: Firebase callable function `executeCommand`.
- LIFF and Flutter use the Firebase SDK callable wrapper.
- Bot uses the Admin SDK directly (server-side), not HTTP.
- All responses use the same envelope.

### 9.2 Command catalog（v1）

**Household**

- `household.create`
- `household.update`
- `household.delete`（owner only；需先移除成員或轉移）

**Members**

- `member.invite`
- `member.accept`
- `member.remove`
- `member.updateRole`
- `member.leave`

**Animals**

- `animal.create`
- `animal.update`
- `animal.archive`
- `animal.delete`

**Records**

- `record.create`
- `record.update`
- `record.delete`

**Reminders / tasks**

- `reminder.create`
- `reminder.update`
- `reminder.delete`
- `task.complete`
- `task.uncomplete`

**User / LINE**

- `user.updateProfile`
- `user.deleteAccount`
- `line.link`
- `line.unlink`

### 9.3 Response envelope

```ts
type CommandResult<T> =
  | { ok: true; commandId: string; revision?: number; data: T; serverTime: string }
  | {
      ok: false;
      commandId: string;
      code: ErrorCode;
      message: string;
      current?: T;
      currentRevision?: number;
      lastChangedFields?: string[];
      serverTime: string;
    };
```

### 9.4 Error codes

```text
VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
CONFLICT
RATE_LIMITED
DUPLICATE_ID
IDEMPOTENCY_MISMATCH
LINE_ALREADY_LINKED
LAST_OWNER
INVITE_EXPIRED
INVITE_USED
INTERNAL
```

## 10. LINE integration

### 10.1 Channels

- One LINE provider.
- **Messaging API channel** for the Bot.
- **LINE Login channel** for LIFF; linked to the same provider so user IDs are consistent.
- **LIFF app** under the LINE Login channel.
- Test and production use separate providers/channels.

### 10.2 LIFF pages

| Path | Content |
|---|---|
| `/` | Today: greeting, overdue, today tasks, quick add, animal chips |
| `/animals` | List, search, add |
| `/animals/:id` | Profile, recent records, weight chart, quick actions |
| `/record/new` | Record form: type, animal, time, value, note |
| `/invite` | Accept household invite (`?token=`) |
| `/settings/invite` | Create/revoke household invite (owner) |
| `/settings` | Profile, household, members, notifications, logout, delete account |
| `/link` | Link LINE to an existing Apple/Google account |

### 10.3 Bot commands

```text
今日                  → today's task summary
居民                  → animal list
餵食 <居民> [備註]     → create feeding record now
體重 <居民> <數字>     → create weight record（預設單位 g）
完成 <任務>            → complete task (idempotent)
邀請                  → create single-use invite (owner)
說明                  → help
```

- Ambiguous animal names → quick reply picker; never guess.
- All postback IDs are re-checked against household membership on the server.
- v1 is 1:1 chat only; group chats do not expose household data.
- Unlinked user → reply with a LIFF login link.

### 10.4 Rich menu

Six cells:

1. 今日任務 → LIFF `/`
2. 我的居民 → LIFF `/animals`
3. 快速紀錄 → LIFF `/record/new`
4. 邀請家人 → LIFF `/settings/invite`
5. 通知設定 → LIFF `/settings`
6. 使用說明 → Bot help

### 10.5 Webhook

- HTTPS Function `lineWebhook`, raw body preserved.
- Verify `x-line-signature` with the Messaging API channel secret.
- For each event, use `webhookEventId` as the command idempotency key.
- v1 processes each event synchronously and replies within the 2-second budget. If production p95 exceeds 2s, the defined fallback is to enqueue the event to Pub/Sub and return 200 immediately; the processor remains idempotent.
- Reply via the reply API; if the reply token is expired, fall back to push only for critical notifications.

### 10.6 Notifications

- Cloud Scheduler every 5 minutes: query reminders whose `nextDueAt` is due.
- Send LINE push + FCM (Flutter).
- Deduplicate with `notificationLog` keyed by `reminderId + dueDate + channel`.
- Respect household quiet hours and per-user opt-in.
- Notification failure is logged; it does not roll back data.

## 11. UI system

### 11.1 Brand

- Working name: **苔間**.
- Tagline: **把每一次照顧，留在同一個家。**
- Tone: calm, warm, trustworthy; not childish.
- Logo: simple moss/pebble mark + wordmark; no reptile clipart.

### 11.2 Design tokens

```json
{
  "color": {
    "bg": "#FFF8EE",
    "ink": "#3B2F2A",
    "primary": "#7C9A76",
    "primaryStrong": "#4F6B4B",
    "accent": "#E8A87C",
    "butter": "#F4D9B0",
    "successBg": "#EEF4E8",
    "overdue": "#C96F4A",
    "card": "#FFFFFF",
    "muted": "#8A7E73",
    "line": "#EADCCB"
  },
  "font": {
    "display": "Nunito, Noto Sans TC, sans-serif",
    "body": "Noto Sans TC, -apple-system, sans-serif"
  },
  "radius": { "sm": 12, "md": 18, "lg": 24, "pill": 999 },
  "space": [4, 8, 12, 16, 24, 32]
}
```

### 11.3 Components

- `MossCard`: white card, 24px radius, low-shadow, optional action.
- `TaskRow`: completion dot, title, time, overdue pill.
- `AnimalChip`: 40px avatar (photo or color + initials), name, species.
- `QuickRecordSheet`: bottom sheet with type segmented control, animal picker, time, value, note.
- `ConflictBanner`: peach background, "資料已更新", two actions.
- `EmptyState`: simple line illustration + one sentence + CTA.
- `PrimaryButton` (52px), `GhostButton`, `Field` (48px), `Toast`.

### 11.4 Screens

1. Today
2. Animals list
3. Animal detail (profile, quick actions, weight chart, timeline)
4. Quick record sheet
5. Invite
6. Conflict state
7. Settings
8. Empty/loading/error states

### 11.5 Accessibility

- Body contrast ≥ 4.5:1; large text ≥ 3:1.
- Tap targets ≥ 44×44.
- Dynamic type; no fixed-height text containers.
- VoiceOver labels for icon-only buttons.
- Reduced motion disables blob animations.
- Light mode only in v1; tokens ready for dark mode.

### 11.6 Implementation

- LIFF: React + CSS Modules + CSS variables; Lucide icons; Noto Sans TC + Nunito.
- Flutter: `ThemeData` generated from the same token JSON; custom widgets mirror LIFF.
- No pixel-art assets, no copied illustrations, no original app's text.

## 12. Security and privacy

### 12.1 Secrets

- LINE channel secret and access token live in Google Secret Manager or Functions environment variables.
- Never in the repo, LIFF bundle, Flutter binary, or logs.
- `.env.local` is gitignored; `.env.example` contains placeholders only.
- CI uses Workload Identity Federation; no long-lived service account keys.

### 12.2 Authentication

- Verify LINE ID token server-side: `aud`, `exp`, `iss`, `sub`.
- Never trust a client-supplied userId.
- Revoke refresh tokens on disable/delete.
- Rate-limit login attempts.

### 12.3 Firestore rules

- Client writes: deny all.
- Reads: only household members; documents carry `householdId`.
- `users/{uid}` readable by self; `lineUsers` and `commands` are server-only.
- Rules unit tests are a release gate.

### 12.4 Abuse prevention

- Rate limits per UID/IP/command.
- Payload size limits and Zod validation.
- LINE webhook signature + eventId dedupe.
- Invite tokens: 128-bit random, hashed at rest, single-use, 7-day expiry, revocable.
- Generic errors for UID/email existence.

### 12.5 App Check

- Enable before public launch.
- Flutter: App Attest + DeviceCheck.
- LIFF: reCAPTCHA Enterprise if feasible; if not, Functions enforce ID token + rate limits, and App Check is enabled for the native app.

### 12.6 Privacy

- Collect: LINE userId, displayName, pictureUrl, Firebase UID, household/animal/record data, push token (Flutter).
- Do not collect email unless Apple/Google provides it; no phone/address in v1.
- Privacy policy and terms; subprocessors: Google Firebase, LINE.
- Taiwan PDPA; GDPR notes if serving EU.
- **Account deletion**: owner must transfer or delete the household; caretaker membership is removed. Delete Auth, FCM tokens, and personal Storage objects. Firestore records created by the user remain in the household but are attributed to「已刪除成員」. Audit logs retain only the pseudonymous UID (no display name or email). Backups rotate within 30 days.
- Data export: v1.1 JSON/CSV; v1 via support.
- Age rating: 4+ for v1 (no public UGC).

## 13. Operations

### 13.1 CI/CD

- GitHub Actions: install → lint → typecheck → unit → emulator integration → build → deploy staging.
- Production deploy requires manual approval.
- Deploy Functions, Hosting, Firestore rules/indexes together.

### 13.2 Data lifecycle and backups

- Firestore TTL: `commands.expiresAt` (24h), `rateLimits.expiresAt` (1h), `notificationLog.expiresAt` (30d).
- Soft-deleted documents are purged 30 days after `deletedAt` by a scheduled function.
- Daily Firestore export to GCS; 30-day retention.
- Quarterly restore drill.
- Document restore runbook.

### 13.3 Observability

- Cloud Logging + Error Reporting.
- Metrics: command success rate, 409 rate, webhook 5xx, p95 latency, push failure rate, daily active households.
- Alerts: error rate > 2%, webhook 5xx > 1%, command p95 > 3s, budget > 80%.

### 13.4 Cost controls

- Firestore read/write budgets and alerts.
- Functions min instances 0.
- LINE push quota monitoring.
- Dashboard queries use indexes; avoid per-render full scans.

### 13.5 Incident switches

- Disable Bot webhook.
- Disable command API.
- LIFF maintenance page.
- Roll back Functions/Hosting to previous version.

## 14. Testing and acceptance

### 14.1 Test pyramid

- **Unit**: Zod schemas, permission matrix, completion key, invite state machine, conflict detection.
- **Integration**: Firebase Emulator; two clients; concurrent updates; duplicate commands; webhook replay; invite race; last-owner protection.
- **E2E**: two LINE test users; LIFF + Bot interleaved.
- **Load**: 100 concurrent commands; verify no duplicate records and p95 < 3s.
- **Security**: rules fuzzing, secret scan, dependency audit, SAST.
- **Accessibility**: axe/Lighthouse for LIFF; VoiceOver for Flutter.

### 14.2 Acceptance criteria（v1）

- [ ] LINE login works in LIFF; Apple/Google login works in iOS; accounts can be linked.
- [ ] A user can create a household, invite another user, and accept the invite.
- [ ] Owner and caretaker see the same animals and records.
- [ ] Caretaker cannot delete animals or manage members.
- [ ] Creating a record from LIFF and Bot simultaneously produces two records, no duplicates.
- [ ] Replaying the same command or webhook event does not duplicate data.
- [ ] Two users editing the same animal with the same baseRevision → one succeeds, one sees a conflict.
- [ ] Two users completing the same task → one completion, both see who completed it.
- [ ] Invite accept race → one membership.
- [ ] Last owner cannot be removed.
- [ ] Today page shows overdue/today tasks correctly in the household timezone.
- [ ] Account deletion removes access and data per policy.
- [ ] Rules tests, unit tests, integration tests pass in CI.
- [ ] LIFF passes basic accessibility checks.
- [ ] iOS build passes App Store review requirements (Sign in with Apple, account deletion, privacy labels).

## 15. Delivery plan

The first implementation plan covers **Phase 0 and Phase 1 only**. Phase 2+ receives a separate plan after the LINE-first MVP is validated.

### Phase 0 — Foundation

- Monorepo, pnpm workspaces, TypeScript config, lint/format.
- `packages/domain`: schemas, types, error codes, permission matrix, species list.
- Firebase Emulator config, rules/indexes skeleton.
- CI skeleton.
- Exit: `pnpm test` and emulator boot pass.

### Phase 1 — LINE-first MVP

- Auth: `lineLogin`, account linking, `lineUsers`.
- Households, members, invites.
- Animals, records, reminders, task completions.
- `executeCommand` with conflict/idempotency/audit.
- LIFF: Today, Animals, Animal detail, Quick record, Invite, Settings.
- Bot: webhook, commands, rich menu, notifications.
- Tests: unit + emulator integration + E2E with two LINE test users.
- Exit: all v1 acceptance criteria except iOS-specific ones.

### Phase 2 — Flutter iOS

- Flutter app with Riverpod, go_router, Firebase Auth/Firestore/Functions/FCM.
- Offline outbox and conflict UI.
- Today, Animals, Animal detail, Quick record, Settings.
- Sign in with Apple/Google; LINE linking.
- Exit: iOS TestFlight build passes core flows; offline replay tests pass.

### Phase 3 — Hardening and launch

- App Check, rate limits, backups, monitoring, alerts.
- Privacy policy, terms, support page, account deletion.
- App Store metadata, screenshots, review notes, test account.
- Closed beta (10–20 users), fix issues, production launch.
- Exit: beta feedback resolved; incident runbook; on-call expectations.

### Phase 4+ — v1.1 / v1.2 / v1.3

Each gets its own spec and plan.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LINE API changes or pricing | `LineGateway` abstraction; monitor quotas |
| Webhook latency | synchronous fast path; Pub/Sub fallback |
| Firestore hot spots | avoid household counters; use `ownerCount` only for low-frequency role changes |
| Account merge complexity | no auto-merge in v1; manual support |
| LIFF limitations | complex editing stays in Flutter |
| Review rejection due to LINE-only login | Apple/Google login is first-class in iOS |
| Brand/trademark conflict | search 「苔間」 and domains before launch |
| Scope creep | phase gates; v1 acceptance criteria fixed |
| Data loss | backups + restore drills + soft delete |

## 17. Decisions

| Decision | Choice | Why |
|---|---|---|
| Product positioning | Public product | Requires privacy, roles, store review from day one |
| Launch strategy | Phased | Shop/subscription/journal/breeding are separate subsystems |
| LINE strategy | LIFF-first + Bot | Fastest test surface; forces server-authoritative backend |
| Backend | New Firebase + Emulator | Matches architecture; isolates from `g-reptile` |
| Primary platform | iOS first | Xcode available; Flutter still cross-platform later |
| Shared boundary | Household-level | Simpler rules and UX; per-animal ACL in v1.1 |
| Writes | Server-authoritative command API | Conflict, validation, idempotency |
| Conflict model | Revision + commandId + append-only records | No lost updates; safe retries |
| UI direction | B — 苔間 · 溫暖手繪 | Warm, differentiated, family-friendly |
| Notification | LINE push + FCM | LINE-first; native later |
| Media | Deferred to v1.1 | Avoid Storage/moderation in v1 |
| Species | Static list | Avoid admin tooling in v1 |

## Appendix A — Environment variables

```text
APP_ENV=dev|staging|prod
APP_BASE_URL=https://...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...          # CI only / ADC preferred
FIREBASE_PRIVATE_KEY=...           # CI only / Secret Manager
LINE_LOGIN_CHANNEL_ID=...
LINE_MESSAGING_CHANNEL_ID=...
LINE_MESSAGING_CHANNEL_SECRET=...  # Secret Manager
LINE_CHANNEL_ACCESS_TOKEN=...      # Secret Manager
LIFF_ID=...                        # public
LIFF_URL=https://liff.line.me/...
```

Frontend-visible values: Firebase web config, `LIFF_ID`, `LIFF_URL`, `APP_BASE_URL`.  
Server-only values: channel secret, access token, service account credentials.

## Appendix B — Glossary

- **Household**：共享同一批居民與照護資料的家庭單位。
- **Owner / Caretaker**：屋主／代管人。
- **Resident**：一隻爬寵（UI 用「居民」）。
- **Record**：一次照護事實（餵食、換水、體重等）。
- **Reminder**：排程規則，產生今日任務。
- **Completion**：某個提醒在某一天的完成事實。
- **Command**：一個具備 idempotency 與 revision 的伺服器端寫入操作。
- **LIFF**：LINE Front-end Framework，在 LINE 內開啟的 web app。
- **Rich menu**：LINE 聊天室底部的圖文選單。

## Appendix C — Firestore indexes and TTL

Composite indexes:

```text
animals:            householdId ASC, status ASC, name ASC
records:            householdId ASC, occurredAt DESC
records:            animalId ASC, occurredAt DESC
reminders:          householdId ASC, enabled ASC, nextDueAt ASC
reminders:          enabled ASC, nextDueAt ASC          # scheduler
taskCompletions:    householdId ASC, dueDate ASC
invites:            householdId ASC, status ASC
auditLogs (subcollection): createdAt DESC
```

TTL policies:

```text
commands.expiresAt          24 hours
rateLimits.expiresAt        1 hour
notificationLog.expiresAt   30 days
```
