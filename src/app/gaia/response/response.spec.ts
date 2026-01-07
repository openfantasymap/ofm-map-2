import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Response } from './response';

describe('Response', () => {
  let component: Response;
  let fixture: ComponentFixture<Response>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Response]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Response);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
