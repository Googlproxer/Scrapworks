import { DialogRef } from '@angular/cdk/dialog';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  actions,
  defaultProfile,
  type BindingProfile,
  type ButtonControl,
  type Context,
  type ControllerType,
  type Vector2Binding,
} from '@contracts/input';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { BindingLabels } from '../binding-labels.service';
import { ControlSettingsService } from '../control-settings.service';

type Binding = ButtonControl | Vector2Binding;
type Direction = 'up' | 'down' | 'left' | 'right';
type DeviceTab = 'keyboard' | 'gamepad';
interface BindingEditor {
  context: Context;
  name: string;
  index: number;
}

@Component({
  selector: 'app-controls',
  providers: [BindingLabels],
  host: { '(keydown.escape)': 'cancelCapture($event)' },
  templateUrl: './controls.component.html',
  styleUrl: './controls.component.scss',
})
export class ControlsComponent {
  public readonly runtime = inject(GameRuntimeService);
  public readonly settings = inject(ControlSettingsService);
  public readonly labels = inject(BindingLabels);
  private readonly ref = inject(DialogRef);
  public readonly draft = signal<BindingProfile>(structuredClone(this.settings.profile()));
  public readonly saving = signal(false);
  public readonly loaded = signal(false);
  public readonly tab = signal<DeviceTab>('keyboard');
  public readonly editor = signal<BindingEditor | null>(null);
  public readonly captureLabel = signal<string | null>(null);
  public readonly selectedController = this.runtime.selectedController;
  public readonly labelStyle = signal<ControllerType | 'automatic'>('automatic');
  public readonly controllerType = computed(() => {
    const style = this.labelStyle();
    if (style !== 'automatic') return style;
    return this.runtime.controllers().find((controller) => controller.selected)?.type ?? 'xbox';
  });
  public readonly contexts: readonly Context[] = ['gameplay', 'ui'];
  public readonly directions: readonly Direction[] = ['up', 'down', 'left', 'right'];
  private stopCapture?: () => void;
  public readonly conflicts = computed(() => {
    const conflicts: string[] = [];
    for (const context of this.contexts) {
      const seen = new Map<string, string>();
      for (const row of this.rows(context))
        for (const { binding } of this.visibleBindings(row.bindings)) {
          const controls = this.isButton(binding)
            ? [binding]
            : binding.kind === 'buttons2d'
              ? this.directions.map((direction) => binding[direction])
              : [];
          for (const control of controls) {
            if (!this.matchesTab(control)) continue;
            const key = `${control.device}:${control.device === 'keyboard' ? control.code : control.button}`;
            const previous = seen.get(key);
            if (previous && previous !== row.name)
              conflicts.push(
                `${this.labels.context(context)}: ${this.describe(control)} — ${this.label(previous)} / ${this.label(row.name)}`,
              );
            seen.set(key, row.name);
          }
        }
    }
    return [...new Set(conflicts)];
  });
  public constructor() {
    let destroyed = false;
    inject(DestroyRef).onDestroy(() => {
      destroyed = true;
      this.stopCapture?.();
    });
    void this.settings.ready.then(() => {
      if (!destroyed) {
        this.draft.set(structuredClone(this.settings.profile()));
        this.loaded.set(true);
      }
    });
  }
  public rows(context: Context) {
    return Object.entries(actions[context])
      .filter(([name]) => !['jump', 'inventory'].includes(name))
      .map(([name, kind]) => ({
        name,
        kind,
        bindings: (this.draft().contexts[context] as Readonly<Record<string, readonly Binding[]>>)[
          name
        ],
      }));
  }
  public visibleBindings(bindings: readonly Binding[]) {
    return bindings
      .map((binding, index) => ({ binding, index }))
      .filter(({ binding }) =>
        this.isButton(binding)
          ? this.matchesTab(binding)
          : binding.kind === 'stick2d'
            ? this.tab() === 'gamepad'
            : this.directions.some((direction) => this.matchesTab(binding[direction])),
      );
  }
  public columns(context: Context): readonly number[] {
    const count = Math.max(
      2,
      ...this.rows(context).map((row) => this.visibleBindings(row.bindings).length),
    );
    return Array.from({ length: count }, (_, index) => index);
  }
  public label(name: string): string {
    return this.labels.action(name);
  }
  public isButton(binding: Binding): binding is ButtonControl {
    return 'device' in binding;
  }
  public describe(control: ButtonControl): string {
    return this.labels.button(control, this.controllerType());
  }
  public describeBinding(binding: Binding): string {
    if (!this.isButton(binding) && binding.kind === 'buttons2d')
      return this.labels.directions({
        up: this.matchesTab(binding.up) ? this.describe(binding.up) : '—',
        down: this.matchesTab(binding.down) ? this.describe(binding.down) : '—',
        left: this.matchesTab(binding.left) ? this.describe(binding.left) : '—',
        right: this.matchesTab(binding.right) ? this.describe(binding.right) : '—',
      });
    return this.labels.binding(binding, this.controllerType());
  }
  public matchesTab(control: ButtonControl): boolean {
    return (control.device === 'gamepad') === (this.tab() === 'gamepad');
  }
  public selectTab(tab: DeviceTab): void {
    this.cancelCapture();
    this.editor.set(null);
    this.tab.set(tab);
  }
  public tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tab =
      event.key === 'Home'
        ? 'keyboard'
        : event.key === 'End'
          ? 'gamepad'
          : this.tab() === 'keyboard'
            ? 'gamepad'
            : 'keyboard';
    this.selectTab(tab);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLElement>(`#controls-tab-${tab}`)
      ?.focus();
  }
  private edit(context: Context, name: string, change: (bindings: Binding[]) => void): void {
    const draft = structuredClone(this.draft());
    change((draft.contexts[context] as unknown as Record<string, Binding[]>)[name]);
    this.draft.set(draft);
  }
  public capture(context: Context, name: string, index?: number, direction?: Direction): void {
    this.cancelCapture();
    this.captureLabel.set(
      `${this.label(name)}${direction ? ' ' + this.labels.direction(direction) : ''}`,
    );
    this.stopCapture = this.runtime.captureBinding((control) => {
      if (!this.matchesTab(control)) return;
      this.edit(context, name, (bindings) => {
        if (index === undefined) bindings.push(control);
        else if (direction) {
          const binding = bindings[index];
          if ('kind' in binding && binding.kind === 'buttons2d')
            bindings[index] = { ...binding, [direction]: control };
        } else bindings[index] = control;
      });
      this.cancelCapture();
    });
  }
  public cancelCapture(event?: Event): void {
    if (event && this.captureLabel()) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.stopCapture?.();
    this.stopCapture = undefined;
    this.captureLabel.set(null);
  }
  public activateBinding(context: Context, name: string, index: number, binding: Binding): void {
    if (this.isButton(binding)) this.capture(context, name, index);
    else {
      this.cancelCapture();
      const current = this.editor();
      this.editor.set(
        current?.context === context && current.name === name && current.index === index
          ? null
          : { context, name, index },
      );
    }
  }
  public editing(context: Context, name: string): Vector2Binding | null {
    const editor = this.editor();
    if (!editor || editor.context !== context || editor.name !== name) return null;
    const binding = this.rows(context).find((row) => row.name === name)?.bindings[editor.index];
    return binding && !this.isButton(binding) ? binding : null;
  }
  public remove(context: Context, name: string, index: number): void {
    this.cancelCapture();
    this.editor.set(null);
    this.edit(context, name, (bindings) => bindings.splice(index, 1));
  }
  public add(context: Context, name: string, kind: string): void {
    if (kind === 'button') this.capture(context, name);
    else if (this.tab() === 'gamepad') this.addStick(context, name);
    else this.addDirections(context, name);
  }
  private directionBinding(): Vector2Binding {
    return this.tab() === 'gamepad'
      ? {
          kind: 'buttons2d',
          up: { device: 'gamepad', button: 'dpadUp' },
          down: { device: 'gamepad', button: 'dpadDown' },
          left: { device: 'gamepad', button: 'dpadLeft' },
          right: { device: 'gamepad', button: 'dpadRight' },
        }
      : {
          kind: 'buttons2d',
          up: { device: 'keyboard', code: 'KeyW' },
          down: { device: 'keyboard', code: 'KeyS' },
          left: { device: 'keyboard', code: 'KeyA' },
          right: { device: 'keyboard', code: 'KeyD' },
        };
  }
  public addDirections(context: Context, name: string): void {
    this.cancelCapture();
    this.edit(context, name, (bindings) => {
      this.editor.set({ context, name, index: bindings.length });
      bindings.push(this.directionBinding());
    });
  }
  public addStick(context: Context, name: string): void {
    this.cancelCapture();
    const stick = name === 'orbit' ? 'right' : 'left';
    const deadzone = this.defaultDeadzone(context, name);
    this.edit(context, name, (bindings) => {
      this.editor.set({ context, name, index: bindings.length });
      bindings.push({ kind: 'stick2d', stick, deadzone });
    });
  }
  public changeVectorType(context: Context, name: string, index: number, event: Event): void {
    this.cancelCapture();
    const value = (event.target as HTMLSelectElement).value;
    const replacement: Vector2Binding =
      value === 'directions'
        ? this.directionBinding()
        : {
            kind: 'stick2d',
            stick: value === 'right' ? 'right' : 'left',
            deadzone: this.defaultDeadzone(context, name),
          };
    this.edit(context, name, (bindings) => {
      const previous = bindings[index];
      bindings[index] =
        replacement.kind === 'stick2d' && !this.isButton(previous) && previous.kind === 'stick2d'
          ? { ...replacement, deadzone: previous.deadzone }
          : replacement;
    });
  }
  private defaultDeadzone(context: Context, name: string): number {
    const bindings =
      (defaultProfile.contexts[context] as Readonly<Record<string, readonly Binding[]>>)[name] ??
      [];
    const stick = bindings.find((binding) => !this.isButton(binding) && binding.kind === 'stick2d');
    return stick && !this.isButton(stick) && stick.kind === 'stick2d' ? stick.deadzone : 0.18;
  }
  public changeStick(context: Context, name: string, index: number, event: Event): void {
    this.changeVectorType(context, name, index, event);
  }
  public stickSettings() {
    return this.contexts.flatMap((context) =>
      this.rows(context).flatMap((row) =>
        row.bindings.flatMap((binding, index) =>
          !this.isButton(binding) && binding.kind === 'stick2d'
            ? [{ context, name: row.name, index, binding, id: `${context}-${row.name}-${index}` }]
            : [],
        ),
      ),
    );
  }
  public changeDeadzone(context: Context, name: string, index: number, event: Event): void {
    const deadzone = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone > 0.9) return;
    this.edit(context, name, (bindings) => {
      const binding = bindings[index];
      if (!this.isButton(binding) && binding.kind === 'stick2d')
        bindings[index] = { ...binding, deadzone };
    });
  }
  public selectController(event: Event): void {
    this.runtime.selectController((event.target as HTMLSelectElement).value || null);
  }
  public selectLabelStyle(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.labelStyle.set(
      value === 'xbox' || value === 'dualshock' || value === 'dualsense' ? value : 'automatic',
    );
  }
  public reset(): void {
    this.cancelCapture();
    this.editor.set(null);
    this.draft.set(structuredClone(defaultProfile));
  }
  public async save(): Promise<void> {
    this.saving.set(true);
    if (await this.settings.save(this.draft())) this.ref.close();
    this.saving.set(false);
  }
  public close(): void {
    this.cancelCapture();
    this.ref.close();
  }
}
