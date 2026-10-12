import { AfterViewInit, Component, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  imports: [],
  selector: 'app-game-viewport',
  styleUrl: './game-viewport.scss',
  templateUrl: './game-viewport.html',
})
export class GameViewport implements AfterViewInit, OnDestroy {
  private readonly rendererHost = viewChild.required<ElementRef<HTMLElement>>('rendererHost');
  private readonly gameRuntimeService = inject(GameRuntimeService);

  public ngAfterViewInit() {
    this.gameRuntimeService.mount(this.rendererHost().nativeElement);
  }

  public ngOnDestroy() {
    this.gameRuntimeService.unmount();
  }
}
