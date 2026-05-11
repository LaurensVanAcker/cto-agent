import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { distinctUntilKeyChanged, filter, interval, startWith, switchMap, takeWhile } from 'rxjs';
import { DateTime } from 'luxon';
import { DrawerModule } from 'primeng/drawer';

import { ContractConfirmationApiService } from '@dps/core/api';
import { ChangeSidenavVisibility, LoadActualsCount, RootState } from '@dps/core/store';
import { Store } from '@ngxs/store';
import { MainMenuComponent } from '@dps/shared/components';

const COMPANY_ACTUALS_COUNT_INTERVAL_MILLIS: number = DateTime.fromSeconds(60).toMillis();

@UntilDestroy()
@Component({
  selector: 'dps-company',
  imports: [RouterOutlet, DrawerModule, MainMenuComponent],
  templateUrl: './company.component.html',
  styleUrl: './company.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'flex h-full',
  },
})
export class CompanyComponent {
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly isSidenavVisible = this.store.selectSignal(RootState.isSidenavVisible);

  constructor(
    private store: Store,
    readonly contractConfirmationApiService: ContractConfirmationApiService
  ) {
    this.store
      .select(RootState.getCompanyData)
      .pipe(
        filter(Boolean),
        distinctUntilKeyChanged('isActualsEnabled'),
        switchMap(company =>
          interval(COMPANY_ACTUALS_COUNT_INTERVAL_MILLIS).pipe(
            startWith(company),
            takeWhile(() => company.isActualsEnabled)
          )
        ),
        untilDestroyed(this)
      )
      .subscribe(() => this.store.dispatch(new LoadActualsCount()));
  }

  hideSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(false));
  }
}
