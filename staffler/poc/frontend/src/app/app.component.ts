import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivationStart, EventType, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Store } from '@ngxs/store';

import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';

import { AuthStore, GetCompany } from '@dps/core/store';
import { AppRouteEnum } from './app.routes.model';
import { CompanyRoutePathParam } from './pages/company/company.routes.model';
import { APP_UPDATE_TOAST_KEY, AppUpdateService } from '@dps/core/app-update';
import { DateTime } from 'luxon';
import { getLastViewedCompanyMembership } from './shared/functions';

@UntilDestroy()
@Component({
  selector: 'dps-root',
  imports: [RouterOutlet, ToastModule, ButtonModule, TranslatePipe],
  providers: [MessageService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly appUpdateToastKey = APP_UPDATE_TOAST_KEY;

  constructor(
    public appUpdateService: AppUpdateService,
    public messageService: MessageService,
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

    this.appUpdateService.updateAvailable$.pipe(untilDestroyed(this)).subscribe(() => {
      this.messageService.add({
        key: APP_UPDATE_TOAST_KEY,
        sticky: true,
        closable: false,
        severity: 'contrast',
        contentStyleClass: 'flex-column gap-3',
      });
    });

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

  activateAppUpdate(): void {
    this.messageService.clear(APP_UPDATE_TOAST_KEY);

    this.router.navigateByUrl('').then(() => window.location.reload());
  }
}
