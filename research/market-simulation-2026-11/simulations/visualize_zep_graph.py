#!/usr/bin/env python3
"""Fetch the Zep Cloud graph and render a readable PNG/SVG snapshot.

86 nodes with 32 connected components are unreadable as one spring layout, so
the main component is drawn large and the isolated concepts are shown in a
side panel.
"""
from __future__ import annotations

import json
import math
import os
from collections import Counter
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import networkx as nx
from zep_cloud.client import Zep

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "simulations" / "results"
SITE = ROOT / "site"
GRAPH_ID = os.environ.get("GRAPH_ID", "mirofish_4fc677f874214ea4")
API_KEY = os.environ.get("ZEP_API_KEY", "")
if not API_KEY:
    raise SystemExit("ZEP_API_KEY missing")
OUT.mkdir(exist_ok=True)
SITE.mkdir(exist_ok=True)

client = Zep(api_key=API_KEY)
nodes = client.graph.node.get_by_graph_id(graph_id=GRAPH_ID)
edges = client.graph.edge.get_by_graph_id(graph_id=GRAPH_ID)

raw = {
    "graph_id": GRAPH_ID,
    "node_count": len(nodes),
    "edge_count": len(edges),
    "nodes": [
        {
            "uuid": n.uuid_,
            "name": n.name,
            "labels": n.labels,
            "summary": n.summary,
            "attributes": n.attributes,
        }
        for n in nodes
    ],
    "edges": [
        {
            "uuid": e.uuid_,
            "name": e.name,
            "fact": e.fact,
            "source": e.source_node_uuid,
            "target": e.target_node_uuid,
            "source_name": e.source_node_name,
            "target_name": e.target_node_name,
        }
        for e in edges
    ],
}
(OUT / "graph_launch_nfc.json").write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")

G = nx.Graph()
for n in nodes:
    G.add_node(n.uuid_, name=n.name or "?", labels=n.labels or [])
for e in edges:
    if e.source_node_uuid and e.target_node_uuid:
        G.add_edge(e.source_node_uuid, e.target_node_uuid)

components = sorted(nx.connected_components(G), key=len, reverse=True)
main_nodes = components[0]
main = G.subgraph(main_nodes).copy()
small = G.subgraph(set(G.nodes) - set(main_nodes)).copy()
degrees = dict(main.degree())
max_degree = max(degrees.values()) if degrees else 1

label_colors = {
    "User": "#c96b3b",
    "PetShopOwner": "#3f7c6a",
    "Veterinarian": "#6b5b95",
    "ContentCreator": "#b8860b",
    "GiftGiver": "#b05a7a",
    "ReptileBreeder": "#2f6f9f",
    "DIYer": "#7a8b3a",
    "Organization": "#666666",
    "Retailer": "#8a5a2b",
    "Person": "#557a95",
}
default_color = "#a9a29a"


def node_color(n):
    labels = G.nodes[n].get("labels") or []
    label = labels[0] if labels else "Concept"
    return label_colors.get(label, default_color)


def node_size(n, max_deg=1):
    return 110 + 620 * ((G.degree(n) / max_deg) ** 0.7 if max_deg else 0)


for font in ["PingFang TC", "Heiti TC", "Arial Unicode MS", "Noto Sans CJK TC", "DejaVu Sans"]:
    try:
        matplotlib.font_manager.findfont(font, fallback_to_default=False)
        plt.rcParams["font.sans-serif"] = [font]
        break
    except Exception:
        continue
plt.rcParams["axes.unicode_minus"] = False

fig = plt.figure(figsize=(20, 12), dpi=180)
fig.patch.set_facecolor("#fbf7ef")
gs = fig.add_gridspec(1, 2, width_ratios=[3.2, 1.0], wspace=0.05)
ax = fig.add_subplot(gs[0, 0])
ax2 = fig.add_subplot(gs[0, 1])
for a in (ax, ax2):
    a.set_facecolor("#fbf7ef")
    a.axis("off")

# Main component: spring layout.
pos = nx.spring_layout(main, k=1.55 / math.sqrt(max(len(main), 2)), iterations=350, seed=7)
normal_edges = [(u, v) for u, v in main.edges if u != v]
nx.draw_networkx_edges(main, pos, edgelist=normal_edges, ax=ax, edge_color="#c9beb0", width=1.0, alpha=0.55)
for u, v in main.edges:
    if u == v:
        x, y = pos[u]
        ax.add_patch(plt.Circle((x, y), 0.022, fill=False, color="#c96b3b", alpha=0.35, lw=0.9))
nx.draw_networkx_nodes(
    main, pos, ax=ax, node_color=[node_color(n) for n in main.nodes],
    node_size=[node_size(n, max_degree) for n in main.nodes],
    linewidths=1.0, edgecolors="#fffdf8", alpha=0.96,
)
label_nodes = sorted(main.nodes, key=lambda n: degrees[n], reverse=True)[:32]
for n in label_nodes:
    name = G.nodes[n].get("name") or ""
    if not name or name == "?":
        continue
    ax.annotate(
        name, pos[n], xytext=(0, 8), textcoords="offset points",
        ha="center", va="bottom", fontsize=9, color="#2f2a24", fontweight="bold",
        bbox=dict(boxstyle="round,pad=0.2", fc="#fffdf8", ec="none", alpha=0.78),
    )
ax.text(0.01, 1.015, f"主連通 component · {len(main)} nodes / {main.number_of_edges()} edges", transform=ax.transAxes, fontsize=12, color="#6f665c", va="bottom")

# Small components: a grid of mini-clusters.
small_components = sorted(nx.connected_components(small), key=len, reverse=True)
cols = 3
rows = math.ceil(len(small_components) / cols)
for index, comp in enumerate(small_components):
    row, col = divmod(index, cols)
    cx = (col + 0.5) / cols
    cy = 1 - (row + 0.55) / max(rows, 1)
    comp = list(comp)
    if len(comp) == 1:
        local = {comp[0]: (cx, cy)}
    else:
        sub = small.subgraph(comp)
        p = nx.circular_layout(sub, scale=0.035)
        local = {n: (cx + p[n][0], cy + p[n][1]) for n in comp}
    for u, v in small.subgraph(comp).edges:
        ax2.plot([local[u][0], local[v][0]], [local[u][1], local[v][1]], color="#c9beb0", lw=0.8, alpha=0.6, transform=ax2.transAxes)
    for n in comp:
        ax2.scatter([local[n][0]], [local[n][1]], s=node_size(n, max_degree) * 0.55, c=[node_color(n)], edgecolors="#fffdf8", linewidths=0.6, transform=ax2.transAxes, zorder=3)
        name = G.nodes[n].get("name") or ""
        ax2.annotate(
            name, local[n], xytext=(0, 5), textcoords="offset points",
            ha="center", va="bottom", fontsize=6.8, color="#2f2a24",
            transform=ax2.transAxes, zorder=4,
            bbox=dict(boxstyle="round,pad=0.12", fc="#fbf7ef", ec="none", alpha=0.7),
        )
ax2.text(0.02, 1.015, f"獨立／小型 components · {len(small)} nodes", transform=ax2.transAxes, fontsize=12, color="#6f665c", va="bottom")
ax2.set_xlim(0, 1)
ax2.set_ylim(0, 1)

counts = Counter((G.nodes[n].get("labels") or ["Concept"])[0] for n in G.nodes)
handles = []
for label, color in list(label_colors.items()) + [("Concept", default_color)]:
    if counts.get(label, 0):
        handles.append(Line2D([0], [0], marker="o", color="w", markerfacecolor=color, markersize=9, label=f"{label} ({counts[label]})"))
fig.legend(handles=handles, loc="lower left", bbox_to_anchor=(0.02, 0.02), frameon=True, facecolor="#fffdf8", edgecolor="#e5dccd", fontsize=9, title="Node type", title_fontsize=9)

fig.suptitle(
    f"苔間上線＋NFC · Zep Cloud GraphRAG\n{len(nodes)} nodes / {len(edges)} edges · {GRAPH_ID}",
    fontsize=19, fontweight="bold", color="#2f2a24", y=0.965,
)
fig.text(
    0.5, 0.015,
    "Spring projection of the main component; isolated concepts shown separately. Self-facts drawn as small loops.",
    ha="center", va="bottom", fontsize=8.5, color="#8a8178",
)
fig.subplots_adjust(left=0.02, right=0.98, top=0.87, bottom=0.08)
for path in [OUT / "graph_launch_nfc.png", SITE / "graph-launch-nfc.png"]:
    fig.savefig(path, bbox_inches="tight", facecolor=fig.get_facecolor())
plt.close(fig)
print(f"wrote {OUT / 'graph_launch_nfc.png'}")
print(f"wrote {SITE / 'graph-launch-nfc.png'}")
print(f"nodes={len(nodes)} edges={len(edges)} components={len(components)} main={len(main)} small={len(small)}")
