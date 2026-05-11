import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompanyInvitationsComponent } from './company-invitations.component';

describe('CompanyInvitationsComponent', () => {
  let component: CompanyInvitationsComponent;
  let fixture: ComponentFixture<CompanyInvitationsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompanyInvitationsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CompanyInvitationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
