# 苔間 · 2026-11 市場模擬

這是一份決策輔助，不是營收預測。所有模型參數都是明確假設；苔間目前沒有真實付款、續訂或規模化 iOS 發佈資料。

## 檔案

- `site/index.html` — 可直接開啟的靜態報告（圖表、情境計算器、商轉／App Store counterfactual、四個階段的判斷）。
- `simulations/monte_carlo.py` — 100,000 條路徑的蒙地卡羅（五情境各 20,000，含商轉與 App Store counterfactual）。
- `simulations/results/monte_carlo.json` — 原始結果、敏感度、留存曲線。
- `simulations/mirofish_oasis/` — MiroFish 的 OASIS 引擎 pilot：12 個 persona、2 輪、2 份設定檔。
- `simulations/results/oasis_summary.json` — OASIS pilot 的低訊號摘要。
- `simulations/run_mirofish_local.py` — MiroFish-Local（Graphiti + Neo4j）完整 pipeline 驅動腳本。
- `simulations/results/mirofish_local_summary.json` — 本地 pipeline 驗證結果與阻塞原因。
- `simulations/structured_panel.py` — 用 THU LLM 對 12 個 persona 做結構化訪問。
- `simulations/results/structured_panel.json` — 11 位顧客 persona 的回答（官方 seed 已排除）。
- `build_site_data.py` — 把結果合成 `site/data.js` / `data.json`。

## 重跑

```bash
# 蒙地卡羅
python3 simulations/monte_carlo.py

# OASIS（需要先安裝 MiroFish；此 repo 不提交 MiroFish checkout）
cd MiroFish/backend
uv venv --python /path/to/python3.11 .venv-arm
uv pip install --python .venv-arm/bin/python -r requirements.txt
uv pip install --python .venv-arm/bin/python 'mcp<2'
cd ../..
MiroFish/backend/.venv-arm/bin/python backend/scripts/run_twitter_simulation.py \
  --config ../simulations/mirofish_oasis/config.json --max-rounds 2 --no-wait

# 摘要與網站
python3 simulations/summarize_oasis.py
MiroFish/backend/.venv-arm/bin/python simulations/structured_panel.py
python3 build_site_data.py
```

MiroFish 原版完整 GraphRAG pipeline 使用 Zep Cloud（key 驗證：create user 201、delete 200）＋遠端 Ollama。遠端主機（i7-8700K / 30GB / Titan V 12GB）可跑 `qwen2.5:7b` 與 `qwen2.5:14b-instruct`；14B 使用約 9.7GB VRAM。Qwen ontology 成功產生 10 類實體／6 種關係，Zep graph 建出 19 nodes／27 edges，15 個 persona 完成。已修正：API 啟動 simulation 加上 `--no-wait`，並在第一輪 off-peak 導致 0 個 active agents 時強制至少選 1 個 agent。修正後 simulation 48 秒完成，report 已生成 2/3 章節；內容品質仍受 qwen2.5:14b 限制。GraphRAG 建圖／檢索本身成功。本機資源沒有再被吃滿。

完整 pipeline 已用 Zep Cloud + 遠端 Ollama 跑過：GraphRAG 建圖成功、OASIS 48 秒完成、ReportAgent 完成 2/3 段後因後端中止而失敗。`MiroFish/`、`MiroFish-local/`、`.env`、SQLite DB 與 log 都不進 git。

### Zep 平替

- **Zep Cloud Free**：每月 10,000 credits、2 projects；實務上仍需能建立帳號並取得 key，且有限額。
- **MiroFish-Local + Zep Cloud + 遠端 Ollama**：Zep 建圖 36 nodes / 41 edges、14 個 persona；OASIS 完成 2 輪、9 則貼文 / 0 留言。流程可跑，但 Qwen 內容品質不足，需更強模型或改 prompt。
- **Graphiti + Neo4j / FalkorDB**：Apache-2.0、可自架，沒有 Zep key；需要自行處理 graph DB、LLM/embedding 與運維。
- **MiroFish-Local**：以 `ZEP_BACKEND=graphiti` 支援 Graphiti + Neo4j 的 fork；完整 pipeline 可離線，但不是上游官方支援。
- 其他記憶框架（Mem0、Letta、Cognee）不是 Zep API 的直接 drop-in，移植成本較高。

## Ollama 本機模型

- 模型快取：`/Volumes/YCAIR/ollama/models`
- 模型：`qwen2.5:7b-instruct`（權重實際位於外接硬碟）
- 實際用量：約 4.7 GB 下載；模型載入後以單一併發執行
- 啟動參數：`OLLAMA_NUM_PARALLEL=1`、`OLLAMA_MAX_LOADED_MODELS=1`、
  `OLLAMA_CONTEXT_LENGTH=8192`、`OLLAMA_KEEP_ALIVE=5m`、
  `OLLAMA_FLASH_ATTENTION=1`、`nice -n 5`
- 目的：單一模型、單一併發，避免 16GB Mac mini 的 unified memory 被吃滿。
- 資源紀錄：`simulations/results/resource_usage.jsonl`
- 完整 pipeline 指令：`MiroFish-local/backend/.venv/bin/python simulations/run_mirofish_local.py`
- 若 OASIS 沒有 actions，報告會標示 partial，不把沉默當市場結論。
- 2026-11 執行結果：14 profiles、36 nodes / 41 edges、OASIS 9 posts / 0 comments、ReportAgent 2/3 sections。

## 報告站

- 網址：<https://taijian.ycair.space>
- 部署：`npx wrangler deploy`（`wrangler.jsonc` 指向 `./site`，custom domain 為 `taijian.ycair.space`）
- 更新流程：修改 `site/` → `python3 build_site_data.py` → `npx wrangler deploy`
- 靜態檔案只包含報告與 JSON，不含 API key 或 SSH 憑證。

## 安全

- 不要把 API key 貼進 issue、PR、網頁或 commit。
- 本機 `.env` 必須是 `chmod 600`。
- 使用過的 key 若曾出現在對話或公開位置，應立即更換。
- 網站只載入靜態 JSON，沒有把金鑰送到瀏覽器。
