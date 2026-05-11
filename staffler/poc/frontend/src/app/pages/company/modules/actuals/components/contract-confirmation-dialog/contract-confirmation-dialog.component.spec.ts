import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ContractConfirmationDialogComponent } from './contract-confirmation-dialog.component';

describe('ContractConfirmationDialogComponent', () => {
  let component: ContractConfirmationDialogComponent;
  let fixture: ComponentFixture<ContractConfirmationDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractConfirmationDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ContractConfirmationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
