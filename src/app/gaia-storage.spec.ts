import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { GaiaStorage } from './gaia-storage';

describe('GaiaStorage', () => {
  let service: GaiaStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient()] });
    service = TestBed.inject(GaiaStorage);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
