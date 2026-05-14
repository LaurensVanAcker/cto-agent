import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmployeeWageDialogComponent } from './employee-wage-dialog.component';

describe('EmployeeWageDialogComponent', () => {
  let component: EmployeeWageDialogComponent;
  let fixture: ComponentFixture<EmployeeWageDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployeeWageDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EmployeeWageDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
