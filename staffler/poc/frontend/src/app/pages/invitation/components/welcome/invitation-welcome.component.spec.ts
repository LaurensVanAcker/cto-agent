import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvitationWelcomeComponent } from './invitation-welcome.component';

describe('InvitationWelcomeComponent', () => {
  let component: InvitationWelcomeComponent;
  let fixture: ComponentFixture<InvitationWelcomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvitationWelcomeComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(InvitationWelcomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
