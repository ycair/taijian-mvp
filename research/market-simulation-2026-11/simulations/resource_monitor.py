#!/usr/bin/env python3
"""Low-overhead macOS resource logger for the Ollama/MiroFish run."""
import datetime, json, os, re, subprocess, time
from pathlib import Path

out = Path(__file__).resolve().parent / "results" / "resource_usage.jsonl"
out.parent.mkdir(parents=True, exist_ok=True)
while True:
    vm = subprocess.run(["vm_stat"], capture_output=True, text=True).stdout
    page = int(re.search(r"page size of (\d+)", vm).group(1))
    def pages(name):
        m = re.search(rf"{name}:\s+(\d+)", vm)
        return int(m.group(1)) if m else 0
    swap = subprocess.run(["sysctl", "-n", "vm.swapusage"], capture_output=True, text=True).stdout.strip()
    load = os.getloadavg()
    row = {
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "free_mb": round(pages("Pages free") * page / 1024 / 1024, 1),
        "active_mb": round(pages("Pages active") * page / 1024 / 1024, 1),
        "wired_mb": round(pages("Pages wired down") * page / 1024 / 1024, 1),
        "compressed_mb": round(pages("Pages occupied by compressor") * page / 1024 / 1024, 1),
        "swap": swap,
        "load1": round(load[0], 2),
    }
    with out.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row) + "\n")
    time.sleep(15)
