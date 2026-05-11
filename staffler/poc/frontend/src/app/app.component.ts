import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivationStart, EventType, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Store } from '@ngxs/store';

import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';

import { AuthStore, GetCompany } from '@dps/core/store';
import { AppRouteEnum } from './app.routes.model';
import { CompanyRoutePathParam } from './pages/company/company.routes.model';
import { getLastViewedCompanyMembership } from './shared/functions';

// PoC step 1: dropped the AppUpdateService wiring (PWA service-worker
// update toast). No PWA in this PoC.

@UntilDestroy()
@Component({
  selector: 'dps-root',
  imports: [RouterOutlet, ToastModule, ButtonModule],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  constructor(
    private authStore: AuthStore,
    private router: Router,
    private store: Store
  ) {
    this.router.events
      .pipe(
        filter(event => event.type === EventType.ActivationStart),
        map(event =>
          (event as ActivationStart).snapshot.paramMap.get(CompanyRoutePathParam.COMPANY_ID)
        ),
        filter(Boolean),
        untilDestroyed(this)
      )
      .subscribe(companyId => this.store.dispatch(new GetCompany(companyId)));

    if (window.location.pathname === '/') {
      this.authStore
        .getCurrUserData$()
        .pipe(
          filter(currUser => !!currUser.companyMemberships.length),
          untilDestroyed(this)
        )
        .subscribe(currUser =>
          this.router.navigate([
            AppRouteEnum.COMPANY,
            getLastViewedCompanyMembership(currUser.companyMemberships).companyId,
          ])
        );
    }
  }
}
