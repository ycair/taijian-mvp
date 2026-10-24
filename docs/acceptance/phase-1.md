# Phase 1 驗收清單

Phase 1 的目標是「LINE 優先、家庭共享、衝突安全」的照護核心。以下分為三部分：
自動化檢查（可在乾淨 checkout 重現）、真實 LINE 手動驗收、以及**尚未完成的上線前置條件**。

## 自動化檢查

在乾淨 checkout 依序執行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test                                   # 單元測試（domain / functions / liff）
pnpm --filter @taijian/functions test:integration
pnpm --filter @taijian/functions test:rules
pnpm build
```

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm --filter @taijian/functions test:integration`（需要 Java 21 與 Firebase Emulator）
- [ ] `pnpm --filter @taijian/functions test:rules`
- [ ] `pnpm build`
- [ ] 本機 E2E：`pnpm emulators` + `pnpm seed` + `pnpm mock:line` + `pnpm test:e2e`

本機 E2E 的環境需求：

```bash
pnpm exec playwright install chromium   # 第一次執行前
pnpm emulators                          # 終端 1：Auth / Firestore / Functions
pnpm seed                               # 終端 2：寫入 hh_demo 種子資料
pnpm mock:line                          # 終端 3：mock LINE（:4010）
pnpm test:e2e                           # 終端 4：Playwright 會自行啟動 Vite
```

- `apps/liff/.env.local` 與 `services/functions/.env` 是**本機專用**檔案，已被
  `.gitignore` 忽略，不可提交。
- `VITE_USE_MOCK_LINE=true` 只在 Vite `DEV` 建置生效；正式 bundle 不會走 mock 分支。
- E2E 以 `/?mockLineIdToken=test-token-A` 登入 `line_UtestA`，看到種子居民「阿肥」的
  「餵食」任務並完成它。

### CI

`.github/workflows/ci.yml` 在 Node 22 + Java 21 上依序執行
`install → lint → typecheck → test → test:integration → test:rules → build`。
E2E 目前是本機驗收，尚未納入 CI。

## 手動驗收（真實 LINE 測試 provider）

- [ ] 在與 Messaging API channel 相同的 provider 下建立 LINE Login channel 與 LIFF app。
- [ ] 將 LIFF endpoint URL 設為部署後的 Hosting URL。
- [ ] 將 Messaging API webhook URL 設為部署後的 `lineWebhook` URL。
- [ ] 在 Secret Manager 設定 `LINE_LOGIN_CHANNEL_ID`、`LINE_MESSAGING_CHANNEL_SECRET`、
      `LINE_CHANNEL_ACCESS_TOKEN`、`LIFF_ID`。
- [ ] 兩個 LINE 測試帳號：A 建立家庭；B 接受邀請。
- [ ] A、B 都看到同一個居民與同一筆今日任務。
- [ ] A 在 LIFF 記錄餵食、B 在 Bot 記錄體重；兩筆都出現在時間軸。
- [ ] A、B 同時完成同一筆任務；只存在一筆完成紀錄，且兩人都看到完成者。
- [ ] 重送同一個 webhook event；不會建立重複紀錄。
- [ ] 兩台裝置以過期 revision 編輯同一隻居民；其中一台收到衝突提示。
- [ ] 刪除帳號；確認存取權移除，資料依刪除政策處理。

## 上線前仍待完成（launch prerequisites）

Phase 0–1 的程式碼已完成，但以下是**正式上線前必須補上**的項目，目前尚未實作或尚未部署：

- [ ] **`cleanupPending` 尾端清理**：動物／紀錄刪除的 cascade 有上限，超過上限的分頁會
      標記 `cleanupPending: true`；尚缺清除 job，以及讀取路徑對 `cleanupPending` 的 join
      處理，避免已刪除資料在尾端仍被讀到。
- [ ] **`deleteAccount` 強化**：目前未要求重新驗證（re-auth）、沒有 rate limit，也沒有
      管理端失敗重試；上線前需補齊，避免 stolen token 或重試風暴造成半刪除狀態。
- [ ] **App Check 強制執行**：`ENFORCE_APP_CHECK` 仍是 opt-in；上線環境需開啟並確認
      LIFF／Bot 都有合法 App Check token。
- [ ] **TTL 政策部署**：`commands`、`rateLimits`、`loginRateLimits`、`notificationLog` 的
      `expiresAt` 已寫入，但尚未在各環境啟用 Firestore TTL（見
      [`docs/operations/ttl.md`](../operations/ttl.md)）。
- [ ] **`ownerUid` backfill**：舊資料若缺 `households.ownerUid`，需一次性 backfill，
      否則 owner 轉移與刪除帳號的判斷會退化。
- [ ] **真實 LINE channel 設定**：建立正式 Login／Messaging API channel、LIFF app、
      rich menu 圖檔上傳，並設定 webhook 與 endpoint URL。
- [ ] **Rules 部署**：`firestore.rules` 與 `firestore.indexes.json` 尚未部署到
      staging／production；需以 `firebase deploy --only firestore` 發佈並驗證。

## 出場條件

- [ ] 無 P0／P1 缺陷。
- [ ] 所有自動化檢查為綠燈。
- [ ] 以兩個真實帳號完成手動 LINE 流程。
- [ ] 上述上線前置條件全部關閉，或有明確的階段二排程與風險接受紀錄。
