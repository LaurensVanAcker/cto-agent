import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';
import { filter, take } from 'rxjs';

import { ChangeSidenavVisibility, LoadActualsCount, RootState } from '@dps/core/store';
import { Store } from '@ngxs/store';
import { MainMenuComponent } from '@dps/shared/components';

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
export class CompanyComponent implements OnInit {
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly isSidenavVisible = this.store.selectSignal(RootState.isSidenavVisible);

  constructor(private store: Store) {}

  ngOnInit(): void {
    // Re-load the pending-prestatie count as soon as the company data
    // lands. Without this the sidebar badge would only update on
    // membership change, missing the first-load case (operator opens
    // the app fresh, has pending prestaties to confirm). Subscribed
    // once via take(1) — subsequent updates run after each save in the
    // actuals page.
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(() => this.store.dispatch(new LoadActualsCount()));
  }

  hideSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(false));
  }
}
