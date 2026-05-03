import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ANNOTATION_PALETTE } from '../annotations-storage';

export interface AnnotationDialogData {
  mode: 'create' | 'edit';
  title?: string;
  body?: string;
  color?: string;
  lng?: number;
  lat?: number;
}

export interface AnnotationDialogResult {
  title?: string;
  body?: string;
  color?: string;
  delete?: boolean;
}

@Component({
  selector: 'app-annotation-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, FormsModule, MatFormFieldModule, MatInputModule],
  templateUrl: './annotation-dialog.html',
  styleUrl: './annotation-dialog.scss',
})
export class AnnotationDialog {
  readonly dialogRef = inject(MatDialogRef);
  readonly data = inject<AnnotationDialogData>(MAT_DIALOG_DATA);
  readonly palette = ANNOTATION_PALETTE;

  title: string = this.data.title ?? '';
  body: string = this.data.body ?? '';
  color: string = this.data.color ?? '';

  selectColor(value: string): void {
    this.color = this.color === value ? '' : value;
  }

  save(): void {
    const result: AnnotationDialogResult = { title: this.title, body: this.body, color: this.color };
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  remove(): void {
    const result: AnnotationDialogResult = { delete: true };
    this.dialogRef.close(result);
  }
}
