import { Color4, Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { SCENE_UNITS_PER_METRE } from '@core/world-grid';
import type {
  DebugAxes,
  DebugBox,
  DebugCircle,
  DebugLine,
  DebugPoint,
  DebugRay,
  DebugSphere,
  DebugStyle,
} from './types';

export type DebugShape =
  | { kind: 'line'; options: DebugLine }
  | { kind: 'ray' | 'arrow'; options: DebugRay }
  | { kind: 'circle'; options: DebugCircle }
  | { kind: 'sphere'; options: DebugSphere }
  | { kind: 'box'; options: DebugBox }
  | { kind: 'axes'; options: DebugAxes };

export interface DebugGeometry {
  readonly lines: Vector3[][];
  readonly colors: Color4[][];
}

const samples = Array.from({ length: 64 }, (_, index) => {
  const angle = (index * Math.PI * 2) / 64;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const zero = { x: 0, y: 0, z: 0 };

function point(value: DebugPoint): Vector3 {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new Error('Nonfinite point');
  return new Vector3(value.x, value.y, value.z);
}

function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Dimension must be positive');
  return value;
}

function color(style: DebugStyle): Color4 {
  const hex = style.color ?? '#00ffff';
  const alpha = style.opacity ?? 1;
  if (!/^#[\da-f]{6}$/i.test(hex) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1)
    throw new Error('Invalid color or opacity');
  const rgb = Color3.FromHexString(hex);
  return new Color4(rgb.r, rgb.g, rgb.b, alpha);
}

/** Local geometry is in scene units; owner scale is deliberately applied nowhere. */
export function compileDebugGeometry(shape: DebugShape): DebugGeometry {
  const lines: Vector3[][] = [];
  const colors: Color4[][] = [];
  const tint = color(shape.options);

  const add = (vertices: Vector3[], lineColor = tint) => {
    lines.push(
      vertices.map((vertex) => {
        vertex.scaleInPlace(SCENE_UNITS_PER_METRE);
        if (!vertex.asArray().every(Number.isFinite))
          throw new Error('Geometry exceeds finite scene coordinates');
        return vertex;
      }),
    );
    colors.push(vertices.map(() => lineColor));
  };

  const circle = (center: DebugPoint, radius: number, plane: DebugCircle['plane']) => {
    const origin = point(center);
    positive(radius);
    if (!['xz', 'xy', 'yz'].includes(plane ?? 'xz')) throw new Error('Invalid circle plane');
    const vertices = samples.map(([a, b]) =>
      origin.add(
        plane === 'xy'
          ? new Vector3(a * radius, b * radius, 0)
          : plane === 'yz'
            ? new Vector3(0, a * radius, b * radius)
            : new Vector3(a * radius, 0, b * radius),
      ),
    );
    vertices.push(vertices[0].clone());
    add(vertices);
  };

  switch (shape.kind) {
    case 'line':
      add([point(shape.options.start), point(shape.options.end)]);
      break;
    case 'circle':
      circle(shape.options.center ?? zero, shape.options.radius, shape.options.plane);
      break;
    case 'sphere':
      for (const plane of ['xz', 'xy', 'yz'] as const)
        circle(shape.options.center ?? zero, shape.options.radius, plane);
      break;
    case 'ray':
    case 'arrow': {
      const origin = point(shape.options.origin ?? zero);
      const direction = point(shape.options.direction);
      positive(direction.length());
      direction.normalize();
      const length = positive(shape.options.length);
      const end = origin.add(direction.scale(length));
      add([origin, end.clone()]);
      if (shape.kind === 'arrow') {
        const head = length * 0.2;
        const side = Vector3.Cross(
          direction,
          Math.abs(direction.y) < 0.9 ? Vector3.Up() : Vector3.Right(),
        )
          .normalize()
          .scale(head * 0.5);
        const base = end.subtract(direction.scale(head));
        add([base.add(side), end.clone(), base.subtract(side)]);
      }
      break;
    }
    case 'box': {
      const center = point(shape.options.center ?? zero);
      const size = point(shape.options.dimensions);
      [size.x, size.y, size.z].forEach(positive);
      const corners = Array.from({ length: 8 }, (_, i) =>
        center.add(
          new Vector3(
            (i & 1 ? 0.5 : -0.5) * size.x,
            (i & 2 ? 0.5 : -0.5) * size.y,
            (i & 4 ? 0.5 : -0.5) * size.z,
          ),
        ),
      );
      for (let i = 0; i < 8; i++)
        for (const bit of [1, 2, 4])
          if (!(i & bit)) add([corners[i].clone(), corners[i | bit].clone()]);
      break;
    }
    case 'axes': {
      const origin = point(shape.options.origin ?? zero);
      const length = positive(shape.options.length);
      for (const [axis, hex] of [
        [Vector3.Right(), '#ff4444'],
        [Vector3.Up(), '#44ff44'],
        [Vector3.Forward(), '#4488ff'],
      ] as const)
        add(
          [origin.clone(), origin.add(axis.scale(length))],
          color({ color: hex, opacity: shape.options.opacity }),
        );
      break;
    }
  }
  return { lines, colors };
}
