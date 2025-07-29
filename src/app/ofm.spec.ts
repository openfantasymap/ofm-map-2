import { TestBed } from '@angular/core/testing';

import { Ofm } from './ofm';

describe('Ofm', () => {
  let service: Ofm;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ofm);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
