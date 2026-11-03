import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

let startupShell = document.querySelector('app-root > main');

bootstrapApplication(App, appConfig)
  .then(() => {
    startupShell = null;
  })
  .catch((err: unknown) => {
    console.error(err);
    if (startupShell && !startupShell.isConnected)
      document.querySelector('app-root')?.replaceChildren(startupShell);
    const task = document.getElementById('startup-task');
    if (task) {
      task.textContent = 'Scrapworks could not start. Reload to try again.';
      task.setAttribute('role', 'alert');
    }
    document.getElementById('startup-progress')?.remove();
    document.getElementById('startup-reload')?.removeAttribute('hidden');
  });
