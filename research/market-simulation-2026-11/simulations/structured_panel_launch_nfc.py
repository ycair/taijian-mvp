#!/usr/bin/env python3
"""Structured persona panel for app launch + NFC sticker + merchandise.

This is a supplement to the OASIS run: same personas, direct structured
questions, so we get willingness-to-pay and objection data that OASIS comments
may not surface. Synthetic qualitative research, not a survey.
"""
from __future__ import annotations

import csv
import json
import os
import re
from pathlib import Path

from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
SIM_ID = "sim_8395a3e78031"
SIM_DIR = ROOT / "MiroFish-local" / "backend" / "uploads" / "simulations" / SIM_ID
OUT = ROOT / "simulations" / "results" / "structured_panel_launch_nfc.json"

MODEL = os.environ.get("LLM_MODEL_NAME", "qwen2.5:14b-instruct")
BASE_URL = os.environ.get("LLM_BASE_URL", "http://127.0.0.1:11434/v1")
API_KEY = os.environ.get("LLM_API_KEY", "ollama")

TARGET_NAMES = {
    "小安", "阿凱", "陳老闆", "林醫師", "阿宏", "雅婷", "Eric", "米米",
    "阿珍", "老周", "小美", "Kevin", "阿德", "王小姐", "小林",
}

QUESTIONS = """
請以這個 persona 的真實立場回答苔間上線＋NFC 周邊的市場問題。不要扮演客服，不要為了禮貌而提高分數；如果不會買，就明確說不會。

情境：
- 苔間 iOS App 上線，免費版每月 60 張照片；Pro 199 元/月，含匯出、家庭權限、進階提醒。
- NFC 貼紙：空白貼紙可在 App 內綁定一隻居民；已設定貼紙讓 iPhone 靠近後開 App，跳到該居民快速記錄頁。3 張 299 元、5 張 399 元；Pro 年繳可含 3 張。
- 其他周邊：照護記錄卡、缸邊標籤、托特包、徽章；爬店／繁殖者 10 張＋店家後台 1,999 元。
- iPhone XS 以後可背景感應；iPhone 7/8/X 要手動；Android 只能用 QR code fallback。

只回傳一個 JSON object，不要 markdown、不要解釋：
{
  "interest_app": 1到5的整數,
  "trial_app": 0到1的小數,
  "pay_app": 0到1的小數,
  "preferred_plan": "free" | "99" | "199" | "399" | "unsure",
  "max_price_twd": 整數,
  "nfc_interest": 1到5的整數,
  "nfc_buy": 0到1的小數,
  "nfc_3pack_299_ok": true | false,
  "nfc_use_case": "最可能的使用方式，30字內",
  "merch_interest": 1到5的整數,
  "merch_which": "最可能買的周邊，30字內；不會買就寫不會買",
  "biggest_concern": "最大疑慮，40字內",
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
    profiles_path = SIM_DIR / "twitter_profiles.csv"
    with profiles_path.open(encoding="utf-8", newline="") as handle:
        personas = [row for row in csv.DictReader(handle) if row.get("name") in TARGET_NAMES]
    print(f"personas: {len(personas)}")

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
                {"role": "system", "content": "你是台灣爬蟲與特殊寵物市場的受訪者。請誠實、具體、簡短，只輸出 JSON。"},
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
            max_tokens=800,
        )
        content = response.choices[0].message.content or ""
        try:
            answer = parse_json(content)
        except Exception as error:
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

    valid = [row["answer"] for row in results if "interest_app" in row["answer"]]
    summary = {
        "status": "completed",
        "model": MODEL,
        "n": len(results),
        "valid": len(valid),
        "mean_interest_app": round(sum(row["interest_app"] for row in valid) / len(valid), 2) if valid else None,
        "mean_trial_app": round(sum(row["trial_app"] for row in valid) / len(valid), 3) if valid else None,
        "mean_pay_app": round(sum(row["pay_app"] for row in valid) / len(valid), 3) if valid else None,
        "plans": {plan: sum(1 for row in valid if row["preferred_plan"] == plan) for plan in ["free", "99", "199", "399", "unsure"]},
        "median_max_price": sorted(row["max_price_twd"] for row in valid)[len(valid) // 2] if valid else None,
        "mean_nfc_interest": round(sum(row["nfc_interest"] for row in valid) / len(valid), 2) if valid else None,
        "mean_nfc_buy": round(sum(row["nfc_buy"] for row in valid) / len(valid), 3) if valid else None,
        "nfc_3pack_299_yes": sum(1 for row in valid if row.get("nfc_3pack_299_ok") is True),
        "mean_merch_interest": round(sum(row["merch_interest"] for row in valid) / len(valid), 2) if valid else None,
        "note": "Synthetic qualitative panel; not a representative survey or a revenue forecast.",
    }
    OUT.write_text(json.dumps({"summary": summary, "responses": results}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
