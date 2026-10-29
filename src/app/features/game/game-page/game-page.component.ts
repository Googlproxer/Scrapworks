import { JsonPipe, NgOptimizedImage } from '@angular/common';
import {
  afterRenderEffect,
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  viewChild,
} from '@angular/core';
import { ControlsComponent } from '@app/features/controls/controls/controls.component';
import { SaveLoadComponent } from '@app/features/save/save-load/save-load.component';
import { UiInputAdapterService } from '@app/features/ui/ui-input-adapter.service';
import { UiService } from '@app/features/ui/ui.service';
import { environment } from '@environments/environment';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  imports: [JsonPipe, NgOptimizedImage],
  selector: 'app-game-page',
  styleUrl: './game-page.component.scss',
  templateUrl: './game-page.component.html',
  providers: [GameRuntimeService, UiService, UiInputAdapterService],
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  private readonly rendererHost = viewChild.required<ElementRef<HTMLElement>>('rendererHost');
  public readonly gameRuntimeService = inject(GameRuntimeService);
  private readonly uiService = inject(UiService);
  public readonly inputAdapter = inject(UiInputAdapterService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly developer = !!environment.dev;
  public constructor() {
    afterRenderEffect(() => {
      if (this.gameRuntimeService.errorMessage())
        this.element.nativeElement.querySelector<HTMLButtonElement>('[data-retry]')?.focus();
    });
  }

  public ngAfterViewInit() {
    this.gameRuntimeService.mount(this.rendererHost().nativeElement);
    this.inputAdapter.attach(this.element.nativeElement);
  }

  public ngOnDestroy() {
    this.gameRuntimeService.unmount();
  }

  public startGame() {
    this.gameRuntimeService.setScene('Game');
    this.gameRuntimeService.focusViewport();
  }

  public async openSaveDialog() {
    this.uiService.openUIDialog('save-dialog', SaveLoadComponent, {
      ariaLabelledBy: 'save-load-component',
    });
  }

  public openControls(): void {
    this.uiService.openUIDialog('controls', ControlsComponent, {
      ariaLabelledBy: 'controls-title',
    });
  }
}
