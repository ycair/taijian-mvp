#!/usr/bin/env python3
"""Summarize the small MiroFish/OASIS pilot without inventing quotes."""
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "simulations" / "mirofish_oasis" / "twitter_simulation.db"
OUT = ROOT / "simulations" / "results" / "oasis_summary.json"

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
posts = [dict(row) for row in con.execute(
    "select p.post_id, p.user_id, u.name, p.content, p.created_at "
    "from post p join user u on u.user_id=p.user_id order by p.post_id"
)]
comments = con.execute("select count(*) from comment").fetchone()[0]
likes = con.execute("select count(*) from like").fetchone()[0]
follows = con.execute("select count(*) from follow").fetchone()[0]
agents = con.execute("select count(*) from user").fetchone()[0]
con.close()

summary = {
    "status": "completed",
    "agents": agents,
    "rounds": 2,
    "actions": len(posts) + comments + likes + follows,
    "counts": {"posts": len(posts), "comments": comments, "likes": likes, "follows": follows},
    "adoption_signal": "無法判斷",
    "themes": [
        {"agent": "OASIS pilot", "text": f"本次 {len(posts)} 則貼文中有 {max(0, len(posts) - 1)} 則重貼官方 beta 訊息，沒有展開價格、隱私或使用理由。"},
        {"agent": "OASIS pilot", "text": f"留言 {comments}、讚 {likes}、追蹤 {follows}；訊號不足以推論市場接受度。"},
        {"agent": "OASIS pilot", "text": "persona 間沒有形成對話，因此不能把沉默解讀成不支持，也不能解讀成支持。"},
    ],
    "method_note": "MiroFish OASIS Twitter 引擎，12 個 persona、2 輪、每輪 1 小時；使用 gpt-oss-120b。MiroFish 完整 GraphRAG 流程需要 Zep Cloud key，本次未提供；此 pilot 只作流程驗證。",
    "raw_posts": [
        {"agent": post["name"], "content": post["content"][:160]}
        for post in posts
    ],
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False, indent=2))
