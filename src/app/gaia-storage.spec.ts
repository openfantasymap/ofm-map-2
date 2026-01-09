import { TestBed } from '@angular/core/testing';

import { GaiaStorage } from './gaia-storage';

describe('GaiaStorage', () => {
  let service: GaiaStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GaiaStorage);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
