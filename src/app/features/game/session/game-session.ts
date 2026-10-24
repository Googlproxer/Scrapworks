import type { GameTickContext, GameTickHandler } from '@contracts/game-tick';
import type { WorldCommand, WorldDefinition, WorldView } from '@contracts/world';
import { FIXED_STEP_SECONDS, Simulation } from '@simulation/simulation';

interface TickRegistration {
  readonly handler: GameTickHandler;
  readonly order: number;
  readonly sequence: number;
  active: boolean;
}

/** One application scheduler advanced by the renderer's existing frame source. */
export class GameSession {
  private readonly simulation: Simulation;
  private readonly tickHandlers = new Set<TickRegistration>();
  private completedView: WorldView;
  private nextSequence = 0;
  private revision = 0;
  private advancing = false;
  private failure?: { readonly cause: unknown };
  private accumulator = 0;
  private userPaused = false;
  private movement = { x: 0, z: 0, sprint: false };

  constructor(definition: WorldDefinition, options: { developerFixture?: boolean } = {}) {
    this.simulation = new Simulation(definition, options);
    this.completedView = this.simulation.view;
  }

  /** A failed session remains readable, but only a new session can advance again. */
  public get failed(): boolean {
    return this.failure !== undefined;
  }

  /** Runs before the step's commands and motor, in ascending order and then attachment order. */
  public registerTickHandler(handler: GameTickHandler, order = 0): () => void {
    if (!Number.isFinite(order)) throw new Error('Game tick order must be finite.');
    const registration = { handler, order, sequence: this.nextSequence++, active: true };
    this.tickHandlers.add(registration);
    return () => {
      registration.active = false;
      this.tickHandlers.delete(registration);
    };
  }

  public advance(deltaSeconds: number): void {
    if (this.userPaused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.failure) throw this.failure.cause;
    if (this.advancing) throw new Error('A gameplay step cannot recursively advance its session.');
    this.accumulator = Math.min(this.accumulator + deltaSeconds, FIXED_STEP_SECONDS * 5);
    this.advancing = true;
    const revision = this.revision;
    try {
      let steps = 0;
      while (this.accumulator + 1e-10 >= FIXED_STEP_SECONDS && steps++ < 5) {
        const context: GameTickContext = Object.freeze({
          tick: this.completedView.tick + 1,
          deltaSeconds: FIXED_STEP_SECONDS,
        });
        const handlers = [...this.tickHandlers].sort(
          (a, b) => a.order - b.order || a.sequence - b.sequence,
        );
        for (const registration of handlers) {
          if (registration.active) registration.handler(context);
          if (this.userPaused || revision !== this.revision) {
            this.accumulator = 0;
            return;
          }
        }
        this.simulation.step(this.movement);
        this.completedView = this.simulation.view;
        this.accumulator = Math.max(0, this.accumulator - FIXED_STEP_SECONDS);
      }
    } catch (cause) {
      this.failure = { cause };
      this.resetTiming();
      this.clearInput();
      throw cause;
    } finally {
      this.advancing = false;
    }
  }

  public setMovement(direction: { readonly x: number; readonly z: number }, sprint = false): void {
    if (this.userPaused || this.failed) return;
    this.movement = { ...direction, sprint };
  }

  public setPaused(paused: boolean): void {
    if (this.userPaused === paused) return;
    this.userPaused = paused;
    this.resetTiming();
    this.clearInput();
  }

  public pause(paused = true): void {
    this.setPaused(paused);
  }
  public resetTiming(): void {
    this.revision++;
    this.accumulator = 0;
  }

  public clearInput(): void {
    this.revision++;
    this.movement = { x: 0, z: 0, sprint: false };
    this.simulation.clearInput();
    if (!this.failed) this.completedView = this.simulation.view;
  }

  public enqueue(command: WorldCommand): void {
    if (!this.userPaused && !this.failed) this.simulation.enqueue(command);
  }
  public get view(): WorldView {
    return structuredClone(this.completedView);
  }
  public get current(): WorldView {
    return this.view;
  }
}
