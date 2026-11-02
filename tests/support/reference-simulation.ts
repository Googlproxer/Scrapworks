/** Node-only movement/placement oracle, retained from 421cc28 before ECS adoption.
 * Plain object storage is independent of Miniplex; domain/motor rules are shared.
 * This executable fixture is never a production backend. */
import assert from 'node:assert/strict';
import type {
  BuildingView,
  CommandResult,
  DepositDefinition,
  WorldCommand,
  WorldDefinition,
  WorldView,
} from '@contracts/world';
import { assertWorldDefinition } from '@contracts/world';
import { cellCenter } from '@core/world-grid';
import { entityCollider } from '@core/world-collision';
import { TEST_BUILDING_FOOTPRINT, validatePlacement } from '@simulation/placement';
import { PlayerMotor, type MovementIntent } from '@simulation/player-motor';
import { FIXED_STEP_SECONDS } from '@simulation/world-rules';
import type { PlayerState } from '@simulation/world-state';
import { WorldPhysics } from '@simulation/physics/world-physics';
interface ReferenceState {
  worldId: string;
  tick: number;
  stepSeconds: number;
  nextEntityId: number;
  player: PlayerState;
  inventory: Record<string, number>;
  equipment: string[];
  research: string[];
  productionTotals: Record<string, number>;
  deposits: DepositDefinition[];
  buildings: BuildingView[];
}
export class ReferenceSimulation {
  public readonly definition: WorldDefinition;
  private readonly state: ReferenceState;
  private readonly playerMotor: PlayerMotor;
  private readonly physics: WorldPhysics;
  private commands: WorldCommand[] = [];
  constructor(definition: WorldDefinition) {
    assertWorldDefinition(definition);
    this.definition = structuredClone(definition);
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
    this.physics = new WorldPhysics(this.definition, 'player', this.state.player.position);
    this.playerMotor = new PlayerMotor(this.state.player, this.physics);
    this.syncCollision();
  }

  private syncCollision(): void {
    const colliders = [
      ...this.definition.blockers,
      ...this.state.deposits.filter((deposit) => deposit.quantity > 0),
      ...this.state.buildings,
    ].map((entity) => ({ ...entityCollider(this.definition.grid, entity), id: entity.id }));
    for (let row = 0; row < this.definition.grid.rows; row++)
      for (let column = 0; column < this.definition.grid.columns; column++)
        if (this.definition.terrain[row * this.definition.grid.columns + column] === 'water')
          colliders.push({
            id: `water:${column}:${row}`,
            shape: 'box',
            center: cellCenter(this.definition.grid, { row, column }),
            width: this.definition.grid.metresPerCell,
            depth: this.definition.grid.metresPerCell,
            height: 1,
          });
    this.physics.syncStatic(colliders);
  }
  public enqueue(command: WorldCommand): void {
    this.commands.push(structuredClone(command));
  }
  public clearInput(): void {
    this.commands = [];
    this.playerMotor.clearInput();
  }
  public dispose(): void {
    this.physics.dispose();
  }
  public step(movement: MovementIntent): void {
    for (const command of this.commands) {
      if (command.type !== 'place') continue;
      const result = validatePlacement(
        this.definition,
        this.view,
        command.cell,
        command.rotation,
        true,
      );
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
    this.syncCollision();
    this.playerMotor.step(movement, this.state.tick);
    this.state.tick++;
  }
  public get view(): WorldView {
    return {
      ...structuredClone(this.state),
    };
  }
  public assertMatches(actual: WorldView): void {
    const canonical = (view: WorldView) => ({
      ...view,
      deposits: [...view.deposits].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      buildings: [...view.buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    });
    const movementOnly = { ...actual };
    delete movementOnly.opening;
    delete movementOnly.ground;
    delete movementOnly.bodies;
    assert.deepEqual(canonical(movementOnly), canonical(this.view));
  }
}
