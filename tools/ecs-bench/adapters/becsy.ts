import { Base } from '../base.ts';
import { complete } from '../model.ts';
import type { Fixture, Payload, Projection, RecordData, Snapshot } from '../model.ts';
import type { Entity, System as SystemType, World as WorldType } from '@lastolivegames/becsy';

export function preloadBecsy(checked: boolean) {
  return checked
    ? import('@lastolivegames/becsy/lib/index.js')
    : import('@lastolivegames/becsy/lib/perf.js');
}

export async function createBecsy(
  fixture: Fixture,
  snapshot?: Snapshot,
  checked = false,
): Promise<Base> {
  // Root main is UMD under type:module; /perf is absent in the 0.16.1 tarball.
  const { System, Type, World } = await preloadBecsy(checked);
  // Becsy binds component types to a world. Fresh classes are required on rebuild.
  class Data {
    public static schema = { value: Type.object };
    declare public value: Payload;
  }
  class Hot {
    public static schema = { work: Type.float64, charge: Type.float64, quantity: Type.float64 };
    declare public work: number;
    declare public charge: number;
    declare public quantity: number;
  }
  class Active {}
  class Advance extends System {
    public readonly moving = this.query((q) => q.current.with(Data, Hot, Active).write);
    public readonly privileges = this.query((q) => q.usingAll.write.create.update);
    public override execute(): void {
      adapter.builder = this;
      const start = performance.now();
      if (adapter.advancing) {
        for (const entity of this.moving.current) {
          const payload = entity.write(Data).value;
          const hot = entity.write(Hot);
          hot.work = hot.work <= 1 ? complete(payload, adapter.resources) : hot.work - 1;
          hot.charge = hot.charge > 0 ? hot.charge - 1 : 1200;
          adapter.dirtyEntity(payload.ordinal);
        }
      }
      if (adapter.advancing) adapter.phases.systems = performance.now() - start;
      adapter.action?.();
      adapter.builder = undefined;
    }
  }
  class Becsy extends Base {
    private handles: Entity[] = [];
    public builder?: SystemType;
    public advancing = false;
    public action?: () => void;
    public constructor(private readonly world: WorldType) {
      super(fixture, snapshot);
      this.world.build((system) => {
        this.builder = system;
        this.initialize(snapshot);
        this.builder = undefined;
      });
    }
    public dirtyEntity(ordinal: number): void {
      this.mark(ordinal);
    }
    protected insert(record: RecordData): void {
      const entity = this.builder!.createEntity(Data, { value: record.payload }, Hot, {
        work: record.work,
        charge: record.charge,
        quantity: record.quantity,
      });
      if (record.payload.kind === 'processor' && record.payload.status === 0) entity.add(Active);
      this.handles[record.payload.ordinal] = entity.hold();
    }
    protected remove(ordinal: number): void {
      this.handles[ordinal].delete();
      delete this.handles[ordinal];
    }
    protected read(ordinal: number): RecordData {
      const entity = this.handles[ordinal];
      const payload = entity.read(Data).value;
      const hot = entity.read(Hot);
      return { payload, work: hot.work, charge: hot.charge, quantity: hot.quantity };
    }
    protected membership(ordinal: number, active: boolean): void {
      if (active) this.handles[ordinal].add(Active);
      else this.handles[ordinal].remove(Active);
    }
    protected quantity(ordinal: number, value: number): void {
      this.handles[ordinal].write(Hot).quantity = value;
    }
    protected systems(): Promise<void> {
      return this.world.execute(this.resources.tick * 0.05, 0.05);
    }
    private async perform(action: () => void, advancing = false): Promise<void> {
      this.action = action;
      this.advancing = advancing;
      try {
        await this.systems();
      } finally {
        this.action = undefined;
        this.advancing = false;
        this.builder = undefined;
      }
    }
    public override step(): Promise<void> {
      if (this.disposed) return Promise.reject(new Error('Disposed benchmark world'));
      return this.perform(() => this.commit(), true);
    }
    public override async project(full = false): Promise<Projection> {
      let value!: Projection;
      await this.perform(() => {
        value = this.projectNow(full);
      });
      return value;
    }
    public override async capture(): Promise<Snapshot> {
      let value!: Snapshot;
      await this.perform(() => {
        value = this.captureNow();
      });
      return value;
    }
    public override grow(size: number): Promise<void> {
      return this.perform(() => {
        super.grow(size);
      });
    }
    public override probe(): Promise<void> {
      return this.perform(() => {
        super.probe();
      });
    }
    protected shutdown(): Promise<void> {
      this.handles = [];
      return this.world.terminate();
    }
  }
  const capacity = fixture.capacity ?? fixture.size * 2;
  const world = await World.create({
    defs: [Data, Hot, Active, Advance],
    maxEntities: capacity,
    maxShapeChangesPerFrame: Math.max(10000, capacity * 6),
    maxWritesPerFrame: Math.max(10000, capacity * 4),
  });
  const adapter = new Becsy(world);
  return adapter;
}
