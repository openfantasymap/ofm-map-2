import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputDialog } from './input';

describe('Input', () => {
  let component: InputDialog;
  let fixture: ComponentFixture<InputDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
