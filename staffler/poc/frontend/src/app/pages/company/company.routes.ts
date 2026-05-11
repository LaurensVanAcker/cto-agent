import { Routes } from '@angular/router';

import { CompanyComponent } from './company.component';
import { CompanyRouteEnum, CompanyRoutePathParam } from './company.routes.model';
import { COMPANY_TIME_REGISTRATION_CAN_ACTIVATE_FN } from './modules/time-registration/company-time-registration.guard';
import {
  COMPANY_GROUPS_ENABLED_GUARD,
  GROUP_USER_ROLE_GUARD,
} from './modules/groups/company-groups.guard';
import { COMPANY_ACTUALS_ENABLED_GUARD } from './modules/actuals/company-actuals.guard';

export const COMPANY_ROUTES: Routes = [
  {
    path: `:${CompanyRoutePathParam.COMPANY_ID}`,
    component: CompanyComponent,
    children: [
      {
        path: CompanyRouteEnum.ONBOARDING,
        loadComponent: () =>
          import('./modules/onboarding/company-onboarding.component').then(
            c => c.CompanyOnboardingComponent
          ),
      },
      {
        path: CompanyRouteEnum.PLANNING,
        loadComponent: () =>
          import('./modules/planning/company-planning.component').then(
            c => c.CompanyPlanningComponent
          ),
      },
      {
        path: CompanyRouteEnum.PROFILE,
        loadComponent: () =>
          import('./modules/profile/company-profile.component').then(
            c => c.CompanyProfileComponent
          ),
      },
      {
        path: CompanyRouteEnum.NEWCOMERS,
        loadChildren: () =>
          import('./modules/newcomers/company-newcomers.routes').then(
            m => m.COMPANY_NEWCOMERS_ROUTES
          ),
      },
      {
        path: CompanyRouteEnum.TIME_REGISTRATION,
        loadComponent: () =>
          import('./modules/time-registration/company-time-registration.component').then(
            c => c.CompanyTimeRegistrationComponent
          ),
        canActivate: [COMPANY_TIME_REGISTRATION_CAN_ACTIVATE_FN],
      },
      {
        path: CompanyRouteEnum.INVITATIONS,
        loadChildren: () =>
          import('./modules/invitations/company-invitations.routes').then(
            m => m.COMPANY_INVITATIONS_ROUTES
          ),
      },
      {
        path: CompanyRouteEnum.GROUPS,
        loadChildren: () =>
          import('./modules/groups/company-groups.routes').then(m => m.COMPANY_GROUPS_ROUTES),
        canActivate: [COMPANY_GROUPS_ENABLED_GUARD, GROUP_USER_ROLE_GUARD],
      },
      {
        path: CompanyRouteEnum.USER_ACCOUNTS,
        loadChildren: () =>
          import('./modules/user-accounts/user-accounts.routes').then(
            m => m.COMPANY_USER_ACCOUNTS_ROUTES
          ),
      },
      {
        path: CompanyRouteEnum.ACTUALS,
        loadChildren: () =>
          import('./modules/actuals/company-actuals.routes').then(m => m.COMPANY_ACTUALS_ROUTES),
        canActivate: [COMPANY_ACTUALS_ENABLED_GUARD],
      },
      { path: '**', redirectTo: CompanyRouteEnum.PLANNING },
    ],
  },
];
