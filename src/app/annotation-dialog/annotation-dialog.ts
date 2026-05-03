import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ANNOTATION_PALETTE, ANNOTATION_ICONS } from '../annotations-storage';

export interface AnnotationDialogData {
  mode: 'create' | 'edit';
  geometryType?: 'Point' | 'LineString' | 'Polygon';
  title?: string;
  body?: string;
  color?: string;
  icon?: string;
  lng?: number;
  lat?: number;
}

export interface AnnotationDialogResult {
  title?: string;
  body?: string;
  color?: string;
  icon?: string;
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
  readonly icons = ANNOTATION_ICONS;

  title: string = this.data.title ?? '';
  body: string = this.data.body ?? '';
  color: string = this.data.color ?? '';
  icon: string = this.data.icon ?? '';

  selectColor(value: string): void {
    this.color = this.color === value ? '' : value;
  }

  selectIcon(cls: string): void {
    this.icon = this.icon === cls ? '' : cls;
  }

  save(): void {
    const result: AnnotationDialogResult = {
      title: this.title,
      body: this.body,
      color: this.color,
      icon: this.icon,
    };
    this.dialogRef.close(result);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  remove(): void {
    const result: AnnotationDialogResult = { delete: true };
    this.dialogRef.close(result);
  }

  geometryLabel(): string {
    switch (this.data.geometryType) {
      case 'LineString': return 'Line';
      case 'Polygon': return 'Polygon';
      default: return 'Point';
    }
  }
}
