import { editableView } from '../../../testing/editable-view';
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
      const view = editableView(simulation.view);
      feedback.update(view);
      expect(center.visible()).toEqual([]);
      const rejected = {
        generation: 1,
        id: 1,
        tick: 1,
        event: {
          kind: 'command-result' as const,
          acknowledgement: {
            sequence: 1,
            tick: 1,
            result: { accepted: false, reason: 'missing-input' as const },
          },
        },
      };
      feedback.handle(rejected);
      feedback.handle({ ...rejected, id: 2 });
      expect(center.visible()).toHaveLength(1);
      expect(center.visible()[0].message).toContain('required materials');
      view.opening!.state.fieldEnabled = true;
      view.opening!.state.researchQueue = ['material-recovery'];
      feedback.update(view);
      expect(center.visible().some((n) => n.key === 'research-wait')).toBe(false);
      view.opening!.state.researchQueue = ['improvised-tools'];
      feedback.update(view);
      expect(center.visible().some((n) => n.key === 'research-wait')).toBe(false);
      view.opening!.extracted = { scrap: 4 };
      feedback.update(view);
      expect(center.visible().some((n) => n.key === 'research-wait')).toBe(true);
      view.opening!.state.fieldEnabled = false;
      feedback.update(view);
      expect(center.visible().some((n) => n.key === 'research-wait')).toBe(false);
      feedback.handle({
        generation: 1,
        id: 3,
        tick: 2,
        event: { kind: 'research-completed', technology: 'improvised-tools' },
      });
      expect(center.visible().filter((n) => n.title === 'Research complete')).toHaveLength(1);
      feedback.handle({
        generation: 1,
        id: 4,
        tick: 2,
        event: { kind: 'handcraft-ended', recipe: 'metal-plate', reason: 'stock-or-space' },
      });
      expect(center.visible().at(-1)?.tone).toBe('warning');
    } finally {
      center.destroy();
      simulation.dispose();
    }
  });
});
