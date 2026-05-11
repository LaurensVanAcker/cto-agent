import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FieldValidationErrorsComponent } from './field-validation-errors.component';

describe('FieldValidationErrorsComponent', () => {
  let component: FieldValidationErrorsComponent;
  let fixture: ComponentFixture<FieldValidationErrorsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FieldValidationErrorsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(FieldValidationErrorsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
