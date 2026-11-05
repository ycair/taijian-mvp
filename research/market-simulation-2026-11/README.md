# 苔間 · 2026-11 市場模擬

這是一份決策輔助，不是營收預測。所有模型參數都是明確假設；苔間目前沒有真實付款、續訂或規模化 iOS 發佈資料。

## 檔案

- `site/index.html` — 可直接開啟的靜態報告（圖表、情境計算器、四個階段的判斷）。
- `simulations/monte_carlo.py` — 60,000 條路徑的蒙地卡羅（三情境各 20,000）。
- `simulations/results/monte_carlo.json` — 原始結果、敏感度、留存曲線。
- `simulations/mirofish_oasis/` — MiroFish 的 OASIS 引擎 pilot：12 個 persona、2 輪、2 份設定檔。
- `simulations/results/oasis_summary.json` — OASIS pilot 的低訊號摘要。
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

MiroFish 完整 GraphRAG pipeline 需要 Zep Cloud API key；本次沒有提供，因此只跑 OASIS 引擎，並把結果標為低訊號 pilot。`MiroFish/`、`.env`、SQLite DB 與 log 都不進 git。

## 安全

- 不要把 API key 貼進 issue、PR、網頁或 commit。
- 本機 `.env` 必須是 `chmod 600`。
- 使用過的 key 若曾出現在對話或公開位置，應立即更換。
- 網站只載入靜態 JSON，沒有把金鑰送到瀏覽器。
