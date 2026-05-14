import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewcomerProfileComponent } from './newcomer-profile.component';

describe('NewcomerProfileComponent', () => {
  let component: NewcomerProfileComponent;
  let fixture: ComponentFixture<NewcomerProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewcomerProfileComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(NewcomerProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
