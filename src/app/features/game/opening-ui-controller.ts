import { signal } from '@angular/core';
import type { WorldView } from '@contracts/world';
import type { OpeningCommand } from '@contracts/opening';
import type { CommandSubmission } from '@contracts/session-event';

interface OpeningUiPorts {
  world(): WorldView | null;
  selectedEntityId(): string | null;
  submit(command: OpeningCommand): CommandSubmission;
  setUiFocused(value: boolean): void;
  focusViewport(): void;
}

/** UI intent/work-exit ownership; all material changes remain worker commands. */
export class OpeningUiController {
  private readonly fieldKitValue = signal(false);
  private readonly warningValue = signal(false);
  public readonly fieldKitOpen = this.fieldKitValue.asReadonly();
  public readonly workExitWarning = this.warningValue.asReadonly();
  private workExitContinuation?: () => void;

  public constructor(private readonly ports: OpeningUiPorts) {}

  public reset(): void {
    this.workExitContinuation = undefined;
    this.warningValue.set(false);
    this.fieldKitValue.set(false);
  }

  public restoreCrafting(visible: boolean): void {
    this.workExitContinuation = undefined;
    this.warningValue.set(false);
    this.fieldKitValue.set(visible);
  }

  public salvageNearby(): void {
    const world = this.ports.world();
    if (!world) return;
    const selected = world.deposits.find((deposit) => deposit.id === this.ports.selectedEntityId());
    const target =
      selected ??
      [...world.deposits]
        .filter((deposit) => deposit.quantity > 0)
        .sort(
          (a, b) =>
            Math.hypot(
              a.position.x - world.player.position.x,
              a.position.z - world.player.position.z,
            ) -
            Math.hypot(
              b.position.x - world.player.position.x,
              b.position.z - world.player.position.z,
            ),
        )[0];
    if (target) this.ports.submit({ type: 'salvage', target: target.id });
  }

  public toggleFieldKit(): void {
    this.requestWorkExit(() => {
      const open = !this.fieldKitOpen();
      this.ports.submit({ type: 'handcraft-ui', visible: false });
      this.fieldKitValue.set(open);
      if (open) this.ports.setUiFocused(true);
      else this.ports.focusViewport();
    });
  }

  public requestWorkExit(continuation: () => void): void {
    if (this.ports.world()?.opening?.state.handcraft) {
      if (this.workExitWarning()) return;
      this.workExitContinuation = continuation;
      this.warningValue.set(true);
      this.ports.submit({ type: 'handcraft-ui', visible: true, suspended: true });
    } else continuation();
  }

  public resolveWorkExit(cancel: boolean): void {
    const continuation = this.workExitContinuation;
    this.workExitContinuation = undefined;
    this.warningValue.set(false);
    this.ports.submit({ type: 'handcraft-ui', visible: !cancel, suspended: false });
    if (cancel) continuation?.();
  }
}
