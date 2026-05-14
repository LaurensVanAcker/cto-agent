import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { UntilDestroy } from '@ngneat/until-destroy';
import { combineLatest, filter, shareReplay, startWith, switchMap, take, tap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';

import { PageHeaderComponent } from '@dps/shared/components';
import { EmployeeApiService } from '@dps/core/api';
import { ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { CompanyNewcomersRouteEnum } from './company-newcomers.routes.model';
import { Store } from '@ngxs/store';
import { OverlayBadgeModule } from 'primeng/overlaybadge';

@UntilDestroy()
@Component({
  selector: 'dps-company-newcomers',
  imports: [
    AsyncPipe,
    ButtonModule,
    TranslatePipe,
    RouterLink,
    TableModule,
    PageHeaderComponent,
    PaginatorModule,
    OverlayBadgeModule,
  ],
  templateUrl: './company-newcomers.component.html',
  styleUrl: './company-newcomers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-x-hidden' },
})
export class CompanyNewcomersComponent {
  constructor(
    private employeeApiService: EmployeeApiService,
    private store: Store
  ) {}

  readonly isLoading = signal(false);
  readonly pageControl = new FormControl(0, { nonNullable: true });
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  readonly newcomers$ = combineLatest([
    this.company$,
    this.pageControl.valueChanges.pipe(startWith(this.pageControl.value)),
  ]).pipe(
    tap(() => this.isLoading.set(true)),
    switchMap(([currCompany, page]) =>
      this.employeeApiService.getNewcomers({
        companyId: currCompany.id,
        page,
      })
    ),
    tap(() => this.isLoading.set(false)),
    shareReplay(1)
  );
  readonly companyNewcomersRouteEnum = CompanyNewcomersRouteEnum;
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }
}
