import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppLocaleSelectorComponent } from './app-locale-selector.component';

describe('AppLocaleSelectorComponent', () => {
  let component: AppLocaleSelectorComponent;
  let fixture: ComponentFixture<AppLocaleSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppLocaleSelectorComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AppLocaleSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
