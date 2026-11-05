#!/usr/bin/env python3
"""Drive MiroFish-Local through its HTTP API for the 苔間 seed.

The script is intentionally boring and observable: every step is printed and the
raw responses are saved. It does not bypass the app's normal pipeline.
"""
from __future__ import annotations

import json
import mimetypes
import sys
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "seeds" / "taijian_seed.md"
OUT = ROOT / "simulations" / "results"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:5001/api"
TIMEOUT = 120


def request(method: str, path: str, payload=None, upload: Path | None = None, timeout: int = TIMEOUT):
    url = f"{BASE}{path}"
    headers = {"accept": "application/json"}
    body = None
    if upload is not None:
        boundary = f"----taijian{uuid.uuid4().hex}"
        content_type = mimetypes.guess_type(upload.name)[0] or "text/plain"
        file_bytes = upload.read_bytes()
        requirement = (
            "模擬台灣爬蟲與特殊寵物飼主對苔間照護紀錄 App 的採用、付費意願、"
            "價格敏感度、隱私與家庭共享需求。請建立包含飼主、新手、繁殖者、"
            "爬店、特寵獸醫、內容創作者與價格敏感族群的市場模擬。"
        )
        fields = [
            ("simulation_requirement", requirement),
            ("project_name", "苔間 2026-11 市場模擬"),
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
    (OUT / "mirofish_ontology.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    body = unwrap(data)
    project_id = body.get("project_id") or data.get("project_id")
    if not project_id:
        raise RuntimeError(f"no project_id: {json.dumps(data, ensure_ascii=False)[:2000]}")
    print("project_id", project_id)

    status, data = request("POST", "/graph/build", {"project_id": project_id})
    (OUT / "mirofish_build_submit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    body = unwrap(data)
    task_id = body.get("task_id") or data.get("task_id")
    if not task_id:
        raise RuntimeError(f"no build task_id: {json.dumps(data, ensure_ascii=False)[:2000]}")
    built = wait_task("/graph/task", task_id)
    (OUT / "mirofish_build.json").write_text(json.dumps(built, ensure_ascii=False, indent=2), encoding="utf-8")
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
        "enable_reddit": False,
    })
    (OUT / "mirofish_simulation_create.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    simulation_id = unwrap(data).get("simulation_id")
    if not simulation_id:
        raise RuntimeError(f"no simulation_id: {json.dumps(data, ensure_ascii=False)[:2000]}")
    print("simulation_id", simulation_id)

    status, data = request("POST", "/simulation/prepare", {
        "simulation_id": simulation_id,
        "use_llm_for_profiles": True,
        "parallel_profile_count": 3,
    })
    (OUT / "mirofish_prepare_submit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    prep_task = unwrap(data).get("task_id")
    if prep_task:
        prepared = wait_task("/simulation/prepare/status", prep_task, max_seconds=1800, method="POST", payload={"task_id": prep_task})
        (OUT / "mirofish_prepare.json").write_text(json.dumps(prepared, ensure_ascii=False, indent=2), encoding="utf-8")

    status, data = request("POST", "/simulation/start", {
        "simulation_id": simulation_id,
        "platform": "twitter",
        "max_rounds": 2,
        "enable_graph_memory_update": False,
    }, timeout=180)
    (OUT / "mirofish_start.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("start", json.dumps(data, ensure_ascii=False)[:400])

    started = time.time()
    while True:
        status, data = request("GET", f"/simulation/{simulation_id}/run-status")
        body = unwrap(data)
        state = body.get("runner_status") or body.get("status") or data.get("status")
        print(f"  simulation: {state} ({int(time.time() - started)}s)", flush=True)
        if state in {"completed", "done", "success", "stopped"}:
            (OUT / "mirofish_run_status.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            break
        if state in {"failed", "error"}:
            raise RuntimeError(json.dumps(data, ensure_ascii=False)[:2000])
        if time.time() - started > 1800:
            raise TimeoutError("simulation timed out")
        time.sleep(8)

    for endpoint, filename in [
        (f"/simulation/{simulation_id}/posts", "mirofish_posts.json"),
        (f"/simulation/{simulation_id}/comments", "mirofish_comments.json"),
        (f"/simulation/{simulation_id}/config", "mirofish_config.json"),
    ]:
        try:
            _, data = request("GET", endpoint, timeout=30)
            (OUT / filename).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as error:
            print(f"optional {endpoint} failed: {error}")

    status, data = request("POST", "/report/generate", {"simulation_id": simulation_id})
    (OUT / "mirofish_report_submit.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("report submit", json.dumps(data, ensure_ascii=False)[:400])
    report_task = unwrap(data).get("task_id")
    report_id = unwrap(data).get("report_id")
    if report_task:
        result = wait_task("/report/generate/status", report_task, max_seconds=1800, method="POST", payload={"task_id": report_task})
        (OUT / "mirofish_report_status.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        report_id = unwrap(result).get("report_id") or report_id
    if report_id:
        _, report = request("GET", f"/report/{report_id}", timeout=60)
        (OUT / "mirofish_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print("report_id", report_id)

    summary = {
        "status": "completed",
        "project_id": project_id,
        "graph_id": graph_id,
        "simulation_id": simulation_id,
        "report_id": report_id,
    }
    (OUT / "mirofish_local_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
