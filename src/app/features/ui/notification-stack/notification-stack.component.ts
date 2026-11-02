import { Component, inject } from '@angular/core';
import { UiService } from '../ui.service';

@Component({
  imports: [],
  selector: 'app-notification-stack',
  styleUrl: './notification-stack.component.scss',
  templateUrl: './notification-stack.component.html',
})
export class NotificationStackComponent {
  public readonly ui = inject(UiService);
}
