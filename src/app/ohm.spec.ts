import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OhmService } from './ohm';

describe('OhmService', () => {
  it('should be created', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient()] });
    expect(TestBed.inject(OhmService)).toBeTruthy();
  });
});
