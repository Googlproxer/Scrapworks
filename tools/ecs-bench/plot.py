"""Generate standalone research charts from recorded summaries, never live timings."""
import json
import os
from pathlib import Path
import sys
import importlib.metadata
import hashlib

root = Path(__file__).resolve().parents[2]
os.environ.setdefault("MPLCONFIGDIR", str(root / "tmp" / "ecs-bench" / "matplotlib"))
sys.path.insert(0, str(root / "tmp" / "ecs-bench" / "plotting"))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

folder = Path(sys.argv[1]).resolve()
(folder / "chart-environment.json").write_text(json.dumps({"python": sys.version, "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "memoryBaseline": "before adapter import; heap plus separately reported backing storage", "packages": {d.metadata["Name"]: d.version for d in importlib.metadata.distributions(path=[str(root / "tmp" / "ecs-bench" / "plotting")])}}, indent=2), encoding="utf-8")
data = json.loads((folder / "summary.json").read_text(encoding="utf-8"))
candidates = ["reference", "miniplex", "bitecs", "koota", "becsy"]
colors = dict(zip(candidates, ["#6b7280", "#0072B2", "#D55E00", "#009E73", "#CC79A7"]))
fig, axes = plt.subplots(2, 4, figsize=(17, 8), constrained_layout=True)
for row, environment in enumerate(["node", "browser"]):
    for col, workload in enumerate(["mixed", "idle", "active", "churn"]):
        ax = axes[row, col]
        for candidate in candidates:
            values = sorted([r for r in data["rows"] if r["environment"] == environment and r["workload"] == workload and r["candidate"] == candidate], key=lambda r: r["size"])
            if values:
                ax.plot([r["size"] for r in values], [r["p95"] for r in values], marker="o", label=candidate, color=colors[candidate])
                for r in values:
                    if r["successful"] != 5:
                        ax.scatter([r["size"]], [r["p95"]], marker="x", s=70, color="black")
        if workload == "mixed": ax.axhline(5, color="#333333", linestyle="--", linewidth=1, label="5 ms target")
        ax.set_xscale("log"); ax.set_yscale("symlog", linthresh=0.1); ax.set_ylim(bottom=0); ax.set_title(f"{environment}: {workload}")
        ax.set_xlabel("Meaningful entities"); ax.set_ylabel("Combined p95 (ms)"); ax.grid(alpha=0.25)
axes[0, 0].legend(fontsize=8)
fig.suptitle("ECS scaling: native work + structural updates + detached changed publication\nLinear below 0.1 ms; Chromium zeros are below timer resolution. Cross markers: fewer than five successful repetitions")
fig.savefig(folder / "scaling.svg"); fig.savefig(folder / "scaling.png", dpi=150); plt.close(fig)

fig, axes = plt.subplots(1, 2, figsize=(12, 5), constrained_layout=True)
for ax, environment in zip(axes, ["node", "browser"]):
    profiles = [p for p in data["profiles"] if p["environment"] == environment and p["status"] == "ok"]
    values = []
    for p in profiles:
        checkpoints = p["result"]["checkpoints"]
        base = checkpoints.get("beforeImport", {})
        pop = checkpoints["populated"]
        if environment == "node":
            amount = (pop["heapUsed"] + pop["external"] - base.get("heapUsed", 0) - base.get("external", 0))
        else:
            amount = pop["usedSize"] + pop.get("backingStorageSize", 0) - base.get("usedSize", 0) - base.get("backingStorageSize", 0)
        values.append((p["candidate"], amount / 1024**2))
    if values:
        ax.bar([v[0] for v in values], [v[1] for v in values], color=[colors[v[0]] for v in values])
    sizes = sorted({p.get("size", 100000) for p in profiles})
    ax.set_title(f"{environment}: {', '.join(format(s, ',') for s in sizes)} entities"); ax.set_ylabel("Incremental populated memory (MiB)"); ax.grid(axis="y", alpha=0.25)
fig.suptitle("Post-GC populated state above the before-adapter-import baseline\nNode heap + external; browser JS heap + reported backing storage; excludes RSS")
fig.savefig(folder / "memory.svg"); fig.savefig(folder / "memory.png", dpi=150); plt.close(fig)
