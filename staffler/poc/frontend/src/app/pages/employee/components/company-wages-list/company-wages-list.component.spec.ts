import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyWagesListComponent } from './company-wages-list.component';

describe('CompanyWagesListComponent', () => {
  let component: CompanyWagesListComponent;
  let fixture: ComponentFixture<CompanyWagesListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyWagesListComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CompanyWagesListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
