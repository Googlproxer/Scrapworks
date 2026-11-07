import type { Injector, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { GameState } from '@contracts/game-state';
import { filter, firstValueFrom, type Observable } from 'rxjs';

/** Subscribe before the action when the transition can complete synchronously. */
export async function waitForGameState(
  source: Observable<GameState>,
  expected: Pick<GameState, 'sceneKey' | 'phase'>,
): Promise<GameState> {
  const matches = (state: GameState) =>
    state.sceneKey === expected.sceneKey && state.phase === expected.phase;

  const state = await firstValueFrom(
    source.pipe(filter((state) => matches(state) || ['error', 'stopped'].includes(state.phase))),
  );
  if (!matches(state))
    throw new Error(`Expected ${JSON.stringify(expected)}; received ${JSON.stringify(state)}`);
  return state;
}

/** Angular schedules the observation; the fixture injector owns the effect's teardown. */
export function waitForSignal<T>(
  source: Signal<T>,
  predicate: (value: T) => boolean,
  injector: Injector,
): Promise<T> {
  return firstValueFrom(toObservable(source, { injector }).pipe(filter(predicate)));
}
