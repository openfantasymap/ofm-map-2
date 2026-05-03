import { Component, inject, model } from '@angular/core';
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
  readonly dialogRef = inject(MatDialogRef<AnnotationDialog, AnnotationDialogResult | null>);
  readonly data = inject<AnnotationDialogData>(MAT_DIALOG_DATA);
  readonly title = model(this.data.title ?? '');
  readonly body = model(this.data.body ?? '');
  readonly color = model(this.data.color ?? '');
  readonly palette = ANNOTATION_PALETTE;

  selectColor(value: string): void {
    this.color.set(this.color() === value ? '' : value);
  }

  save(): void {
    this.dialogRef.close({ title: this.title(), body: this.body(), color: this.color() });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  remove(): void {
    this.dialogRef.close({ delete: true });
  }
}
