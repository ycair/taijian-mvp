#!/usr/bin/env python3
"""
苔間 2026-11 market simulation.

All numbers are explicit hypotheses, not observed traction. The model is
deliberately small and reproducible: a monthly paid-user funnel with churn,
revenue, acquisition cost and fixed cost. It does not replace interviews,
pricing tests or real retention data.
"""
from __future__ import annotations

import json
import math
import random
import statistics
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "results"
OUT.mkdir(parents=True, exist_ok=True)
SEED = 20261106
N = 20000
CURRENCY = "TWD"


def tri(rng: random.Random, low: float, mode: float, high: float) -> float:
    return rng.triangular(low, high, mode)


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * p / 100
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def summary(values: list[float]) -> dict:
    return {
        "mean": round(statistics.fmean(values), 2),
        "p10": round(pct(values, 10), 2),
        "p50": round(pct(values, 50), 2),
        "p90": round(pct(values, 90), 2),
        "min": round(min(values), 2),
        "max": round(max(values), 2),
    }


def scenario_params(name: str) -> dict:
    """Parameter ranges. medians are shown in the web report."""
    # reptile-keeping households in Taiwan: 150k-300k; explicit assumption
    common = {
        "reptile_households": (150000, 225000, 300000),
        "digital_share": (0.30, 0.45, 0.60),
        "reach_12m": (0.10, 0.20, 0.30),
        "trial_rate": (0.08, 0.14, 0.20),
        "paid_rate": (0.18, 0.29, 0.40),
        "referral_multiplier": (1.00, 1.15, 1.30),
        "arpu": (129, 179, 239),
        "monthly_churn": (0.03, 0.055, 0.09),
        "variable_cost_per_paid": (10, 20, 35),
        "cac_per_paid": (300, 600, 900),
        "fixed_cost_monthly": (25000, 50000, 80000),
        "take_rate": (0.0, 0.0, 0.0),
        "refund_rate": (0.0, 0.0, 0.0),
    }
    if name == "conservative":
        common.update({
            "reach_12m": (0.04, 0.08, 0.14),
            "trial_rate": (0.04, 0.08, 0.13),
            "paid_rate": (0.10, 0.18, 0.28),
            "arpu": (99, 149, 199),
            "monthly_churn": (0.06, 0.085, 0.12),
            "cac_per_paid": (500, 900, 1400),
        })
    elif name == "upside":
        common.update({
            "reach_12m": (0.20, 0.30, 0.42),
            "trial_rate": (0.14, 0.20, 0.28),
            "paid_rate": (0.30, 0.40, 0.52),
            "arpu": (179, 229, 299),
            "monthly_churn": (0.02, 0.035, 0.06),
            "cac_per_paid": (150, 350, 650),
        })
    elif name == "commercial":
        # Counterfactual: real payments, paid/partner acquisition, a small team.
        common.update({
            "digital_share": (0.45, 0.60, 0.75),
            "reach_12m": (0.22, 0.36, 0.50),
            "trial_rate": (0.12, 0.18, 0.26),
            "paid_rate": (0.22, 0.32, 0.42),
            "referral_multiplier": (1.05, 1.20, 1.40),
            "arpu": (179, 229, 299),
            "monthly_churn": (0.035, 0.055, 0.075),
            "variable_cost_per_paid": (15, 25, 40),
            "cac_per_paid": (350, 600, 900),
            "fixed_cost_monthly": (60000, 90000, 130000),
            "take_rate": (0.04, 0.05, 0.07),
            "refund_rate": (0.02, 0.04, 0.07),
        })
    elif name == "appstore":
        # Counterfactual: App Store distribution, IAP, 15% Small Business fee,
        # payment/refund overhead. If revenue exceeds the program threshold,
        # Apple's 30% take would make this scenario worse.
        common.update({
            "digital_share": (0.55, 0.70, 0.85),
            "reach_12m": (0.30, 0.44, 0.58),
            "trial_rate": (0.18, 0.27, 0.36),
            "paid_rate": (0.27, 0.38, 0.48),
            "referral_multiplier": (1.10, 1.28, 1.50),
            "arpu": (199, 249, 299),
            "monthly_churn": (0.025, 0.045, 0.065),
            "variable_cost_per_paid": (12, 22, 35),
            "cac_per_paid": (220, 420, 700),
            "fixed_cost_monthly": (50000, 80000, 120000),
            "take_rate": (0.15, 0.18, 0.20),
            "refund_rate": (0.02, 0.04, 0.06),
        })
    return common


def sample_params(rng: random.Random, ranges: dict) -> dict:
    return {key: tri(rng, *value) for key, value in ranges.items()}


def run_one(rng: random.Random, params: dict) -> dict:
    reached = (
        params["reptile_households"]
        * params["digital_share"]
        * params["reach_12m"]
        * params["referral_multiplier"]
    )
    trials = reached * params["trial_rate"]
    paid_total = trials * params["paid_rate"]
    churn = params["monthly_churn"]
    gross_arpu = params["arpu"]
    net_multiplier = max(0.0, 1 - params.get("take_rate", 0.0) - params.get("refund_rate", 0.0))
    arpu = gross_arpu * net_multiplier
    variable = params["variable_cost_per_paid"]
    cac = params["cac_per_paid"]
    fixed = params["fixed_cost_monthly"]

    active = 0.0
    revenue = 0.0
    cost = 0.0
    monthly_mrr = []
    active_curve = []
    # Acquisition is back-loaded slightly: early founder-led sales are slower
    # than community distribution after month 3.
    ramp = [0.55, 0.65, 0.8, 0.95, 1.05, 1.1, 1.15, 1.2, 1.2, 1.25, 1.25, 1.25]
    weight_sum = sum(ramp)
    for month in range(12):
        new_paid = paid_total * ramp[month] / weight_sum
        active = active * (1 - churn) + new_paid
        mrr = active * arpu
        revenue += mrr
        cost += fixed + active * variable + new_paid * cac
        monthly_mrr.append(mrr)
        active_curve.append(active)

    ltv = max(0.0, (arpu - variable) / churn) if churn > 0 else 0.0
    payback = cac / max(1.0, arpu - variable)
    return {
        "reached": reached,
        "trials": trials,
        "paid_total": paid_total,
        "active_m12": active,
        "mrr_m12": monthly_mrr[-1],
        "revenue_12m": revenue,
        "cost_12m": cost,
        "profit_12m": revenue - cost,
        "ltv": ltv,
        "gross_arpu": gross_arpu,
        "net_arpu": arpu,
        "take_rate": params.get("take_rate", 0.0),
        "refund_rate": params.get("refund_rate", 0.0),
        "cac": cac,
        "ltv_cac": ltv / cac if cac > 0 else 0.0,
        "payback_months": payback,
        "monthly_mrr": monthly_mrr,
        "active_curve": active_curve,
    }


def simulate(name: str, iterations: int, seed: int) -> tuple[list[dict], dict]:
    rng = random.Random(seed)
    ranges = scenario_params(name)
    rows = [run_one(rng, sample_params(rng, ranges)) for _ in range(iterations)]
    return rows, ranges


def summarize_rows(rows: list[dict]) -> dict:
    revenue = [row["revenue_12m"] for row in rows]
    mrr = [row["mrr_m12"] for row in rows]
    active = [row["active_m12"] for row in rows]
    profit = [row["profit_12m"] for row in rows]
    ltv_cac = [row["ltv_cac"] for row in rows]
    payback = [row["payback_months"] for row in rows]
    net_arpu = [row["net_arpu"] for row in rows]
    return {
        "revenue_12m": summary(revenue),
        "mrr_m12": summary(mrr),
        "active_m12": summary(active),
        "profit_12m": summary(profit),
        "ltv_cac": summary(ltv_cac),
        "payback_months": summary(payback),
        "net_arpu": summary(net_arpu),
        "probability_mrr_over_100k": round(sum(value >= 100000 for value in mrr) / len(mrr), 4),
        "probability_revenue_over_1m": round(sum(value >= 1000000 for value in revenue) / len(revenue), 4),
        "probability_profitable": round(sum(value > 0 for value in profit) / len(profit), 4),
        "probability_ltv_cac_over_3": round(sum(value >= 3 for value in ltv_cac) / len(ltv_cac), 4),
        "probability_payback_under_12m": round(sum(value <= 12 for value in payback) / len(payback), 4),
    }


def histogram(values: list[float], bins: int = 24) -> dict:
    low = min(values)
    high = max(values)
    width = (high - low) / bins if high > low else 1
    counts = [0] * bins
    for value in values:
        index = min(bins - 1, int((value - low) / width))
        counts[index] += 1
    return {
        "bins": [round(low + width * index, 0) for index in range(bins)],
        "counts": counts,
        "width": round(width, 0),
    }


def median_curve(curves: list[list[float]], month: int) -> dict:
    values = [curve[month] for curve in curves]
    return {"p10": pct(values, 10), "p50": pct(values, 50), "p90": pct(values, 90)}


def sensitivity(name: str, base_ranges: dict) -> list[dict]:
    variables = [
        "reptile_households",
        "digital_share",
        "reach_12m",
        "trial_rate",
        "paid_rate",
        "arpu",
        "monthly_churn",
        "cac_per_paid",
        "fixed_cost_monthly",
    ]
    out = []
    for variable in variables:
        low_ranges = {key: value for key, value in base_ranges.items()}
        high_ranges = {key: value for key, value in base_ranges.items()}
        low, mode, high = base_ranges[variable]
        low_ranges[variable] = (low, low, low)
        high_ranges[variable] = (high, high, high)
        low_rows, _ = simulate_with_ranges(low_ranges, 3000, SEED + 11)
        high_rows, _ = simulate_with_ranges(high_ranges, 3000, SEED + 12)
        low_rev = statistics.median(row["revenue_12m"] for row in low_rows)
        high_rev = statistics.median(row["revenue_12m"] for row in high_rows)
        low_mrr = statistics.median(row["mrr_m12"] for row in low_rows)
        high_mrr = statistics.median(row["mrr_m12"] for row in high_rows)
        out.append({
            "variable": variable,
            "low": low,
            "high": high,
            "low_revenue_12m": round(low_rev, 0),
            "high_revenue_12m": round(high_rev, 0),
            "low_mrr_m12": round(low_mrr, 0),
            "high_mrr_m12": round(high_mrr, 0),
            "swing_revenue": round(abs(high_rev - low_rev), 0),
        })
    out.sort(key=lambda item: item["swing_revenue"], reverse=True)
    return out


def simulate_with_ranges(ranges: dict, iterations: int, seed: int) -> tuple[list[dict], dict]:
    rng = random.Random(seed)
    rows = [run_one(rng, sample_params(rng, ranges)) for _ in range(iterations)]
    return rows, ranges


def main() -> None:
    results = {}
    all_rows = []
    scenario_summaries = {}
    scenario_curves = {}
    for name, seed in [
        ("conservative", SEED + 1),
        ("base", SEED + 2),
        ("upside", SEED + 3),
        ("commercial", SEED + 4),
        ("appstore", SEED + 5),
    ]:
        rows, ranges = simulate(name, N, seed)
        all_rows.extend(rows)
        scenario_summaries[name] = summarize_rows(rows)
        scenario_curves[name] = [
            median_curve([row["active_curve"] for row in rows], month)
            for month in range(12)
        ]

    base_rows, base_ranges = simulate("base", N, SEED + 2)
    overall = summarize_rows(all_rows)
    # The base distribution is the headline; the pooled distribution is useful
    # for showing that scenario choice dominates the result.
    hist_revenue = histogram([row["revenue_12m"] for row in base_rows])
    hist_mrr = histogram([row["mrr_m12"] for row in base_rows])
    sensitivity_rows = sensitivity("base", base_ranges)

    retention = []
    for churn in [0.03, 0.055, 0.09]:
        retention.append({
            "monthly_churn": churn,
            "m12": round((1 - churn) ** 12, 4),
            "m24": round((1 - churn) ** 24, 4),
            "median_lifetime_months": round(1 / churn, 1),
        })

    results = {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "seed": SEED,
            "iterations_per_scenario": N,
            "currency": CURRENCY,
            "model": "monthly paid-user funnel + churn + CAC + fixed cost",
            "disclaimer": "All parameters are hypotheses. No revenue, retention, or conversion data exists for 苔間 yet.",
        },
        "scenario_summaries": scenario_summaries,
        "pooled": overall,
        "base_histograms": {"revenue_12m": hist_revenue, "mrr_m12": hist_mrr},
        "base_retention_curve": scenario_curves["base"],
        "sensitivity": sensitivity_rows,
        "retention": retention,
        "market_sources": [
            {
                "label": "農業部 2023 家犬貓調查：28.3% 家戶養寵物、9.3% 養非犬貓",
                "url": "https://animal.moa.gov.tw/public/files/LatestNews_anp_news/202503310609020001.pdf",
            },
            {
                "label": "台北時報 2024：台灣寵物犬貓與非犬貓飼養趨勢",
                "url": "https://www.taipeitimes.com/News/taiwan/archives/2024/06/03/2003818796",
            },
            {
                "label": "TVBS 2025：爬蟲類約占寵物飼養量 10%（媒體引述，低可信度）",
                "url": "https://news.tvbs.com.tw/local/2967043",
            },
            {
                "label": "中央社 2025：台北國際兩棲爬蟲盛典 15,000 人次、1,500 萬元營業額",
                "url": "https://www.cna.com.tw/postwrite/chi/401223",
            },
            {
                "label": "LINE Taiwan 2024：2,200 萬用戶、約 94% 人口滲透率",
                "url": "https://www.linecorp.com/tw/pr/news/2024/1217",
            },
            {
                "label": "台經院 2024：2023 台灣寵物產業規模約 631 億元",
                "url": "https://vos.tier.org.tw/Viewpoint01More.aspx?DGUID=390c8a34-e293-4056-8aa2-b54c5315fdd7",
            },
        ],
        "assumptions": scenario_params("base"),
        "scenario_ranges": {
            name: scenario_params(name)
            for name in ["conservative", "base", "upside", "commercial", "appstore"]
        },
        "scenario_notes": {
            "commercial": "Counterfactual: real payments and partner/paid acquisition, still web/LIFF-first.",
            "appstore": "Counterfactual: App Store distribution and IAP; 15% Small Business take rate, 3% payment/refund overhead. Above Apple's Small Business threshold the 30% take applies.",
        },
    }
    (OUT / "monte_carlo.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "base": scenario_summaries["base"],
        "conservative": scenario_summaries["conservative"]["mrr_m12"],
        "upside": scenario_summaries["upside"]["mrr_m12"],
        "commercial": scenario_summaries["commercial"]["mrr_m12"],
        "appstore": scenario_summaries["appstore"]["mrr_m12"],
        "sensitivity_top": sensitivity_rows[:4],
        "written": str(OUT / "monte_carlo.json"),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
