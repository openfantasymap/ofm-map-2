import { TestBed } from '@angular/core/testing';

import { Ohm } from './ohm';

describe('Ohm', () => {
  let service: Ohm;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ohm);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
