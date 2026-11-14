import { MenuLogoComponent } from '../menu-logo/menu-logo.component';
import { Component } from '@angular/core';

@Component({
  imports: [MenuLogoComponent],
  host: { class: 'loading-screen sw-ui' },
  selector: 'app-loading-screen',
  templateUrl: './loading-screen.component.html',
})
export class LoadingScreenComponent {}
