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

MiroFish 原版完整 GraphRAG pipeline 需要 Zep Cloud API key。這次用 Zep Cloud（key 驗證：create user 201、delete 200）＋ Ollama `qwen2.5:7b-instruct`（權重在外接硬碟）：Qwen ontology 成功產生 10 類實體／6 種關係，Zep graph 建出 19 nodes／27 edges，14 個 persona 也生成完成。但 OASIS 2 回合等了約 8 分鐘仍只有 7 則初始貼文、0 actions，因此停止；沒有把 partial run 當市場結果。資源監測最低 free 約 64 MB、最高 load 35.9，停止是為了避免機器進入不可操作狀態。

若要做完整 pipeline，換一個在 JSON schema 提示下會回傳文字的模型／provider（或自架 Ollama），或使用 Zep Cloud Free。`MiroFish/`、`MiroFish-local/`、`.env`、SQLite DB 與 log 都不進 git。

### Zep 平替

- **Zep Cloud Free**：每月 10,000 credits、2 projects；實務上仍需能建立帳號並取得 key，且有限額。
- **MiroFish-Local + Zep Cloud + Ollama**：Zep、Qwen ontology、14 個 persona 已驗證；OASIS 未產生 actions，需改用 3B、減少 agents 或雲端模型。
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

## 安全

- 不要把 API key 貼進 issue、PR、網頁或 commit。
- 本機 `.env` 必須是 `chmod 600`。
- 使用過的 key 若曾出現在對話或公開位置，應立即更換。
- 網站只載入靜態 JSON，沒有把金鑰送到瀏覽器。
