import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-response',
  imports: [MatDialogModule],
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
