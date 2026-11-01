import type { DebugDrawFactory } from './types';
import { createNoopDebugDraw } from './noop';

export const createDebugDraw: DebugDrawFactory = createNoopDebugDraw;
