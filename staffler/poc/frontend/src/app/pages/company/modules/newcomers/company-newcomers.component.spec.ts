import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyNewcomersComponent } from './company-newcomers.component';

describe('NewcomersComponent', () => {
  let component: CompanyNewcomersComponent;
  let fixture: ComponentFixture<CompanyNewcomersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyNewcomersComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanyNewcomersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
