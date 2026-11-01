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
import { TEST_BUILDING_FOOTPRINT, validatePlacement } from '@simulation/placement';
import { PlayerMotor, type MovementIntent } from '@simulation/player-motor';
import { FIXED_STEP_SECONDS } from '@simulation/world-rules';
import type { PlayerState } from '@simulation/world-state';
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
  private commands: WorldCommand[] = [];
  private lastCommandResult: CommandResult | null = null;
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
    for (const command of this.commands) {
      const result = validatePlacement(
        this.definition,
        this.view,
        command.cell,
        command.rotation,
        true,
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
  public assertMatches(actual: WorldView): void {
    const canonical = (view: WorldView) => ({
      ...view,
      deposits: [...view.deposits].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      buildings: [...view.buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    });
    assert.deepEqual(canonical(actual), canonical(this.view));
  }
}
