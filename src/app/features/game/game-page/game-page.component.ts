import { Dialog } from '@angular/cdk/dialog';
import { JsonPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { SaveLoadComponent } from '@app/features/save/save-load/save-load.component';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  imports: [JsonPipe],
  selector: 'app-game-page',
  styleUrl: './game-page.component.scss',
  templateUrl: './game-page.component.html',
  providers: [GameRuntimeService],
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  private readonly rendererHost = viewChild.required<ElementRef<HTMLElement>>('rendererHost');
  public readonly gameRuntimeService = inject(GameRuntimeService);
  private readonly dialog = inject(Dialog);

  public ngAfterViewInit() {
    this.gameRuntimeService.mount(this.rendererHost().nativeElement);
  }

  public ngOnDestroy() {
    this.gameRuntimeService.unmount();
  }

  public startGame() {
    this.gameRuntimeService.setScene('Game');
  }

  public async openSaveDialog() {
    this.gameRuntimeService.setInputEnabled(false);
    const dialog = this.dialog.open(SaveLoadComponent);
    const resultSub = dialog.closed.subscribe((result) => {
      console.log('Dialog closed with result:', result);
      this.gameRuntimeService.setInputEnabled(true);
      resultSub.unsubscribe();
    });
  }
}
