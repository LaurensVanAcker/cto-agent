import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DpsLegalInfoFooterComponent } from './dps-legal-info-footer.component';

describe('DpsLegalInfoFooterComponent', () => {
  let component: DpsLegalInfoFooterComponent;
  let fixture: ComponentFixture<DpsLegalInfoFooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DpsLegalInfoFooterComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DpsLegalInfoFooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
