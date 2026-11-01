import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import {
  visibleAsBoolean,
  visibleAsColor3,
  visibleAsNumber,
  visibleAsString,
  visibleAsVector3,
} from 'babylonjs-editor-tools';
import type { DebugDrawWriter } from '../types';
import { DebugShapeScript } from './shape-script';

export default class DebugBox extends DebugShapeScript {
  @visibleAsBoolean('Drawing enabled') public enabled = true;
  @visibleAsString('Category') public category = 'general';
  @visibleAsBoolean('World-space coordinates') public worldSpace = false;
  @visibleAsBoolean('Respect scenery depth') public depthTest = true;
  @visibleAsColor3('Color') public color = new Color3(0, 1, 1);
  @visibleAsNumber('Opacity', { min: 0, max: 1 }) public opacity = 1;
  @visibleAsVector3('Offset (m)') public offset = new Vector3();
  @visibleAsVector3('Full dimensions (m)', { min: 0.001 }) public dimensions = new Vector3(1, 1, 1);

  protected override draw(draw: DebugDrawWriter): void {
    draw.box('shape', { center: this.offset, dimensions: this.dimensions, ...this.style });
  }
}
