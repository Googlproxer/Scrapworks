import { Simulation } from '@simulation/simulation';
import { NotificationCenter } from './notifications';
import { OpeningFeedback } from './opening-feedback';

describe('Opening notifications', () => {
  it('surfaces shortages/rejections once per transition, resolves waiting and reports research completion', () => {
    const simulation = new Simulation({
      version: 1,
      id: 'notices',
      grid: { origin: { x: 0, z: 0 }, columns: 1, rows: 1, metresPerCell: 2 },
      terrain: ['soil'],
      spawn: { x: 1, y: 0, z: 1 },
      deposits: [],
      blockers: [],
    });
    const center = new NotificationCenter();
    try {
      const feedback = new OpeningFeedback(center);
      const view = structuredClone(simulation.view);
      feedback.update(view);
      expect(center.visible()).toEqual([]);
      const rejected = {
        ...view,
        lastCommandResult: { accepted: false, reason: 'missing-input' as const },
      };
      feedback.update(rejected);
      feedback.update(structuredClone(rejected));
      expect(center.visible()).toHaveLength(1);
      expect(center.visible()[0].message).toContain('required materials');
      view.opening!.state.fieldTechnology = 'improvised-tools';
      view.opening!.state.fieldEnabled = true;
      feedback.update(view);
      expect(center.visible().some((n) => n.key === 'research-wait')).toBe(true);
      view.opening!.state.fieldEnabled = false;
      feedback.update(view);
      expect(center.visible().some((n) => n.key === 'research-wait')).toBe(false);
      view.opening!.state.message = 'Improvised tools researched. Its recipes are now available.';
      feedback.update(view);
      feedback.update(structuredClone(view));
      expect(center.visible().filter((n) => n.title === 'Research complete')).toHaveLength(1);
      view.opening!.state.message = 'Batch stopped: the next unit needs materials or space.';
      feedback.update(view);
      expect(center.visible().at(-1)?.tone).toBe('warning');
    } finally {
      center.destroy();
      simulation.dispose();
    }
  });
});
