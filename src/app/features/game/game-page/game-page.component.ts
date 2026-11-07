import { JsonPipe } from '@angular/common';
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
import { loadDeveloperSaveDialog } from '@app/features/save/developer-save-dialog';
import { UiInputAdapterService } from '@app/features/ui/ui-input-adapter.service';
import { UiService } from '@app/features/ui/ui.service';
import { environment } from '@environments/environment';
import { GameRuntimeService } from '../game-runtime.service';
import { DebugDrawPanelComponent } from '../debug-draw-panel/debug-draw-panel.component';
import { FieldKitComponent } from '../field-kit/field-kit.component';
import { NotificationStackComponent } from '../../ui/notification-stack/notification-stack.component';
import { LoadingIndicatorComponent } from '../../../shared/loading/loading-indicator/loading-indicator.component';
import { LoadingScreenComponent } from '../../../shared/loading/loading-screen/loading-screen.component';
import { MenuLogoComponent } from '../../../shared/loading/menu-logo/menu-logo.component';
import { GameplaySaveService, GAMEPLAY_SAVE_REPOSITORY } from '../../save/gameplay-save.service';
import { IndexedDbSaveRepository } from '../../../../persistence/indexeddb-save-repository';
import { GameplaySavesComponent } from '../../save/gameplay-saves/gameplay-saves.component';

@Component({
  imports: [
    JsonPipe,
    MenuLogoComponent,
    GameplaySavesComponent,
    DebugDrawPanelComponent,
    FieldKitComponent,
    NotificationStackComponent,
    LoadingIndicatorComponent,
    LoadingScreenComponent,
  ],
  selector: 'app-game-page',
  styleUrl: './game-page.component.scss',
  templateUrl: './game-page.component.html',
  providers: [
    GameRuntimeService,
    UiService,
    UiInputAdapterService,
    GameplaySaveService,
    { provide: GAMEPLAY_SAVE_REPOSITORY, useFactory: () => new IndexedDbSaveRepository() },
  ],
})
export class GamePageComponent implements AfterViewInit, OnDestroy {
  private readonly rendererHost = viewChild.required<ElementRef<HTMLElement>>('rendererHost');
  public readonly gameRuntimeService = inject(GameRuntimeService);
  private readonly uiService = inject(UiService);
  public readonly inputAdapter = inject(UiInputAdapterService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  public readonly developer = !!environment.dev;
  public readonly saves = inject(GameplaySaveService);
  private wasBusy = false;

  public constructor() {
    afterRenderEffect(() => {
      const busy = this.gameRuntimeService.isBusy();
      if (this.gameRuntimeService.errorMessage()) {
        this.element.nativeElement.querySelector<HTMLButtonElement>('[data-retry]')?.focus();
      } else if (busy) {
        this.element.nativeElement
          .querySelector<HTMLElement>('[data-loading-focus]')
          ?.focus({ preventScroll: true });
      } else if (this.wasBusy && this.gameRuntimeService.isReady()) {
        if (this.gameRuntimeService.currentSceneKey() === 'Game')
          this.gameRuntimeService.focusViewport();
        else
          this.element.nativeElement
            .querySelector<HTMLButtonElement>('[data-play]')
            ?.focus({ preventScroll: true });
      }
      this.wasBusy = busy;
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
    if (this.saves.busy()) return;
    void this.saves.newGame();
  }

  public async openSaveDialog() {
    const component = await loadDeveloperSaveDialog();
    if (!component) return;
    this.uiService.openUIDialog('save-dialog', component, {
      ariaLabelledBy: 'save-load-component',
    });
  }

  public openControls(): void {
    this.uiService.openUIDialog('controls', ControlsComponent, {
      ariaLabelledBy: 'controls-title',
    });
  }
}
