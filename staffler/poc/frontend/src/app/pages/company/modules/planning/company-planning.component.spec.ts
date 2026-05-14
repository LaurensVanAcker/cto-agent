import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyPlanningComponent } from './company-planning.component';

describe('CompanyPlanningComponent', () => {
  let component: CompanyPlanningComponent;
  let fixture: ComponentFixture<CompanyPlanningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyPlanningComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CompanyPlanningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
