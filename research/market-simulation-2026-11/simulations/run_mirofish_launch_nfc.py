#!/usr/bin/env python3
"""Run MiroFish-Local for the launch + NFC + merchandise scenario.

This keeps the MiroFish pipeline intact (GraphRAG -> personas -> OASIS), but
post-processes the generated simulation config so the first posts are specific
questions rather than generic statements. That is what makes Reddit comments
possible and gives the report quotable material.
"""
from __future__ import annotations

import json
import mimetypes
import os
import sys
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seeds" / "taijian_launch_nfc_seed.md"
OUT = ROOT / "simulations" / "results"
OUT.mkdir(parents=True, exist_ok=True)
PREFIX = "launch_nfc_"
BASE = "http://localhost:5001/api"
TIMEOUT = 600

REQUIREMENT = (
    "模擬苔間 App 在台灣正式上線，並保留 NFC 客製貼紙、照護記錄卡、"
    "缸邊標籤與品牌周邊商品策略後的市場反應。請觀察一般飼主、新手、"
    "家庭、繁殖者、爬店、特寵獸醫、內容創作者、禮物購買者與 Android "
    "使用者對 App 訂閱、NFC 貼紙價格與用途、周邊商品、通路與隱私風險"
    "的反應。重點是可追溯的討論、反對理由、付費意願與購買情境。"
)

INITIAL_POSTS = [
    "苔間 App 正式上線了：免費版每月 60 張照片，Pro 199 元。你會先試免費版，還是直接付 199？什麼情況下你才會覺得 199 值得？",
    "苔間推出 NFC 貼紙：貼在缸上，iPhone 靠近就跳到這隻居民的快速記錄頁。3 張 299 元、5 張 399 元。你會買嗎？還是覺得很雞肋？",
    "如果 NFC 貼紙只能綁定一隻居民，但一包有 3 張，你會怎麼用？貼在缸、貼在飼料盒、貼在保溫箱，還是送給朋友？",
    "苔間說貼紙遺失可以撤銷重綁，但貼紙本身不是防偽晶片。你會擔心別人撿到貼紙，就能看到你的照護紀錄嗎？",
    "苔間除了 App，還要賣照護記錄卡、缸邊標籤、托特包與徽章。你覺得這是品牌加分，還是本業都還沒站穩就開始做周邊？",
    "如果爬店賣動物時附贈苔間 NFC 貼紙，客人回家刷貼紙就能看售後紀錄，店家會想用嗎？客人會信任嗎？",
    "Android 用戶目前只能用貼紙上的 QR code fallback，不能直接感應。這會不會讓你覺得苔間是 iPhone 用戶的俱樂部？",
    "如果 199 元 Pro 方案直接含 3 張 NFC 貼紙，你會不會覺得比單買貼紙更划算？還是你根本不需要貼紙？",
]

HOT_TOPICS = [
    "苔間 App 上線",
    "NFC 貼紙",
    "199 元訂閱",
    "周邊商品",
    "Android fallback",
    "爬店售後",
]


def request(method: str, path: str, payload=None, upload: Path | None = None, timeout: int = TIMEOUT):
    url = f"{BASE}{path}"
    headers = {"accept": "application/json"}
    body = None
    if upload is not None:
        boundary = f"----taijian{uuid.uuid4().hex}"
        content_type = mimetypes.guess_type(upload.name)[0] or "text/plain"
        file_bytes = upload.read_bytes()
        fields = [
            ("simulation_requirement", REQUIREMENT),
            ("project_name", "苔間 2026-11 上線＋NFC 周邊模擬"),
        ]
        body = b""
        for name, value in fields:
            body += (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        body += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="files"; filename="{upload.name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
        headers["content-type"] = f"multipart/form-data; boundary={boundary}"
    elif payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["content-type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {path} -> HTTP {error.code}: {raw[:1000]}") from error


def unwrap(data: dict) -> dict:
    return data.get("data") if isinstance(data.get("data"), dict) else data


def wait_task(path: str, task_id: str, *, interval: int = 5, max_seconds: int = 1800, method: str = "GET", payload=None) -> dict:
    started = time.time()
    while True:
        if method == "POST":
            status, data = request("POST", path, payload or {"task_id": task_id})
        else:
            status, data = request("GET", f"{path}/{task_id}")
        body = unwrap(data)
        state = body.get("status") or data.get("status")
        print(f"  poll {path}: {state} ({int(time.time() - started)}s)", flush=True)
        if state in {"completed", "done", "success"}:
            return data
        if state in {"failed", "error"}:
            raise RuntimeError(json.dumps(data, ensure_ascii=False)[:2000])
        if time.time() - started > max_seconds:
            raise TimeoutError(f"{path}/{task_id} timed out")
        time.sleep(interval)


def patch_simulation_config(simulation_id: str) -> None:
    """Make the generated scenario discussion-friendly.

    The LLM-generated initial posts are usually generic statements, not
    questions. Reddit comments need a prompt to react to, so replace them with
    concrete launch/NFC/merch questions and make off-peak hours active.
    """
    path = ROOT / "MiroFish-local" / "backend" / "uploads" / "simulations" / simulation_id / "simulation_config.json"
    config = json.loads(path.read_text(encoding="utf-8"))

    time_config = config.setdefault("time_config", {})
    time_config.update({
        "total_simulation_hours": 24,
        "minutes_per_round": 60,
        "agents_per_hour_min": 8,
        "agents_per_hour_max": 10,
        "peak_hours": [19, 20, 21, 22],
        "peak_activity_multiplier": 1.5,
        "off_peak_hours": [0, 1, 2, 3, 4, 5],
        "off_peak_activity_multiplier": 1.0,
        "morning_hours": [6, 7, 8],
        "morning_activity_multiplier": 0.8,
        "work_hours": list(range(9, 19)),
        "work_activity_multiplier": 1.0,
    })

    event_config = config.setdefault("event_config", {})
    event_config["initial_posts"] = [
        {
            "content": content,
            "poster_type": "Person",
            "poster_agent_id": (index * 2) % max(1, len(config.get("agent_configs", []))),
        }
        for index, content in enumerate(INITIAL_POSTS)
    ]
    event_config["hot_topics"] = HOT_TOPICS
    event_config["narrative_direction"] = (
        "討論苔間 App 上線後的訂閱價值、NFC 貼紙的實用性與價格、"
        "周邊商品是否分散資源、Android fallback、隱私與爬店售後通路。"
        "請讓支持和反對的意見都出現，避免全部正面。"
    )
    event_config["scheduled_events"] = []

    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"patched config: {path}")


def main() -> None:
    health_url = "http://localhost:5001/health"
    for attempt in range(30):
        try:
            with urllib.request.urlopen(health_url, timeout=10) as response:
                print("health", response.status, response.read().decode()[:100], flush=True)
                break
        except Exception as error:
            if attempt == 29:
                raise RuntimeError(f"backend did not become healthy: {error}")
            time.sleep(5)

    print("upload seed", SEED)
    status, data = request("POST", "/graph/ontology/generate", upload=SEED)
    (OUT / f"{PREFIX}ontology.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    body = unwrap(data)
    project_id = body.get("project_id") or data.get("project_id")
    if not project_id:
        raise RuntimeError(f"no project_id: {json.dumps(data, ensure_ascii=False)[:2000]}")
    print("project_id", project_id)

    status, data = request("POST", "/graph/build", {"project_id": project_id})
    (OUT / f"{PREFIX}build_submit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    body = unwrap(data)
    task_id = body.get("task_id") or data.get("task_id")
    if not task_id:
        raise RuntimeError(f"no build task_id: {json.dumps(data, ensure_ascii=False)[:2000]}")
    built = wait_task("/graph/task", task_id)
    (OUT / f"{PREFIX}build.json").write_text(json.dumps(built, ensure_ascii=False, indent=2), encoding="utf-8")
    body = unwrap(built)
    result = body.get("result") if isinstance(body.get("result"), dict) else {}
    graph_id = body.get("graph_id") or result.get("graph_id") or built.get("graph_id")
    if not graph_id:
        raise RuntimeError(f"no graph_id: {json.dumps(built, ensure_ascii=False)[:2000]}")
    print("graph_id", graph_id)

    status, data = request("POST", "/simulation/create", {
        "project_id": project_id,
        "graph_id": graph_id,
        "enable_twitter": True,
        "enable_reddit": True,
    })
    (OUT / f"{PREFIX}simulation_create.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    simulation_id = unwrap(data).get("simulation_id")
    if not simulation_id:
        raise RuntimeError(f"no simulation_id: {json.dumps(data, ensure_ascii=False)[:2000]}")
    print("simulation_id", simulation_id)

    status, data = request("POST", "/simulation/prepare", {
        "simulation_id": simulation_id,
        "use_llm_for_profiles": True,
        "parallel_profile_count": 1,
    })
    (OUT / f"{PREFIX}prepare_submit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    prep_task = unwrap(data).get("task_id")
    if prep_task:
        prepared = wait_task("/simulation/prepare/status", prep_task, max_seconds=1800, method="POST", payload={"task_id": prep_task})
        (OUT / f"{PREFIX}prepare.json").write_text(json.dumps(prepared, ensure_ascii=False, indent=2), encoding="utf-8")

    patch_simulation_config(simulation_id)

    status, data = request("POST", "/simulation/start", {
        "simulation_id": simulation_id,
        "platform": "parallel",
        "max_rounds": 8,
        "enable_graph_memory_update": False,
    }, timeout=180)
    (OUT / f"{PREFIX}start.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("start", json.dumps(data, ensure_ascii=False)[:400])

    started = time.time()
    while True:
        status, data = request("GET", f"/simulation/{simulation_id}/run-status", timeout=30)
        body = unwrap(data)
        state = body.get("runner_status") or body.get("status") or data.get("status")
        print(f"  simulation: {state} ({int(time.time() - started)}s)", flush=True)
        if state in {"completed", "done", "success", "stopped"}:
            (OUT / f"{PREFIX}run_status.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            break
        if state in {"failed", "error"}:
            raise RuntimeError(json.dumps(data, ensure_ascii=False)[:2000])
        if time.time() - started > 1800:
            raise TimeoutError("simulation timed out after 30 minutes")
        time.sleep(8)

    for endpoint, filename in [
        (f"/simulation/{simulation_id}/posts", f"{PREFIX}posts.json"),
        (f"/simulation/{simulation_id}/comments", f"{PREFIX}comments.json"),
        (f"/simulation/{simulation_id}/config", f"{PREFIX}config.json"),
    ]:
        try:
            _, data = request("GET", endpoint, timeout=30)
            (OUT / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as error:
            print(f"optional {endpoint} failed: {error}")

    summary = {
        "status": "simulation_completed",
        "project_id": project_id,
        "graph_id": graph_id,
        "simulation_id": simulation_id,
        "max_rounds": 8,
        "platform": "parallel",
    }
    (OUT / f"{PREFIX}summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
