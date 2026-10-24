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
pnpm seed                               # 終端 2：寫入 hh_demo 種子資料（可選，E2E 會自動重跑）
pnpm mock:line                          # 終端 3：mock LINE（127.0.0.1:4010）
pnpm test:e2e                           # 終端 4：Playwright 會自行啟動 Vite
```

- `pnpm test:e2e` 的 global setup 會先確認 Firestore（8080）、Auth（9099）、
  Functions（5001）與 mock LINE（4010）都可連線；未啟動時以明確訊息失敗，不會誤跑。
- global setup 會自動執行 `pnpm seed`：清掉 `hh_demo` 既有的 `taskCompletions`，並把
  `reminder_demo.nextDueAt` 重設為當下，因此同一天重跑或跨午夜執行都不會沿用舊狀態。
- E2E 先斷言「已完成 by」數量為 0，點擊後才斷言變為 1，證明完成紀錄是本次執行寫入的。
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
- [ ] 全新帳號從 Today 或居民頁的空狀態點「建立家庭」，填名稱與時區後直接進到
      Today，且不再顯示「還沒有家庭」。
- [ ] A、B 都看到同一個居民與同一筆今日任務。
- [ ] A 在 LIFF 記錄餵食、B 在 Bot 記錄體重；兩筆都出現在時間軸。
- [ ] A、B 同時完成同一筆任務；只存在一筆完成紀錄，且兩人都看到完成者。
- [ ] 舊的完成紀錄（沒有 `completedByName`）在 Today 顯示「已刪除成員」，不顯示 UID。
- [ ] 在居民詳情新增每日／每週／每 N 天提醒；重新整理後提醒仍在，且到期的提醒
      出現在 Today。
- [ ] A、B 同時編輯同一筆提醒；較晚送出的一方看到衝突橫幅（目前版本與變更欄位），
      「查看最新」會載入對方版本，「保留我的」可用最新 revision 重送成功。
- [ ] 刪除提醒後 Today 不再顯示；以過期 revision 刪除會顯示衝突。
- [ ] 在設定頁看見成員名稱與角色；A（屋主）可將 B 設為屋主再降回照顧者，並可移除 B。
      B（照顧者）看不到邀請、移除或變更角色等屋主按鈕，只能自行離開家庭。
- [ ] A 產生邀請後，設定頁的有效邀請顯示建立日、到期日與狀態；按「撤銷邀請」並確認後，
      該連結無法再被接受。
- [ ] A 同時屬於兩個家庭時，設定頁可切換家庭；重新開啟 LIFF 後仍預設開啟最後選擇的
      家庭（`users/{uid}.defaultHouseholdId`）。切換失敗（已非成員）會顯示中文錯誤。
- [ ] 在設定頁修改顯示名稱與個人時區；空白名稱或無效時區會顯示中文錯誤，成功後重新
      整理仍保留新值。
- [ ] 在居民詳情編輯名字、物種、品系、性別、生日與備註；以過期 revision 儲存時顯示
      衝突橫幅，「查看最新」載入最新內容，「保留我的」確認後以最新 revision 重送成功。
- [ ] 屋主可在居民詳情封存或刪除居民（皆需確認，且帶 `baseRevision`）；照顧者看不到
      這兩個按鈕。刪除後居民、紀錄與提醒不再出現在列表與 Today。
- [ ] 手機開啟飛航模式送出紀錄（或中斷函式回應）後恢復網路重送；時間軸只有一筆，
      且 `records` 文件的 `recordId` 與第一次相同。
- [ ] 重送同一個 webhook event；不會建立重複紀錄。
- [ ] 兩台裝置以過期 revision 編輯同一隻居民；其中一台收到衝突提示。
- [ ] 登出後畫面顯示「請重新登入 LINE」；重新登入或切換 LINE 帳號後，不會看到
      前一個帳號的家庭、居民或任務。
- [ ] 刪除帳號；確認存取權移除，資料依刪除政策處理。

### App Check 環境變數

- [ ] 本機／E2E：`VITE_RECAPTCHA_ENTERPRISE_KEY` 留空，App Check 初始化被跳過，
      emulator 流程不受影響。
- [ ] Dev 除錯：設定 `VITE_RECAPTCHA_ENTERPRISE_KEY` 與
      `VITE_APP_CHECK_DEBUG_TOKEN`（僅 Vite `DEV` 生效）後，請求帶有合法 App Check
      token。
- [ ] Production：`VITE_RECAPTCHA_ENTERPRISE_KEY` 已設定，且部署環境的
      `ENFORCE_APP_CHECK=true`；未帶 token 的請求被拒絕。

## 上線前仍待完成（launch prerequisites）

Phase 0–1 的程式碼已完成，但以下項目**尚未實作或尚未部署**。每一項都有具名負責人與
明確決策，完成後才能勾選；任一項未關閉即不得對外上線。決策欄即為驗收條件，不接受以
「之後再排」取代。

| # | 項目 | 現況 | 負責人（Owner） | 決策（Decision） |
|---|---|---|---|---|
| 1 | `cleanupPending` 尾端清理 | 動物／紀錄刪除的 cascade 有上限，超過上限的分頁會標記 `cleanupPending: true`；尚缺清除 job 與讀取路徑的 join | YCAIR | 在 public launch 前完成 purge job 與讀取端 join，並以測試家庭驗證已刪資料的尾端不再被讀到。 |
| 2 | `deleteAccount` 強化 | 目前未要求重新驗證（re-auth）、沒有 rate limit、也沒有管理端失敗重試 | YCAIR | public launch 前補齊 re-auth、rate limit 與 admin 失敗重試；以整合測試覆蓋半刪除與重試情境。 |
| 3 | App Check 強制執行 | LIFF 已會在設定 `VITE_RECAPTCHA_ENTERPRISE_KEY` 時初始化 App Check；`ENFORCE_APP_CHECK` 仍是 opt-in | YCAIR | 先在 staging 同時開啟客戶端 key 與 `ENFORCE_APP_CHECK`，確認 LIFF／Bot 皆帶合法 token，再於 production 強制執行；未通過不得上線。 |
| 4 | TTL 政策部署 | `expiresAt` 已寫入，但尚未在各環境啟用 Firestore TTL（見 [`docs/operations/ttl.md`](../operations/ttl.md)） | YCAIR | 依 runbook 對 `commands`、`rateLimits`、`loginRateLimits`、`notificationLog` 在 demo／staging／production 逐環境啟用並截圖留存。 |
| 5 | `ownerUid` backfill | 舊資料若缺 `households.ownerUid`，owner 轉移與刪除帳號的判斷會退化 | YCAIR | public launch 前執行一次性 backfill，並驗證每個家庭都有指向現存 owner 的 `ownerUid`。 |
| 6 | 真實 LINE channel 設定 | 尚未建立正式 Login／Messaging API channel、LIFF app 與 rich menu | YCAIR | 建立正式 provider、上傳 rich menu 圖檔、設定 webhook 與 endpoint URL，並完成一次真實雙帳號登入。 |
| 7 | Rules 部署 | `firestore.rules` 與 `firestore.indexes.json` 尚未部署到 staging／production | YCAIR | 以 `firebase deploy --only firestore` 發佈並跑一次 rules 冒煙測試；部署紀錄需連到 release 票。 |

## 出場條件

- [ ] 無 P0／P1 缺陷（負責人：YCAIR；上線前逐項 review 並簽核）。
- [ ] 所有自動化檢查為綠燈（附上 CI run 連結）。
- [ ] 以兩個真實帳號完成手動 LINE 流程（負責人：YCAIR；留存截圖或錄影）。
- [ ] 上表第 1–7 項全部勾選並由 YCAIR 簽核；任一項未關閉即不得上線。
