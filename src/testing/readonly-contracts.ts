import type { WorldView } from '@contracts/world';
import type { GameRuntimeService } from '@app/features/game/game-runtime.service';
import type { ControlSettingsService } from '@app/features/controls/control-settings.service';

/** Compile-only ownership checks. No runtime imports or test hooks. */
function readonlyOwnership(
  view: WorldView,
  runtime: GameRuntimeService,
  settings: ControlSettingsService,
): void {
  // @ts-expect-error published nested state is immutable
  view.player.position.x = 5;
  // @ts-expect-error published opening jobs are immutable
  view.opening!.state.minifab.charge = 5;
  // @ts-expect-error published arrays are immutable
  view.opening!.bag.slots.push(null);
  // @ts-expect-error published ground items are immutable
  view.ground![0].quantity = 5;
  // @ts-expect-error the Angular facade exposes read-only signals
  runtime.world.set(null);
  // @ts-expect-error preferences expose read-only signals
  settings.profile.set({});
}

void readonlyOwnership;
