import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddressAutocompleteFieldComponent } from './address-autocomplete-field.component';

describe('AddressAutocompleteFieldComponent', () => {
  let component: AddressAutocompleteFieldComponent;
  let fixture: ComponentFixture<AddressAutocompleteFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddressAutocompleteFieldComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AddressAutocompleteFieldComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
