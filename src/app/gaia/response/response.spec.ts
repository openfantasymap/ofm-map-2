import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

import { GaiaView, Response } from './response';

describe('Response', () => {
  let fixture: ComponentFixture<Response>;
  const data: GaiaView = {
    description: 'A market square under a grey sky.',
    image_prompt: 'market square, overcast',
    image: signal<string | null>(null),
    imageState: signal('none' as const),
    imageError: signal<string | null>(null),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Response],
      providers: [provideZonelessChangeDetection(), { provide: MAT_DIALOG_DATA, useValue: data }],
    }).compileComponents();
    fixture = TestBed.createComponent(Response);
    fixture.detectChanges();
  });

  it('shows the description', () => {
    expect(fixture.nativeElement.textContent).toContain('A market square');
  });
});
