import type { ActionFrame } from '@contracts/input';

export const actionHeld = (frame: ActionFrame, name: string): boolean => {
  const action = frame.states[name];
  return action?.kind === 'button' && action.held;
};

export const actionPressed = (frame: ActionFrame, name: string): boolean => {
  const action = frame.states[name];
  return action?.kind === 'button' && action.pressed;
};
