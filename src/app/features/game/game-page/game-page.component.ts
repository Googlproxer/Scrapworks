import { JsonPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, viewChild } from '@angular/core';
import { SaveLoadComponent } from '@app/features/save/save-load/save-load.component';
import { UiService } from '@app/features/ui/ui.service';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  imports: [JsonPipe],
  selector: 'app-game-page',
  styleUrl: './game-page.component.scss',
  templateUrl: './game-page.component.html',
  providers: [GameRuntimeService, UiService],
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  private readonly rendererHost = viewChild.required<ElementRef<HTMLElement>>('rendererHost');
  public readonly gameRuntimeService = inject(GameRuntimeService);
  private readonly uiService = inject(UiService);

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
    this.uiService.openUIDialog('save-dialog', SaveLoadComponent, {
      ariaLabelledBy: 'save-load-component',
    });
  }
}
