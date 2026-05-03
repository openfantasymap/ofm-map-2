import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ANNOTATION_PALETTE } from '../annotations-storage';
import { ICON_CATALOG, IconCategory, IconEntry } from '../icons-catalog';

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
  imports: [
    MatDialogModule, MatButtonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
  ],
  templateUrl: './annotation-dialog.html',
  styleUrl: './annotation-dialog.scss',
})
export class AnnotationDialog {
  readonly dialogRef = inject(MatDialogRef);
  readonly data = inject<AnnotationDialogData>(MAT_DIALOG_DATA);
  readonly palette = ANNOTATION_PALETTE;
  readonly catalog = ICON_CATALOG;

  title: string = this.data.title ?? '';
  body: string = this.data.body ?? '';
  color: string = this.data.color ?? '';
  icon: string = this.data.icon ?? '';

  // Default to RPG · Weapons (first category) unless the existing icon belongs
  // to a specific category — then start in that one.
  selectedCategoryIndex = signal(this.findInitialCategory());
  filter = signal('');

  filteredIcons = computed<IconEntry[]>(() => {
    const cat = this.catalog[this.selectedCategoryIndex()];
    if (!cat) return [];
    const q = this.filter().trim().toLowerCase();
    if (!q) return cat.icons;
    return cat.icons.filter(i => i.name.includes(q) || i.cls.includes(q));
  });

  private findInitialCategory(): number {
    if (!this.data.icon) return 0;
    for (let i = 0; i < this.catalog.length; i++) {
      if (this.catalog[i].icons.some(ic => ic.cls === this.data.icon)) return i;
    }
    return 0;
  }

  setCategory(i: number) {
    this.selectedCategoryIndex.set(i);
    this.filter.set('');
  }

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
