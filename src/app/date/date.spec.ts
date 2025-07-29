import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Date } from './date';

describe('Date', () => {
  let component: Date;
  let fixture: ComponentFixture<Date>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Date]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Date);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
