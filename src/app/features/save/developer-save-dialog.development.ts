import type { ComponentType } from '@angular/cdk/overlay';

export async function loadDeveloperSaveDialog(): Promise<ComponentType<unknown>> {
  return (await import('./save-load/save-load.component')).SaveLoadComponent;
}
