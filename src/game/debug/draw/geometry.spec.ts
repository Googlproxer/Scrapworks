import { compileDebugGeometry } from './geometry';
import { createNoopDebugDraw } from './noop';
import DebugCircle from './editor/debug-circle';
import DebugAxes from './editor/debug-axes';
import DebugBox from './editor/debug-box';

describe('debug geometry and production facade', () => {
  it('closes a cached 64-segment circle in centimetres and builds wire primitives', () => {
    const circle = compileDebugGeometry({ kind: 'circle', options: { radius: 3 } });
    expect(circle.lines[0]).toHaveLength(65);
    expect(circle.lines[0][0].asArray()).toEqual([300, 0, 0]);
    expect(circle.lines[0][64].equals(circle.lines[0][0])).toBe(true);
    expect(compileDebugGeometry({ kind: 'sphere', options: { radius: 1 } }).lines).toHaveLength(3);
    expect(
      compileDebugGeometry({ kind: 'box', options: { dimensions: { x: 1, y: 2, z: 3 } } }).lines,
    ).toHaveLength(12);
    expect(
      compileDebugGeometry({ kind: 'axes', options: { length: 1 } }).colors.map((line) =>
        line[0].asArray(),
      ),
    ).toEqual([
      [1, 68 / 255, 68 / 255, 1],
      [68 / 255, 1, 68 / 255, 1],
      [68 / 255, 136 / 255, 1, 1],
    ]);
  });

  it('normalizes rays, adds an arrow head, and rejects malformed shapes', () => {
    const options = { direction: { x: 10, y: 0, z: 0 }, length: 2 };
    expect(compileDebugGeometry({ kind: 'ray', options }).lines[0][1].asArray()).toEqual([
      200, 0, 0,
    ]);
    expect(compileDebugGeometry({ kind: 'arrow', options }).lines).toHaveLength(2);
    expect(() => compileDebugGeometry({ kind: 'circle', options: { radius: NaN } })).toThrow();
    expect(() =>
      compileDebugGeometry({
        kind: 'ray',
        options: { ...options, direction: { x: 0, y: 0, z: 0 } },
      }),
    ).toThrow();
    expect(() =>
      compileDebugGeometry({ kind: 'circle', options: { radius: 1, color: 'red' } }),
    ).toThrow();
  });

  it('keeps Editor inspector metadata independent between adapters', () => {
    const keys = (type: unknown) =>
      (type as { _VisibleInInspector: { propertyKey: string }[] })._VisibleInInspector.map(
        (item) => item.propertyKey,
      );

    expect(keys(DebugCircle)).toContain('radius');
    expect(keys(DebugCircle)).not.toContain('length');
    expect(keys(DebugAxes)).toContain('length');
    expect(keys(DebugAxes)).not.toContain('radius');
    expect(keys(DebugBox)).toContain('dimensions');
    expect(keys(DebugBox)).not.toContain('radius');
    expect(new Set(keys(DebugCircle)).size).toBe(keys(DebugCircle).length);
  });

  it('does not inspect the scene, owner or provider in the production implementation', () => {
    const callback = vi.fn();
    const manager = createNoopDebugDraw();
    const attachment = manager.attach(undefined!, {}, callback);
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    manager.configure({ enabled: true, disabledCategories: [] }, () => true);
    manager.bindWorld(() => {
      throw new Error('Must not read world');
    });
    attachment.setEnabled(true);
    attachment.clear();
    attachment.dispose();
    unsubscribe();
    manager.dispose();
    expect(callback).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({ available: false, categories: [] });
  });
});
