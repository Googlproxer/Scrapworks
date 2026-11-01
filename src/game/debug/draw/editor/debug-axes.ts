import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import {
  visibleAsBoolean,
  visibleAsNumber,
  visibleAsString,
  visibleAsVector3,
} from 'babylonjs-editor-tools';
import type { DebugDrawWriter } from '../types';
import { DebugShapeScript } from './shape-script';

export default class DebugAxes extends DebugShapeScript {
  @visibleAsBoolean('Drawing enabled') public enabled = true;
  @visibleAsString('Category') public category = 'transforms';
  @visibleAsBoolean('World-space coordinates') public worldSpace = false;
  @visibleAsBoolean('Respect scenery depth') public depthTest = true;
  public color = new Color3(0, 1, 1);
  @visibleAsNumber('Opacity', { min: 0, max: 1 }) public opacity = 1;
  @visibleAsVector3('Offset (m)') public offset = new Vector3();
  @visibleAsNumber('Length (m)', { min: 0.001 }) public length = 1;

  protected override draw(draw: DebugDrawWriter): void {
    draw.axes('shape', { origin: this.offset, length: this.length, opacity: this.opacity });
  }
}
