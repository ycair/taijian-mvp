#!/usr/bin/env python3
"""Structured persona panel, using the THU OpenAI-compatible endpoint.

This supplements the small MiroFish/OASIS pilot. It is synthetic qualitative
research, not a representative survey and not a purchase forecast.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIRO = ROOT / "MiroFish"
ENV = MIRO / ".env"

# Load only the LLM configuration; never print the key.
if ENV.exists():
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())

try:
    from openai import OpenAI
except ImportError:
    print("openai package is required; use MiroFish/backend/.venv-arm/bin/python", file=sys.stderr)
    raise

MODEL = os.environ.get("LLM_MODEL_NAME", "gpt-oss-120b")
BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.ithu.tw/v1")
API_KEY = os.environ.get("LLM_API_KEY", "")
if not API_KEY:
    raise SystemExit("LLM_API_KEY missing")

PROFILES = ROOT / "simulations" / "mirofish_oasis" / "twitter_profiles.csv"
OUT = ROOT / "simulations" / "results" / "structured_panel.json"

QUESTIONS = """
請以這個 persona 的真實立場回答苔間 beta 的市場問題。不要扮演客服，也不要為了禮貌而提高分數。
苔間：LINE-first 爬蟲與特殊寵物照護紀錄；iOS 完整 App；LIFF 快速記錄/查詢；餵食、換水、體重、蛻皮、醫療、家庭共享、公開旅程；免費 60 張照片/月；支持者方案 99/199/399 元/月（目前 sandbox，尚無真實付款）。

只回傳一個 JSON object，不要 markdown：
{
  "interest": 1到5的整數,
  "trial_likelihood": 0到1的小數,
  "pay_likelihood": 0到1的小數,
  "max_price_twd": 整數,
  "preferred_plan": "free" | "99" | "199" | "399" | "unsure",
  "must_have": "最必要的功能，30字內",
  "biggest_concern": "最大疑慮，40字內",
  "try_trigger": "什麼情況會讓你真的開始用，40字內",
  "cancel_trigger": "什麼情況會讓你停止使用，40字內",
  "channel": "最可能接觸到這個工具的方式，30字內",
  "quote": "用你的語氣說一句話，50字內"
}
"""


def parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            return json.loads(match.group(0))
        raise


def main() -> None:
    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
    with PROFILES.open(encoding="utf-8", newline="") as handle:
        personas = list(csv.DictReader(handle))

    results = []
    for persona in personas:
        prompt = (
            f"你的 persona：\n"
            f"姓名：{persona['name']}\n"
            f"帳號：{persona['username']}\n"
            f"公開簡介：{persona['description']}\n"
            f"完整人設：{persona['user_char']}\n\n"
            + QUESTIONS
        )
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "你是台灣爬蟲與特殊寵物市場的受訪者。請誠實、具體、簡短。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
            max_tokens=700,
        )
        content = response.choices[0].message.content or ""
        try:
            answer = parse_json(content)
        except Exception as error:  # keep raw output for audit
            answer = {"parse_error": str(error), "raw": content}
        results.append({
            "agent_id": int(persona["user_id"]),
            "name": persona["name"],
            "username": persona["username"],
            "persona": persona["user_char"],
            "answer": answer,
            "usage": response.usage.model_dump() if response.usage else None,
        })
        print(f"answered {persona['user_id']} {persona['name']}", flush=True)

    valid = [row["answer"] for row in results if "interest" in row["answer"]]
    summary = {
        "status": "completed",
        "model": MODEL,
        "n": len(results),
        "valid": len(valid),
        "mean_interest": round(sum(row["interest"] for row in valid) / len(valid), 2) if valid else None,
        "mean_trial_likelihood": round(sum(row["trial_likelihood"] for row in valid) / len(valid), 3) if valid else None,
        "mean_pay_likelihood": round(sum(row["pay_likelihood"] for row in valid) / len(valid), 3) if valid else None,
        "plans": {plan: sum(1 for row in valid if row["preferred_plan"] == plan) for plan in ["free", "99", "199", "399", "unsure"]},
        "median_max_price": sorted(row["max_price_twd"] for row in valid)[len(valid) // 2] if valid else None,
        "note": "Synthetic qualitative panel; not a representative survey or a revenue forecast.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"summary": summary, "responses": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
