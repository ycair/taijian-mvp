#!/usr/bin/env python3
"""Second, interaction-heavy Reddit run for the launch + NFC scenario.

The first parallel run produced only 8 Reddit comments. This run keeps the same
graph/personas but boosts activity and runs Reddit only for 12 rounds, so we get
more reactions to quote. The first run's DB is backed up before force-restart.
"""
from __future__ import annotations

import json
import shutil
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "simulations" / "results"
SIM_ID = "sim_8395a3e78031"
SIM_DIR = ROOT / "MiroFish-local" / "backend" / "uploads" / "simulations" / SIM_ID
BASE = "http://localhost:5001/api"

POSTS = [
    "苔間推出 NFC 貼紙：貼在缸上，iPhone 靠近就跳到這隻居民的快速記錄頁。3 張 299 元、5 張 399 元。你會買嗎？還是覺得很雞肋？",
    "苔間說貼紙遺失可以撤銷重綁，但貼紙本身不是防偽晶片。你會擔心別人撿到貼紙，就能看到你的照護紀錄嗎？",
    "Android 用戶目前只能用貼紙上的 QR code fallback，不能直接感應。這會不會讓你覺得苔間是 iPhone 用戶的俱樂部？",
    "苔間除了 App，還要賣照護記錄卡、缸邊標籤、托特包與徽章。你覺得這是品牌加分，還是本業都還沒站穩就開始做周邊？",
    "如果爬店賣動物時附贈苔間 NFC 貼紙，客人回家刷貼紙就能看售後紀錄，店家會想用嗎？客人會信任嗎？",
]


def req(method: str, path: str, payload=None, timeout: int = 120):
    body = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None
    request = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"content-type": "application/json", "accept": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", "replace"))


def main() -> None:
    # Back up the first run before force cleanup deletes the DBs.
    for name in ("twitter_simulation.db", "reddit_simulation.db", "run_state.json"):
        src = SIM_DIR / name
        if src.exists():
            shutil.copy2(src, OUT / f"launch_nfc_round1_{name}")
    print("backed up first run")

    config_path = SIM_DIR / "simulation_config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    time_config = config.setdefault("time_config", {})
    time_config.update({
        "total_simulation_hours": 24,
        "minutes_per_round": 60,
        "agents_per_hour_min": 15,
        "agents_per_hour_max": 20,
        "peak_activity_multiplier": 1.5,
        "off_peak_activity_multiplier": 1.0,
        "morning_activity_multiplier": 1.0,
        "work_activity_multiplier": 1.0,
    })
    for agent in config.get("agent_configs", []):
        agent["activity_level"] = 1.0
        agent["comments_per_hour"] = max(3.0, float(agent.get("comments_per_hour", 1.0)))
        agent["posts_per_hour"] = max(1.0, float(agent.get("posts_per_hour", 0.5)))
        agent["active_hours"] = list(range(0, 24))
        agent["response_delay_min"] = 1
        agent["response_delay_max"] = 3
    config.setdefault("event_config", {})["initial_posts"] = [
        {"content": content, "poster_type": "Person", "poster_agent_id": index * 3}
        for index, content in enumerate(POSTS)
    ]
    config["event_config"]["narrative_direction"] = (
        "讓支持與反對 NFC 貼紙、199 訂閱、周邊商品與 Android fallback 的意見充分交鋒；"
        "特別追問價格、隱私、貼紙遺失、單隻寵物是否值得、爬店售後與周邊商品是否分散資源。"
    )
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print("patched config for boosted Reddit run")

    start = req("POST", "/simulation/start", {
        "simulation_id": SIM_ID,
        "platform": "reddit",
        "max_rounds": 12,
        "enable_graph_memory_update": False,
        "force": True,
    }, timeout=180)
    print("start", json.dumps(start, ensure_ascii=False)[:300])

    started = time.time()
    while True:
        data = req("GET", f"/simulation/{SIM_ID}/run-status", timeout=30)
        body = data.get("data", data)
        state = body.get("runner_status") or body.get("status")
        print(f"  simulation: {state} ({int(time.time() - started)}s)")
        if state in {"completed", "done", "success", "stopped"}:
            (OUT / "launch_nfc_round2_run_status.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            break
        if state in {"failed", "error"}:
            raise RuntimeError(json.dumps(data, ensure_ascii=False)[:2000])
        if time.time() - started > 1800:
            raise TimeoutError("round 2 timed out")
        time.sleep(8)

    for name in ("reddit_simulation.db", "run_state.json"):
        src = SIM_DIR / name
        if src.exists():
            shutil.copy2(src, OUT / f"launch_nfc_round2_{name}")
    print("saved round 2 DB")


if __name__ == "__main__":
    main()
