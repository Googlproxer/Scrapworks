import { Dialog } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SaveLoadComponent } from './features/save/save-load/save-load.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App {
  private readonly dialog = inject(Dialog);

  public async openSaveDialog() {
    const dialog = this.dialog.open(SaveLoadComponent);
    const resultSub = dialog.closed.subscribe((result) => {
      console.log('Dialog closed with result:', result);
      resultSub.unsubscribe();
    });
  }
}
