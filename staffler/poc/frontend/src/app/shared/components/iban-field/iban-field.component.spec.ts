import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IbanFieldComponent } from './iban-field.component';

describe('IbanFieldComponent', () => {
  let component: IbanFieldComponent;
  let fixture: ComponentFixture<IbanFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IbanFieldComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(IbanFieldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
