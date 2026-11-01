"""Standalone publication figures; no live benchmark work is run."""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path('tmp/ecs-bench/plotting').resolve()))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

summary = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
target = Path(sys.argv[2])
colors = {'miniplex': '#0072B2', 'bitecs': '#D55E00'}
fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))
normal = [row for row in summary['rows'] if row['options']['workload'] == 'mixed' and row['options']['wire'] == 'object' and not row['options'].get('batch')]
scaling = len({row['options']['size'] for row in normal}) > 1
for candidate, color in colors.items():
    for mode, style in [('inline', '-'), ('worker', '--')]:
        rows = [row for row in normal if row['options']['candidate'] == candidate and row['options']['execution'] == mode]
        rows.sort(key=lambda row: row['options']['size'])
        for ax, metric in zip(axes, ['roundTrip', 'workAndPublication']):
            if scaling:
                ax.plot([row['options']['size'] for row in rows], [row['metrics'][metric]['p95']['median'] for row in rows], style, marker='o', color=color, label=f'{candidate}: {mode}')
                incomplete = [row for row in rows if row['complete'] < row['runs']]
                if incomplete:
                    ax.scatter([row['options']['size'] for row in incomplete], [row['metrics'][metric]['p95']['median'] for row in incomplete], marker='x', color='black', s=65, zorder=4)
                ax.set_xscale('log')
                ax.set_xlabel('Meaningful entities')
            elif rows:
                row = rows[0]
                x = list(colors).index(candidate) * 3 + (mode == 'worker')
                values = row['metrics'][metric]['p95']
                ax.bar(x, values['median'], color=color, alpha=1 if mode == 'worker' else .55, label=f'{candidate}: {mode}')
                ax.errorbar(x, values['median'], yerr=[[values['median']-values['min']], [values['max']-values['median']]], color='black', capsize=4)
                ax.set_xticks([0, 1, 3, 4], ['Miniplex\ninline', 'Miniplex\nworker', 'bitECS\ninline', 'bitECS\nworker'])
                ax.set_xlabel(f"{row['options']['size']:,} meaningful entities; whiskers show repetition range")
            ax.set_yscale('symlog', linthresh=.1)
            ax.grid(axis='y', alpha=.2)
            ax.set_ylabel('Median per-run p95 (ms)')
if any(row['complete'] < row['runs'] for row in normal):
    for ax in axes:
        ax.plot([], [], marker='x', linestyle='none', color='black', label='Partial timeout trials')
axes[0].set_title('Host request through applied detached view')
axes[1].set_title('Simulation + detached publication, before transport')
axes[1].axhline(5, color='black', linestyle=':', label='5 ms simulation budget')
axes[0].legend(fontsize=8); axes[1].legend(fontsize=8)
contract = 'lean transferred numeric views' if summary['manifest']['protocol'].get('presentation') == 'lean' else 'rich object messages'
fig.suptitle(f'Single-worker comparison — {contract}, normal mixed work')
fig.tight_layout()
for extension in ['svg', 'png']:
    fig.savefig(target / f'latency.{extension}', dpi=160)
plt.close(fig)

paced = [job for job in summary['jobs'] if job['mode'] == 'paced' and not job['diagnostic'] and job['options']['workload'] == 'mixed' and job['status'] == 'ok']
fig, ax = plt.subplots(figsize=(9, 4.5))
for candidate, color in colors.items():
    for mode, marker in [('inline', 'o'), ('worker', 's')]:
        jobs = [job for job in paced if job['options']['candidate'] == candidate and job['options']['execution'] == mode]
        if not jobs:
            continue
        ax.scatter([job['options']['pressureMs'] + (-.15 if mode == 'inline' else .15) for job in jobs], [job['result']['statistics']['frames']['p99'] for job in jobs], color=color, marker=marker, label=f'{candidate}: {mode}', alpha=.7)
ax.axhline(33.4, color='black', linestyle=':', label='Frozen frame p99 budget')
ax.set_xlabel('Controlled main-thread work per frame (ms)'); ax.set_ylabel('Per-run callback arrival interval p99 (ms)')
ax.set_title('60 Hz callback arrival responsiveness — every normal-work repetition')
ax.grid(alpha=.2); ax.legend(fontsize=8); fig.tight_layout()
for extension in ['svg', 'png']:
    fig.savefig(target / f'responsiveness.{extension}', dpi=160)
plt.close(fig)
for svg in target.glob('*.svg'):
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf8').splitlines()) + '\n', encoding='utf8')
