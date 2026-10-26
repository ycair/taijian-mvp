# 苔間 · Taijian

> LINE-first, conflict-safe care log for reptiles and exotic pets.  
> 把每一次照顧，留在同一個家。

**Status:** Supabase demo running locally — no billing account required.  
**Working name:** 苔間（商標／網域尚未檢索）  
**Target:** LINE-first demo on Supabase; Flutter iOS with native LINE + Supabase real mode.

---

## What this is

苔間是一個給爬蟲與特殊寵物飼主使用的照護紀錄產品。它不是另一個單機記事本，而是一個**家庭共享、跨入口、衝突安全**的照護系統：

- **LINE LIFF**：不用安裝 App，就能看今日任務、快速紀錄、邀請家人。
- **LINE Bot**：今日摘要、快速指令、提醒通知、圖文選單。
- **Flutter iOS**：完整編輯、圖表、離線 outbox、推播。
- **同一個 Firebase UID、同一份 Firestore 資料、同一套權限。**

## Supabase demo (current)

The demo backend runs on the **Supabase free tier** and does not require a credit card.
It replaces the paused Firebase staging path for the demo:

- **Postgres + RLS** — household members can read their own data; clients cannot write directly.
- **Edge Functions** — `line-login`, `execute-command`, `line-webhook`.
- **Custom LINE JWT** — LINE ID token is verified server-side; the function returns a short-lived
  Supabase-compatible JWT. PostgREST RLS uses its `sub` as `auth.uid()`.
- **Conflict safety** — client-generated `commandId` + idempotency table, per-row `revision`,
  and server-side commands for writes.
- **Single-use invites** — hashed token, expiry, used count, and membership transaction.

### Run locally (Docker, no cloud account)

```bash
pnpm install
pnpm supabase:start
pnpm supabase:reset
cp supabase/functions/.env.example supabase/functions/.env
pnpm exec supabase status   # copy the Publishable key
cp apps/liff-sb/.env.example apps/liff-sb/.env.local
# edit apps/liff-sb/.env.local: VITE_SUPABASE_ANON_KEY=<Publishable key>
```

Then run these in two terminals:

```bash
pnpm supabase:functions   # Edge Functions on http://127.0.0.1:54321/functions/v1
pnpm dev:liff-sb          # LIFF demo on http://localhost:5174
```

Open `http://localhost:5174/?mock=UtestA` and press **以 LINE 登入**. The seed includes:

- `UtestA` — owner of「苔間測試家庭」with resident「阿肥」and a daily feeding reminder.
- `UtestB` — caretaker in the same household.

Core demo flows: Today → complete a task; 居民 → add a resident; resident detail → quick record
and reminder; 設定 → owner creates an invite link. The invite can be accepted by opening
`/invite?token=...` as `UtestB`.

### Deploy to a free Supabase project

1. Create a free project at `supabase.com` (no card required).
2. `pnpm exec supabase link --project-ref <ref>` and `pnpm exec supabase db push`.
3. Deploy functions: `pnpm exec supabase functions deploy line-login execute-command line-webhook`.
4. Set function secrets (never commit them):
   `JWT_SECRET` = project JWT secret, `LINE_LOGIN_CHANNEL_ID`, `LINE_MESSAGING_CHANNEL_SECRET`,
   `LINE_CHANNEL_ACCESS_TOKEN`, `LIFF_ID`. Do **not** set `ALLOW_MOCK_LINE` in production;
   only the local demo enables it.
5. Build the LIFF with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LIFF_ID`, and
   `VITE_USE_MOCK_LINE=false`; host it on any free HTTPS static host (Cloudflare Pages,
   Netlify, GitHub Pages). Point the LINE LIFF endpoint URL at that host.
6. Set the LINE Messaging webhook to
   `https://<project-ref>.supabase.co/functions/v1/line-webhook`.

`.env.local`, `supabase/functions/.env`, LINE secrets, and the Supabase secret key must stay
out of git. The Flutter app supports a Supabase real mode with native LINE login
(see [Flutter iOS native LINE](docs/operations/ios-native-line.md)); mock remains
the default in debug builds.

## Why this exists

多數照護 App 在「一個人使用」時沒有問題；一旦有第二個照顧者，就會出現：

- 兩個人同時新增紀錄 → 重複資料。
- 兩個人同時完成任務 → 不知道誰完成了。
- 一個人用舊畫面儲存 → 覆蓋另一個人的修改。
- LINE 通知重送 → 同一筆紀錄被建立兩次。

苔間的設計目標，是讓這些情況在架構層被解決，而不是靠使用者小心。

## Core guarantees

| 保證 | 實作方式 |
|---|---|
| 重送不會重複 | 每個寫入都有 client-generated `commandId`，伺服器 24 小時內冪等 |
| 同時新增不會互蓋 | 照護紀錄 append-only；兩筆都保留 |
| 同時完成任務只算一次 | `taskCompletions` 使用 `sha256(reminderId + ":" + dueDate)` 作為 document ID |
| 編輯不會 lost update | 可變文件有 `revision`；`baseRevision` 不符回 `409 CONFLICT` 與最新資料 |
| LINE webhook 重送不會重複 | 以 `webhookEventId` 作為 command idempotency key |
| 邀請只能接受一次 | 單次 token + Firestore transaction + 過期／撤銷狀態 |
| 離線操作可安全重播 | Flutter outbox 保存 command，重連後依序送出；衝突可見 |
| 所有關鍵操作可追溯 | 每個 command 寫入 household audit log |

完整規則見 [`docs/superpowers/specs/2026-10-23-taijian-mvp-design.md`](docs/superpowers/specs/2026-10-23-taijian-mvp-design.md) §8。

## v1 scope

- LINE Login、Apple／Google 登入與帳號綁定
- 家庭建立、邀請、owner／caretaker 角色
- 居民管理（新增、編輯、封存、刪除、顏色頭像）
- 照護紀錄（餵食、換水、體重、排便、蛻皮、活動、醫療、備註、自訂測量）
- 今日任務、逾期提示、體重趨勢、時間軸
- 提醒（每日／每週／每 N 天、時區、開關）
- LINE LIFF：今日、居民、居民詳情、快速紀錄、邀請、設定
- LINE Bot：今日、居民、餵食、體重、完成任務、邀請、說明
- Flutter iOS：同一 API、離線 outbox、FCM
- 安全：Firestore rules、command 權限、rate limit、audit log、帳號刪除、備份

## Roadmap

| 階段 | 內容 | 狀態 |
|---|---|---|
| v1 | 照護核心 + 家庭共享 + LINE | 設計中 |
| v1.1 | 日記、照片、媒體子系統 | 未開始 |
| v1.2 | 繁殖、血統、族譜 | 未開始 |
| v1.3 | 商城、點數、訂閱 | 未開始 |

## Architecture (Firebase Phase 1 reference; Supabase demo above)

```text
┌──────────────────────┐      ┌──────────────────────┐
│ LINE LIFF (React)    │      │ Flutter iOS (Phase 2)│
│ liff.init / ID token │      │ Auth / Firestore / FCM│
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
│ Firestore / Auth/FCM │      │ LINE Platform        │
│                      │      │ LIFF / Bot / Push    │
└──────────────────────┘      └──────────────────────┘
```

- **Reads**：client 直接讀 Firestore，rules 限制在 household 成員。
- **Writes**：全部走 `executeCommand`；client 寫入一律拒絕。
- **Identity**：LINE／Apple／Google → 同一個 Firebase UID。
- **Secrets**：LINE channel secret／access token 只在 Secret Manager 或 Functions 環境變數。

## Repository layout

```text
apps/
  liff/                 React + Vite + TypeScript + CSS Modules（Firebase Phase 1 reference）
  liff-sb/              React + Vite + Supabase demo（current）
  mobile/               Flutter iOS（Phase 2, native LINE + Supabase real mode）
services/
  functions/            Node 22 + TypeScript + Firebase Functions v2（paused）
supabase/
  migrations/           Postgres schema, RLS, seed
  functions/            line-login / execute-command / line-webhook
packages/
  domain/               Zod schemas、command types、permissions
  design-tokens/        Direction B tokens（JSON + CSS variables）
docs/
  design/               視覺方向 mockup
  superpowers/specs/    v1 設計規格
```

目前 repo 只有設計文件；Phase 0 建立 monorepo、Emulator 設定與 CI。

## Documentation

- [v1 Design Spec](docs/superpowers/specs/2026-10-23-taijian-mvp-design.md)
- [Supabase cloud demo](docs/operations/supabase-cloud.md)
- [Flutter iOS native LINE](docs/operations/ios-native-line.md)
- [Visual Directions](docs/design/visual-directions.html)
- Reverse-engineering notes (private): `ycair/paapajiu-re`

苔間的架構參考自一份 private 逆向研究，但**不包含**任何原 App 的程式碼、素材、角色、文案或品牌識別。

## Development

Prerequisites: Node 22.x (`pnpm` downloads and pins it via `.npmrc`) and pnpm 10.

```bash
pnpm install     # install workspace dependencies
pnpm lint        # ESLint across the monorepo
pnpm typecheck   # tsc across every workspace package
pnpm test        # Vitest across every workspace package
pnpm build       # build every workspace package
```

Phase 0 會加入：

- Node 22 + pnpm workspaces
- Firebase Emulator Suite（Auth / Firestore / Functions / Hosting）
- `packages/domain` 共用 schema 與 command 定義
- Vitest + Firebase Rules Unit Testing
- GitHub Actions：lint → typecheck → test → build

Phase 2 會加入 Flutter 3.x（Riverpod、go_router、Firebase、Drift）與 iOS build。

## Local development (Phase 0–1)

```bash
pnpm install
pnpm emulators          # Auth / Firestore / Functions（會把 .env 複製進 .deploy/functions）
pnpm seed               # 種子家庭 hh_demo、阿肥、今日餵食提醒（可選，E2E 會自動重跑）
pnpm mock:line          # mock LINE（127.0.0.1:4010），供本機登入與 push
pnpm --filter @taijian/liff dev
pnpm test:e2e           # Playwright 驗收（自動 seed 並啟動 Vite）
```

第一次跑 E2E 前先安裝瀏覽器：`pnpm exec playwright install chromium`。

`apps/liff/.env.local` 與 `services/functions/.env` 是本機專用設定（已被 git 忽略）：

```text
# apps/liff/.env.local
VITE_FIREBASE_API_KEY=demo
VITE_FIREBASE_AUTH_DOMAIN=demo-taijian.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-taijian
VITE_FIREBASE_APP_ID=1:demo:web:demo
VITE_LIFF_ID=test-liff
VITE_USE_EMULATORS=true
VITE_USE_MOCK_LINE=true
VITE_RECAPTCHA_ENTERPRISE_KEY=
VITE_APP_CHECK_DEBUG_TOKEN=
```

```text
# services/functions/.env
APP_ENV=dev
LINE_LOGIN_CHANNEL_ID=test-login-channel
LINE_MESSAGING_CHANNEL_ID=test-messaging-channel
LINE_MESSAGING_CHANNEL_SECRET=test-messaging-secret
LINE_CHANNEL_ACCESS_TOKEN=test-access-token
LINE_VERIFY_URL=http://127.0.0.1:4010/oauth2/v2.1/verify
LINE_API_BASE=http://127.0.0.1:4010
APP_BASE_URL=http://localhost:5173
LIFF_ID=test-liff
```

Functions emulator 的來源是 `.deploy/functions`（與部署相同），因此
`pnpm emulators` 會先跑 `pnpm emulators:prep`，把 `services/functions/.env`、
`.env.local`、`.env.demo-taijian` 複製進產物，`LINE_VERIFY_URL` 才指得到 mock LINE。
`pnpm deploy:functions` 不會複製任何 env 檔，部署產物不含機密。

本機 E2E 以 `http://localhost:5173/?mockLineIdToken=test-token-A` 登入
`line_UtestA`（`test-token-B` 對應 `line_UtestB`；其他 token 一律 401）。mock 登入只在
Vite `DEV` 建置生效。`pnpm test:e2e` 的 global setup 會先確認 emulator 與 mock LINE
都在執行，再自動重跑 `pnpm seed`（清掉舊的 `taskCompletions` 並把 `nextDueAt` 設為
當下），因此跨午夜或同一天重跑都不會誤判。驗收清單見
[`docs/acceptance/phase-1.md`](docs/acceptance/phase-1.md)。

### LIFF onboarding, households, settings, and retries

- **建立家庭**：沒有家庭時，Today／居民頁的空狀態與 `/household/new` 都提供
  「建立家庭」表單（名稱＋IANA 時區）。成功後會選取新家庭、重讀
  `users/{uid}.householdIds`，再導向 Today，因此不會先閃出「還沒有家庭」。
- **切換家庭**：`HouseholdProvider` 以 `users/{uid}.defaultHouseholdId` 決定預設家庭
  （無效或已退出時退回 `householdIds[0]`）。設定頁列出所有家庭，切換時透過
  `user.updateProfile` 寫回預設值；伺服器會先確認呼叫者仍是該家庭成員。
- **成員管理**：設定頁讀取 `households/{id}/members`，顯示名稱與角色。屋主可移除
  成員（`member.remove`）與變更角色（`member.updateRole`）；每位成員都能自行離開
  （`member.leave`）。移除、變更角色、離開與撤銷邀請都需要確認。
- **邀請管理**：屋主可產生邀請，並在設定頁看到該家庭的有效邀請（建立日、到期日、
  狀態）與撤銷按鈕（`member.revokeInvite`）。`invites` 的讀取規則只開放給該家庭
  屋主，寫入仍一律由伺服器處理。
- **個人資料**：設定頁可修改顯示名稱與個人時區（`user.updateProfile`）；空白名稱或
  無效 IANA 時區會以中文錯誤提示，不會送出。
- **居民編輯與生命週期**：居民詳情頁可編輯名字、物種、品系、性別、生日與備註
  （`animal.update` + `baseRevision`）。屋主另有封存（`animal.archive`）與刪除
  （`animal.delete`）操作，兩者都帶 `baseRevision` 並需確認；刪除會連帶隱藏紀錄與
  提醒。
- **衝突處理**：居民編輯、提醒更新與提醒刪除收到 `CONFLICT` 時會顯示
  `currentRevision`／`lastChangedFields`。「查看最新」載入伺服器版本；「保留我的」
  在確認後以最新 revision 重送。封存／刪除居民收到衝突時會提示重新整理後再試。
- **提醒管理**：居民詳情頁可新增、編輯、刪除提醒（每日／每週／每 N 天、單一時刻、
  時區、啟用開關）。更新與刪除都帶 `baseRevision`；衝突時同樣可載入最新或保留自己
  的變更後重送。
- **重試不重複**：表單每次「意圖」只產生一組 `commandId` 與（紀錄用的）
  `recordId`、`occurredAt`。請求逾時後重按儲存會沿用同一組 id，伺服器以
  `commands/{commandId}` 重播原結果；成功後才重置。修改表單內容會視為新的意圖。
- **完成者名稱**：Today 使用 `task.complete` 寫入的 `completedByName` 快照；舊資料
  沒有名稱時顯示「已刪除成員」，不會露出原始 UID。
- **登入切換**：已有 Firebase session 時仍會用目前的 LINE ID token 交換並比對 UID；
  UID 不同會先登出再登入新帳號，`HouseholdProvider` 也會以 UID 重新掛載。登出後
  Gate 顯示「請重新登入 LINE」。

### App Check

App Check 由建置環境變數控制：

```text
VITE_RECAPTCHA_ENTERPRISE_KEY=<reCAPTCHA Enterprise site key>
VITE_APP_CHECK_DEBUG_TOKEN=<dev-only debug token>
```

- **本機／E2E**：`VITE_RECAPTCHA_ENTERPRISE_KEY` 留空即可完全跳過 App Check
  初始化，emulator 不需要 debug token。
- **Dev 除錯**：設定 key 後，若同時設定 `VITE_APP_CHECK_DEBUG_TOKEN`（僅限 Vite
  `DEV` 建置），會以該 debug token 初始化。
- **Production**：必須設定 `VITE_RECAPTCHA_ENTERPRISE_KEY`；啟用後 LIFF 會自動
  取得並更新 App Check token。伺服器端的 `ENFORCE_APP_CHECK` 仍由部署環境控制，
  兩者需一起開啟。

## Security

- **Do not commit** LINE channel secrets, access tokens, Firebase service account keys, or `.env` files.
- Use `.env.local` for local development and Google Secret Manager for deployed functions.
- If a credential was ever pasted into a chat, issue, or PR, rotate it immediately.
- Firestore rules deny all client writes; functions use the Admin SDK.
- LINE webhook verifies `x-line-signature`; LINE ID tokens are verified server-side.
- 帳號刪除、資料匯出與備份策略見 spec §12–13。

## Brand

苔間 is a working name. Before public launch:

- Trademark search in the target markets.
- Domain and social handle check.
- App Store name and subtitle check.
- Original logo/illustration commission or creation.

## License

Proprietary. All rights reserved. Not open source.

---

**Next step:** run the local Supabase demo, then decide whether to deploy a free Supabase project and connect a real LINE LIFF channel. Flutter real-data mode remains a follow-up.
