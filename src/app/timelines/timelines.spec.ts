import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Timelines } from './timelines';

describe('Timelines', () => {
  let component: Timelines;
  let fixture: ComponentFixture<Timelines>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Timelines]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Timelines);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
