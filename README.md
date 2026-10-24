# 苔間 · Taijian

> LINE-first, conflict-safe care log for reptiles and exotic pets.  
> 把每一次照顧，留在同一個家。

**Status:** v1 design spec approved — Phase 0 (foundation) in progress.  
**Working name:** 苔間（商標／網域尚未檢索）  
**Target:** iOS first; LINE LIFF + LINE Bot as the primary test surface.

---

## What this is

苔間是一個給爬蟲與特殊寵物飼主使用的照護紀錄產品。它不是另一個單機記事本，而是一個**家庭共享、跨入口、衝突安全**的照護系統：

- **LINE LIFF**：不用安裝 App，就能看今日任務、快速紀錄、邀請家人。
- **LINE Bot**：今日摘要、快速指令、提醒通知、圖文選單。
- **Flutter iOS**：完整編輯、圖表、離線 outbox、推播。
- **同一個 Firebase UID、同一份 Firestore 資料、同一套權限。**

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

## Architecture

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
  liff/                 React + Vite + TypeScript + CSS Modules（Phase 1）
  mobile/               Flutter iOS（Phase 2）
services/
  functions/            Node 22 + TypeScript + Firebase Functions v2
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

**Next step:** review the v1 spec. Once approved, the first implementation plan covers Phase 0 (foundation) and Phase 1 (LINE-first MVP).
