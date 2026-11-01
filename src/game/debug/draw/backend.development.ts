import { DevelopmentDebugDraw } from './development-renderer';
import type { DebugDrawFactory } from './types';

export const createDebugDraw: DebugDrawFactory = (scene) => new DevelopmentDebugDraw(scene);
