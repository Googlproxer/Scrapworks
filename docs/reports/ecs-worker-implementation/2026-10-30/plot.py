"""Render production-only offline figures; never run during measurements."""
import json
import os
import sys
from pathlib import Path
cache = Path('tmp/ecs-bench/matplotlib').resolve()
cache.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('MPLCONFIGDIR', str(cache))
sys.path.insert(0, str(Path('tmp/ecs-bench/plotting').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).parent
summary = json.loads((root / 'summary.json').read_text(encoding='utf8'))
colors = {'inline': '#CC6600', 'worker': '#0072B2'}
fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
for mode, color in colors.items():
    rows = sorted([r for r in summary['rows'] if r['options']['execution'] == mode and r['options']['workload'] == 'mixed'], key=lambda r: r['options']['size'])
    for ax, metric in zip(axes, ['workAndPublication', 'roundTrip']):
        values = [r['metrics'][metric]['p95'] for r in rows]
        ax.errorbar([r['options']['size'] / 1000 for r in rows], [v['median'] for v in values], yerr=[[v['median']-v['min'] for v in values], [v['max']-v['median'] for v in values]], marker='o', color=color, capsize=4, label=mode)
for ax, title in zip(axes, ['Simulation and detached publication', 'Host request through completed cache']):
    ax.set_title(title)
    ax.set_xlabel('Meaningful entities (thousands)')
    ax.set_ylabel('Median per-run p95 (ms); range of five runs')
    ax.grid(alpha=.2)
    ax.legend()
axes[0].axhline(5, linestyle=':', color='black', label='Normal target budget')
axes[0].scatter([100], [5], marker='x', color='black', zorder=5)
axes[0].legend()
fig.suptitle('Production Miniplex — normal mixed world')
fig.tight_layout()
for ext in ['svg', 'png']:
    fig.savefig(root / ('latency.' + ext), dpi=160)
plt.close(fig)
fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
for mode, color in colors.items():
    jobs = [j for j in summary['jobs'] if j['mode'] == 'paced' and not j['diagnostic'] and j['options']['execution'] == mode]
    for ax, metric in zip(axes, ['frames', 'inputToVisible']):
        ax.scatter([j['options']['pressureMs'] + (-.1 if mode == 'inline' else .1) for j in jobs], [j['result']['statistics'][metric]['p99'] for j in jobs], color=color, marker='o' if mode == 'inline' else 's', label=mode, alpha=.7)
for ax, title, budget in zip(axes, ['Callback arrival intervals', 'Synthetic input to completed presentation'], [33.4, 150]):
    ax.axhline(budget, linestyle=':', color='black', label='Required p99 budget')
    ax.set_xlabel('Controlled main-thread pressure per frame (ms)')
    ax.set_ylabel('Per-run p99 (ms)')
    ax.set_title(title)
    ax.grid(alpha=.2)
    ax.legend()
fig.suptitle('60 Hz normal workload — every 30-second repetition')
fig.tight_layout()
for ext in ['svg', 'png']:
    fig.savefig(root / ('responsiveness.' + ext), dpi=160)
plt.close(fig)
for svg in root.glob('*.svg'):
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf8').splitlines()) + '\n', encoding='utf8')
