import { signal } from '@angular/core';
import type { GameInputPort, UiKeyInput } from '@contracts/game-client';
import type {
  ActionFrame,
  BindingProfile,
  ButtonControl,
  ControllerInfo,
  Context,
} from '@contracts/input';

/** Input ownership and ordered frame invalidation are synchronous application capabilities. */
export class GameInputCoordinator {
  private port?: GameInputPort;
  private attachment = 0;
  private captureRevision = 0;
  private stopCapture?: () => void;
  private unsubscribeControllers?: () => void;
  private revisionValue = 0;
  private enabledValue = true;
  private focusedValue = false;
  private readonly listeners = new Set<(frame: ActionFrame) => void>();
  private readonly controllerValues = signal<readonly ControllerInfo[]>([]);
  private readonly selectedValue = signal<string | null>(null);
  private readonly captureValue = signal(false);
  public readonly controllers = this.controllerValues.asReadonly();
  public readonly selectedController = this.selectedValue.asReadonly();
  public readonly capturing = this.captureValue.asReadonly();

  public constructor(private readonly session: { clearInput(): void; pause(): void }) {}

  public get revision(): number {
    return this.revisionValue;
  }

  public get enabledRequested(): boolean {
    return this.enabledValue;
  }

  public get uiFocused(): boolean {
    return this.focusedValue;
  }

  public invalidate(): void {
    ++this.revisionValue;
  }

  public requestEnabled(value: boolean): void {
    this.enabledValue = value;
    this.invalidate();
  }

  public setUiFocused(value: boolean): void {
    this.focusedValue = value;
    this.invalidate();
  }

  public attach(port: GameInputPort): void {
    this.detach();
    this.port = port;
    const generation = this.attachment;
    this.unsubscribeControllers = port.subscribeControllers((controllers) => {
      if (generation !== this.attachment) return;
      this.controllerValues.set(controllers);
      const selected = this.selectedValue();
      if (selected !== null) {
        const controller = controllers.find((value) => value.id === selected);
        if (!controller) this.selectedValue.set(null);
        else if (!controller.selected) this.selectController(selected);
      }
    });
  }

  public detach(): void {
    ++this.attachment;
    this.invalidate();
    this.stopCapture?.();
    this.stopCapture = undefined;
    this.unsubscribeControllers?.();
    this.unsubscribeControllers = undefined;
    this.port = undefined;
    this.controllerValues.set([]);
    this.captureValue.set(false);
  }

  public updateBindings(profile: BindingProfile): void {
    this.invalidate();
    this.session.clearInput();
    this.port?.updateBindings(profile);
  }

  public setContext(context: Context | null): void {
    this.port?.setContext(context);
  }

  public focus(): void {
    this.port?.focus();
  }

  public handleKeyboard(input: UiKeyInput): boolean {
    return this.port?.handleUiKeyboard(input) ?? false;
  }

  public handlePointer(input: { button: number; down: boolean }): boolean {
    return this.port?.handleUiPointer(input) ?? false;
  }

  public subscribe(listener: (frame: ActionFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispatch(frame: ActionFrame, current: () => boolean): void {
    for (const listener of this.listeners) {
      listener(frame);
      if (!current()) break;
    }
  }

  public selectController(id: string | null): void {
    this.invalidate();
    this.session.clearInput();
    const previous = this.selectedValue();
    this.selectedValue.set(id);
    if (this.port?.selectController(id) === false) this.selectedValue.set(previous);
  }

  public captureBinding(listener: (control: ButtonControl) => void): () => void {
    this.stopCapture?.();
    const capture = ++this.captureRevision;
    const attachment = this.attachment;
    this.invalidate();
    this.session.pause();
    this.captureValue.set(true);
    const unsubscribe = this.port?.captureBinding((control) => {
      if (attachment === this.attachment && capture === this.captureRevision && this.captureValue())
        listener(control);
    });
    let stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      unsubscribe?.();
      if (capture === this.captureRevision) {
        this.invalidate();
        this.captureValue.set(false);
      }
    };

    this.stopCapture = stop;
    return stop;
  }
}
