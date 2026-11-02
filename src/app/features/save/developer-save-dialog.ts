import type { ComponentType } from '@angular/cdk/overlay';

/** Gameplay persistence starts in Milestone 4; production exposes no test-data dialog. */
export async function loadDeveloperSaveDialog(): Promise<ComponentType<unknown> | null> {
  return null;
}
