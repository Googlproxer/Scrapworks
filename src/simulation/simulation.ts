import type { CommandResult, WorldCommand, WorldDefinition, WorldView } from '@contracts/world';
import { assertWorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { TEST_BUILDING_FOOTPRINT, validatePlacement } from './placement';
import { PlayerMotor, type MovementIntent } from './player-motor';
import { FIXED_STEP_SECONDS } from './world-rules';
import type { WorldState } from './world-state';
export type { MovementIntent } from './player-motor';
export { FIXED_STEP_SECONDS, PLAYER_RADIUS, SPRINT_SPEED, WALK_SPEED } from './world-rules';

/** One owner of authoritative mutable world data. This is not a gameplay-save codec. */
export class Simulation {
  public readonly definition: WorldDefinition;
  private readonly state: WorldState;
  private readonly playerMotor: PlayerMotor;
  private commands: WorldCommand[] = [];
  private lastCommandResult: CommandResult | null = null;
  private readonly developerFixture: boolean;

  constructor(definition: WorldDefinition, options: { developerFixture?: boolean } = {}) {
    assertWorldDefinition(definition);
    this.definition = structuredClone(definition);
    const freeze = (value: unknown): void => {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    };
    freeze(this.definition);
    this.state = {
      worldId: definition.id,
      tick: 0,
      stepSeconds: FIXED_STEP_SECONDS,
      nextEntityId: 1,
      player: { position: { ...definition.spawn }, facing: 0, moving: false, sprinting: false },
      inventory: {},
      equipment: [],
      research: [],
      productionTotals: {},
      deposits: structuredClone([...definition.deposits]),
      buildings: [],
    };
    this.developerFixture = options.developerFixture ?? false;
    this.playerMotor = new PlayerMotor(this.definition, this.state.player, this.state.buildings);
  }

  public enqueue(command: WorldCommand): void {
    this.commands.push(structuredClone(command));
  }

  public clearInput(): void {
    this.commands = [];
    this.playerMotor.clearInput();
  }

  public step(movement: MovementIntent): void {
    // Commands observe the completed previous step, then movement advances, then the view publishes.
    for (const command of this.commands) {
      if (command.type !== 'place' || command.buildingId !== 'test-building') {
        this.lastCommandResult = { accepted: false, reason: 'unknown-command' };
        continue;
      }
      const result = validatePlacement(
        this.definition,
        this.view,
        command.cell,
        command.rotation,
        this.developerFixture,
      );
      this.lastCommandResult = { accepted: result.valid, reason: result.reason };
      if (result.valid) {
        const ids = new Set(
          [...this.definition.blockers, ...this.state.deposits, ...this.state.buildings].map(
            (entity) => entity.id,
          ),
        );
        while (ids.has(`building-${this.state.nextEntityId}`)) this.state.nextEntityId++;
        this.state.buildings.push({
          id: `building-${this.state.nextEntityId++}`,
          buildingId: 'test-building',
          cell: { ...command.cell },
          position: cellCenter(this.definition.grid, command.cell),
          footprint: { ...TEST_BUILDING_FOOTPRINT },
          rotation: command.rotation,
        });
      }
    }
    this.commands = [];
    this.playerMotor.step(movement);
    this.state.tick++;
  }

  public get view(): WorldView {
    return {
      ...structuredClone(this.state),
      lastCommandResult: this.lastCommandResult ? { ...this.lastCommandResult } : null,
    };
  }
}
