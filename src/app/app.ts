import { Component, inject, signal } from '@angular/core';
import { NavigationError, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoadingIndicatorComponent } from './shared/loading/loading-indicator/loading-indicator.component';
import { LoadingScreenComponent } from './shared/loading/loading-screen/loading-screen.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoadingIndicatorComponent, LoadingScreenComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {
  public readonly routeActivated = signal(false);
  public readonly startupFailed = signal(false);

  public constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationError) this.startupFailed.set(true);
      });
  }
}
