import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  effect,
  untracked,
} from '@angular/core';
import { fromEvent, merge, Subscription } from 'rxjs';
import { WindingTravel } from '@core/winding-travel';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  imports: [],
  selector: 'app-winding-handle',
  styleUrl: './winding-handle.component.scss',
  templateUrl: './winding-handle.component.html',
})
export class WindingHandleComponent {
  private readonly runtime = inject(GameRuntimeService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly travel = new WindingTravel();
  private readonly subscriptions = new Subscription();
  private pointer: number | null = null;
  private keyboardHeld = false;
  public readonly angle = signal(-90);

  public constructor() {
    effect(() => {
      this.runtime.restoreRevision?.();
      untracked(() => this.release());
    });
    const document = this.element.nativeElement.ownerDocument;
    this.subscriptions.add(
      this.runtime.subscribeActions((frame) => {
        if (this.pointer !== null || this.keyboardHeld) return;
        const active = document.activeElement;
        if (
          frame.context !== 'ui' ||
          !active ||
          !this.element.nativeElement.contains(active) ||
          this.runtime.workExitWarning()
        ) {
          this.travel.reset();
          return;
        }
        const input = frame.states['wind'];
        if (input?.kind === 'vector2') this.sample(input.value.x, -input.value.y);
      }),
    );
    this.subscriptions.add(
      merge(
        fromEvent(document, 'visibilitychange'),
        fromEvent(document.defaultView!, 'blur'),
      ).subscribe(() => this.release()),
    );
    inject(DestroyRef).onDestroy(() => {
      this.subscriptions.unsubscribe();
      this.release();
    });
  }

  private sample(x: number, y: number): void {
    const movement = this.travel.sample(x, y);
    if (!movement) return;
    this.angle.set(movement.angle);
    if (movement.degrees) this.runtime.command({ type: 'wind', degrees: movement.degrees });
  }

  public start(event: PointerEvent): void {
    if (event.button !== 0 || this.pointer !== null) return;
    const handle = event.currentTarget as HTMLElement;
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    this.pointer = event.pointerId;
    this.travel.reset();
    this.move(event);
    event.preventDefault();
  }

  public move(event: PointerEvent): void {
    if (event.pointerId !== this.pointer) return;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.sample(
      (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2),
      (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2),
    );
  }

  public release(): void {
    this.pointer = null;
    this.keyboardHeld = false;
    this.travel.reset();
  }

  public key(event: KeyboardEvent): void {
    if (this.pointer !== null || event.isComposing) return;
    const angles = { up: -90, right: 0, down: 90, left: 180 };
    for (const binding of this.runtime.settings.profile().contexts.ui.wind) {
      if (binding.kind !== 'buttons2d') continue;
      for (const direction of ['up', 'right', 'down', 'left'] as const) {
        const control = binding[direction];
        if (control.device !== 'keyboard' || control.code !== event.code) continue;
        event.preventDefault();
        if (event.type === 'keyup') {
          this.keyboardHeld = false;
          this.travel.reset();
          return;
        }
        if (event.repeat) return;
        this.keyboardHeld = true;
        this.travel.reset();
        const current = (this.angle() * Math.PI) / 180;
        this.travel.sample(Math.cos(current), Math.sin(current));
        const target = (angles[direction] * Math.PI) / 180;
        const delta = ((angles[direction] - this.angle() + 540) % 360) - 180;
        // Opposite digital directions are deliberate half turns, not a noisy stick/centre jump.
        if (Math.abs(delta) > 120) {
          const halfway = current + (delta * Math.PI) / 360;
          this.sample(Math.cos(halfway), Math.sin(halfway));
        }
        this.sample(Math.cos(target), Math.sin(target));
        return;
      }
    }
  }
}
