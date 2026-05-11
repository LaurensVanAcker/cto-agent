import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyActualsComponent } from './company-actuals.component';

describe('CompanyActualsComponent', () => {
  let component: CompanyActualsComponent;
  let fixture: ComponentFixture<CompanyActualsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyActualsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CompanyActualsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
