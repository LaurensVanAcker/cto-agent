import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyTimeRegistrationComponent } from './company-time-registration.component';

describe('CompanyTimeRegistrationComponent', () => {
  let component: CompanyTimeRegistrationComponent;
  let fixture: ComponentFixture<CompanyTimeRegistrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyTimeRegistrationComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CompanyTimeRegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
