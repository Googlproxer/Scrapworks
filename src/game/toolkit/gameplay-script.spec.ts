import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { SceneManager } from '@babylonjs-toolkit/next/scenemanager';
import type { GameTickContext, GameTickHandler } from '@contracts/game-tick';
import { attachScriptsInOrder } from './attach-scripts-in-order';
import { GameplayScript, type GameplayScriptOptions } from './gameplay-script';

class TickSource {
  public readonly handlers = new Set<GameTickHandler>();
  public readonly registerCompletedTickHandler = vi.fn(
    (handler: GameTickHandler, order?: number) => {
      void order;
      this.handlers.add(handler);
      return () => this.handlers.delete(handler);
    },
  );

  public emit(
    context: GameTickContext = {
      tick: 1,
      deltaSeconds: 0.05,
      phase: 'completed',
      generation: 1,
      publishedTick: 1,
      publication: 1,
    },
  ): void {
    for (const handler of [...this.handlers]) handler(context);
  }
}

class RecordingScript extends GameplayScript {
  public onUpdateAction?: () => void;
  public onTickAction?: () => void;

  constructor(
    transform: TransformNode,
    scene: Scene,
    private readonly events: string[],
    private readonly name: string,
    options: GameplayScriptOptions = {},
  ) {
    super(transform, scene, options, name);
  }

  protected override onStart(): void {
    this.events.push(`${this.name}:start`);
  }

  protected override onUpdate(): void {
    this.events.push(`${this.name}:update`);
    this.onUpdateAction?.();
  }

  protected override onLateUpdate(): void {
    this.events.push(`${this.name}:late`);
  }

  protected override onGameTick(context: GameTickContext): void {
    this.events.push(`${this.name}:tick:${context.tick}`);
    this.onTickAction?.();
  }

  protected override onDestroy(): void {
    this.events.push(`${this.name}:destroy`);
  }
}

describe('GameplayScript with native Toolkit lifecycle', () => {
  let engine: NullEngine;
  let scene: Scene;
  let events: string[];
  let ticks: TickSource;
  let previousPlaying: boolean;

  beforeEach(() => {
    previousPlaying = SceneManager.ScenePlaying;
    SceneManager.ScenePlaying = true;
    engine = new NullEngine();
    scene = new Scene(engine);
    new FreeCamera('camera', Vector3.Zero(), scene);
    events = [];
    ticks = new TickSource();
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
    SceneManager.ScenePlaying = previousPlaying;
    vi.restoreAllMocks();
  });

  function script(name = 'player', options: GameplayScriptOptions = {}): RecordingScript {
    return new RecordingScript(new TransformNode(name, scene), scene, events, name, {
      ticks,
      ...options,
    });
  }

  function initialize(): void {
    scene.render(); // Toolkit awakens components on their first frame.
    scene.render(); // Toolkit starts components on their second frame.
  }

  it('attaches once in explicit order and runs without physics or global runtime initialization', () => {
    const initializeRuntime = vi.spyOn(SceneManager, 'InitializeRuntime');
    const later = script('later');
    const earlier = script('earlier');
    const registrations = [
      { script: later, order: 20 },
      { script: earlier, order: 10 },
    ];
    attachScriptsInOrder(registrations);
    attachScriptsInOrder(registrations);
    expect(earlier.initialized).toBe(false);
    scene.render();
    expect(events).toEqual([]);
    expect(ticks.handlers.size).toBe(0);
    scene.render();
    expect(events).toEqual(['earlier:start', 'later:start']);
    expect(earlier.initialized).toBe(true);
    expect(ticks.handlers.size).toBe(2);
    events.length = 0;
    scene.render();
    expect(events).toEqual(['earlier:update', 'later:update', 'earlier:late', 'later:late']);
    expect(scene.getPhysicsEngine()).toBeNull();
    expect(initializeRuntime).not.toHaveBeenCalled();
  });

  it('registers tick hooks on start with their explicit order and never advances them from render', () => {
    const player = script('player', { tickOrder: -10 });
    player.attach();
    initialize();
    expect(ticks.registerCompletedTickHandler).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      -10,
    );
    events.length = 0;
    scene.render();
    expect(events).toEqual(['player:update', 'player:late']);
    ticks.emit({
      tick: 7,
      deltaSeconds: 0.05,
      phase: 'completed',
      generation: 1,
      publishedTick: 7,
      publication: 7,
    });
    ticks.emit({
      tick: 8,
      deltaSeconds: 0.05,
      phase: 'completed',
      generation: 1,
      publishedTick: 8,
      publication: 8,
    });
    expect(events.slice(-2)).toEqual(['player:tick:7', 'player:tick:8']);
  });

  it('does not register render-only components for gameplay ticks', () => {
    class RenderOnlyScript extends GameplayScript {
      protected override onUpdate(): void {
        events.push('render');
      }
    }
    const visual = new RenderOnlyScript(new TransformNode('visual', scene), scene, { ticks });
    visual.attach();
    initialize();
    scene.render();
    expect(events).toEqual(['render']);
    expect(ticks.registerCompletedTickHandler).not.toHaveBeenCalled();
  });

  it('gates disabled components and ancestors while keeping tick subscriptions unique', () => {
    const parent = new TransformNode('parent', scene);
    const player = script();
    player.transform.parent = parent;
    player.attach();
    initialize();
    events.length = 0;
    for (const disable of [
      () => (player.enabled = false),
      () => player.transform.setEnabled(false),
      () => parent.setEnabled(false),
    ]) {
      disable();
      scene.render();
      ticks.emit();
      expect(events).toEqual([]);
      player.enabled = true;
      player.transform.setEnabled(true);
      parent.setEnabled(true);
    }
    scene.render();
    ticks.emit();
    expect(events).toEqual(['player:update', 'player:late', 'player:tick:1']);
    expect(ticks.registerCompletedTickHandler).toHaveBeenCalledTimes(1);
  });

  it('keeps presentation updating when gameplay is suspended and rejects obsolete frame work', () => {
    let active = false;
    let current = true;
    const player = script('player', {
      isGameplayActive: () => active,
      isCurrent: () => current,
    });
    player.attach();
    initialize();
    events.length = 0;
    scene.render();
    ticks.emit();
    expect(events).toEqual(['player:update', 'player:late']);
    active = true;
    ticks.emit();
    expect(events.at(-1)).toBe('player:tick:1');
    events.length = 0;
    player.onUpdateAction = () => (current = false);
    scene.render();
    ticks.emit();
    expect(events).toEqual(['player:update']);
  });

  it('honors Toolkit scene suspension for gameplay ticks as well as frame hooks', () => {
    const player = script();
    player.attach();
    initialize();
    events.length = 0;
    SceneManager.ScenePlaying = false;
    scene.render();
    ticks.emit();
    expect(events).toEqual([]);
    SceneManager.ScenePlaying = true;
    ticks.emit();
    expect(events).toEqual(['player:tick:1']);
  });

  it.each(['component', 'node', 'scene'] as const)(
    'unregisters native hooks and ticks when the %s is disposed',
    (owner) => {
      const player = script();
      player.attach();
      initialize();
      const transform = player.transform;
      expect(SceneManager.GetComponent(transform, 'player')).toBe(player);
      events.length = 0;
      if (owner === 'component') player.dispose();
      if (owner === 'node') transform.dispose();
      if (owner === 'scene') scene.dispose();
      player.dispose();
      ticks.emit();
      if (!scene.isDisposed) scene.render();
      expect(events).toEqual(['player:destroy']);
      expect(player.initialized).toBe(false);
      expect(ticks.handlers.size).toBe(0);
      expect(SceneManager.GetComponent(transform, 'player')).toBeNull();
    },
  );

  it('cleans up a component disposed before its first native start', () => {
    const player = script();
    player.attach();
    player.dispose();
    player.attach();
    initialize();
    ticks.emit();
    expect(events).toEqual(['player:destroy']);
    expect(ticks.registerCompletedTickHandler).not.toHaveBeenCalled();
  });

  it('stops a later tick callback when an earlier callback invalidates the world', () => {
    let current = true;
    const first = script('first', { isCurrent: () => current });
    const second = script('second', { isCurrent: () => current });
    first.onTickAction = () => (current = false);
    attachScriptsInOrder([
      { script: first, order: 1 },
      { script: second, order: 2 },
    ]);
    initialize();
    events.length = 0;
    ticks.emit();
    expect(events).toEqual(['first:tick:1']);
  });
});
