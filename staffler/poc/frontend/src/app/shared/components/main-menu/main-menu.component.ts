import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { TooltipModule } from 'primeng/tooltip';
import { BadgeModule } from 'primeng/badge';
import { ButtonModule } from 'primeng/button';

import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { CompanyMembership, UserRole } from '@dps/shared/models';
import { AuthStore, ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { AuthApiService } from '@dps/core/api/auth';
import { AuthRoutePath } from '../../../pages/auth';
import { COMPANY_ROUTES_ICONS_MAP } from '@dps/shared/configs';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { filter, map } from 'rxjs';
import { AppLocaleSelectorComponent } from '../app-locale-selector/app-locale-selector.component';
import { DividerModule } from 'primeng/divider';
import { ActionCenterDialogComponent } from '../action-center-dialog/action-center-dialog.component';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { UserApiService } from '@dps/core/api';
import { toSignal } from '@angular/core/rxjs-interop';

// PoC step 1: stripped the user-account dropdown along with COMPANY_PROFILE,
// USER_ACCOUNTS, ACTUALS, TIME_REGISTRATION and SEARCH menu items. Their
// modules are deleted; the corresponding properties (isActualsEnabled,
// isTimeRegistrationEnabled, companyContractConfirmationsCount, searchRoute,
// isPartialTimeRegistrationMenu, checkPartialTimeRegistrationMenu) are gone.

@UntilDestroy()
@Component({
  selector: 'dps-main-menu',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TooltipModule,
    TranslatePipe,
    RouterLink,
    RouterLinkActive,
    BadgeModule,
    ButtonModule,
    AppLocaleSelectorComponent,
    DividerModule,
    ActionCenterDialogComponent,
    FloatLabelModule,
    SelectModule,
  ],
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class:
      'flex flex-column relative border-right-1 border-round-right-2xl surface-50 border-200 transition-duration-300 p-3 z-2',
    '[class.expanded]': 'isMenuExpanded()',
  },
})
export class MainMenuComponent {
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly isMenuExpanded = signal(this.isMobileScreen());
  readonly linkClasses: string = ['border-round', 'hover:surface-200', 'p-3'].join(' ');
  readonly activeLinkClasses: string = ['bg-primary', 'hover:bg-primary', 'active'].join(' ');
  readonly companyRouteEnum = CompanyRouteEnum;
  readonly companyRoutesIconsMap = COMPANY_ROUTES_ICONS_MAP;
  readonly loginRoute = ['/', AuthRoutePath.LOGIN];
  readonly isGroupUser = computed(() => {
    return this.authStore.hasRoles([UserRole.GROUP_USER]);
  });
  readonly hasCustomerUserRole = toSignal(
    this.store.select(RootState.getCompanyData).pipe(
      filter(company => !!company),
      map(() => this.authStore.hasRoles([UserRole.COMPANY_USER, UserRole.GROUP_USER]))
    ),
    { initialValue: false }
  );
  readonly isGroupsEnabled = this.store.selectSignal(RootState.isCompanyGroupsEnabled);
  readonly currCompany = this.store.selectSignal(RootState.getCompanyData);
  readonly selectedMembership = computed<CompanyMembership | null>(
    () =>
      this.authStore
        .get()
        .currentUser?.companyMemberships.find(m => m.companyId === this.currCompany()?.id) ?? null
  );
  readonly userCompanyMemberships = toSignal(
    this.authStore.getCurrUserData$().pipe(map(user => user.companyMemberships))
  );

  constructor(
    private store: Store,
    private authStore: AuthStore,
    private router: Router,
    protected authApiService: AuthApiService,
    private userApiService: UserApiService
  ) {
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        untilDestroyed(this)
      )
      .subscribe(() => {
        if (this.isMobileScreen()) {
          this.hideSidenav();
        }
      });
  }

  onMembershipChange(membership: CompanyMembership): void {
    // PoC step 1: dropped the LoadActualsCount dispatch — actuals module is stripped.
    this.router.navigate([AppRouteEnum.COMPANY, membership.companyId, CompanyRouteEnum.PLANNING]);
    this.userApiService
      .setUserLastViewedCompany(membership.userId, membership.companyId)
      .subscribe();
  }

  toggleMenuExpansion(): void {
    this.isMenuExpanded.update(isExpanded => !isExpanded);
  }

  hideSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(false));
  }
}
