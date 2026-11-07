import type { GameState } from '@contracts/game-state';
import { Subject } from 'rxjs';
import { waitForGameState } from './wait-for-state';

describe('event-based game-state waits', () => {
  it('captures a synchronous transition and releases its subscription', async () => {
    const states = new Subject<GameState>();
    const waiting = waitForGameState(states, { sceneKey: 'Game', phase: 'ready' });
    expect(states.observed).toBe(true);
    states.next({ sceneKey: 'Game', phase: 'loading', errorMessage: null });
    const ready: GameState = { sceneKey: 'Game', phase: 'ready', errorMessage: null };
    states.next(ready);
    // A subsequent re-entrant transition must not hide the event already captured.
    states.next({ sceneKey: 'MainMenu', phase: 'loading', errorMessage: null });
    expect(await waiting).toBe(ready);
    expect(states.observed).toBe(false);
  });

  it('fails on an unexpected terminal state and releases its subscription', async () => {
    const states = new Subject<GameState>();
    const waiting = expect(
      waitForGameState(states, { sceneKey: 'Game', phase: 'ready' }),
    ).rejects.toThrow('Asset failed');
    states.next({ sceneKey: 'Game', phase: 'error', errorMessage: 'Asset failed' });
    await waiting;
    expect(states.observed).toBe(false);
  });

  it('allows a terminal state when that is the expected event', async () => {
    const states = new Subject<GameState>();
    const waiting = waitForGameState(states, { sceneKey: null, phase: 'stopped' });
    states.next({ sceneKey: null, phase: 'stopped', errorMessage: null });
    expect(await waiting).toMatchObject({ phase: 'stopped' });
    expect(states.observed).toBe(false);
  });

  it('settles a pending wait when its owner completes the stream', async () => {
    const states = new Subject<GameState>();
    const waiting = expect(
      waitForGameState(states, { sceneKey: 'Game', phase: 'ready' }),
    ).rejects.toThrow('no elements');
    states.complete();
    await waiting;
    expect(states.observed).toBe(false);
  });
});
