import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DateComponent } from './date';

describe('DateComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DateComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: 1182.5 },
      ],
    }).compileComponents();
  });

  it('should create', () => {
    expect(TestBed.createComponent(DateComponent).componentInstance).toBeTruthy();
  });
});
