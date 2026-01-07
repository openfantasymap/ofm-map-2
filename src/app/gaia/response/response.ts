import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import {MatExpansionModule} from '@angular/material/expansion';
@Component({
  selector: 'app-response',
  imports: [MatDialogModule, MatButtonModule, MatExpansionModule],
  templateUrl: './response.html',
  styleUrl: './response.scss'
})
export class Response {
  readonly dialogRef = inject(MatDialogRef<Response>);
  readonly data = inject<any>(MAT_DIALOG_DATA);

  onNoClick(): void {
    this.dialogRef.close();
  }
}
