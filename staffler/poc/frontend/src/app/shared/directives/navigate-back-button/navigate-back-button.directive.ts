import { Directive, HostListener, Input } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

interface LocationState {
  navigationId: number;
}

@Directive({
  selector: '[dpsNavigateBackButton]',
  standalone: true,
})
export class NavigateBackButtonDirective {
  @Input({
    alias: 'dpsNavigateBackButton',
    required: true,
  })
  defaultBackRoute!: string;

  constructor(
    private location: Location,
    private router: Router
  ) {}

  @HostListener('click')
  onClick() {
    const canGoBack = (this.location.getState() as LocationState).navigationId > 1;
    canGoBack ? this.location.back() : this.router.navigateByUrl(this.defaultBackRoute);
  }
}
