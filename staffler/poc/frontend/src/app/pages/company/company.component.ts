import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';

import { ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { Store } from '@ngxs/store';
import { MainMenuComponent } from '@dps/shared/components';

// PoC step 1: removed the actuals count polling interval (60s) and the
// ContractConfirmationApiService injection because the actuals module is
// stripped from this PoC.

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

  constructor(private store: Store) {}

  hideSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(false));
  }
}
