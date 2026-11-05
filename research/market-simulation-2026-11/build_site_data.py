#!/usr/bin/env python3
"""Build the static market-research site data from simulation outputs."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"
SITE.mkdir(exist_ok=True)

mc = json.loads((ROOT / "simulations" / "results" / "monte_carlo.json").read_text(encoding="utf-8"))
oasis_path = ROOT / "simulations" / "results" / "oasis_summary.json"
panel_path = ROOT / "simulations" / "results" / "structured_panel.json"
oasis = json.loads(oasis_path.read_text(encoding="utf-8")) if oasis_path.exists() else {
    "status": "pending",
    "note": "OASIS run has not produced a summary yet.",
}
panel = json.loads(panel_path.read_text(encoding="utf-8")) if panel_path.exists() else {
    "summary": {"status": "pending", "note": "Structured persona panel has not finished yet."},
    "responses": [],
}
local_summary_path = ROOT / "simulations" / "results" / "mirofish_local_summary.json"
local_report_path = ROOT / "simulations" / "results" / "mirofish_report.json"
mirofish_local = {
    "summary": json.loads(local_summary_path.read_text(encoding="utf-8")) if local_summary_path.exists() else {"status": "pending"},
    "report": json.loads(local_report_path.read_text(encoding="utf-8")) if local_report_path.exists() else None,
}
if panel.get("summary", {}).get("status") == "completed":
    customer_rows = [
        row for row in panel.get("responses", [])
        if row.get("agent_id") != 0 and row.get("answer", {}).get("interest") is not None
    ]
    if customer_rows:
        answers = [row["answer"] for row in customer_rows]
        panel["summary"].update({
            "n": len(customer_rows),
            "customer_n": len(customer_rows),
            "official_seed_excluded": True,
            "mean_interest": round(sum(a["interest"] for a in answers) / len(answers), 2),
            "mean_trial_likelihood": round(sum(a["trial_likelihood"] for a in answers) / len(answers), 3),
            "mean_pay_likelihood": round(sum(a["pay_likelihood"] for a in answers) / len(answers), 3),
            "plans": {plan: sum(1 for a in answers if a.get("preferred_plan") == plan) for plan in ["free", "99", "199", "399", "unsure"]},
            "median_max_price": sorted(a["max_price_twd"] for a in answers)[len(answers) // 2],
        })

payload = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "monte_carlo": mc,
    "oasis": oasis,
    "panel": panel,
    "mirofish_local": mirofish_local,
}
(SITE / "data.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
(SITE / "data.js").write_text(
    "window.TAIJIAN_SIM = " + json.dumps(payload, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print(f"wrote {SITE / 'data.js'} ({len(json.dumps(payload))} bytes)")
