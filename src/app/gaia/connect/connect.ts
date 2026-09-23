import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** What the map should do once the dialog closes (undefined = cancelled). */
export type GaiaConnectResult = { action: 'login' } | { action: 'key'; key: string } | undefined;

/**
 * Gate in front of the GaiaWM "eye on the world": an OpenRouter account is
 * required because the view is painted by an image model billed to the viewer.
 */
@Component({
  selector: 'app-gaia-connect',
  imports: [MatDialogModule, MatButtonModule, MatExpansionModule, FormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './connect.html',
  styleUrl: './connect.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GaiaConnectDialog {
  readonly dialogRef = inject(MatDialogRef<GaiaConnectDialog, GaiaConnectResult>);
  pastedKey = '';

  login() {
    this.dialogRef.close({ action: 'login' });
  }

  useKey() {
    const key = this.pastedKey.trim();
    if (key) this.dialogRef.close({ action: 'key', key });
  }
}
