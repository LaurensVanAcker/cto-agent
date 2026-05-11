import { ChangeDetectionStrategy, Component, HostBinding, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { AUTH_KEY } from '@dps/core/api/auth';

const REDIRECT_PATH_QUERY_PARAM_KEY = 'redirectPath';

@Component({
    selector: 'dps-signin',
    imports: [ProgressSpinnerModule],
    templateUrl: './signin.component.html',
    styleUrl: './signin.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SigninComponent {
  @HostBinding('class') hostClasses = [
    'flex',
    'justify-content-center',
    'align-items-center',
    'h-full',
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.route.queryParamMap
      .pipe(
        filter(paramMap => paramMap.has(AUTH_KEY)),
        take(1)
      )
      .subscribe(paramMap => {
        localStorage.setItem(AUTH_KEY, paramMap.get(AUTH_KEY) as string);
        this.router.navigateByUrl(paramMap.get(REDIRECT_PATH_QUERY_PARAM_KEY) || '');
      });
  }
}
