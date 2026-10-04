import { Component, inject, viewChild, type AfterViewInit, type ElementRef, type OnDestroy } from '@angular/core';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  selector: 'app-phaser-game',
  template: '<div #gameHost class="game-container"></div>',
})
export class PhaserGame implements AfterViewInit, OnDestroy {
  private readonly gameHost = viewChild.required<ElementRef<HTMLDivElement>>('gameHost');

  private readonly gameRuntimeService = inject(GameRuntimeService);

  public ngAfterViewInit() {
    this.gameRuntimeService.mount(this.gameHost().nativeElement);
  }

  public ngOnDestroy() {
    this.gameRuntimeService.unmount();
  }
}
