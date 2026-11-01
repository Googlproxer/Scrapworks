import { Component, inject } from '@angular/core';
import { GameRuntimeService } from '../game-runtime.service';

@Component({
  imports: [],
  selector: 'app-debug-draw-panel',
  styleUrl: './debug-draw-panel.component.scss',
  templateUrl: './debug-draw-panel.component.html',
})
export class DebugDrawPanelComponent {
  public readonly runtime = inject(GameRuntimeService);
}
