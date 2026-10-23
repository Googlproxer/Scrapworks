import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { ControlsComponent } from '../../controls/controls/controls.component';
import { GameRuntimeService } from '../../game/game-runtime.service';
import { UiService } from '../ui.service';

@Component({
  selector: 'app-game-menu',
  templateUrl: './game-menu.component.html',
  styleUrl: './game-menu.component.scss',
})
export class GameMenuComponent {
  private readonly ref = inject(DialogRef);
  private readonly ui = inject(UiService);
  private readonly runtime = inject(GameRuntimeService);
  public resume(): void {
    this.ref.close();
    this.runtime.focusViewport();
  }
  public controls(): void {
    this.ui.openUIDialog('controls', ControlsComponent, { ariaLabelledBy: 'controls-title' });
  }
  public mainMenu(): void {
    this.ref.close();
    this.runtime.setScene('MainMenu');
  }
}
