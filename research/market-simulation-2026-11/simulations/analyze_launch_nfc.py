#!/usr/bin/env python3
"""Extract a traceable evidence table from the launch + NFC simulation."""
from __future__ import annotations

import csv
import json
import os
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "simulations" / "results"
SUMMARY = json.loads((OUT / "launch_nfc_summary.json").read_text(encoding="utf-8"))
SIM_ID = os.environ.get("SIM_ID", SUMMARY["simulation_id"])
SIM_DIR = ROOT / "MiroFish-local" / "backend" / "uploads" / "simulations" / SIM_ID
DB_OVERRIDE = os.environ.get("DB_OVERRIDE")
OUTPUT_NAME = os.environ.get("OUTPUT_NAME", "launch_nfc_analysis.json")

THEMES = {
    "nfc": ["nfc", "貼紙", "感應", "感應貼", "刷貼", "tag"],
    "pricing": ["199", "299", "399", "1,999", "1999", "價格", "付費", "訂閱", "免費"],
    "privacy": ["隱私", "私密", "權限", "家人", "家庭", "陌生人", "安全", "外洩"],
    "merch": ["周邊", "托特", "衣服", "t-shirt", "徽章", "馬克杯", "商品"],
    "android": ["android", "安卓", "qr", "qrcode", "fallback", "iphone 限定", "iphone-only"],
    "channel": ["爬店", "繁殖", "獸醫", "店家", "通路", "展會", "寵物展"],
    "retention": ["留存", "續訂", "退訂", "取消", "習慣", "每天", "持續"],
    "export": ["匯出", "備份", "csv", "資料帶走", "轉移"],
}

POSITIVE = ["方便", "實用", "會買", "願意", "值得", "不錯", "喜歡", "需要", "解決", "好看", "加分", "划算"]
NEGATIVE = ["不會", "不需要", "雞肋", "貴", "麻煩", "擔心", "怕", "難用", "退訂", "浪費", "卻步", "沒必要", "複雜"]


def load_profiles() -> dict[int, dict]:
    profiles = {}
    for csv_path in SIM_DIR.glob("*_profiles.csv"):
        with csv_path.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                try:
                    uid = int(row.get("user_id", ""))
                except ValueError:
                    continue
                profiles[uid] = {
                    "name": row.get("name") or row.get("username") or f"agent_{uid}",
                    "username": row.get("username", ""),
                    "bio": (row.get("description") or row.get("user_char") or "")[:400],
                }
    return profiles


def db_records(platform: str, profiles: dict[int, dict]) -> list[dict]:
    db_path = Path(DB_OVERRIDE) if DB_OVERRIDE else SIM_DIR / f"{platform}_simulation.db"
    if not db_path.exists():
        return []
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    tables = {row[0] for row in con.execute("select name from sqlite_master where type='table'")}
    records = []

    if "post" in tables:
        for row in con.execute("select * from post order by rowid"):
            d = dict(row)
            uid = d.get("user_id")
            author = profiles.get(uid, {})
            records.append({
                "kind": "post",
                "platform": platform,
                "id": f"{platform[0].upper()}-P{d.get('post_id', d.get('id', len(records)))}",
                "user_id": uid,
                "author": author.get("name") or f"agent_{uid}",
                "content": (d.get("content") or "").strip(),
                "created_at": d.get("created_at"),
            })

    if "comment" in tables:
        for row in con.execute("select * from comment order by rowid"):
            d = dict(row)
            uid = d.get("user_id")
            author = profiles.get(uid, {})
            records.append({
                "kind": "comment",
                "platform": platform,
                "id": f"{platform[0].upper()}-C{d.get('comment_id', d.get('id', len(records)))}",
                "user_id": uid,
                "author": author.get("name") or f"agent_{uid}",
                "content": (d.get("content") or "").strip(),
                "created_at": d.get("created_at"),
                "post_id": d.get("post_id"),
            })

    con.close()
    return [r for r in records if r["content"]]


def classify(text: str) -> dict:
    low = text.lower()
    themes = [name for name, words in THEMES.items() if any(w in low for w in words)]
    pos = sum(1 for w in POSITIVE if w in low)
    neg = sum(1 for w in NEGATIVE if w in low)
    sentiment = "positive" if pos > neg else "negative" if neg > pos else "neutral"
    return {"themes": themes, "sentiment": sentiment, "positive_hits": pos, "negative_hits": neg}


def main() -> None:
    profiles = load_profiles()
    records = []
    platforms = ("reddit",) if DB_OVERRIDE else ("twitter", "reddit")
    for platform in platforms:
        records.extend(db_records(platform, profiles))

    for record in records:
        record.update(classify(record["content"]))

    by_platform = Counter(r["platform"] for r in records)
    by_kind = Counter(f"{r['platform']}:{r['kind']}" for r in records)
    by_author = Counter(r["author"] for r in records)
    theme_counts = Counter(t for r in records for t in r["themes"])
    sentiment = Counter(r["sentiment"] for r in records)

    # Group evidence by theme, keeping the longest/most specific quotes.
    evidence = defaultdict(list)
    for record in records:
        for theme in record["themes"]:
            evidence[theme].append(record)
    for theme in evidence:
        evidence[theme].sort(key=lambda r: (len(r["content"]), r["kind"] == "comment"), reverse=True)

    payload = {
        "simulation_id": SIM_ID,
        "graph_id": SUMMARY.get("graph_id"),
        "project_id": SUMMARY.get("project_id"),
        "counts": {
            "total": len(records),
            "by_platform": dict(by_platform),
            "by_kind": dict(by_kind),
            "unique_authors": len(by_author),
            "top_authors": by_author.most_common(20),
            "themes": dict(theme_counts),
            "sentiment": dict(sentiment),
        },
        "records": records,
        "evidence_by_theme": {
            theme: [
                {k: r[k] for k in ("id", "platform", "kind", "author", "content", "sentiment")}
                for r in rows[:8]
            ]
            for theme, rows in evidence.items()
        },
    }
    (OUT / OUTPUT_NAME).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(payload["counts"], ensure_ascii=False, indent=2))
    print("\n--- sample quotes by theme ---")
    for theme, rows in payload["evidence_by_theme"].items():
        print(f"\n[{theme}]")
        for row in rows[:4]:
            print(f"  {row['id']} {row['author']}: {row['content'][:180]}")


if __name__ == "__main__":
    main()
