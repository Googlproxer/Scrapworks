import { Vector2 } from '@babylonjs/core';
import type { ButtonControl, Vector2Binding } from '../bindings';
import { clampVector, controlId, deadzone, stickId } from './evaluator.helpers';
import type { ActionFrame, ActionState, Context, RawInput, Rules } from './evaluator.types';

export class ActionEvaluator {
  private raw: RawInput = {
    down: new Set(),
    sticks: { left: Vector2.Zero(), right: Vector2.Zero() },
  };

  private context: Context | null = null;
  private revision = 0;
  private states: Record<string, ActionState> = {};

  private blockedButtons = new Set<string>();
  private readonly blockedSticks = new Set<string>();

  public get currentContext() {
    return this.context;
  }

  constructor(private readonly rules: Readonly<Record<Context, Rules>>) {}

  public setContext(context: Context | null): void {
    if (context === this.context) return;

    this.context = context;
    this.revision++;

    // Cancel previous actions without generating release events.
    this.states = {};

    // Held buttons must be released before the new context can use them.
    this.blockedButtons = new Set(this.raw.down);
    this.blockedSticks.clear();

    if (context !== null) {
      for (const rule of Object.values(this.rules[context])) {
        if (rule.kind !== 'vector2') continue;

        for (const binding of rule.bindings) {
          if (binding.kind === 'stick2d') {
            this.blockedSticks.add(stickId(binding));
          }
        }
      }
    }

    // Centred sticks immediately become available.
    this.sample(this.raw);
  }

  public sample(raw: RawInput): void {
    this.raw = raw;

    for (const id of this.blockedButtons) {
      if (!raw.down.has(id)) this.blockedButtons.delete(id);
    }

    if (this.context === null) return;

    for (const [name, rule] of Object.entries(this.rules[this.context])) {
      if (rule.kind === 'button') {
        const held = rule.bindings.some((control) => this.isDown(control));

        const previous = this.states[name];
        const old = previous?.kind === 'button' ? previous : undefined;

        this.states[name] = {
          kind: 'button',
          held,
          pressed: (old?.pressed ?? false) || (!(old?.held ?? false) && held),
          released: (old?.released ?? false) || ((old?.held ?? false) && !held),
        };
      } else {
        let value = Vector2.Zero();

        for (const binding of rule.bindings) {
          const candidate = this.vector(binding);

          if (Math.hypot(candidate.x, candidate.y) > Math.hypot(value.x, value.y)) {
            value = candidate;
          }
        }

        this.states[name] = { kind: 'vector2', value };
      }
    }
  }

  public takeFrame(): ActionFrame {
    const frame: ActionFrame = {
      context: this.context,
      revision: this.revision,
      states: this.states,
    };

    // Clear transient edges while retaining held states.
    this.states = Object.fromEntries(
      Object.entries(this.states).map(([name, state]) => [
        name,
        state.kind === 'button' ? { ...state, pressed: false, released: false } : state,
      ]),
    );

    return frame;
  }

  public isCurrent(frame: ActionFrame): boolean {
    return frame.revision === this.revision;
  }

  private isDown(control: ButtonControl): boolean {
    const id = controlId(control);

    return this.raw.down.has(id) && !this.blockedButtons.has(id);
  }

  private vector(binding: Vector2Binding): Vector2 {
    if (binding.kind === 'buttons2d') {
      return clampVector({
        x: Number(this.isDown(binding.right)) - Number(this.isDown(binding.left)),
        y: Number(this.isDown(binding.up)) - Number(this.isDown(binding.down)),
      });
    }

    const value = deadzone(this.raw.sticks[binding.stick], binding.deadzone);

    const id = stickId(binding);

    if (this.blockedSticks.has(id)) {
      if (value.x === 0 && value.y === 0) {
        this.blockedSticks.delete(id);
      }

      return Vector2.Zero();
    }

    return value;
  }
}
