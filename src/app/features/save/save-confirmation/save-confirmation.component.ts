import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';

@Component({
  host: { class: 'sw-shell sw-dialog' },
  selector: 'app-save-confirmation',
  templateUrl: './save-confirmation.component.html',
  styleUrl: './save-confirmation.component.scss',
})
export class SaveConfirmationComponent {
  public readonly message = inject<string>(DIALOG_DATA);
  public readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
