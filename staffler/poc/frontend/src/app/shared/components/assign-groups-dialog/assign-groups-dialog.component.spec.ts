import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignGroupsDialogComponent } from './assign-groups-dialog.component';

describe('AssignGroupsDialogComponent', () => {
  let component: AssignGroupsDialogComponent;
  let fixture: ComponentFixture<AssignGroupsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignGroupsDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AssignGroupsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
